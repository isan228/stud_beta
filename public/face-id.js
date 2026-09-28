/* Face ID: снятие лица при регистрации и вход по лицу.
   face-api.js — дескриптор лица, MediaPipe FaceLandmarker — сетка лица и улыбка (проверка «живости»). */
(function () {
    const FACEAPI_ESM = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/dist/face-api.esm.js';
    const FACEAPI_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/';
    const MEDIAPIPE_ESM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
    const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
    const MEDIAPIPE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

    const ENROLL_SAMPLES = 5;
    const LOGIN_SAMPLES = 2;
    const LIVENESS_TIMEOUT_MS = 20000;
    const CAPTURE_MAX_ATTEMPTS = 40;
    /* Живость: сначала нейтральное лицо, затем улыбка — статичное фото этот переход не пройдёт. */
    const SMILE_NEUTRAL = 0.25;
    const SMILE_ON = 0.6;
    const SMILE_HOLD_MS = 350;

    let enginesPromise = null;

    function loadEngines() {
        if (!enginesPromise) {
            enginesPromise = (async () => {
                const [faceapi, vision] = await Promise.all([import(FACEAPI_ESM), import(MEDIAPIPE_ESM)]);
                const tf = faceapi.tf;
                try {
                    await tf.setBackend('webgl');
                } catch (_) {
                    await tf.setBackend('cpu');
                }
                await tf.ready();

                const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
                const createLandmarker = (delegate) => vision.FaceLandmarker.createFromOptions(fileset, {
                    baseOptions: { modelAssetPath: MEDIAPIPE_MODEL, delegate },
                    runningMode: 'VIDEO',
                    numFaces: 1,
                    outputFaceBlendshapes: true
                });
                const [landmarker] = await Promise.all([
                    createLandmarker('GPU').catch(() => createLandmarker('CPU')),
                    faceapi.nets.ssdMobilenetv1.loadFromUri(FACEAPI_MODELS),
                    faceapi.nets.faceLandmark68Net.loadFromUri(FACEAPI_MODELS),
                    faceapi.nets.faceRecognitionNet.loadFromUri(FACEAPI_MODELS)
                ]);
                return { faceapi, vision, landmarker, backend: tf.getBackend() };
            })().catch((err) => {
                enginesPromise = null;
                throw new Error('Не удалось загрузить модуль распознавания. Проверьте интернет и обновите страницу.');
            });
        }
        return enginesPromise;
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function buildModal(title) {
        const root = document.createElement('div');
        root.className = 'faceid-modal';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.innerHTML = `
            <div class="faceid-card">
                <div class="faceid-video-wrap">
                    <video class="faceid-video" autoplay muted playsinline></video>
                    <canvas class="faceid-overlay"></canvas>
                </div>
                <button type="button" class="faceid-close" aria-label="Закрыть">&times;</button>
                <h3 class="faceid-title"></h3>
                <div class="faceid-welcome hidden"></div>
                <div class="faceid-bottom">
                    <div class="faceid-indicators">
                        <span class="faceid-chip" data-chip="face">Лицо: —</span>
                        <span class="faceid-chip" data-chip="smile">Улыбка: —</span>
                        <span class="faceid-chip" data-chip="backend">TF.js: —</span>
                    </div>
                    <div class="faceid-progress"><div class="faceid-progress-bar"></div></div>
                    <p class="faceid-status">Загрузка…</p>
                </div>
            </div>`;
        root.querySelector('.faceid-title').textContent = title;
        document.body.appendChild(root);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const chip = (name) => root.querySelector(`[data-chip="${name}"]`);
        return {
            root,
            restoreScroll: () => { document.body.style.overflow = prevOverflow; },
            video: root.querySelector('.faceid-video'),
            overlay: root.querySelector('.faceid-overlay'),
            bar: root.querySelector('.faceid-progress-bar'),
            status: root.querySelector('.faceid-status'),
            welcome: root.querySelector('.faceid-welcome'),
            close: root.querySelector('.faceid-close'),
            setChip(name, text, on) {
                const el = chip(name);
                el.textContent = text;
                el.classList.toggle('on', !!on);
            }
        };
    }

    /**
     * Открывает камеру на весь экран, ждёт улыбку (живость), снимает дескрипторы и
     * вызывает submit(descriptors) → { welcome } прямо в открытом окне.
     */
    function runFaceSession({ title, samples, submit }) {
        return new Promise((resolve, reject) => {
            const ui = buildModal(title);
            const ctx = ui.overlay.getContext('2d');
            let stream = null;
            let finished = false;
            let rafId = 0;
            const track = { faceVisible: false, smile: 0 };

            function setStatus(text, kind) {
                ui.status.textContent = text;
                ui.status.dataset.kind = kind || '';
            }

            function showWelcome(text, ok) {
                ui.welcome.textContent = text;
                ui.welcome.className = `faceid-welcome ${ok ? 'ok' : 'fail'}`;
            }

            function cleanup() {
                finished = true;
                cancelAnimationFrame(rafId);
                if (stream) stream.getTracks().forEach((t) => t.stop());
                ui.root.remove();
                ui.restoreScroll();
                document.removeEventListener('keydown', onKey);
            }

            function onKey(e) {
                if (e.key === 'Escape') cancel();
            }

            function cancel() {
                if (finished) return;
                cleanup();
                reject(new Error('cancelled'));
            }

            ui.close.addEventListener('click', cancel);
            document.addEventListener('keydown', onKey);

            function startTracking({ vision, landmarker }) {
                const drawing = new vision.DrawingUtils(ctx);
                const { FaceLandmarker } = vision;
                let lastVideoTime = -1;
                const loop = () => {
                    if (finished) return;
                    if (ui.video.readyState >= 2 && ui.video.currentTime !== lastVideoTime) {
                        lastVideoTime = ui.video.currentTime;
                        const res = landmarker.detectForVideo(ui.video, performance.now());
                        ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
                        track.faceVisible = res.faceLandmarks.length > 0;
                        ui.setChip('face', track.faceVisible ? 'Лицо: есть' : 'Лицо: нет', track.faceVisible);
                        if (track.faceVisible) {
                            const lm = res.faceLandmarks[0];
                            drawing.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
                                color: 'rgba(56,189,248,0.25)',
                                lineWidth: 0.5
                            });
                            drawing.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
                                color: '#38bdf8',
                                lineWidth: 2
                            });
                            const shapes = Object.fromEntries(
                                (res.faceBlendshapes[0]?.categories || []).map((c) => [c.categoryName, c.score])
                            );
                            track.smile = ((shapes.mouthSmileLeft || 0) + (shapes.mouthSmileRight || 0)) / 2;
                            ui.setChip('smile', `Улыбка: ${Math.round(track.smile * 100)}%`, track.smile > SMILE_ON);
                        } else {
                            track.smile = 0;
                            ui.setChip('smile', 'Улыбка: —', false);
                        }
                    }
                    rafId = requestAnimationFrame(loop);
                };
                loop();
            }

            async function waitForSmile() {
                let sawNeutral = false;
                let smileSince = 0;
                const start = Date.now();
                while (!finished) {
                    if (Date.now() - start > LIVENESS_TIMEOUT_MS) {
                        throw new Error('Улыбка не обнаружена. Посмотрите в камеру и улыбнитесь.');
                    }
                    if (!track.faceVisible) {
                        setStatus('Лицо не видно — посмотрите в камеру');
                        smileSince = 0;
                    } else if (!sawNeutral) {
                        setStatus('Смотрите в камеру с нейтральным лицом…');
                        if (track.smile < SMILE_NEUTRAL) sawNeutral = true;
                    } else if (track.smile > SMILE_ON) {
                        setStatus('Отлично, держите улыбку…');
                        if (!smileSince) smileSince = Date.now();
                        if (Date.now() - smileSince >= SMILE_HOLD_MS) return;
                    } else {
                        setStatus('Улыбнитесь, чтобы подтвердить, что это вы 🙂');
                        smileSince = 0;
                    }
                    await sleep(60);
                }
            }

            async function captureDescriptors(faceapi) {
                const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 });
                const descriptors = [];
                let attempts = 0;
                while (descriptors.length < samples && attempts < CAPTURE_MAX_ATTEMPTS) {
                    if (finished) return null;
                    attempts++;
                    setStatus(`Съёмка лица… ${descriptors.length}/${samples}`);
                    const det = await faceapi
                        .detectSingleFace(ui.video, opts)
                        .withFaceLandmarks()
                        .withFaceDescriptor();
                    if (det?.descriptor) {
                        descriptors.push(Array.from(det.descriptor));
                        ui.bar.style.width = `${(descriptors.length / samples) * 100}%`;
                    }
                    await sleep(samples > 2 ? 300 : 150);
                }
                if (descriptors.length < samples) {
                    throw new Error('Не удалось захватить лицо. Проверьте освещение.');
                }
                return descriptors;
            }

            (async () => {
                try {
                    if (!navigator.mediaDevices?.getUserMedia) {
                        throw new Error('Браузер не поддерживает камеру. Откройте сайт в Chrome или Safari по HTTPS.');
                    }
                    setStatus('Загрузка TensorFlow.js, face-api.js и MediaPipe…');
                    const engines = await loadEngines();
                    if (finished) return;
                    ui.setChip('backend', `TF.js: ${engines.backend}`, true);

                    setStatus('Запуск камеры…');
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
                            audio: false
                        });
                    } catch (_) {
                        throw new Error('Нет доступа к камере. Разрешите доступ к камере в настройках браузера.');
                    }
                    if (finished) { stream.getTracks().forEach((t) => t.stop()); return; }
                    ui.video.srcObject = stream;
                    await new Promise((r) => {
                        if (ui.video.readyState >= 2) r();
                        else ui.video.onloadeddata = () => r();
                    });
                    ui.overlay.width = ui.video.videoWidth;
                    ui.overlay.height = ui.video.videoHeight;
                    startTracking(engines);

                    await waitForSmile();
                    if (finished) return;
                    const descriptors = await captureDescriptors(engines.faceapi);
                    if (!descriptors) return;

                    setStatus('Проверка…');
                    const result = await submit(descriptors);
                    if (finished) return;
                    setStatus('Готово', 'ok');
                    showWelcome(result.welcome || 'Готово', true);
                    await sleep(1200);
                    cleanup();
                    resolve(result);
                } catch (err) {
                    if (finished) return;
                    setStatus(err.message || 'Ошибка', 'fail');
                    showWelcome(err.status === 401 ? 'Лицо не распознано' : 'Не получилось', false);
                    await sleep(1800);
                    if (finished) return;
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

    /** Регистрация: снимает лицо и сохраняет его на сервере до оплаты. Возвращает enrollToken. */
    async function enrollForRegistration() {
        const result = await runFaceSession({
            title: 'Регистрация лица',
            samples: ENROLL_SAMPLES,
            submit: async (descriptors) => {
                const data = await postJson('/api/auth/face/enroll-pending', { descriptors });
                return { enrollToken: data.enrollToken, welcome: 'Лицо сохранено' };
            }
        });
        return result.enrollToken;
    }

    /** Вход: возвращает { token, user } от /api/auth/face/login. */
    function login() {
        return runFaceSession({
            title: 'Вход по лицу',
            samples: LOGIN_SAMPLES,
            submit: async (descriptors) => {
                const data = await postJson('/api/auth/face/login', { descriptors });
                return { ...data, welcome: `Привет, ${data.user?.username || ''}!` };
            }
        });
    }

    window.StudFaceId = {
        isSupported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        preload: () => loadEngines().catch(() => {}),
        enrollForRegistration,
        login
    };
})();
