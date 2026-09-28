/* Face ID: снятие лица при регистрации и вход по лицу (face-api.js, модели с CDN). */
(function () {
    const FACEAPI_SRC = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/dist/face-api.js';
    const FACEAPI_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/';
    const ENROLL_SAMPLES = 5;
    const LOGIN_SAMPLES = 2;
    const BLINK_TIMEOUT_MS = 15000;
    const CAPTURE_MAX_ATTEMPTS = 40;

    let modelsPromise = null;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (window.faceapi) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Не удалось загрузить модуль распознавания'));
            document.head.appendChild(s);
        });
    }

    function loadModels() {
        if (!modelsPromise) {
            modelsPromise = (async () => {
                await loadScript(FACEAPI_SRC);
                const faceapi = window.faceapi;
                try {
                    await faceapi.tf.setBackend('webgl');
                } catch (_) {
                    await faceapi.tf.setBackend('cpu');
                }
                await faceapi.tf.ready();
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODELS),
                    faceapi.nets.faceLandmark68Net.loadFromUri(FACEAPI_MODELS),
                    faceapi.nets.faceRecognitionNet.loadFromUri(FACEAPI_MODELS)
                ]);
                return faceapi;
            })().catch((err) => {
                modelsPromise = null;
                throw err;
            });
        }
        return modelsPromise;
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function dist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function eyeAspectRatio(eye) {
        return (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2 * dist(eye[0], eye[3]));
    }

    function buildModal(title) {
        const root = document.createElement('div');
        root.className = 'faceid-modal';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.innerHTML = `
            <div class="faceid-card">
                <button type="button" class="faceid-close" aria-label="Закрыть">&times;</button>
                <h3 class="faceid-title"></h3>
                <div class="faceid-video-wrap">
                    <video class="faceid-video" autoplay muted playsinline></video>
                    <div class="faceid-frame"></div>
                </div>
                <div class="faceid-progress"><div class="faceid-progress-bar"></div></div>
                <p class="faceid-status">Загрузка…</p>
            </div>`;
        root.querySelector('.faceid-title').textContent = title;
        document.body.appendChild(root);
        return {
            root,
            video: root.querySelector('.faceid-video'),
            frame: root.querySelector('.faceid-frame'),
            bar: root.querySelector('.faceid-progress-bar'),
            status: root.querySelector('.faceid-status'),
            close: root.querySelector('.faceid-close')
        };
    }

    /**
     * Открывает камеру, ждёт моргания (защита от фото) и снимает дескрипторы лица.
     * @returns {Promise<number[][]>} дескрипторы или отклоняется с Error('cancelled') / ошибкой камеры
     */
    function captureFace({ title, samples }) {
        return new Promise((resolve, reject) => {
            const ui = buildModal(title);
            let stream = null;
            let cancelled = false;

            function setStatus(text, kind) {
                ui.status.textContent = text;
                ui.status.dataset.kind = kind || '';
            }

            function cleanup() {
                cancelled = true;
                if (stream) stream.getTracks().forEach((t) => t.stop());
                ui.root.remove();
                document.removeEventListener('keydown', onKey);
            }

            function onKey(e) {
                if (e.key === 'Escape') cancel();
            }

            function cancel() {
                cleanup();
                reject(new Error('cancelled'));
            }

            ui.close.addEventListener('click', cancel);
            ui.root.addEventListener('click', (e) => { if (e.target === ui.root) cancel(); });
            document.addEventListener('keydown', onKey);

            (async () => {
                try {
                    if (!navigator.mediaDevices?.getUserMedia) {
                        throw new Error('Браузер не поддерживает камеру. Откройте сайт в Chrome или Safari по HTTPS.');
                    }
                    setStatus('Загрузка моделей распознавания…');
                    const faceapi = await loadModels();
                    if (cancelled) return;

                    setStatus('Запуск камеры…');
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                            audio: false
                        });
                    } catch (camErr) {
                        throw new Error('Нет доступа к камере. Разрешите доступ к камере в настройках браузера.');
                    }
                    if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
                    ui.video.srcObject = stream;
                    await new Promise((r) => {
                        if (ui.video.readyState >= 2) r();
                        else ui.video.onloadeddata = () => r();
                    });

                    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

                    setStatus('Посмотрите в камеру и моргните');
                    let openBaseline = 0;
                    let closed = false;
                    let blinked = false;
                    const blinkStart = Date.now();
                    while (!blinked) {
                        if (cancelled) return;
                        if (Date.now() - blinkStart > BLINK_TIMEOUT_MS) {
                            throw new Error('Моргание не обнаружено. Посмотрите прямо в камеру и попробуйте снова.');
                        }
                        const det = await faceapi.detectSingleFace(ui.video, opts).withFaceLandmarks();
                        ui.frame.classList.toggle('faceid-frame--ok', !!det);
                        if (!det) {
                            setStatus('Лицо не видно — поместите его в рамку');
                            await sleep(80);
                            continue;
                        }
                        setStatus('Моргните, чтобы подтвердить, что это вы');
                        const lm = det.landmarks;
                        const ear = (eyeAspectRatio(lm.getLeftEye()) + eyeAspectRatio(lm.getRightEye())) / 2;
                        if (!closed) {
                            openBaseline = openBaseline ? Math.max(ear, openBaseline * 0.98) : ear;
                            if (openBaseline > 0 && ear < openBaseline * 0.72) closed = true;
                        } else if (ear > openBaseline * 0.85) {
                            blinked = true;
                        }
                    }

                    setStatus('Отлично! Держите лицо неподвижно…');
                    const descriptors = [];
                    let attempts = 0;
                    while (descriptors.length < samples && attempts < CAPTURE_MAX_ATTEMPTS) {
                        if (cancelled) return;
                        attempts++;
                        const det = await faceapi
                            .detectSingleFace(ui.video, opts)
                            .withFaceLandmarks()
                            .withFaceDescriptor();
                        if (det?.descriptor) {
                            descriptors.push(Array.from(det.descriptor));
                            ui.bar.style.width = `${(descriptors.length / samples) * 100}%`;
                        }
                        await sleep(samples > 2 ? 250 : 120);
                    }
                    if (descriptors.length < samples) {
                        throw new Error('Не удалось снять лицо. Проверьте освещение и попробуйте снова.');
                    }

                    setStatus('Готово', 'ok');
                    await sleep(300);
                    cleanup();
                    resolve(descriptors);
                } catch (err) {
                    if (cancelled) return;
                    cleanup();
                    reject(err);
                }
            })();
        });
    }

    async function postJson(url, body) {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const err = new Error(data.error || 'Ошибка сервера');
            err.code = data.code;
            err.status = resp.status;
            throw err;
        }
        return data;
    }

    /** Регистрация: снимает лицо и сохраняет его на сервере до оплаты. */
    async function enrollForRegistration() {
        const descriptors = await captureFace({ title: 'Регистрация лица', samples: ENROLL_SAMPLES });
        const data = await postJson('/api/auth/face/enroll-pending', { descriptors });
        return data.enrollToken;
    }

    /** Вход: возвращает { token, user } от /api/auth/face/login. */
    async function login() {
        const descriptors = await captureFace({ title: 'Вход по лицу', samples: LOGIN_SAMPLES });
        return postJson('/api/auth/face/login', { descriptors });
    }

    window.StudFaceId = {
        isSupported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        preload: () => loadModels().catch(() => {}),
        enrollForRegistration,
        login
    };
})();
