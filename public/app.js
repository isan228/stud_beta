// Полностью отключаем app.js на странице админки
if (window.location.pathname.includes('/admin') || document.getElementById('adminLoginForm')) {
    console.log('app.js: Страница админки обнаружена, скрипт отключен');
    // Не выполняем никакой код на странице админки
} else {
    // API базовый URL
    const API_URL = '/api';

    /**
     * Читает тело ответа как JSON. Если пришёл HTML/текст (часто при 502 от nginx или обрыве CDN),
     * не бросает SyntaxError — помечает отдельной ошибкой (иначе пользователь видит «Ошибка соединения»).
     */
    async function parseApiJsonResponse(response) {
        const text = await response.text();
        const trimmed = text.trim();
        if (!trimmed) return {};
        try {
            return JSON.parse(trimmed);
        } catch {
            const err = new Error('NON_JSON_API_RESPONSE');
            err.httpStatus = response.status;
            throw err;
        }
    }

    /** Короткая подсказка при сбое fetch (часто iPhone / Safari / DNS / SSL). */
    function clientNetworkFailureMessage() {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const probe = origin ? `${origin}/api/platform` : '/api/platform';
        return (
            'Сервер не отвечает. Откройте в Safari отдельной вкладкой: ' + probe +
            ' — должен появиться JSON (числа). Если нет: сеть, DNS, сертификат или блокировка. ' +
            'С ПК по Wi‑Fi: на телефоне нельзя использовать localhost — только IP компьютера или домен. ' +
            'На iPhone: Настройки → Wi‑Fi → (i) у сети → отключите «Ограничить отслеживание IP»; ' +
            'в Apple ID → iCloud → «Частная передача реле» не должна маскировать весь трафик.'
        );
    }

    function escapeHtmlStr(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Состояние приложения
    let currentUser = null;
    let currentToken = null;
    let currentTest = null;
    let currentQuestions = [];
    let currentAnswers = {};
    let currentQuestionIndex = 0;
    let instantFeedbackMode = false;
    let instantFeedbackLockedQuestions = {};
    let testTimer = null;
    let testStartTime = null;
    // Время на каждый вопрос: { [questionId]: секунды }
    let questionTimes = {};
    let _questionViewStart = null;
    let _lastViewedQuestionId = null;
    let _usmleQuestionLiveTimer = null;

    const USMLE_SUBJECT_TAG_NAMES = new Set([
        'anatomy', 'behavioral science', 'histology', 'physiology', 'pharmacology',
        'embryology', 'genetics', 'biostatistics', 'immunology', 'microbiology',
        'pathology', 'pathophysiology', 'biochemistry'
    ]);

    function isUsmleTestSession() {
        if (getProgramType() === 'usmle') return true;
        try {
            const raw = sessionStorage.getItem('testData');
            if (!raw) return false;
            const data = JSON.parse(raw);
            return !!(data.isCustomUsmle || data.programType === 'usmle');
        } catch (_) {
            return false;
        }
    }

    function formatQuestionClock(totalSec) {
        const s = Math.max(0, Math.floor(Number(totalSec) || 0));
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${String(sec).padStart(2, '0')}`;
    }

    function splitUsmleQuestionTags(tags) {
        const subjects = [];
        const systems = [];
        for (const t of tags || []) {
            const name = String(t?.name || t || '').trim();
            if (!name) continue;
            if (USMLE_SUBJECT_TAG_NAMES.has(name.toLowerCase())) subjects.push(name);
            else systems.push(name);
        }
        return {
            subjects: [...new Set(subjects)],
            systems: [...new Set(systems)]
        };
    }

    function stopUsmleQuestionLiveTimer() {
        if (_usmleQuestionLiveTimer) {
            clearInterval(_usmleQuestionLiveTimer);
            _usmleQuestionLiveTimer = null;
        }
    }

    function updateUsmleQuestionMeta(question) {
        const box = document.getElementById('usmleQuestionMeta');
        if (!box) return;

        if (!isUsmleTestSession() || !question) {
            box.hidden = true;
            stopUsmleQuestionLiveTimer();
            return;
        }

        box.hidden = false;
        const { subjects, systems } = splitUsmleQuestionTags(question.Tags || question.tags || []);
        const subEl = document.getElementById('usmleMetaSubject');
        const sysEl = document.getElementById('usmleMetaSystem');
        if (subEl) {
            const val = subEl.querySelector('.usmle-meta-value');
            if (val) val.textContent = subjects.length ? subjects.join(', ') : '—';
        }
        if (sysEl) {
            const val = sysEl.querySelector('.usmle-meta-value');
            if (val) val.textContent = systems.length ? systems.join(', ') : '—';
        }

        const paintTime = () => {
            const base = Number(questionTimes[question.id] || 0);
            const live = _questionViewStart ? Math.floor((Date.now() - _questionViewStart) / 1000) : 0;
            const el = document.getElementById('usmleMetaQuestionTimeValue');
            if (el) el.textContent = formatQuestionClock(base + live);
        };

        stopUsmleQuestionLiveTimer();
        paintTime();
        _usmleQuestionLiveTimer = setInterval(paintTime, 1000);
    }
    let chatPollInterval = null;
    let isChatOpen = false;
    let pendingDeviceAlerts = [];
    let pendingBroadcastAlerts = [];
    let isSubscriptionAlertsOpen = false;
    /** Защита от двойного вызова setupEventListeners (init в app.js + inline DOMContentLoaded на страницах). */
    let appEventListenersAttached = false;

    // Инициализация (вызывается на каждой странице отдельно)

    // Тема
    function initTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeIcon(theme);
        console.log('Theme initialized:', theme); // Для отладки
    }

    function toggleTheme(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Получаем текущую тему из атрибута или localStorage
        let currentTheme = document.documentElement.getAttribute('data-theme');
        if (!currentTheme || currentTheme === 'null' || currentTheme === '') {
            currentTheme = localStorage.getItem('theme') || 'light';
        }

        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        // Устанавливаем новую тему
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);

        console.log('Theme toggled to:', newTheme); // Для отладки
    }

    function updateThemeIcon(theme) {
        const themeToggle = document.getElementById('themeToggle');
        if (!themeToggle) return;
        const moon = '<svg class="theme-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true"><path d="M18 13.5A7 7 0 0 1 10.5 6 6.5 6.5 0 1 0 18 13.5Z"/></svg>';
        const sun = '<svg class="theme-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2.2M12 18.8V21M4.2 12H6.4M17.6 12h2.2M6.2 6.2l1.6 1.6M16.2 16.2l1.6 1.6M6.2 17.8l1.6-1.6M16.2 7.8l1.6-1.6"/></svg>';
        const svg = theme === 'dark' ? sun : moon;
        const icon = themeToggle.querySelector('.theme-icon');
        if (icon) {
            icon.innerHTML = svg;
        } else {
            themeToggle.innerHTML = svg;
        }
    }

    function userDisplayName(user) {
        return String(user?.username || user?.name || 'Студент').trim() || 'Студент';
    }

    function userInitials(name) {
        const parts = String(name || 'S').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'S';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    function userSubscriptionChipLabel(user) {
        if (!user) return '';
        if (user.isAdminAccount) return 'Админ';
        const end = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
        if (end && !Number.isNaN(end.getTime()) && end > new Date()) return 'Подписка активна';
        if (user.usmleSubscriptionActive === true) return 'USMLE активен';
        const usmleEnd = user.usmleSubscriptionEndDate ? new Date(user.usmleSubscriptionEndDate) : null;
        if (usmleEnd && !Number.isNaN(usmleEnd.getTime()) && usmleEnd > new Date()) return 'USMLE активен';
        return 'Нет подписки';
    }

    function updateNavUserChip() {
        const actions = document.querySelector('.nav-actions');
        if (!actions) return;

        let chip = document.getElementById('navUserChip');
        const profileLink = document.getElementById('profileLink');

        if (!currentUser) {
            if (chip) chip.remove();
            if (profileLink) profileLink.classList.remove('nav-link-hidden-desktop');
            return;
        }

        const name = userDisplayName(currentUser);
        const sub = userSubscriptionChipLabel(currentUser);
        const initials = userInitials(name);

        if (!chip) {
            chip = document.createElement('a');
            chip.id = 'navUserChip';
            chip.className = 'nav-user-chip';
            chip.href = '/profile';
            const themeBtn = document.getElementById('themeToggle');
            if (themeBtn && themeBtn.parentElement === actions) {
                actions.insertBefore(chip, themeBtn);
            } else {
                actions.insertBefore(chip, actions.firstChild);
            }
        }

        chip.innerHTML = `
            <span class="nav-user-avatar" aria-hidden="true">${initials.replace(/</g, '')}</span>
            <span class="nav-user-meta">
                <strong class="nav-user-name"></strong>
                <span class="nav-user-sub"></span>
            </span>`;
        const nameEl = chip.querySelector('.nav-user-name');
        const subEl = chip.querySelector('.nav-user-sub');
        if (nameEl) nameEl.textContent = name;
        if (subEl) subEl.textContent = sub;
        chip.classList.toggle('is-active-sub', sub.includes('актив'));
        chip.classList.toggle('is-expired-sub', sub === 'Нет подписки');
        if (profileLink) profileLink.classList.add('nav-link-hidden-desktop');
    }

    // Загрузка пользователя
    async function loadUser() {
        const token = localStorage.getItem('token');
        if (token) {
            currentToken = token;
            await fetchUser();
        }
        return currentUser !== null;
    }

    async function fetchUser() {
        try {
            const response = await fetch(`${API_URL}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                await refreshAccountSecurityAlerts();
                updateUI();
                console.log('Пользователь загружен:', currentUser);
                return true; // Успешная загрузка
            } else {
                pendingDeviceAlerts = [];
                pendingBroadcastAlerts = [];
                // Токен невалидный
                if (response.status === 401) {
                    currentUser = null;
                    currentToken = null;
                    localStorage.removeItem('token');
                }
                updateUI();
                return false;
            }
        } catch (error) {
            console.error('Ошибка загрузки пользователя:', error);
            currentUser = null;
            pendingDeviceAlerts = [];
            pendingBroadcastAlerts = [];
            updateUI();
            return false;
        }
    }

    function updateUI() {
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const profileLink = document.getElementById('profileLink');
        const favoritesLink = document.getElementById('favoritesLink');
        const subscriptionsLink = document.getElementById('subscriptionsLink');

        if (currentUser) {
            if (loginBtn) loginBtn.style.display = 'none';
            if (registerBtn) registerBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'block';
            if (profileLink) profileLink.style.display = 'block';
            if (favoritesLink) favoritesLink.style.display = 'block';
            if (subscriptionsLink) subscriptionsLink.style.display = 'block';
        } else {
            if (loginBtn) loginBtn.style.display = 'block';
            if (registerBtn) registerBtn.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (profileLink) profileLink.style.display = 'none';
            if (favoritesLink) favoritesLink.style.display = 'none';
            if (subscriptionsLink) subscriptionsLink.style.display = 'none';
        }

        updateNavUserChip();
        ensureUserChatVisibility();
        ensureSubscriptionAlertVisibility();
    }

    function ensureUserChatVisibility() {
        const dock = document.getElementById('userChatFabDock');
        const chatButton = document.getElementById('userChatToggle');
        if (dock) dock.style.display = currentUser ? 'flex' : 'none';
        if (chatButton) chatButton.style.display = currentUser ? 'flex' : 'none';

        if (!currentUser) {
            const chatStack = document.getElementById('userChatStack');
            if (chatStack) chatStack.style.display = 'none';
            stopChatPolling();
            isChatOpen = false;
        } else {
            startChatPolling();
            updateChatUnreadBadge();
        }
    }

    function buildSubscriptionAlerts() {
        if (!currentUser || !currentUser.subscriptionEndDate) return [];
        const endDate = new Date(currentUser.subscriptionEndDate);
        if (Number.isNaN(endDate.getTime())) return [];

        const now = new Date();
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / msPerDay);

        let alerts = [];
        if (daysLeft < 0) {
            alerts = [{
                level: 'danger',
                kind: 'subscription',
                key: 'sub-expired',
                title: 'Подписка закончилась',
                text: 'Ваша подписка уже истекла. Продлите подписку, чтобы сохранить полный доступ к тестам.',
                link: '/subscriptions',
                linkLabel: 'К подпискам'
            }];
        } else if (daysLeft === 0) {
            alerts = [{
                level: 'warning',
                kind: 'subscription',
                key: 'sub-today',
                title: 'Подписка заканчивается сегодня',
                text: 'Сегодня последний день действия подписки. Рекомендуем продлить ее заранее.',
                link: '/subscriptions',
                linkLabel: 'Продлить'
            }];
        } else if (daysLeft <= 7) {
            alerts = [{
                level: 'warning',
                kind: 'subscription',
                key: `sub-soon-${daysLeft}`,
                title: 'Подписка скоро закончится',
                text: `До окончания подписки осталось ${daysLeft} дн. Продлите ее, чтобы не потерять доступ.`,
                link: '/subscriptions',
                linkLabel: 'Продлить'
            }];
        }
        return alerts;
    }

    function buildScheduleSetupAlert() {
        if (!currentUser) return [];
        if (currentUser.kgmaGroupId || currentUser.groupName) return [];
        const shortName = currentUser.University?.shortName || '';
        if (shortName !== 'КГМА') return [];
        return [{
            level: 'info',
            kind: 'schedule-setup',
            key: 'schedule-setup',
            title: 'Сохраните своё расписание',
            text: 'Выберите группу на странице расписания — и каждый день около 17:00 придёт напоминание о завтрашних парах.',
            link: '/schedule',
            linkLabel: 'Открыть расписание'
        }];
    }

    function getLocalAlertSeenKey(key) {
        return `alertSeen:${key}`;
    }

    function isLocalAlertSeen(key) {
        try {
            return localStorage.getItem(getLocalAlertSeenKey(key)) === '1';
        } catch {
            return false;
        }
    }

    function markLocalAlertSeen(key) {
        try {
            localStorage.setItem(getLocalAlertSeenKey(key), '1');
        } catch (_) {}
    }

    function shortenUserAgent(ua) {
        const s = String(ua || 'неизвестно').trim();
        if (s.length <= 80) return s;
        return `${s.slice(0, 77)}…`;
    }

    async function refreshAccountSecurityAlerts() {
        if (!currentToken || !currentUser) {
            pendingDeviceAlerts = [];
            pendingBroadcastAlerts = [];
            ensureSubscriptionAlertVisibility();
            return;
        }
        try {
            const [deviceRes, broadcastRes] = await Promise.all([
                fetch(`${API_URL}/auth/account-alerts/device`, {
                    headers: { Authorization: `Bearer ${currentToken}` }
                }),
                fetch(`${API_URL}/auth/account-alerts/broadcast`, {
                    headers: { Authorization: `Bearer ${currentToken}` }
                })
            ]);
            if (deviceRes.ok) {
                const data = await deviceRes.json();
                pendingDeviceAlerts = Array.isArray(data.deviceAlerts) ? data.deviceAlerts : [];
            } else {
                pendingDeviceAlerts = [];
            }
            if (broadcastRes.ok) {
                const data = await broadcastRes.json();
                pendingBroadcastAlerts = Array.isArray(data.broadcastAlerts) ? data.broadcastAlerts : [];
            } else {
                pendingBroadcastAlerts = [];
            }
        } catch {
            pendingDeviceAlerts = [];
            pendingBroadcastAlerts = [];
        }
        ensureSubscriptionAlertVisibility();
    }

    async function markAllAccountAlertsRead() {
        if (!currentToken) return;
        try {
            await fetch(`${API_URL}/auth/account-alerts/read-all`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${currentToken}` }
            });
            pendingBroadcastAlerts = (pendingBroadcastAlerts || []).map((a) => ({ ...a, isRead: true }));
            pendingDeviceAlerts = (pendingDeviceAlerts || []).map((a) => ({ ...a, isRead: true }));
            [...buildSubscriptionAlerts(), ...buildScheduleSetupAlert()].forEach((a) => {
                if (a.key) markLocalAlertSeen(a.key);
            });
        } catch (e) {
            console.error('markAllAccountAlertsRead', e);
        }
    }

    async function dismissBroadcastAlert(alertId) {
        if (!currentToken) return;
        try {
            const response = await fetch(`${API_URL}/auth/account-alerts/broadcast/${encodeURIComponent(alertId)}/dismiss`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${currentToken}` }
            });
            if (!response.ok) return;
            await refreshAccountSecurityAlerts();
        } catch (e) {
            console.error('dismissBroadcastAlert', e);
        }
    }

    async function dismissDeviceAlert(alertId) {
        if (!currentToken) return;
        try {
            const response = await fetch(`${API_URL}/auth/account-alerts/device/${encodeURIComponent(alertId)}/dismiss`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${currentToken}` }
            });
            if (!response.ok) return;
            await refreshAccountSecurityAlerts();
        } catch (e) {
            console.error('dismissDeviceAlert', e);
        }
    }

    function closeSubscriptionAlertPanel() {
        const panel = document.getElementById('subscriptionAlertPanel');
        if (panel) {
            panel.style.display = 'none';
            panel.setAttribute('aria-hidden', 'true');
        }
        isSubscriptionAlertsOpen = false;
    }

    function positionSubscriptionAlertPanel() {
        const panel = document.getElementById('subscriptionAlertPanel');
        const dock = document.getElementById('userChatFabDock');
        if (!panel || !dock) return;

        const dockRect = dock.getBoundingClientRect();
        const gap = 12;
        const bottomOffset = Math.max(gap, Math.round(window.innerHeight - dockRect.top + gap));

        panel.style.top = 'auto';
        panel.style.left = 'auto';
        panel.style.right = `${Math.max(12, Math.round(window.innerWidth - dockRect.right))}px`;
        panel.style.bottom = `${bottomOffset}px`;
    }

    async function openSubscriptionAlertPanel() {
        const panel = document.getElementById('subscriptionAlertPanel');
        if (!panel) return;

        if (isChatOpen) {
            isChatOpen = false;
            const chatStack = document.getElementById('userChatStack');
            if (chatStack) chatStack.style.display = 'none';
        }

        positionSubscriptionAlertPanel();
        panel.style.display = 'flex';
        panel.setAttribute('aria-hidden', 'false');
        isSubscriptionAlertsOpen = true;

        await markAllAccountAlertsRead();
        ensureSubscriptionAlertVisibility();
    }

    function countUnreadAlerts(subAlerts, scheduleAlerts, deviceAlerts, broadcastAlerts) {
        const localUnread = [...subAlerts, ...scheduleAlerts].filter((a) => !isLocalAlertSeen(a.key)).length;
        const deviceUnread = (deviceAlerts || []).filter((a) => a.isRead !== true).length;
        const broadcastUnread = (broadcastAlerts || []).filter((a) => a.isRead !== true).length;
        return localUnread + deviceUnread + broadcastUnread;
    }

    function ensureSubscriptionAlertVisibility() {
        let bellButton = document.getElementById('subscriptionAlertToggle');
        let alertPanel = document.getElementById('subscriptionAlertPanel');
        const fabDock = document.getElementById('userChatFabDock');
        const subAlerts = buildSubscriptionAlerts();
        const scheduleAlerts = buildScheduleSetupAlert();
        const deviceAlerts = pendingDeviceAlerts || [];
        const broadcastAlerts = pendingBroadcastAlerts || [];
        const totalCount = subAlerts.length + scheduleAlerts.length + deviceAlerts.length + broadcastAlerts.length;
        const unreadCount = countUnreadAlerts(subAlerts, scheduleAlerts, deviceAlerts, broadcastAlerts);

        if (!fabDock) return;

        const bellSvg = `<span class="user-chat-toggle-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></span>`;

        if (!bellButton) {
            bellButton = document.createElement('button');
            bellButton.id = 'subscriptionAlertToggle';
            bellButton.className = 'user-chat-toggle subscription-alert-toggle';
            bellButton.type = 'button';
            bellButton.setAttribute('aria-label', 'Уведомления');
            bellButton.setAttribute('title', 'Уведомления');
            bellButton.innerHTML = `${bellSvg}<span id="subscriptionAlertBadge" class="user-chat-badge" style="display:none;">0</span>`;
            fabDock.insertBefore(bellButton, fabDock.firstChild);

            alertPanel = document.createElement('div');
            alertPanel.id = 'subscriptionAlertPanel';
            alertPanel.className = 'subscription-alert-panel';
            alertPanel.style.display = 'none';
            alertPanel.setAttribute('role', 'dialog');
            alertPanel.setAttribute('aria-label', 'Уведомления');
            alertPanel.setAttribute('aria-hidden', 'true');
            alertPanel.innerHTML = `
                <div class="subscription-alert-panel-head">
                    <span>Уведомления</span>
                    <button type="button" class="subscription-alert-panel-close" aria-label="Закрыть">✕</button>
                </div>
                <div id="subscriptionAlertList" class="subscription-alert-panel-list"></div>
            `;
            document.body.appendChild(alertPanel);

            const closePanelBtn = alertPanel.querySelector('.subscription-alert-panel-close');
            if (closePanelBtn) {
                closePanelBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeSubscriptionAlertPanel();
                });
            }

            bellButton.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await refreshAccountSecurityAlerts();
                if (isSubscriptionAlertsOpen) {
                    closeSubscriptionAlertPanel();
                } else {
                    await openSubscriptionAlertPanel();
                }
            });

            if (!document.subscriptionAlertsOutsideHandler) {
                document.subscriptionAlertsOutsideHandler = (e) => {
                    const panel = document.getElementById('subscriptionAlertPanel');
                    const btn = document.getElementById('subscriptionAlertToggle');
                    const dock = document.getElementById('userChatFabDock');
                    if (!panel || !btn) return;
                    if (panel.contains(e.target) || btn.contains(e.target) || dock?.contains(e.target)) {
                        return;
                    }
                    closeSubscriptionAlertPanel();
                };
                document.addEventListener('click', document.subscriptionAlertsOutsideHandler);
            }

            if (!document.subscriptionAlertsResizeHandler) {
                document.subscriptionAlertsResizeHandler = () => {
                    if (isSubscriptionAlertsOpen) positionSubscriptionAlertPanel();
                };
                window.addEventListener('resize', document.subscriptionAlertsResizeHandler);
            }

            if (!document.subscriptionAlertsEscapeHandler) {
                document.subscriptionAlertsEscapeHandler = (e) => {
                    if (e.key === 'Escape' && isSubscriptionAlertsOpen) {
                        closeSubscriptionAlertPanel();
                    }
                };
                document.addEventListener('keydown', document.subscriptionAlertsEscapeHandler);
            }
        }

        const badge = document.getElementById('subscriptionAlertBadge');
        const list = document.getElementById('subscriptionAlertList');
        alertPanel = document.getElementById('subscriptionAlertPanel');

        if (!currentUser || totalCount === 0) {
            bellButton.style.display = 'none';
            bellButton.classList.remove('has-unread');
            closeSubscriptionAlertPanel();
            return;
        }

        bellButton.style.display = 'flex';
        bellButton.classList.toggle('has-unread', unreadCount > 0);
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = String(unreadCount);
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
        if (list) {
            const renderLocal = (alerts) => alerts.map((alert) => {
                const unreadClass = isLocalAlertSeen(alert.key) ? ' is-read' : ' is-unread';
                const link = alert.link
                    ? `<a href="${escapeHtmlStr(alert.link)}" class="btn btn-primary btn-sm subscription-alert-link">${escapeHtmlStr(alert.linkLabel || 'Открыть')}</a>`
                    : '';
                return `
                <div class="subscription-alert-item ${alert.level}${unreadClass}">
                    <h4>${escapeHtmlStr(alert.title)}</h4>
                    <p>${escapeHtmlStr(alert.text)}</p>
                    ${link}
                </div>`;
            }).join('');

            const subHtml = renderLocal(subAlerts);
            const scheduleHtml = renderLocal(scheduleAlerts);
            const devHtml = deviceAlerts.map((a) => {
                const when = a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : '';
                const ip = a.ipAddress || '—';
                const unreadClass = a.isRead === true ? ' is-read' : ' is-unread';
                return `
                <div class="subscription-alert-item info device-login-alert${unreadClass}" data-device-alert-id="${a.id}">
                    <h4>Вход с нового устройства</h4>
                    <p class="device-login-meta">${when} · IP: ${escapeHtmlStr(ip)}</p>
                    <p class="device-login-ua">${escapeHtmlStr(shortenUserAgent(a.userAgent))}</p>
                    <p class="device-login-hint">Если это были не вы, смените пароль в профиле.</p>
                    <button type="button" class="btn btn-secondary btn-sm device-login-dismiss" data-dismiss-id="${a.id}">Скрыть</button>
                </div>`;
            }).join('');
            const broadcastHtml = broadcastAlerts.map((a) => {
                const when = a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : '';
                const title = escapeHtmlStr(a.title || 'Сообщение от администрации');
                const text = escapeHtmlStr(a.message || '').replace(/\n/g, '<br>');
                const unreadClass = a.isRead === true ? ' is-read' : ' is-unread';
                return `
                <div class="subscription-alert-item info admin-broadcast-alert${unreadClass}" data-broadcast-alert-id="${a.id}">
                    <h4>${title}</h4>
                    ${when ? `<p class="device-login-meta">${when}</p>` : ''}
                    <p class="admin-broadcast-text">${text}</p>
                    <button type="button" class="btn btn-secondary btn-sm broadcast-alert-dismiss" data-dismiss-id="${a.id}">Скрыть</button>
                </div>`;
            }).join('');
            list.innerHTML = scheduleHtml + broadcastHtml + subHtml + devHtml;
            list.querySelectorAll('.broadcast-alert-dismiss').forEach((btn) => {
                btn.addEventListener('click', async (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    const id = btn.getAttribute('data-dismiss-id');
                    if (!id) return;
                    await dismissBroadcastAlert(id);
                });
            });
            list.querySelectorAll('.device-login-dismiss').forEach((btn) => {
                btn.addEventListener('click', async (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    const id = btn.getAttribute('data-dismiss-id');
                    if (!id) return;
                    await dismissDeviceAlert(id);
                });
            });
        }
    }

    // Навигация
    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }
    }

    // Показать страницу по ID (для внутреннего использования)
    function showPageById(pageId) {
        showPage(pageId);
    }

    // Клиентский роутинг - для внутренней навигации без перезагрузки
    function navigateTo(path) {
        // Обновляем URL
        window.history.pushState({ path }, '', path);
        // Обрабатываем маршрут для загрузки данных
        handleRoute(path);
    }

    function handleRoute(path) {
        // Убираем начальный слэш и разбиваем путь
        const route = path.replace(/^\//, '').split('?')[0];
        const params = new URLSearchParams(path.split('?')[1] || '');

        // Обрабатываем маршруты для загрузки данных
        switch (route) {
            case '':
            case 'index.html':
                // Главная страница
                break;
            case 'tests':
                // Загружаем предметы, если мы на странице tests.html
                if (document.getElementById('subjectsList')) {
                    loadSubjects();
                }
                break;
            case 'subject-tests':
                const subjectId = params.get('id');
                const subjectName = params.get('name');
                const subjectDesc = params.get('desc');
                if (subjectId && document.getElementById('testsList')) {
                    loadSubjectTests(subjectId, subjectName, subjectDesc);
                }
                break;
            case 'test-settings':
                const testId = params.get('id');
                const testName = params.get('name');
                const questionsCount = parseInt(params.get('questions') || '0', 10) || 0;
                if (testId && document.getElementById('testName')) {
                    loadTestSettings(testId, testName, questionsCount);
                }
                break;
            case 'favorites':
                if (document.getElementById('favoritesList')) {
                    loadFavorites();
                }
                break;
            case 'profile':
                if (document.getElementById('userStats')) {
                    loadProfile();
                }
                break;
            case 'subscriptions':
                if (document.getElementById('subsStatus') && typeof loadSubscriptionsPage === 'function') {
                    loadSubscriptionsPage();
                }
                break;
            case 'news':
                if (document.getElementById('newsList')) {
                    loadNews();
                }
                break;
            default:
                // Неизвестный маршрут - ничего не делаем
                break;
        }
    }

    // Обработка навигации браузера (назад/вперед)
    window.addEventListener('popstate', (e) => {
        const path = e.state?.path || window.location.pathname;
        handleRoute(path);
    });

    // Обработка кликов на ссылки убрана - используем стандартную навигацию
    // URL будет меняться автоматически при переходах между страницами

    function setupEventListeners() {
        // Пропускаем инициализацию на странице админки
        if (window.location.pathname.includes('/admin') || document.getElementById('adminLoginForm')) {
            console.log('Пропуск инициализации app.js на странице админки');
            return;
        }

        if (appEventListenersAttached) {
            return;
        }
        appEventListenersAttached = true;

        // Кнопки
        // Для кнопок login/register - если это ссылки, не перехватывать клики
        // Ссылки работают через стандартный href
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn && loginBtn.tagName === 'BUTTON') {
            loginBtn.addEventListener('click', () => {
                window.location.href = '/login';
            });
        }
        // Если это ссылка (<a>), она работает стандартно через href

        const registerBtn = document.getElementById('registerBtn');
        if (registerBtn && registerBtn.tagName === 'BUTTON') {
            registerBtn.addEventListener('click', () => {
                window.location.href = '/register';
            });
        }
        // Если это ссылка (<a>), она работает стандартно через href

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }

        // Формы
        // НЕ добавляем обработчик регистрации на странице /register - там используется новый процесс с оплатой
        const registerForm = document.getElementById('registerForm');
        if (registerForm && !window.location.pathname.includes('/register')) {
            registerForm.addEventListener('submit', handleRegister);
        }

        const loginForm = document.getElementById('loginForm');
        // НЕ привязываем обработчик к форме админки
        if (loginForm && !loginForm.id.includes('admin') && loginForm.id !== 'adminLoginForm') {
            loginForm.addEventListener('submit', handleLogin);
        }

        const showLogin = document.getElementById('showLogin');
        if (showLogin) {
            showLogin.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/login';
            });
        }

        const showRegister = document.getElementById('showRegister');
        if (showRegister) {
            showRegister.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/register';
            });
        }

        // Тесты
        const backToSubjectsBtn = document.getElementById('backToSubjects');
        if (backToSubjectsBtn) {
            backToSubjectsBtn.addEventListener('click', () => {
                window.location.href = '/tests';
            });
        }

        const backToTestsBtn = document.getElementById('backToTests');
        if (backToTestsBtn) {
            backToTestsBtn.addEventListener('click', () => {
                const urlParams = new URLSearchParams(window.location.search);
                const subjectId = urlParams.get('subjectId');
                if (subjectId) {
                    window.location.href = `/subject-tests?id=${subjectId}`;
                } else {
                    window.location.href = '/tests';
                }
            });
        }
        const startTestBtn = document.getElementById('startTest');
        if (startTestBtn) {
            startTestBtn.addEventListener('click', startTest);
        }

        const nextQuestionBtn = document.getElementById('nextQuestion');
        if (nextQuestionBtn) {
            nextQuestionBtn.addEventListener('click', nextQuestion);
        }

        const prevQuestionBtn = document.getElementById('prevQuestion');
        if (prevQuestionBtn) {
            prevQuestionBtn.addEventListener('click', prevQuestion);
        }

        const finishTestBtn = document.getElementById('finishTest');
        if (finishTestBtn) {
            finishTestBtn.addEventListener('click', finishTest);
        }

        const reportQuestionErrorBtn = document.getElementById('reportQuestionErrorBtn');
        if (reportQuestionErrorBtn) {
            reportQuestionErrorBtn.addEventListener('click', openQuestionErrorModal);
        }
        const questionErrorForm = document.getElementById('questionErrorForm');
        if (questionErrorForm) {
            questionErrorForm.addEventListener('submit', handleQuestionErrorReport);
        }
        const questionErrorModalClose = document.getElementById('questionErrorModalClose');
        if (questionErrorModalClose) {
            questionErrorModalClose.addEventListener('click', closeQuestionErrorModal);
        }
        const cancelQuestionErrorBtn = document.getElementById('cancelQuestionErrorBtn');
        if (cancelQuestionErrorBtn) {
            cancelQuestionErrorBtn.addEventListener('click', closeQuestionErrorModal);
        }

        const backToTestsAfterResultBtn = document.getElementById('backToTestsAfterResult');
        if (backToTestsAfterResultBtn) {
            backToTestsAfterResultBtn.addEventListener('click', () => {
                window.location.href = '/tests';
            });
        }

        const useTimerCheckbox = document.getElementById('useTimer');
        if (useTimerCheckbox) {
            useTimerCheckbox.addEventListener('change', (e) => {
                const timerGroup = document.getElementById('timerGroup');
                if (timerGroup) {
                    timerGroup.style.display = e.target.checked ? 'flex' : 'none';
                }
            });
        }

        const testModeInput = document.getElementById('testMode');
        const modeInstantBtn = document.getElementById('modeInstantBtn');
        const timerToggleBtn = document.getElementById('timerToggleBtn');
        if (testModeInput && modeInstantBtn && useTimerCheckbox && timerToggleBtn) {
            const applyTestModeUI = () => {
                const mode = testModeInput.value === 'instant' ? 'instant' : 'standard';
                const isInstant = mode === 'instant';
                modeInstantBtn.classList.toggle('active', isInstant);
                timerToggleBtn.classList.toggle('active', !isInstant && useTimerCheckbox.checked);
                const timerGroup = document.getElementById('timerGroup');
                if (timerGroup) {
                    timerGroup.style.display = useTimerCheckbox.checked ? 'flex' : 'none';
                }
            };

            /** Режим теста: instant — без таймера; standard — таймер по чекбоксу useTimer. */
            const setTestMode = (mode, options = {}) => {
                const next = mode === 'instant' ? 'instant' : 'standard';
                testModeInput.value = next;
                if (next === 'instant') {
                    useTimerCheckbox.checked = false;
                } else if (options.timerOn !== undefined) {
                    useTimerCheckbox.checked = !!options.timerOn;
                } else if (!('preserveTimer' in options) || !options.preserveTimer) {
                    useTimerCheckbox.checked = true;
                }
                applyTestModeUI();
            };

            modeInstantBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (testModeInput.value === 'instant') {
                    setTestMode('standard', { timerOn: true });
                } else {
                    setTestMode('instant');
                }
            });

            timerToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (testModeInput.value === 'instant') {
                    setTestMode('standard', { timerOn: true });
                    return;
                }
                useTimerCheckbox.checked = !useTimerCheckbox.checked;
                applyTestModeUI();
            });

            setTestMode(testModeInput.value || 'standard', { preserveTimer: true });
        }

        const startFavoriteTestBtn = document.getElementById('startFavoriteTest');
        if (startFavoriteTestBtn) {
            startFavoriteTestBtn.addEventListener('click', startFavoriteTest);
        }

        // Обработчики для кнопок на главной странице
        document.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (btn.hasAttribute('data-page')) {
                    const page = btn.getAttribute('data-page');
                    if (page === 'tests') {
                        window.location.href = '/tests';
                    }
                }
            });
        });

        // Обратная связь
        document.getElementById('contactForm')?.addEventListener('submit', handleContact);

        // Мобильное меню - инициализируем только один раз
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        const navMenu = document.getElementById('navMenu');

        if (mobileMenuToggle && navMenu && mobileMenuToggle.dataset.initialized !== 'true') {
            mobileMenuToggle.dataset.initialized = 'true';

            // Функция для переключения меню
            const toggleMenu = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                mobileMenuToggle.classList.toggle('active');
                navMenu.classList.toggle('active');
            };

            // Добавляем обработчик клика на кнопку меню
            mobileMenuToggle.addEventListener('click', toggleMenu);

            // Закрытие меню при клике на ссылку
            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', () => {
                    mobileMenuToggle.classList.remove('active');
                    navMenu.classList.remove('active');
                });
            });

            // Закрытие меню при клике вне его (только один раз на document)
            const closeMenuOnOutsideClick = (e) => {
                if (navMenu && mobileMenuToggle &&
                    !navMenu.contains(e.target) &&
                    !mobileMenuToggle.contains(e.target) &&
                    navMenu.classList.contains('active')) {
                    mobileMenuToggle.classList.remove('active');
                    navMenu.classList.remove('active');
                }
            };

            // Добавляем обработчик только если его еще нет
            if (!document.mobileMenuOutsideClickHandler) {
                document.mobileMenuOutsideClickHandler = closeMenuOnOutsideClick;
                document.addEventListener('click', document.mobileMenuOutsideClickHandler);
            }
        }
    }

    function initUserChatWidget() {
        if (document.getElementById('userChatToggle')) return;

        const chatToggle = document.createElement('button');
        chatToggle.id = 'userChatToggle';
        chatToggle.className = 'user-chat-toggle';
        chatToggle.type = 'button';
        chatToggle.setAttribute('aria-label', 'Чат с администратором');
        chatToggle.setAttribute('title', 'Чат');
        chatToggle.innerHTML = `<span class="user-chat-toggle-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><span id="userChatUnreadBadge" class="user-chat-badge" style="display:none;">0</span>`;

        const fabDock = document.createElement('div');
        fabDock.id = 'userChatFabDock';
        fabDock.className = 'user-chat-fab-dock';
        fabDock.style.display = 'none';
        fabDock.appendChild(chatToggle);

        const chatStack = document.createElement('div');
        chatStack.id = 'userChatStack';
        chatStack.className = 'user-chat-stack';
        chatStack.style.display = 'none';

        const chatWindow = document.createElement('div');
        chatWindow.id = 'userChatWindow';
        chatWindow.className = 'user-chat-window';
        chatWindow.innerHTML = `
            <div class="user-chat-header">
                <span class="user-chat-title">Чат с администратором</span>
                <button type="button" id="closeUserChatBtn" class="user-chat-close" aria-label="Закрыть чат">✕</button>
            </div>
            <div class="user-chat-messages-card user-chat-messages-card--solo">
                <div id="userChatMessages" class="user-chat-messages"></div>
            </div>
            <form id="userChatForm" class="user-chat-form">
                <textarea id="userChatInput" rows="2" placeholder="Напишите сообщение..." required></textarea>
                <button type="submit" class="btn btn-primary">Отправить</button>
            </form>
        `;

        chatStack.appendChild(chatWindow);

        document.body.appendChild(fabDock);
        document.body.appendChild(chatStack);

        chatToggle.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (isSubscriptionAlertsOpen) {
                closeSubscriptionAlertPanel();
            }
            isChatOpen = !isChatOpen;
            chatStack.style.display = isChatOpen ? 'flex' : 'none';
            if (isChatOpen) {
                await loadUserChatMessages();
            }
        });

        const closeBtn = document.getElementById('closeUserChatBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', async () => {
                await markAdminMessagesAsRead();
                await updateChatUnreadBadge();
                isChatOpen = false;
                chatStack.style.display = 'none';
            });
        }

        const chatForm = document.getElementById('userChatForm');
        if (chatForm) {
            chatForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const input = document.getElementById('userChatInput');
                if (!input) return;
                const text = input.value.trim();
                if (!text) return;

                try {
                    const response = await fetch(`${API_URL}/chat/messages`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${currentToken}`
                        },
                        body: JSON.stringify({ text })
                    });
                    if (!response.ok) {
                        const result = await response.json().catch(() => ({}));
                        throw new Error(result.error || 'Ошибка отправки сообщения');
                    }

                    input.value = '';
                    await loadUserChatMessages();
                } catch (error) {
                    console.error('Ошибка отправки сообщения в чат:', error);
                    showNotification(error.message || 'Ошибка отправки сообщения', 'error');
                }
            });
        }
    }

    function escapeChatHtml(text) {
        return escapeHtmlStr(text);
    }

    async function fetchUserChatMessagesList() {
        if (!currentUser || !currentToken) return [];
        const response = await fetch(`${API_URL}/chat/messages`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!response.ok) {
            throw new Error('Ошибка загрузки чата');
        }
        const data = await response.json();
        return data.messages || [];
    }

    async function loadUserChatMessages() {
        if (!currentUser || !currentToken) return;
        const messagesEl = document.getElementById('userChatMessages');
        if (!messagesEl) return;

        try {
            const messages = await fetchUserChatMessagesList();
            messagesEl.innerHTML = messages.map(msg => `
                <div class="user-chat-bubble ${msg.isAdmin ? 'admin' : 'user'}">
                    ${msg.text}
                    <div class="user-chat-time">${new Date(msg.createdAt).toLocaleString('ru-RU')}</div>
                </div>
            `).join('');
            messagesEl.scrollTop = messagesEl.scrollHeight;
        } catch (error) {
            console.error('Ошибка загрузки сообщений чата:', error);
        }
    }

    async function updateChatUnreadBadge() {
        const badge = document.getElementById('userChatUnreadBadge');
        if (!badge || !currentUser || !currentToken) return;

        try {
            const response = await fetch(`${API_URL}/chat/unread-count`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            if (!response.ok) return;
            const data = await response.json();
            const count = data.unreadCount || 0;
            const show = count > 0 ? 'inline-flex' : 'none';
            badge.textContent = String(count);
            badge.style.display = show;
            const chatBtn = document.getElementById('userChatToggle');
            if (chatBtn) {
                chatBtn.setAttribute('aria-label', count > 0 ? `Чат, непрочитано: ${count}` : 'Чат с администратором');
            }
        } catch (error) {
            console.error('Ошибка получения счетчика непрочитанных сообщений:', error);
        }
    }

    async function markAdminMessagesAsRead() {
        if (!currentUser || !currentToken) return;
        try {
            await fetch(`${API_URL}/chat/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
        } catch (error) {
            console.error('Ошибка пометки сообщений как прочитанных:', error);
        }
    }

    function startChatPolling() {
        if (chatPollInterval) return;
        chatPollInterval = setInterval(async () => {
            if (!currentUser || !currentToken) return;
            await refreshAccountSecurityAlerts();
            await updateChatUnreadBadge();
            if (isChatOpen) {
                await loadUserChatMessages();
            }
        }, 3000);
    }

    function stopChatPolling() {
        if (!chatPollInterval) return;
        clearInterval(chatPollInterval);
        chatPollInterval = null;
    }

    // Инициализация на всех страницах
    async function init() {
        // Полностью пропускаем инициализацию на странице админки
        if (window.location.pathname.includes('/admin') || document.getElementById('adminLoginForm')) {
            console.log('app.js: Пропуск инициализации на странице админки');
            return;
        }

        initTheme();
        await loadUser();
        setupEventListeners();
        initUserChatWidget();
        ensureUserChatVisibility();
        initScrollAnimations();
        initDocLinks();

        // Обработка текущего маршрута при загрузке для загрузки данных
        handleRoute(window.location.pathname);
    }

    // Подстановка ссылок на документы (оферта, политика) из настроек админки
    async function initDocLinks() {
        try {
            const response = await fetch(`${API_URL}/settings/docs`);
            if (!response.ok) return;
            const data = await response.json();
            document.querySelectorAll('[data-doc="privacy"]').forEach(el => {
                el.href = (data.privacyPolicyUrl && data.privacyPolicyUrl.trim()) ? data.privacyPolicyUrl.trim() : '/downloads/politika_konfidencialnosti.pdf';
            });
            document.querySelectorAll('[data-doc="offer"]').forEach(el => {
                el.href = (data.publicOfferUrl && data.publicOfferUrl.trim()) ? data.publicOfferUrl.trim() : '/downloads/publichnaya_oferta.pdf';
            });
        } catch (e) {
            console.warn('Не удалось загрузить ссылки на документы:', e);
        }
    }

    // Не инициализируем app.js на странице админки
    if (window.location.pathname.includes('/admin')) {
        console.log('app.js: Страница админки обнаружена, инициализация отключена');
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Дополнительная проверка перед инициализацией
        if (!document.getElementById('adminLoginForm')) {
            init();
        } else {
            console.log('app.js: Форма админки обнаружена, инициализация отключена');
        }
    }

    // Анимации при прокрутке
    function initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, observerOptions);

        // Наблюдаем за элементами с классом animate-on-scroll
        document.querySelectorAll('.animate-on-scroll').forEach(el => {
            observer.observe(el);
        });
    }

    // Функция loadPage больше не нужна, используются прямые ссылки

    // Регистрация и вход
    async function handleRegister(e) {
        e.preventDefault();
        const formData = new FormData(e.target);

        // Получаем данные из формы
        const data = {
            username: formData.get('username'),
            email: formData.get('email'),
            password: formData.get('password'),
            confirmPassword: formData.get('confirmPassword'),
            // Явно проверяем состояние чекбоксов
            dataConsent: document.getElementById('dataConsent').checked ? 'true' : 'false',
            publicOffer: document.getElementById('publicOffer').checked ? 'true' : 'false'
        };

        // Проверка чекбоксов на клиенте
        if (!document.getElementById('dataConsent').checked) {
            showNotification('Необходимо согласие на обработку персональных данных', 'error');
            return;
        }

        if (!document.getElementById('publicOffer').checked) {
            showNotification('Необходимо согласие с публичной офертой', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await parseApiJsonResponse(response);

            if (response.ok) {
                // Показываем сообщение об ожидании одобрения
                showNotification(result.message || 'Заявка на регистрацию отправлена. Ожидайте одобрения администратора.', 'success');
                e.target.reset();

                // Перенаправляем на страницу входа через 2 секунды
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                // Обработка ошибок валидации
                if (result.errors && Array.isArray(result.errors)) {
                    const errorMessages = result.errors.map(err => err.msg || err.message).join(', ');
                    showNotification(errorMessages, 'error');
                } else {
                    showNotification(result.error || 'Ошибка регистрации', 'error');
                }
            }
        } catch (error) {
            console.error('Ошибка регистрации:', error);
            if (error.message === 'NON_JSON_API_RESPONSE') {
                showNotification(
                    `Сервер вернул неожиданный ответ (${error.httpStatus}). Обновите страницу или попробуйте позже.`,
                    'error'
                );
            } else {
                showNotification(clientNetworkFailureMessage(), 'error');
            }
        }
    }

    async function handleLogin(e) {
        e.preventDefault();

        // СТРОГАЯ ПРОВЕРКА: не обрабатываем форму админки
        const form = e.target;
        if (!form || form.id === 'adminLoginForm' || form.id.includes('admin')) {
            console.warn('app.js: Попытка обработать форму админки через handleLogin - игнорируем');
            return;
        }

        const formData = new FormData(form);
        const data = Object.fromEntries(formData);

        // Переименовываем identifier в identifier для backend
        const loginData = {
            identifier: data.identifier,
            password: data.password
        };

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(loginData)
            });

            const result = await parseApiJsonResponse(response);

            if (response.ok) {
                currentToken = result.token;
                currentUser = result.user;
                localStorage.setItem('token', currentToken);
                showNotification('Вход выполнен успешно!', 'success');
                const next = new URLSearchParams(window.location.search).get('next');
                const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
                window.location.href = safeNext;
            } else {
                showNotification(result.error || 'Ошибка входа', 'error');
            }
        } catch (error) {
            console.error('Ошибка входа:', error);
            if (error.message === 'NON_JSON_API_RESPONSE') {
                showNotification(
                    `Сервер вернул неожиданный ответ (${error.httpStatus}). Обновите страницу или попробуйте позже.`,
                    'error'
                );
            } else {
                showNotification(clientNetworkFailureMessage(), 'error');
            }
        }
    }

    function logout() {
        currentUser = null;
        currentToken = null;
        pendingDeviceAlerts = [];
        pendingBroadcastAlerts = [];
        stopChatPolling();
        localStorage.removeItem('token');
        showNotification('Вы вышли из системы', 'success');
        window.location.href = '/';
    }

    // Предметы и тесты
    let allSubjects = []; // Храним все предметы для фильтрации
    let currentProgramType = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('programType') === 'usmle')
        ? 'usmle'
        : 'university';

    function setProgramType(program) {
        currentProgramType = program === 'usmle' ? 'usmle' : 'university';
        try { sessionStorage.setItem('programType', currentProgramType); } catch (_) {}
    }

    function getProgramType() {
        return currentProgramType === 'usmle' ? 'usmle' : 'university';
    }

    async function loadSubjects() {
        // Для неавторизованных пользователей показываем предметы с бесплатными тестами
        try {
            const container = document.getElementById('subjectsList');
            if (!container) return;

            const program = getProgramType();
            const response = await fetch(`${API_URL}/tests/subjects?program=${encodeURIComponent(program)}`, {
                headers: currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}
            });
            allSubjects = await response.json();

            // Проверяем количество избранных вопросов (только для авторизованных)
            let favoritesCount = 0;
            if (currentUser && program !== 'usmle') {
                try {
                    const favoritesResponse = await fetch(`${API_URL}/favorites`, {
                        headers: {
                            'Authorization': `Bearer ${currentToken}`
                        }
                    });
                    if (favoritesResponse.ok) {
                        const favorites = await favoritesResponse.json();
                        favoritesCount = favorites.length;
                    }
                } catch (error) {
                    console.error('Ошибка загрузки избранного:', error);
                }
            }

            // Отображаем все предметы с карточкой избранного, если есть избранные вопросы
            displaySubjects(allSubjects, favoritesCount);
        } catch (error) {
            console.error('Ошибка загрузки предметов:', error);
            showNotification('Ошибка загрузки предметов', 'error');
            const container = document.getElementById('subjectsList');
            if (container) {
                container.innerHTML = '<p style="text-align: center; color: var(--danger-color); padding: 3rem; grid-column: 1 / -1;">Ошибка загрузки. Попробуйте обновить страницу.</p>';
            }
        }
    }

    // Функция отображения предметов
    function displaySubjects(subjects, favoritesCount = 0) {
        const container = document.getElementById('subjectsList');
        if (!container) return;

        let html = '';

        // Добавляем карточку "Тест из избранного" если есть избранные вопросы
        if (favoritesCount > 0) {
            html += `
            <div class="subject-card card-animate" style="animation-delay: 0s; border: 2px solid var(--primary-color); background: linear-gradient(135deg, var(--primary-color)15, var(--bg-primary));" onclick="if(typeof startFavoriteTest === 'function') { startFavoriteTest(); } else { window.location.href='/favorites'; }">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.5rem;">⭐</span>
                    <h3 style="margin: 0; color: var(--primary-color);">Тест из избранного</h3>
                </div>
                <p style="margin: 0; color: var(--text-secondary);">
                    Пройдите тест из ${favoritesCount} ${favoritesCount === 1 ? 'вопроса' : favoritesCount < 5 ? 'вопросов' : 'вопросов'}, которые вы добавили в избранное
                </p>
            </div>
        `;
        }

        if (subjects.length === 0) {
            if (html === '') {
                html = '<p style="text-align: center; color: var(--text-secondary); padding: 3rem; grid-column: 1 / -1;">Предметы не найдены</p>';
            }
        } else {
            html += subjects.map((subject, index) => {
                const name = encodeURIComponent(subject.name);
                const desc = encodeURIComponent(subject.description || '');
                const delay = favoritesCount > 0 ? (index + 1) * 0.1 : index * 0.1;
                return `
                <div class="subject-card card-animate" style="animation-delay: ${delay}s;" onclick="window.location.href='/subject-tests?id=${subject.id}&name=${name}&desc=${desc}&program=${getProgramType()}'">
                    <h3>${subject.name}</h3>
                    <p>${subject.description || 'Тесты по данному предмету для подготовки к экзаменам'}</p>
                </div>
            `;
            }).join('');
        }

        container.innerHTML = html;
    }

    // Функция поиска по предметам
    async function filterSubjects(searchQuery) {
        if (!searchQuery || searchQuery.trim() === '') {
            // При очистке поиска загружаем избранное заново
            let favoritesCount = 0;
            try {
                const favoritesResponse = await fetch(`${API_URL}/favorites`, {
                    headers: {
                        'Authorization': `Bearer ${currentToken}`
                    }
                });
                if (favoritesResponse.ok) {
                    const favorites = await favoritesResponse.json();
                    favoritesCount = favorites.length;
                }
            } catch (error) {
                console.error('Ошибка загрузки избранного:', error);
            }
            displaySubjects(allSubjects, favoritesCount);
            updateSearchResultsCount(null);
            return;
        }

        const query = searchQuery.toLowerCase().trim();
        const filtered = allSubjects.filter(subject => {
            const name = subject.name.toLowerCase();
            const description = (subject.description || '').toLowerCase();
            return name.includes(query) || description.includes(query);
        });

        // При поиске не показываем карточку избранного
        displaySubjects(filtered, 0);
        updateSearchResultsCount(filtered.length);
    }

    // Обновление счетчика результатов поиска
    function updateSearchResultsCount(count) {
        const countEl = document.getElementById('searchResultsCount');
        const clearBtn = document.getElementById('clearSearch');

        if (count === null) {
            if (countEl) countEl.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
        } else {
            if (countEl) {
                countEl.style.display = 'block';
                if (count === 0) {
                    countEl.textContent = 'Ничего не найдено';
                    countEl.className = 'search-results-count no-results';
                } else {
                    countEl.textContent = `Найдено: ${count} ${count === 1 ? 'предмет' : count < 5 ? 'предмета' : 'предметов'}`;
                    countEl.className = 'search-results-count';
                }
            }
            if (clearBtn) clearBtn.style.display = 'block';
        }
    }

    let currentSubjectId = null;
    let currentSubjectName = null;
    let currentSubjectDescription = null;
    let subjectTestsCache = [];

    function hasActiveSubscription() {
        if (!currentUser) return false;
        if (currentUser.isAdminAccount === true || currentUser.subscriptionActive === true) return true;
        return !!(currentUser.subscriptionEndDate && new Date(currentUser.subscriptionEndDate) > new Date());
    }

    function hasActiveUsmleSubscription() {
        if (!currentUser) return false;
        if (currentUser.isAdminAccount === true || currentUser.usmleSubscriptionActive === true) return true;
        return !!(currentUser.usmleSubscriptionEndDate && new Date(currentUser.usmleSubscriptionEndDate) > new Date());
    }

    function canAccessTest(test) {
        if (!test) return false;
        // Весь USMLE — только с подпиской USMLE (даже «бесплатные» тесты)
        if ((test.programType || 'university') === 'usmle') {
            return hasActiveUsmleSubscription();
        }
        if (test.isFree) return true;
        return hasActiveSubscription();
    }

    function getTestQuestionCount(test) {
        return test?.Questions?.length ?? test?.questionCount ?? 0;
    }

    function renderTestCard(test, index) {
        const isFree = test.isFree || false;
        const qCount = getTestQuestionCount(test);
        const uniTag = test.University?.shortName
            ? `<span style="background: var(--bg-secondary); color: var(--text-secondary); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">${test.University.shortName}</span>`
            : '';
        const cardClass = 'test-card card-animate';
        const isFav = !!test.isFavorite;
        const starBtn = currentToken
            ? `<button type="button" class="catalog-fav-star ${isFav ? 'is-on' : ''}" data-star-test="${test.id}" onclick="event.stopPropagation(); toggleTestCatalogFavorite(${test.id}, this);" aria-label="Избранное" title="Избранное">★</button>`
            : '';
        return `
            <div class="${cardClass}" style="animation-delay: ${index * 0.1}s; position: relative;" role="button" tabindex="0"
                onclick="handleTestCardClick(${test.id})"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();handleTestCardClick(${test.id});}">
                ${starBtn}
                <h3>${test.name} ${isFree ? '<span style="background: #10b981; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">БЕСПЛАТНО</span>' : ''}${uniTag}</h3>
                <p><strong>Вопросов:</strong> ${qCount}</p>
                ${test.description ? `<p style="margin-top: 0.5rem; font-size: 0.9rem;">${test.description}</p>` : ''}
            </div>
        `;
    }

    async function toggleTestCatalogFavorite(testId, btn) {
        if (!currentToken) {
            window.location.href = '/login';
            return;
        }
        const isOn = btn.classList.contains('is-on');
        try {
            const res = await fetch(`${API_URL}/catalog-favorites/test/${testId}`, {
                method: isOn ? 'DELETE' : 'POST',
                headers: { Authorization: `Bearer ${currentToken}` }
            });
            if (!res.ok) throw new Error('fail');
            btn.classList.toggle('is-on', !isOn);
            const test = subjectTestsCache.find((t) => t.id === testId);
            if (test) test.isFavorite = !isOn;
            showNotification(isOn ? 'Удалено из избранного' : 'Добавлено в избранное', 'success');
        } catch (e) {
            showNotification('Не удалось обновить избранное', 'error');
        }
    }

    async function toggleSubjectCatalogFavorite(subjectId, btn) {
        if (!currentToken) {
            window.location.href = '/login';
            return;
        }
        const isOn = btn.classList.contains('is-on');
        try {
            const res = await fetch(`${API_URL}/catalog-favorites/subject/${subjectId}`, {
                method: isOn ? 'DELETE' : 'POST',
                headers: { Authorization: `Bearer ${currentToken}` }
            });
            if (!res.ok) throw new Error('fail');
            btn.classList.toggle('is-on', !isOn);
            showNotification(isOn ? 'Удалено из избранного' : 'Добавлено в избранное', 'success');
        } catch (e) {
            showNotification('Не удалось обновить избранное', 'error');
        }
    }

    function handleTestCardClick(testId) {
        const test = subjectTestsCache.find((t) => t.id === testId);
        if (!test) return;
        if (canAccessTest(test)) {
            const testName = encodeURIComponent(test.name);
            const qCount = getTestQuestionCount(test);
            window.location.href = `/test-settings?id=${test.id}&name=${testName}&questions=${qCount}`;
            return;
        }
        showSubscriptionRequiredModal();
    }

    let selectedUsmleTagIds = [];

    async function loadSubjectTests(subjectId, subjectName, subjectDescription = '', options = {}) {
        currentSubjectId = subjectId;
        currentSubjectName = subjectName;
        currentSubjectDescription = subjectDescription;

        try {
            let url = `${API_URL}/tests/subjects/${subjectId}/tests`;
            const tagIds = options.tagIds || selectedUsmleTagIds;
            if (getProgramType() === 'usmle' && tagIds && tagIds.length) {
                url += `?tagIds=${encodeURIComponent(tagIds.join(','))}`;
            }
            const response = await fetch(url, {
                headers: currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}
            });
            const tests = await response.json();
            subjectTestsCache = Array.isArray(tests) ? tests : [];

            if (currentToken && subjectTestsCache.length) {
                try {
                    const favRes = await fetch(`${API_URL}/catalog-favorites`, {
                        headers: { Authorization: `Bearer ${currentToken}` }
                    });
                    if (favRes.ok) {
                        const favData = await favRes.json();
                        const favTests = new Set((favData.testIds || []).map(Number));
                        const favSubjects = new Set((favData.subjectIds || []).map(Number));
                        subjectTestsCache.forEach((t) => { t.isFavorite = favTests.has(Number(t.id)); });
                        const subjStar = document.getElementById('subjectFavoriteBtn');
                        if (subjStar) {
                            subjStar.classList.toggle('is-on', favSubjects.has(Number(subjectId)));
                            subjStar.style.display = '';
                            subjStar.onclick = (e) => {
                                e.preventDefault();
                                toggleSubjectCatalogFavorite(subjectId, subjStar);
                            };
                        }
                    }
                } catch (_) { /* ignore */ }
            }

            const subjectNameEl = document.getElementById('subjectName');
            if (subjectNameEl) {
                subjectNameEl.textContent = decodeURIComponent(subjectName || '');
            }

            const descEl = document.getElementById('subjectDescription');
            if (descEl) {
                descEl.textContent = decodeURIComponent(subjectDescription || '') || 'Выберите тест для прохождения. Каждый тест можно настроить под свои потребности.';
            }

            const container = document.getElementById('testsList');
            if (container) {
                if (subjectTestsCache.length === 0) {
                    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 3rem;">Тесты по данному предмету пока не добавлены</p>';
                } else {
                    container.innerHTML = subjectTestsCache.map((test, index) => renderTestCard(test, index)).join('');
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки тестов:', error);
            showNotification('Ошибка загрузки тестов', 'error');
        }
    }

    async function loadUsmleTagFilters(containerId) {
        const el = document.getElementById(containerId || 'usmleTagFilters');
        if (!el) return;
        try {
            const response = await fetch(`${API_URL}/tests/usmle/tags`, {
                headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {}
            });
            const tags = await response.json();
            if (!Array.isArray(tags) || !tags.length) {
                el.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Теги пока не добавлены</p>';
                return;
            }
            el.innerHTML = `
                <div class="usmle-tags-label">Фильтр по тегам</div>
                <div class="usmle-tags-list">
                    ${tags.map((t) => `
                        <button type="button" class="usmle-tag-chip${selectedUsmleTagIds.includes(t.id) ? ' active' : ''}"
                            data-tag-id="${t.id}" onclick="toggleUsmleTag(${t.id})">${t.name}</button>
                    `).join('')}
                </div>
                <button type="button" class="btn btn-secondary btn-sm" style="margin-top:0.5rem;" onclick="clearUsmleTags()">Сбросить теги</button>
            `;
        } catch (e) {
            console.error('loadUsmleTagFilters', e);
        }
    }

    function toggleUsmleTag(tagId) {
        const id = Number(tagId);
        if (selectedUsmleTagIds.includes(id)) {
            selectedUsmleTagIds = selectedUsmleTagIds.filter((x) => x !== id);
        } else {
            selectedUsmleTagIds = [...selectedUsmleTagIds, id];
        }
        loadUsmleTagFilters();
        if (currentSubjectId) {
            loadSubjectTests(currentSubjectId, currentSubjectName, currentSubjectDescription, {
                tagIds: selectedUsmleTagIds
            });
        }
    }

    function clearUsmleTags() {
        selectedUsmleTagIds = [];
        loadUsmleTagFilters();
        if (currentSubjectId) {
            loadSubjectTests(currentSubjectId, currentSubjectName, currentSubjectDescription);
        }
    }

    // Загрузка тестов для главной страницы
    async function loadHomepageTests() {
        const container = document.getElementById('latestTestsList');
        const section = document.getElementById('latestTests');
        
        if (!container || !section) return;

        try {
            let url = `${API_URL}/tests/latest`;
        console.log('Fetching homepage tests from', url);
            
            if (!hasActiveSubscription()) {
                url += '?free=true';
            }

            const response = await fetch(url, {
                headers: currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}
            });
            if (!response.ok) throw new Error('Failed to fetch tests');
            
            const tests = await response.json();
            subjectTestsCache = Array.isArray(tests) ? tests : [];

            if (subjectTestsCache.length > 0) {
            console.log('Displaying', subjectTestsCache.length, 'tests on homepage');
                container.innerHTML = subjectTestsCache.map((test, index) => renderTestCard(test, index)).join('');
                section.style.display = 'block';
            } else {
                section.style.display = 'none';
            }
        } catch (error) {
            console.error('Ошибка загрузки тестов на главной:', error);
            section.style.display = 'none';
        }
    }

    // Динамическая статистика для главной страницы
    async function loadHomepageStats() {
        const statQuestions = document.getElementById('homeStatQuestions');
        const statSubjects = document.getElementById('homeStatSubjects');
        const statTests = document.getElementById('homeStatTests');

        if (!statQuestions || !statSubjects || !statTests) return;

        try {
            const response = await fetch(`${API_URL}/platform`);
            if (!response.ok) {
                throw new Error('Ошибка загрузки статистики платформы');
            }

            const data = await response.json();
            statQuestions.textContent = `${data.questionsCount || 0}+`;
            statSubjects.textContent = `${data.subjectsCount || 0}+`;
            statTests.textContent = `${data.testsCount || 0}+`;
        } catch (error) {
            console.error('Ошибка загрузки статистики главной страницы:', error);
            // Фолбэк при ошибке API
            statQuestions.textContent = '0+';
            statSubjects.textContent = '0+';
            statTests.textContent = '0+';
        }
    }

    let currentTestId = null;
    let currentTestQuestionCount = 0;

    async function loadTestSettings(testId, testName, questionCount = 0) {
        currentTestId = parseInt(testId, 10);
        let total = parseInt(questionCount, 10);
        if (!Number.isFinite(total)) total = 0;

        try {
            const testResponse = await fetch(`${API_URL}/tests/tests/${currentTestId}`);
            if (testResponse.ok) {
                const test = await testResponse.json();
                if (!canAccessTest(test)) {
                    showSubscriptionRequiredModal();
                    setTimeout(() => {
                        if (document.referrer && document.referrer.includes(window.location.origin)) {
                            history.back();
                        } else {
                            window.location.href = '/tests';
                        }
                    }, 300);
                    return;
                }
            }
        } catch (e) {
            console.error('Ошибка проверки доступа к тесту:', e);
        }

        const testNameEl = document.getElementById('testName');
        if (testNameEl) {
            let displayName = testName || '';
            try {
                displayName = decodeURIComponent(displayName);
            } catch (e) {
                /* уже обычная строка */
            }
            testNameEl.textContent = displayName;
        }

        let unsolved = total;
        let solved = 0;
        let correct = 0;
        let incorrect = 0;
        let favorites = 0;

        try {
            const headers = {};
            if (currentUser && currentToken) {
                headers['Authorization'] = `Bearer ${currentToken}`;
            }
            const progressRes = await fetch(`${API_URL}/tests/tests/${testId}/progress`, { headers });
            if (progressRes.ok) {
                const p = await progressRes.json();
                total = typeof p.totalQuestions === 'number' ? p.totalQuestions : total;
                unsolved = p.unsolved ?? 0;
                solved = p.solved ?? 0;
                correct = p.correct ?? 0;
                incorrect = p.incorrect ?? 0;
                favorites = p.favorites ?? 0;
            }
        } catch (e) {
            console.error('Ошибка загрузки прогресса по тесту:', e);
        }

        currentTestQuestionCount = total;

        const questionCountInput = document.getElementById('questionCount');
        if (questionCountInput && total > 0) {
            questionCountInput.max = total;
            const prev = parseInt(questionCountInput.value, 10);
            const fallback = Math.min(10, total);
            if (!Number.isFinite(prev) || prev < 1) {
                questionCountInput.value = fallback;
            } else {
                questionCountInput.value = Math.min(prev, total);
            }
        }

        const maxBadge = document.getElementById('questionCountMax');
        if (maxBadge) maxBadge.textContent = `макс. ${total}`;
        const totalAvailableCount = document.getElementById('totalAvailableCount');
        if (totalAvailableCount) totalAvailableCount.textContent = `всего доступно: ${total}`;
        const modeAllCount = document.getElementById('modeAllCount');
        if (modeAllCount) modeAllCount.textContent = String(total);
        const modeUnsolvedCount = document.getElementById('modeUnsolvedCount');
        if (modeUnsolvedCount) modeUnsolvedCount.textContent = String(unsolved);
        const modeSolvedCount = document.getElementById('modeSolvedCount');
        if (modeSolvedCount) modeSolvedCount.textContent = String(solved);
        const modeIncorrectCount = document.getElementById('modeIncorrectCount');
        if (modeIncorrectCount) modeIncorrectCount.textContent = String(incorrect);
        const modeCorrectCount = document.getElementById('modeCorrectCount');
        if (modeCorrectCount) modeCorrectCount.textContent = String(correct);
        const modeFavoritesCount = document.getElementById('modeFavoritesCount');
        if (modeFavoritesCount) modeFavoritesCount.textContent = String(favorites);
    }

    async function startTest() {
        // Проверяем, является ли тест бесплатным
        let isFreeTest = false;
        try {
            const testResponse = await fetch(`${API_URL}/tests/tests/${currentTestId}`);
            if (testResponse.ok) {
                const test = await testResponse.json();
                isFreeTest = test.isFree || false;
            }
        } catch (error) {
            console.error('Ошибка проверки теста:', error);
        }

        if (!isFreeTest && !hasActiveSubscription()) {
            showSubscriptionRequiredModal();
            return;
        }

        const selectedTestMode = document.getElementById('testMode')?.value || 'standard';
        const instantMode = selectedTestMode === 'instant';
        let questionCount = parseInt(document.getElementById('questionCount')?.value || '10', 10);
        if (!Number.isFinite(questionCount) || questionCount < 1) {
            questionCount = 10;
        }
        if (currentTestQuestionCount > 0) {
            questionCount = Math.min(questionCount, currentTestQuestionCount);
        }
        const randomizeAnswers = document.getElementById('randomizeAnswers')?.checked || false;
        const useTimer = instantMode ? false : (document.getElementById('useTimer')?.checked || false);
        const timerMinutes = parseInt(document.getElementById('timerMinutes')?.value || '30') || 30;

        const modeRadio = document.querySelector('input[name="questionMode"]:checked');
        const mode = modeRadio?.value || 'unsolved';
        const questionFilters = {
            all: mode === 'all',
            unsolved: mode === 'unsolved',
            solved: mode === 'solved',
            correct: mode === 'correct',
            incorrect: mode === 'incorrect',
            favorites: mode === 'favorites'
        };

        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            // Добавляем токен только если пользователь авторизован
            if (currentUser && currentToken) {
                headers['Authorization'] = `Bearer ${currentToken}`;
            }

            const response = await fetch(`${API_URL}/tests/tests/${currentTestId}/questions`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    questionCount,
                    randomizeAnswers,
                    instantFeedbackMode: instantMode,
                    questionFilters
                })
            });

            if (!response.ok) {
                let errMsg = 'Ошибка загрузки вопросов';
                try {
                    const errBody = await response.json();
                    if (errBody.error) errMsg = errBody.error;
                } catch (e) { /* ignore */ }
                throw new Error(errMsg);
            }

            currentQuestions = await response.json();

            // Проверяем, что вопросы получены
            if (!currentQuestions || currentQuestions.length === 0) {
                showNotification('Ошибка: вопросы не найдены для этого теста', 'error');
                return;
            }

            console.log(`Загружено вопросов: ${currentQuestions.length}`);
            currentAnswers = {};
            currentQuestionIndex = 0;
            instantFeedbackMode = instantMode;
            instantFeedbackLockedQuestions = {};
            testStartTime = Date.now();
            questionTimes = {};
            _questionViewStart = Date.now();

            // Сохраняем данные теста в sessionStorage для загрузки на странице теста
            sessionStorage.setItem('testData', JSON.stringify({
                testId: currentTestId,
                questions: currentQuestions,
                answers: currentAnswers,
                questionIndex: currentQuestionIndex,
                startTime: testStartTime,
                timer: useTimer ? timerMinutes * 60 : null,
                instantFeedbackMode: instantMode,
                instantFeedbackLockedQuestions,
                programType: getProgramType()
            }));

            // Переходим на страницу теста
            window.location.href = '/test';
        } catch (error) {
            console.error('Ошибка начала теста:', error);
            showNotification(error.message || 'Ошибка загрузки теста', 'error');
        }
    }

    function startTimer(seconds) {
        const timerEl = document.getElementById('testTimer');
        const timerDisplayEl = document.getElementById('timerDisplay');

        if (!timerEl || !timerDisplayEl) {
            console.warn('Элементы таймера не найдены на странице');
            return;
        }

        timerEl.style.display = 'block';
        let timeLeft = seconds;

        const updateTimer = () => {
            const minutes = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            const newText = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

            if (timerDisplayEl && timerDisplayEl.textContent !== newText) {
                // Обновляем только если текст изменился, чтобы избежать лишних перерисовок
                timerDisplayEl.textContent = newText;
            }

            if (timeLeft <= 0) {
                if (testTimer) {
                    clearInterval(testTimer);
                }
                finishTest();
                showNotification('Время вышло!', 'error');
            } else {
                timeLeft--;
            }
        };

        if (testTimer) {
            clearInterval(testTimer);
        }

        updateTimer();
        testTimer = setInterval(updateTimer, 1000);
    }

    const usmleLinked = () => window.UsmleLinkedQuestion || {};

    function parseUsmleLinkedQuestionText(text) {
        const fn = usmleLinked().parseUsmleLinkedQuestionText;
        return fn ? fn(text) : { isLinked: false, vignette: null, questionText: String(text || '').trim() };
    }

    function renderUsmleQuestionBodyHtml(text, options) {
        const fn = usmleLinked().renderUsmleQuestionBodyHtml;
        if (fn) return fn(text, options);
        return `<h3 class="question-text">${escapeHtmlStr(String(text || '')).replace(/\n/g, '<br>')}</h3>`;
    }

    // ── Медицинский глоссарий: авто-ссылки в тексте ──
    let _medicalKeywordsCache = null;
    let _medicalKeywordsLoading = false;

    async function loadMedicalKeywords() {
        if (_medicalKeywordsCache !== null) return _medicalKeywordsCache;
        if (_medicalKeywordsLoading) return [];
        _medicalKeywordsLoading = true;
        try {
            const resp = await fetch('/api/medical-images/keywords');
            if (!resp.ok) return [];
            _medicalKeywordsCache = await resp.json();
        } catch { _medicalKeywordsCache = []; }
        _medicalKeywordsLoading = false;
        return _medicalKeywordsCache;
    }

    function linkifyMedicalTerms(html, keywords) {
        if (!keywords || !keywords.length) return html;
        // Сортируем по длине убывая (длинные фразы первыми)
        const sorted = [...keywords].sort((a, b) => b.keyword.length - a.keyword.length);
        let result = html;
        for (const { keyword, imageUrl, videoUrl, title, id, mediaType } of sorted) {
            if (!keyword) continue;
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Только целые слова; не трогаем уже созданные <a>
            const re = new RegExp(`(?![^<]*>)(?<!</?a\\b[^>]*>)(?<![\\w])(${escaped})(?![\\w])`, 'gi');
            result = result.replace(re, (match) => {
                const safeUrl = String(imageUrl || '').replace(/"/g, '&quot;');
                const safeVideo = String(videoUrl || '').replace(/"/g, '&quot;');
                const safeTitle = String(title || match).replace(/"/g, '&quot;');
                const safeType = String(mediaType || (videoUrl ? 'video' : 'image')).replace(/"/g, '&quot;');
                return `<a href="#" class="medical-term-link" data-medical-id="${id}" data-img-url="${safeUrl}" data-video-url="${safeVideo}" data-media-type="${safeType}" data-img-title="${safeTitle}" onclick="openMedicalImagePopup(event,this)" title="${safeTitle}">${match}</a>`;
            });
        }
        return result;
    }

    function closeImageLightbox() {
        const popup = document.getElementById('imageLightbox');
        if (popup) popup.remove();
        document.removeEventListener('keydown', onImageLightboxKeydown);
    }

    function onImageLightboxKeydown(e) {
        if (e.key === 'Escape') closeImageLightbox();
    }

    function getMedicalVideoEmbedHtml(videoUrl) {
        const url = String(videoUrl || '').trim();
        if (!url) return '';
        // Загруженные с устройства файлы и прямые video URL
        if (url.startsWith('/uploads/') || /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) {
            return `<video class="image-lightbox-video-file" src="${escapeHtmlStr(url)}" controls playsinline preload="metadata"></video>`;
        }
        let yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/i);
        if (yt) {
            const id = yt[1];
            return `<div class="image-lightbox-video-wrap"><iframe class="image-lightbox-video" src="https://www.youtube.com/embed/${id}?rel=0" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
        }
        let vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
        if (vimeo) {
            return `<div class="image-lightbox-video-wrap"><iframe class="image-lightbox-video" src="https://player.vimeo.com/video/${vimeo[1]}" title="Video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
        }
        return `<p class="image-lightbox-video-fallback"><a href="${escapeHtmlStr(url)}" target="_blank" rel="noopener noreferrer">Открыть видео</a></p>`;
    }

    function openImageLightbox(imgUrl, title = '', videoUrl = '') {
        const url = String(imgUrl || '').trim();
        const video = String(videoUrl || '').trim();
        if (!url && !video) return;
        closeImageLightbox();

        const mediaHtml = video
            ? `${getMedicalVideoEmbedHtml(video)}${url ? `<img class="image-lightbox-img image-lightbox-img--secondary" src="${escapeHtmlStr(url)}" alt="${escapeHtmlStr(title || 'Изображение')}">` : ''}`
            : `<img class="image-lightbox-img" src="${escapeHtmlStr(url)}" alt="${escapeHtmlStr(title || 'Изображение')}">`;

        const popup = document.createElement('div');
        popup.id = 'imageLightbox';
        popup.className = 'image-lightbox';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');
        popup.innerHTML = `
            <button type="button" class="image-lightbox-close" aria-label="Закрыть">&times;</button>
            <div class="image-lightbox-inner">
                ${title ? `<h3 class="image-lightbox-title">${escapeHtmlStr(title)}</h3>` : ''}
                ${mediaHtml}
            </div>
        `;
        popup.addEventListener('click', (ev) => {
            if (ev.target === popup || ev.target.classList.contains('image-lightbox-close')) {
                closeImageLightbox();
            }
        });
        document.body.appendChild(popup);
        document.addEventListener('keydown', onImageLightboxKeydown);
    }

    window.openImageLightbox = openImageLightbox;
    window.closeImageLightbox = closeImageLightbox;

    window.openMedicalImagePopup = function(e, el) {
        e.preventDefault();
        e.stopPropagation();
        openImageLightbox(el.dataset.imgUrl || '', el.dataset.imgTitle || '', el.dataset.videoUrl || '');
    };

    function isZoomableContentImage(img) {
        if (!img || img.tagName !== 'IMG') return false;
        if (img.closest('.image-lightbox, .nav-brand, header .logo, .admin-sidebar, button, a.btn')) return false;
        if (img.classList.contains('image-lightbox-img')) return false;
        return Boolean(
            img.classList.contains('question-image')
            || img.classList.contains('flashcard-image')
            || img.classList.contains('answer-option-image')
            || img.classList.contains('fc-deck-card-img')
            || img.closest('.question-image-wrap, .flashcard-image-wrap, .answer-option-image-wrap, .question-explanation-image-wrap')
        );
    }

    function initImageLightbox() {
        if (window.__imageLightboxBound) return;
        window.__imageLightboxBound = true;
        document.addEventListener('click', (e) => {
            const img = e.target?.closest?.('img');
            if (!isZoomableContentImage(img)) return;
            e.preventDefault();
            e.stopPropagation();
            openImageLightbox(img.currentSrc || img.src, img.alt || '');
        }, true);
    }

    initImageLightbox();

    // Применяем linkify только в USMLE и только к тексту объяснения (описание)
    async function applyMedicalLinkify(root = document) {
        if (getProgramType() !== 'usmle') return;
        const kws = await loadMedicalKeywords();
        if (!kws.length) return;
        const selectors = [
            '.question-explanation-text',
            '.question-explanation-body',
            '.usmle-explanation-body',
            '.usmle-edu-objective-text',
            '.usmle-choice-block',
            '[data-medical-linkify="explanation"]'
        ];
        for (const sel of selectors) {
            root.querySelectorAll?.(sel)?.forEach((el) => {
                if (el.dataset.medicalLinked) return;
                // Не трогаем картинки и подписи к ним — только текстовый блок описания
                if (el.closest('figure, .question-image-wrap, .question-explanation-image-wrap')) return;
                el.dataset.medicalLinked = '1';
                el.innerHTML = linkifyMedicalTerms(el.innerHTML, kws);
            });
        }
        appendMedicalLibrarySections(root);
    }

    function appendMedicalLibrarySections(root = document) {
        const boxes = root.querySelectorAll?.('.question-explanation-box, .usmle-explanation-box');
        if (!boxes || !boxes.length) return;
        boxes.forEach((box) => {
            if (box.querySelector('.usmle-medical-library')) return;
            const links = [...box.querySelectorAll('a.medical-term-link')];
            if (!links.length) return;
            const seen = new Set();
            const items = [];
            links.forEach((a) => {
                const key = String(a.dataset.medicalId || a.dataset.imgTitle || a.textContent || '').trim().toLowerCase();
                if (!key || seen.has(key)) return;
                seen.add(key);
                items.push({
                    id: a.dataset.medicalId || '',
                    title: a.dataset.imgTitle || a.textContent || '',
                    url: a.dataset.imgUrl || '',
                    videoUrl: a.dataset.videoUrl || '',
                    mediaType: a.dataset.mediaType || ''
                });
            });
            if (!items.length) return;
            const library = document.createElement('div');
            library.className = 'usmle-medical-library';
            library.innerHTML = `
                <div class="usmle-medical-library-title">Medical Library</div>
                <ul class="usmle-medical-library-list">
                    ${items.map((item) => `
                        <li>
                            <a href="#" class="usmle-medical-library-link"
                               data-medical-id="${escapeHtmlStr(item.id)}"
                               data-img-url="${String(item.url || '').replace(/"/g, '&quot;')}"
                               data-video-url="${String(item.videoUrl || '').replace(/"/g, '&quot;')}"
                               data-media-type="${String(item.mediaType || '').replace(/"/g, '&quot;')}"
                               data-img-title="${String(item.title || '').replace(/"/g, '&quot;')}"
                               onclick="openMedicalImagePopup(event,this)">
                                <svg class="usmle-medical-library-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    ${item.videoUrl
                                        ? '<path d="M8 5v14l11-7L8 5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'
                                        : '<path d="M7 3h8l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.7"/><path d="M15 3v4h4" stroke="currentColor" stroke-width="1.7"/><path d="M9 12h6M9 16h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'}
                                </svg>
                                <span>${escapeHtmlStr(item.title)}${item.videoUrl ? ' · видео' : ''}</span>
                            </a>
                        </li>
                    `).join('')}
                </ul>
            `;
            box.appendChild(library);
        });
    }

    function normalizeImageUrls(value) {
        if (Array.isArray(value)) {
            return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
        }
        if (typeof value !== 'string') return [];
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return [...new Set(parsed.map(item => String(item || '').trim()).filter(Boolean))];
                }
            } catch (_) { /* ignore */ }
        }
        return [trimmed];
    }

    function renderImageGalleryHtml(value, altText, extraClass = '') {
        const urls = normalizeImageUrls(value);
        if (!urls.length) return '';
        return urls.map((url, index) => `
            <figure class="${['question-image-wrap', extraClass].filter(Boolean).join(' ')}">
                <img src="${String(url).replace(/"/g, '')}" alt="${escapeHtmlStr(urls.length > 1 ? `${altText} ${index + 1}` : altText)}" class="question-image" loading="lazy" decoding="async">
            </figure>
        `).join('');
    }

    function formatUsmleExplanationHtml(rawText) {
        let text = String(rawText || '').trim();
        if (!text) return '';

        let objective = '';
        const objMatch = text.match(/(?:^|\n)\s*(Educational\s+objective|Образовательная\s+цель)\s*:\s*([\s\S]*)$/i);
        if (objMatch) {
            objective = String(objMatch[2] || '').trim();
            text = text.slice(0, objMatch.index).trim();
        }

        const formatInline = (chunk) => {
            let html = escapeHtmlStr(String(chunk || ''));
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/==([^=]+)==/g, '<mark class="usmle-highlight">$1</mark>');
            return html.replace(/\n/g, '<br>');
        };

        const pieces = text.split(/(?=\((?:Choice|Вариант)\s*[A-ZА-Я]\))/i);
        const introParts = [];
        const choiceParts = [];
        pieces.forEach((piece) => {
            const trimmed = String(piece || '').trim();
            if (!trimmed) return;
            if (/^\((?:Choice|Вариант)\s*[A-ZА-Я]\)/i.test(trimmed)) choiceParts.push(trimmed);
            else introParts.push(trimmed);
        });

        let bodyHtml = '';
        if (introParts.length) {
            bodyHtml += `<div class="question-explanation-text usmle-explanation-body">${formatInline(introParts.join('\n\n'))}</div>`;
        }
        if (choiceParts.length) {
            bodyHtml += `<div class="usmle-choice-explanations">${choiceParts.map((part) => {
                const m = part.match(/^\((Choice|Вариант)\s*([A-ZА-Я])\)\s*([\s\S]*)$/i);
                if (!m) {
                    return `<p class="usmle-choice-block">${formatInline(part)}</p>`;
                }
                const label = `(${m[1]} ${String(m[2] || '').toUpperCase()})`;
                const rest = String(m[3] || '').trim();
                return `<p class="usmle-choice-block"><strong class="usmle-choice-label">${escapeHtmlStr(label)}</strong> ${formatInline(rest)}</p>`;
            }).join('')}</div>`;
        }

        const objectiveHtml = objective
            ? `<div class="usmle-edu-objective"><div class="usmle-edu-objective-label">Educational objective:</div><div class="usmle-edu-objective-text question-explanation-text">${formatInline(objective)}</div></div>`
            : '';

        return bodyHtml + objectiveHtml;
    }

    function renderQuestionExplanationHtml(explanation, explanationImageUrl) {
        const text = String(explanation || '').trim();
        const imgHtml = renderImageGalleryHtml(explanationImageUrl, 'Иллюстрация к объяснению', 'question-explanation-image-wrap');
        if (!text && !imgHtml) return '';

        const isUsmle = getProgramType() === 'usmle';
        const textHtml = text
            ? (isUsmle
                ? formatUsmleExplanationHtml(text)
                : `<div class="question-explanation-text">${escapeHtmlStr(text).replace(/\n/g, '<br>')}</div>`)
            : '';

        return `
            <div class="question-explanation-box${isUsmle ? ' usmle-explanation-box' : ''}" role="note">
                <div class="question-explanation-label">${isUsmle ? 'Explanation' : 'Объяснение'}</div>
                ${textHtml}
                ${imgHtml}
            </div>
        `;
    }

    function getUsmleNavLinkFlags(questions) {
        const flags = (questions || []).map(() => ({ linked: false, start: false, mid: false, end: false }));
        const getKey = usmleLinked().getLinkedClusterKey;
        if (!getKey) return flags;

        let i = 0;
        while (i < questions.length) {
            const key = getKey(questions[i] && questions[i].text);
            if (!key) {
                i += 1;
                continue;
            }
            let j = i + 1;
            while (j < questions.length && getKey(questions[j] && questions[j].text) === key) j += 1;
            if (j - i >= 2) {
                for (let k = i; k < j; k += 1) {
                    flags[k].linked = true;
                    flags[k].start = k === i;
                    flags[k].end = k === j - 1;
                    flags[k].mid = k > i && k < j - 1;
                }
            }
            i = j;
        }
        return flags;
    }

    function renderUsmleQuestionNav() {
        const nav = document.getElementById('usmleQuestionNav');
        const list = document.getElementById('usmleQuestionNavList');
        const layout = document.getElementById('testSessionLayout');
        if (!nav || !list) return;

        const isUsmle = getProgramType() === 'usmle';
        document.body.classList.toggle('usmle-test-session', isUsmle);
        if (layout) layout.classList.toggle('has-usmle-qnav', isUsmle);

        if (!isUsmle || !currentQuestions || !currentQuestions.length) {
            nav.hidden = true;
            list.innerHTML = '';
            return;
        }

        nav.hidden = false;
        const flags = getUsmleNavLinkFlags(currentQuestions);
        list.innerHTML = currentQuestions.map((q, index) => {
            const f = flags[index] || {};
            const answered = currentAnswers[q.id] != null;
            const locked = !!(instantFeedbackMode && instantFeedbackLockedQuestions[q.id]);
            const active = index === currentQuestionIndex;
            const classes = [
                'usmle-qnav-item',
                active ? 'is-active' : '',
                answered ? 'is-answered' : '',
                locked ? 'is-reviewed' : '',
                f.linked ? 'is-linked' : '',
                f.start ? 'is-linked-start' : '',
                f.mid ? 'is-linked-mid' : '',
                f.end ? 'is-linked-end' : ''
            ].filter(Boolean).join(' ');

            return `
                <li class="${classes}">
                    <button type="button" class="usmle-qnav-btn" data-q-index="${index}" aria-current="${active ? 'true' : 'false'}" title="Вопрос ${index + 1}">
                        <span class="usmle-qnav-rail" aria-hidden="true">
                            <span class="usmle-qnav-dot"></span>
                        </span>
                        <span class="usmle-qnav-num">${index + 1}</span>
                    </button>
                </li>
            `;
        }).join('');

        list.querySelectorAll('.usmle-qnav-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-q-index'), 10);
                if (Number.isFinite(idx)) goToQuestion(idx);
            });
        });
    }

    function goToQuestion(index) {
        if (!currentQuestions || !currentQuestions.length) return;
        const next = Math.max(0, Math.min(currentQuestions.length - 1, Number(index)));
        if (next === currentQuestionIndex) return;
        currentQuestionIndex = next;
        showQuestion();
    }

    function refreshQuestionExplanationSlot(question) {
        const slot = document.getElementById('questionExplanationSlot');
        if (!slot || !question) return;
        const show = instantFeedbackMode
            && instantFeedbackLockedQuestions[question.id]
            && (question.explanation || question.explanationImageUrl);
        if (show) {
            slot.innerHTML = renderQuestionExplanationHtml(question.explanation, question.explanationImageUrl);
            slot.hidden = false;
            applyMedicalLinkify();
        } else {
            slot.innerHTML = '';
            slot.hidden = true;
        }
    }

    function showQuestion() {
        // Проверяем, что есть вопросы
        if (!currentQuestions || currentQuestions.length === 0) {
            console.error('Нет вопросов для отображения');
            showNotification('Ошибка: вопросы не загружены', 'error');
            window.location.href = '/tests';
            return;
        }

        if (currentQuestionIndex >= currentQuestions.length) {
            finishTest();
            return;
        }

        const question = currentQuestions[currentQuestionIndex];

        // Сохраняем время на предыдущий просмотренный вопрос
        if (_questionViewStart !== null && _lastViewedQuestionId != null) {
            questionTimes[_lastViewedQuestionId] = (questionTimes[_lastViewedQuestionId] || 0)
                + Math.floor((Date.now() - _questionViewStart) / 1000);
        }
        _lastViewedQuestionId = question.id;
        _questionViewStart = Date.now();

        const progress = ((currentQuestionIndex + 1) / currentQuestions.length) * 100;

        const progressFillEl = document.getElementById('progressFill');
        const progressTextEl = document.getElementById('progressText');
        const content = document.getElementById('testContent');

        if (!progressFillEl || !progressTextEl || !content) {
            console.error('Элементы теста не найдены на странице');
            showNotification('Ошибка: элементы теста не найдены', 'error');
            return;
        }

        const isUsmleSession = getProgramType() === 'usmle';
        progressFillEl.style.width = `${progress}%`;
        progressTextEl.textContent = isUsmleSession
            ? `Item ${currentQuestionIndex + 1} of ${currentQuestions.length}`
            : `Вопрос ${currentQuestionIndex + 1} из ${currentQuestions.length}`;

        updateUsmleQuestionMeta(question);

        // Проверяем наличие ответов
        if (!question.Answers || question.Answers.length === 0) {
            console.error('Вопрос без ответов:', question);
            showNotification('Ошибка: вопрос не содержит ответов', 'error');
            return;
        }

        // Добавляем звездочку в правый верхний угол
        const favoriteContainer = document.getElementById('favoriteContainer');
        if (favoriteContainer && currentUser) {
            favoriteContainer.innerHTML = `
            <button class="favorite-icon-btn" onclick="toggleFavorite(${question.id})" id="favoriteBtn${question.id}" title="Добавить в избранное">
                <span id="favoriteIcon${question.id}">☆</span>
            </button>
        `;
        } else if (favoriteContainer) {
            favoriteContainer.innerHTML = '';
        }

        const questionImageHtml = renderImageGalleryHtml(question.imageUrls || question.imageUrl, 'Иллюстрация к вопросу');
        const answerLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        content.innerHTML = `
        <div class="question-item">
            ${renderUsmleQuestionBodyHtml(question.text, {
                isFirstInLinkedGroup: usmleLinked().isFirstLinkedQuestionInList?.(currentQuestions, currentQuestionIndex) || false
            })}
            ${questionImageHtml}
            <div class="answers-list">
                ${question.Answers.map((answer, answerIndex) => `
                    <div class="answer-item" data-answer-id="${answer.id}" onclick="selectAnswer(${answer.id})">
                        ${isUsmleSession ? `<span class="answer-option-letter" aria-hidden="true">${answerLetters[answerIndex] || (answerIndex + 1)}</span>` : ''}
                        <span class="answer-option-text">${answer.text}</span>
                        ${renderImageGalleryHtml(answer.imageUrls || answer.imageUrl, 'Иллюстрация к ответу', 'answer-option-image-wrap')}
                    </div>
                `).join('')}
            </div>
            <div id="questionExplanationSlot" class="question-explanation-slot" hidden></div>
        </div>
    `;

        renderUsmleQuestionNav();
        applyMedicalLinkify();

        const errorQuestionIdEl = document.getElementById('errorQuestionId');
        const errorTestIdEl = document.getElementById('errorTestId');
        const errorQuestionNumberEl = document.getElementById('errorQuestionNumber');
        const errorQuestionTextEl = document.getElementById('errorQuestionText');
        const errorQuestionPreviewEl = document.getElementById('errorQuestionPreview');
        if (errorQuestionIdEl) errorQuestionIdEl.value = String(question.id);
        if (errorTestIdEl) errorTestIdEl.value = String(currentTestId || window.currentTestId || question.testId || '');
        if (errorQuestionNumberEl) errorQuestionNumberEl.value = String(currentQuestionIndex + 1);
        if (errorQuestionTextEl) errorQuestionTextEl.value = question.text || '';
        if (errorQuestionPreviewEl) {
            errorQuestionPreviewEl.value = question.text || '';
        }

        // Проверяем, в избранном ли вопрос
        if (currentUser) {
            checkFavoriteStatus(question.id);
        }

        // Выделяем выбранный ответ
        const selectedAnswerId = currentAnswers[question.id];
        if (selectedAnswerId) {
            document.querySelector(`[data-answer-id="${selectedAnswerId}"]`)?.classList.add('selected');
        }

        if (instantFeedbackMode && instantFeedbackLockedQuestions[question.id]) {
            const correctAnswer = (question.Answers || []).find(a => a.isCorrect === true);
            document.querySelectorAll('.answer-item').forEach(item => {
                const answerId = parseInt(item.getAttribute('data-answer-id'), 10);
                if (correctAnswer && answerId === correctAnswer.id) {
                    item.classList.add('correct');
                }
                if (selectedAnswerId && answerId === parseInt(selectedAnswerId, 10) && (!correctAnswer || answerId !== correctAnswer.id)) {
                    item.classList.add('incorrect');
                }
            });
        }

        refreshQuestionExplanationSlot(question);

        // Кнопки навигации
        const prevBtn = document.getElementById('prevQuestion');
        const nextBtn = document.getElementById('nextQuestion');
        const finishBtn = document.getElementById('finishTest');

        if (prevBtn) {
            prevBtn.style.display = currentQuestionIndex > 0 ? 'block' : 'none';
        }
        if (nextBtn) {
            nextBtn.style.display = currentQuestionIndex < currentQuestions.length - 1 ? 'block' : 'none';
        }
        if (finishBtn) {
            // Кнопка досрочного завершения доступна на любом вопросе
            finishBtn.style.display = currentQuestions.length > 0 ? 'block' : 'none';
        }
    }

    function selectAnswer(answerId) {
        const question = currentQuestions[currentQuestionIndex];
        if (instantFeedbackMode && instantFeedbackLockedQuestions[question.id]) {
            return;
        }
        currentAnswers[question.id] = answerId;

        // Обновляем визуальное выделение
        document.querySelectorAll('.answer-item').forEach(item => {
            item.classList.remove('selected');
        });
        document.querySelector(`[data-answer-id="${answerId}"]`)?.classList.add('selected');

        if (instantFeedbackMode) {
            const correctAnswer = (question.Answers || []).find(a => a.isCorrect === true);
            document.querySelectorAll('.answer-item').forEach(item => {
                const currentAnswerId = parseInt(item.getAttribute('data-answer-id'), 10);
                item.classList.remove('correct', 'incorrect');
                if (correctAnswer && currentAnswerId === correctAnswer.id) {
                    item.classList.add('correct');
                } else if (currentAnswerId === parseInt(answerId, 10) && (!correctAnswer || currentAnswerId !== correctAnswer.id)) {
                    item.classList.add('incorrect');
                }
            });
            instantFeedbackLockedQuestions[question.id] = true;
            refreshQuestionExplanationSlot(question);
            try {
                const testDataRaw = sessionStorage.getItem('testData');
                if (testDataRaw) {
                    const testData = JSON.parse(testDataRaw);
                    testData.instantFeedbackLockedQuestions = instantFeedbackLockedQuestions;
                    sessionStorage.setItem('testData', JSON.stringify(testData));
                }
            } catch (e) { /* ignore */ }
        }
        renderUsmleQuestionNav();
    }

    function nextQuestion() {
        if (currentQuestionIndex < currentQuestions.length - 1) {
            currentQuestionIndex++;
            showQuestion();
        }
    }

    function prevQuestion() {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            showQuestion();
        }
    }

    async function finishTest() {
        // КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ В НАЧАЛЕ ФУНКЦИИ
        console.error('=== FINISH TEST CALLED ===');
        console.error('currentTestId:', currentTestId);
        console.error('currentTestId type:', typeof currentTestId);
        console.error('window.currentTestId:', window.currentTestId);
        console.error('hasUser:', !!currentUser);
        console.error('currentQuestions.length:', currentQuestions?.length || 0);
        console.error('currentAnswers count:', Object.keys(currentAnswers || {}).length);

        if (testTimer) {
            clearInterval(testTimer);
        }
        stopUsmleQuestionLiveTimer();

        const timeSpent = Math.floor((Date.now() - testStartTime) / 1000);

        // Фиксируем время на текущий (последний просматриваемый) вопрос
        if (_questionViewStart !== null && _lastViewedQuestionId != null) {
            questionTimes[_lastViewedQuestionId] = (questionTimes[_lastViewedQuestionId] || 0)
                + Math.floor((Date.now() - _questionViewStart) / 1000);
            _questionViewStart = null;
        }

        const answeredQuestions = currentQuestions.filter(question => {
            const answerId = currentAnswers[question.id];
            return answerId !== undefined && answerId !== null && answerId !== '';
        });
        const isEarlyFinish = answeredQuestions.length < currentQuestions.length;

        if (answeredQuestions.length === 0) {
            showNotification('Сначала ответьте хотя бы на один вопрос', 'error');
            return;
        }

        if (isEarlyFinish) {
            const confirmed = window.confirm(
                `Вы ответили на ${answeredQuestions.length} из ${currentQuestions.length} вопросов. Завершить тест досрочно?`
            );
            if (!confirmed) {
                return;
            }
        }

        const questionsForResult = isEarlyFinish ? answeredQuestions : currentQuestions;

        try {
            let result;

            // КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ
            console.error('=== FINISH TEST START ===');
            console.error('currentTestId:', currentTestId);
            console.error('currentTestId type:', typeof currentTestId);
            console.error('currentTestId defined:', currentTestId !== null && currentTestId !== undefined);
            console.error('hasUser:', !!currentUser);
            console.error('currentQuestions.length:', currentQuestions.length);
            console.error('questionsForResult.length:', questionsForResult.length);
            console.error('currentAnswers:', Object.keys(currentAnswers).length);

            // Пробуем использовать window.currentTestId если currentTestId не установлен
            if (!currentTestId && window.currentTestId) {
                console.error('⚠️ currentTestId is null, using window.currentTestId:', window.currentTestId);
                currentTestId = window.currentTestId;
            }

            // Если это тест из избранного, проверяем локально
            if (!currentTestId) {
                console.error('⚠️ currentTestId is null/undefined - using local check');
                result = checkFavoriteTestAnswers(questionsForResult);
            } else {
                console.error('✅ currentTestId exists - sending request to server');
                const questionIds = questionsForResult.map(q => q.id);
                console.error('Request URL:', `${API_URL}/tests/tests/${currentTestId}/check`);
                console.error('Request body:', { answers: currentAnswers, questionIds });

                // Проверяем, является ли тест бесплатным
                let isFreeTest = false;
                try {
                    const testResponse = await fetch(`${API_URL}/tests/tests/${currentTestId}`);
                    if (testResponse.ok) {
                        const test = await testResponse.json();
                        isFreeTest = test.isFree || false;
                    }
                } catch (error) {
                    console.error('Ошибка проверки теста:', error);
                }

                const headers = {
                    'Content-Type': 'application/json'
                };

                // Добавляем токен только если пользователь авторизован
                if (currentUser && currentToken) {
                    headers['Authorization'] = `Bearer ${currentToken}`;
                }

                const response = await fetch(`${API_URL}/tests/tests/${currentTestId}/check`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ answers: currentAnswers, questionIds })
                });

                console.error('Response status:', response.status);
                console.error('Response ok:', response.ok);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Response error:', errorText);
                    throw new Error('Ошибка проверки ответов');
                }

                result = await response.json();
                console.error('Response result:', result);
            }

            // Загружаем полные вопросы с правильными ответами для разбора
            let fullQuestions = questionsForResult;
            console.log('🔍 Начало finishTest:', {
                currentTestId,
                hasUser: !!currentUser,
                currentQuestionsCount: currentQuestions.length,
                questionsForResultCount: questionsForResult.length,
                firstQuestionHasAnswers: currentQuestions[0]?.Answers?.length || 0,
                firstQuestionId: currentQuestions[0]?.id
            });

            if (currentTestId) {
                try {
                    console.log('📥 Загрузка полного теста с сервера...', { testId: currentTestId, API_URL });
                    const fullHeaders = {};
                    if (currentUser && currentToken) {
                        fullHeaders.Authorization = `Bearer ${currentToken}`;
                    }
                    const fullTestResponse = await fetch(`${API_URL}/tests/tests/${currentTestId}`, {
                        headers: fullHeaders
                    });

                    console.log('📥 Ответ сервера:', {
                        status: fullTestResponse.status,
                        statusText: fullTestResponse.statusText,
                        ok: fullTestResponse.ok
                    });

                    if (fullTestResponse.ok) {
                        const fullTest = await fullTestResponse.json();
                        console.log('✅ Полный тест загружен:', {
                            testId: fullTest.id,
                            questionsCount: fullTest.Questions?.length || 0
                        });

                        // Проверяем, есть ли isCorrect в первом вопросе
                        if (fullTest.Questions && fullTest.Questions.length > 0) {
                            const firstQ = fullTest.Questions[0];
                            if (firstQ.Answers && firstQ.Answers.length > 0) {
                                const correctCount = firstQ.Answers.filter(a => a.isCorrect === true).length;
                                console.log('🔍 Первый вопрос из полного теста:', {
                                    questionId: firstQ.id,
                                    answersCount: firstQ.Answers.length,
                                    correctAnswersCount: correctCount,
                                    answers: firstQ.Answers.map(a => ({
                                        id: a.id,
                                        isCorrect: a.isCorrect,
                                        isCorrectType: typeof a.isCorrect,
                                        text: a.text?.substring(0, 30)
                                    }))
                                });

                                if (correctCount === 0) {
                                    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Первый вопрос в полном тесте не имеет правильных ответов!');
                                }
                            }
                        }

                        // Логируем первые несколько вопросов для отладки
                        if (fullTest.Questions && fullTest.Questions.length > 0) {
                            const firstQ = fullTest.Questions[0];
                            if (firstQ.Answers && firstQ.Answers.length > 0) {
                                console.log('🔍 Загружен полный тест, первый вопрос:', {
                                    questionId: firstQ.id,
                                    answersCount: firstQ.Answers.length,
                                    answers: firstQ.Answers.map(a => ({
                                        id: a.id,
                                        isCorrect: a.isCorrect,
                                        isCorrectType: typeof a.isCorrect,
                                        isCorrectDefined: a.isCorrect !== undefined && a.isCorrect !== null
                                    }))
                                });
                            }
                        }

                        // Создаем маппинг вопросов с правильными ответами
                        const questionsMap = {};
                        fullTest.Questions?.forEach(q => {
                            questionsMap[q.id] = q;
                        });
                        // Обновляем вопросы с правильными ответами
                        fullQuestions = questionsForResult.map(q => {
                            const fullQ = questionsMap[q.id];
                            if (fullQ && fullQ.Answers) {
                                const answersWithCorrect = fullQ.Answers.map(a => {
                                    // Нормализуем isCorrect: приводим к boolean (обрабатываем все форматы)
                                    let isCorrect = false;
                                    if (a.isCorrect === true) {
                                        isCorrect = true;
                                    } else if (a.isCorrect === false || a.isCorrect === null || a.isCorrect === undefined) {
                                        isCorrect = false;
                                    } else if (a.isCorrect === 1 || a.isCorrect === '1') {
                                        isCorrect = true;
                                    } else if (a.isCorrect === 0 || a.isCorrect === '0') {
                                        isCorrect = false;
                                    } else if (typeof a.isCorrect === 'string') {
                                        const str = a.isCorrect.toLowerCase().trim();
                                        isCorrect = str === 'true' || str === 't' || str === '1';
                                    } else {
                                        isCorrect = Boolean(a.isCorrect);
                                    }

                                    return {
                                        id: a.id,
                                        text: a.text,
                                        isCorrect: isCorrect
                                    };
                                });

                                // Логируем для отладки
                                const correctAnswers = answersWithCorrect.filter(a => a.isCorrect);
                                if (correctAnswers.length === 0) {
                                    console.warn(`⚠️ Вопрос ${q.id} не имеет правильного ответа после нормализации!`, {
                                        questionId: q.id,
                                        questionText: q.text?.substring(0, 50),
                                        originalAnswers: fullQ.Answers.map(a => ({
                                            id: a.id,
                                            text: a.text?.substring(0, 50),
                                            isCorrect: a.isCorrect,
                                            isCorrectType: typeof a.isCorrect,
                                            isCorrectValue: JSON.stringify(a.isCorrect),
                                            isCorrectStringified: String(a.isCorrect)
                                        })),
                                        normalizedAnswers: answersWithCorrect.map(a => ({
                                            id: a.id,
                                            isCorrect: a.isCorrect
                                        }))
                                    });
                                } else {
                                    console.log(`✅ Вопрос ${q.id} имеет ${correctAnswers.length} правильный(ых) ответ(ов)`, {
                                        questionId: q.id,
                                        correctAnswerIds: correctAnswers.map(a => a.id),
                                        correctAnswerTexts: correctAnswers.map(a => a.text?.substring(0, 50))
                                    });
                                }

                                return {
                                    ...q,
                                    explanation: fullQ.explanation || q.explanation || null,
                                    explanationImageUrl: fullQ.explanationImageUrl || q.explanationImageUrl || null,
                                    imageUrl: fullQ.imageUrl || q.imageUrl || null,
                                    Answers: answersWithCorrect
                                };
                            }
                            console.warn(`⚠️ Не найден полный вопрос ${q.id} в загруженном тесте`);
                            return q;
                        });

                        // Проверяем, что хотя бы один вопрос имеет правильные ответы
                        const hasCorrectAnswers = fullQuestions.some(q =>
                            q.Answers && q.Answers.some(a => a.isCorrect === true)
                        );

                        if (!hasCorrectAnswers) {
                            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Ни один вопрос не имеет правильных ответов после загрузки полного теста!');
                            console.log('Попытка использовать correctAnswerId из результатов проверки...');

                            // Пытаемся использовать correctAnswerId из результатов проверки
                            if (result && result.results) {
                                fullQuestions = fullQuestions.map(q => {
                                    const questionResult = result.results[q.id];
                                    if (questionResult && questionResult.correctAnswerId && q.Answers) {
                                        q.Answers = q.Answers.map(a => ({
                                            ...a,
                                            isCorrect: a.id === questionResult.correctAnswerId
                                        }));
                                    }
                                    return q;
                                });
                            }
                        }
                    } else {
                        console.error('❌ Не удалось загрузить полный тест:', fullTestResponse.status, fullTestResponse.statusText);
                    }
                } catch (error) {
                    console.error('Ошибка загрузки полных вопросов:', error);
                    // Пытаемся использовать correctAnswerId из результатов проверки
                    if (result && result.results) {
                        console.log('Попытка использовать correctAnswerId из результатов проверки...');
                        fullQuestions = fullQuestions.map(q => {
                            const questionResult = result.results[q.id];
                            if (questionResult && questionResult.correctAnswerId && q.Answers) {
                                q.Answers = q.Answers.map(a => ({
                                    ...a,
                                    isCorrect: a.id === questionResult.correctAnswerId
                                }));
                            }
                            return q;
                        });
                    }
                }
            }

            // Сохранение результата (только если есть testId)
            if (currentTestId && currentUser) {
                try {
                    await fetch(`${API_URL}/stats/test-result`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${currentToken}`
                        },
                        body: JSON.stringify({
                            testId: currentTestId,
                            score: result.score,
                            totalQuestions: result.total,
                            timeSpent,
                            answers: currentAnswers,
                            questions: fullQuestions, // Сохраняем вопросы с правильными ответами
                            results: result.results // Сохраняем результаты проверки
                        })
                    });
                } catch (error) {
                    console.error('Ошибка сохранения результата:', error);
                    // Продолжаем показ результатов даже если сохранение не удалось
                }
            }

            // Убеждаемся, что fullQuestions содержат нормализованный isCorrect перед сохранением
            const questionsToSave = fullQuestions.map(q => {
                if (q.Answers && Array.isArray(q.Answers)) {
                    return {
                        ...q,
                        Answers: q.Answers.map(a => {
                            // Убеждаемся, что isCorrect нормализован (обрабатываем все форматы)
                            let isCorrect = false;
                            if (a.isCorrect === true) {
                                isCorrect = true;
                            } else if (a.isCorrect === false || a.isCorrect === null || a.isCorrect === undefined) {
                                isCorrect = false;
                            } else if (a.isCorrect === 1 || a.isCorrect === '1') {
                                isCorrect = true;
                            } else if (a.isCorrect === 0 || a.isCorrect === '0') {
                                isCorrect = false;
                            } else if (typeof a.isCorrect === 'string') {
                                const str = a.isCorrect.toLowerCase().trim();
                                isCorrect = str === 'true' || str === 't' || str === '1';
                            } else {
                                isCorrect = Boolean(a.isCorrect);
                            }
                            return {
                                id: a.id,
                                text: a.text,
                                imageUrl: a.imageUrl || null,
                                isCorrect: isCorrect // Всегда сохраняем как boolean
                            };
                        })
                    };
                }
                return q;
            });

            // Логируем перед сохранением в sessionStorage
            if (questionsToSave.length > 0) {
                const firstQ = questionsToSave[0];
                if (firstQ.Answers && firstQ.Answers.length > 0) {
                    const correctCount = firstQ.Answers.filter(a => a.isCorrect === true).length;
                    console.log('💾 Сохранение в sessionStorage, первый вопрос:', {
                        questionId: firstQ.id,
                        answersCount: firstQ.Answers.length,
                        correctAnswersCount: correctCount,
                        answers: firstQ.Answers.map(a => ({
                            id: a.id,
                            isCorrect: a.isCorrect,
                            isCorrectType: typeof a.isCorrect
                        }))
                    });

                    if (correctCount === 0) {
                        console.error('❌ ВНИМАНИЕ: Первый вопрос не имеет правильных ответов перед сохранением!', {
                            questionId: firstQ.id,
                            questionText: firstQ.text?.substring(0, 50),
                            allAnswers: firstQ.Answers.map(a => ({
                                id: a.id,
                                text: a.text?.substring(0, 30),
                                isCorrect: a.isCorrect,
                                isCorrectType: typeof a.isCorrect
                            }))
                        });
                    }
                }
            } else {
                console.error('❌ ВНИМАНИЕ: questionsToSave пуст! fullQuestions.length =', fullQuestions.length);
            }

            // Сохраняем результаты в sessionStorage для отображения на странице результатов
            console.log('💾 Сохранение в sessionStorage:', {
                testId: currentTestId,
                testIdType: typeof currentTestId,
                testIdDefined: currentTestId !== null && currentTestId !== undefined,
                questionsCount: questionsToSave.length,
                resultsCount: Object.keys(result.results || {}).length,
                hasCorrectAnswerIds: Object.values(result.results || {}).some(r => r.correctAnswerId !== null)
            });

            sessionStorage.setItem('testResult', JSON.stringify({
                score: result.score,
                total: result.total,
                percentage: result.percentage || Math.round((result.score / result.total) * 100),
                results: result.results || {},
                questions: questionsToSave,
                answers: currentAnswers,
                timeSpent,
                questionTimes,
                isCustomUsmle: !!(sessionStorage.getItem('testData') && JSON.parse(sessionStorage.getItem('testData') || '{}').isCustomUsmle),
                programType: currentProgramType || null,
                testId: currentTestId || window.currentTestId || null,
                instantFeedbackMode: !!instantFeedbackMode
            }));

            // Переходим на страницу разбора ошибок
            window.location.href = '/test-review';
        } catch (error) {
            console.error('Ошибка завершения теста:', error);
            showNotification('Ошибка завершения теста', 'error');
        }
    }

    function checkFavoriteTestAnswers(questions = currentQuestions) {
        let correctCount = 0;
        const results = {};

        questions.forEach(question => {
            const userAnswerId = currentAnswers[question.id];
            // Улучшенная нормализация isCorrect
            const correctAnswer = question.Answers.find(a => {
                if (a.isCorrect === true) return true;
                if (a.isCorrect === false || a.isCorrect === null || a.isCorrect === undefined) return false;
                if (a.isCorrect === 1 || a.isCorrect === '1') return true;
                if (a.isCorrect === 0 || a.isCorrect === '0') return false;
                if (typeof a.isCorrect === 'string') {
                    const str = a.isCorrect.toLowerCase().trim();
                    return str === 'true' || str === 't' || str === '1';
                }
                return Boolean(a.isCorrect);
            });

            if (userAnswerId && correctAnswer && parseInt(userAnswerId) === correctAnswer.id) {
                correctCount++;
                results[question.id] = { correct: true, answerId: correctAnswer.id };
            } else {
                results[question.id] = {
                    correct: false,
                    userAnswerId: userAnswerId ? parseInt(userAnswerId) : null,
                    correctAnswerId: correctAnswer ? correctAnswer.id : null
                };
            }
        });

        return {
            score: correctCount,
            total: questions.length,
            percentage: questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0,
            results
        };
    }

    function showTestResults(result) {
        const scoreEl = document.getElementById('resultScore');
        const totalEl = document.getElementById('resultTotal');
        const percentageEl = document.getElementById('resultPercentage');
        const detailsEl = document.getElementById('resultDetails');

        if (!scoreEl || !totalEl || !percentageEl) {
            console.error('Элементы результатов не найдены на странице');
            return;
        }

        scoreEl.textContent = result.score;
        totalEl.textContent = result.total;
        percentageEl.textContent = `${result.percentage || Math.round((result.score / result.total) * 100)}%`;

        if (detailsEl && result.questions && result.questions.length > 0) {
            detailsEl.innerHTML = result.questions.map((question, index) => {
                const questionResult = result.results[question.id];
                if (!questionResult) return '';

                const userAnswerId = result.answers[question.id];
                const userAnswer = question.Answers?.find(a => a.id === parseInt(userAnswerId));
                // Ищем правильный ответ: сначала по correctAnswerId из результатов, потом по isCorrect
                let correctAnswer = null;

                // Логируем для отладки
                console.log(`Поиск правильного ответа для вопроса ${question.id}:`, {
                    questionId: question.id,
                    correctAnswerId: questionResult.correctAnswerId,
                    answersCount: question.Answers?.length || 0,
                    answers: question.Answers?.map(a => ({
                        id: a.id,
                        text: a.text?.substring(0, 50),
                        isCorrect: a.isCorrect
                    })) || []
                });

                if (questionResult.correctAnswerId) {
                    correctAnswer = question.Answers?.find(a => a.id === questionResult.correctAnswerId);
                    if (correctAnswer) {
                        console.log(`✅ Найден правильный ответ по correctAnswerId: ${correctAnswer.id}`);
                    } else {
                        console.warn(`⚠️ Не найден ответ с id ${questionResult.correctAnswerId} в вопросах`);
                    }
                }
                if (!correctAnswer) {
                    // Улучшенная нормализация isCorrect для всех возможных форматов
                    correctAnswer = question.Answers?.find(a => {
                        if (a.isCorrect === true) return true;
                        if (a.isCorrect === false || a.isCorrect === null || a.isCorrect === undefined) return false;
                        if (a.isCorrect === 1 || a.isCorrect === '1') return true;
                        if (a.isCorrect === 0 || a.isCorrect === '0') return false;
                        if (typeof a.isCorrect === 'string') {
                            const str = a.isCorrect.toLowerCase().trim();
                            return str === 'true' || str === 't' || str === '1';
                        }
                        return Boolean(a.isCorrect);
                    });
                    if (correctAnswer) {
                        console.log(`✅ Найден правильный ответ по isCorrect: ${correctAnswer.id}`, {
                            answerId: correctAnswer.id,
                            isCorrect: correctAnswer.isCorrect,
                            isCorrectType: typeof correctAnswer.isCorrect
                        });
                    } else {
                        console.warn(`⚠️ Не найден ответ с isCorrect=true. Все ответы:`, question.Answers?.map(a => {
                            // Пробуем нормализовать и проверить
                            let normalized = false;
                            if (a.isCorrect === true) normalized = true;
                            else if (a.isCorrect === 1 || a.isCorrect === '1') normalized = true;
                            else if (typeof a.isCorrect === 'string') {
                                const str = a.isCorrect.toLowerCase().trim();
                                normalized = str === 'true' || str === 't' || str === '1';
                            } else {
                                normalized = Boolean(a.isCorrect);
                            }
                            return {
                                id: a.id,
                                isCorrect: a.isCorrect,
                                isCorrectType: typeof a.isCorrect,
                                isCorrectValue: JSON.stringify(a.isCorrect),
                                normalized: normalized,
                                text: a.text?.substring(0, 30)
                            };
                        }));
                    }
                }

                if (!correctAnswer && question.Answers && question.Answers.length > 0) {
                    console.error(`❌ Правильный ответ не найден для вопроса ${question.id}!`, {
                        questionId: question.id,
                        questionText: question.text?.substring(0, 100),
                        answers: question.Answers.map(a => ({ id: a.id, text: a.text?.substring(0, 50), isCorrect: a.isCorrect }))
                    });
                }

                return `
                <div style="margin: 1rem 0; padding: 1rem; border-radius: 0.5rem; background-color: var(--bg-secondary); border-left: 4px solid ${questionResult.correct ? 'var(--success-color)' : 'var(--danger-color)'};">
                    <p style="font-weight: 600; margin-bottom: 0.5rem;"><strong>Вопрос ${index + 1}:</strong> ${question.text}</p>
                    <p style="color: ${questionResult.correct ? 'var(--success-color)' : 'var(--danger-color)'}; font-weight: 600; margin-bottom: 0.5rem;">
                        ${questionResult.correct ? '✓ Правильно' : '✗ Неправильно'}
                    </p>
                    ${!questionResult.correct ? `
                        <p style="color: var(--text-secondary); margin-bottom: 0.25rem;">Ваш ответ: ${userAnswer?.text || 'Не отвечено'}</p>
                        <p style="color: var(--success-color);">Правильный ответ: ${correctAnswer?.text || (question.Answers && question.Answers.length > 0 ? '⚠️ Правильный ответ не отмечен в тесте. Проверьте настройки теста в админ-панели.' : 'Не найден')}</p>
                    ` : ''}
                </div>
            `;
            }).join('');
        } else if (detailsEl) {
            detailsEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Детали результатов недоступны</p>';
        }
    }

    // Избранное
    async function loadFavorites() {
        try {
            const response = await fetch(`${API_URL}/favorites`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Ошибка загрузки избранного');
            }

            const favorites = await response.json();
            const container = document.getElementById('favoritesList');
            const actionsDiv = document.getElementById('favoritesActions');

            // Фильтруем null/undefined вопросы
            const validFavorites = (favorites || []).filter(f => f && f.id);

            if (validFavorites.length === 0) {
                container.innerHTML = `
                <div style="text-align: center; padding: 4rem 2rem; background-color: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-light);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">⭐</div>
                    <h3 style="margin-bottom: 0.5rem; color: var(--text-color);">Нет избранных вопросов</h3>
                    <p style="color: var(--text-secondary);">Добавляйте вопросы в избранное во время прохождения тестов для последующего повторения</p>
                </div>
            `;
                if (actionsDiv) actionsDiv.style.display = 'none';
            } else {
                container.innerHTML = validFavorites.map((fav, index) => `
                <div class="favorite-item">
                    <div class="favorite-item-header">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: start; gap: 0.75rem;">
                                <span style="color: var(--primary-color); font-weight: 600; min-width: 2rem;">${index + 1}.</span>
                                <div style="flex: 1;">
                                    <h4 style="margin-bottom: 0.5rem; color: var(--text-color); font-size: 1.1rem; line-height: 1.5;">${fav.text}</h4>
                                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0;">
                                        <strong>Тест:</strong> ${fav.Test?.name || 'Неизвестно'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <button class="btn-icon" onclick="removeFavorite(${fav.id})" title="Удалить из избранного" style="color: var(--danger-color);">
                            ✕
                        </button>
                    </div>
                </div>
            `).join('');
                if (actionsDiv) {
                    actionsDiv.style.display = 'block';
                    document.getElementById('startFavoriteTest').textContent = `Пройти тест из избранного (${validFavorites.length} вопросов)`;
                }
            }

        } catch (error) {
            console.error('Ошибка загрузки избранного:', error);
            showNotification('Ошибка загрузки избранного', 'error');
        }
    }

    async function removeFavorite(questionId) {
        try {
            const response = await fetch(`${API_URL}/questions/${questionId}/favorite`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            if (response.ok) {
                showNotification('Вопрос удален из избранного', 'success');
                loadFavorites();
            }
        } catch (error) {
            console.error('Ошибка удаления из избранного:', error);
        }
    }

    async function startFavoriteTest() {
        try {
            const response = await fetch(`${API_URL}/favorites`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            const favorites = await response.json();

            if (favorites.length === 0) {
                showNotification('Нет избранных вопросов', 'error');
                return;
            }

            // Загружаем полную информацию о вопросах с правильными ответами
            const questionsWithAnswers = await Promise.all(
                favorites.map(async (fav) => {
                    // Загружаем полную информацию о вопросе
                    const questionResponse = await fetch(`${API_URL}/tests/tests/${fav.Test.id}`);
                    const test = await questionResponse.json();
                    const fullQuestion = test.Questions.find(q => q.id === fav.id);
                    return fullQuestion || fav;
                })
            );

            // Создаем тест из избранных вопросов
            currentQuestions = questionsWithAnswers.map(q => ({
                ...q,
                Answers: q.Answers || []
            }));

            // Перемешиваем ответы для каждого вопроса
            currentQuestions = currentQuestions.map(q => {
                const answers = [...(q.Answers || [])].sort(() => Math.random() - 0.5);
                return { ...q, Answers: answers };
            });

            // Удаляем информацию о правильности ответов перед показом
            currentQuestions = currentQuestions.map(q => ({
                ...q,
                Answers: q.Answers.map(a => ({
                    id: a.id,
                    text: a.text,
                    imageUrl: a.imageUrl || null,
                    isCorrect: a.isCorrect // Сохраняем для проверки
                }))
            }));

            currentAnswers = {};
            currentQuestionIndex = 0;
            instantFeedbackMode = false;
            instantFeedbackLockedQuestions = {};
            testStartTime = Date.now();
            questionTimes = {};
            _questionViewStart = Date.now();
            currentTestId = null; // Специальный тест из избранного

            // Сохраняем данные теста в sessionStorage для загрузки на странице теста
            sessionStorage.setItem('testData', JSON.stringify({
                testId: null, // Специальный тест из избранного
                questions: currentQuestions,
                answers: currentAnswers,
                questionIndex: currentQuestionIndex,
                startTime: testStartTime,
                timer: null,
                instantFeedbackMode: false,
                instantFeedbackLockedQuestions
            }));

            // Переходим на страницу теста
            window.location.href = '/test';
        } catch (error) {
            console.error('Ошибка начала теста из избранного:', error);
            showNotification('Ошибка загрузки теста', 'error');
        }
    }

    // Профиль
    async function fillProfileGroupSelect(user) {
        const wrap = document.getElementById('profileGroupWrap');
        const groupSelect = document.getElementById('profileGroupId');
        const facultySelect = document.getElementById('profileFacultyId');
        const courseSelect = document.getElementById('profileCourse');
        if (!wrap || !groupSelect) return;

        const facultyId = facultySelect?.value || user?.facultyId || '';
        const course = courseSelect?.value || user?.course || '';

        try {
            const params = new URLSearchParams();
            if (facultyId) params.set('facultyId', facultyId);
            if (course) params.set('course', course);
            const res = await fetch(`${API_URL}/schedule/kgma/profile-groups?${params.toString()}`, {
                headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {}
            });
            if (!res.ok) {
                wrap.style.display = 'none';
                return;
            }
            const data = await res.json();
            if (!data.isKgma) {
                wrap.style.display = 'none';
                return;
            }

            wrap.style.display = '';
            if (data.needDirection) {
                groupSelect.innerHTML = '<option value="">Сначала выберите факультет и курс</option>';
                return;
            }

            const groups = Array.isArray(data.groups) ? data.groups : [];
            groupSelect.innerHTML = groups.length
                ? '<option value="">Выберите группу</option>'
                  + groups.map((g) => `<option value="${g.id}" data-name="${escapeHtmlStr(g.name)}">${escapeHtmlStr(g.name)}</option>`).join('')
                : '<option value="">Группы не найдены</option>';

            const selected = user?.kgmaGroupId || data.selectedGroupId;
            if (selected && groupSelect.querySelector(`option[value="${CSS.escape(String(selected))}"]`)) {
                groupSelect.value = String(selected);
            } else {
                groupSelect.value = '';
            }
        } catch (e) {
            wrap.style.display = 'none';
        }
    }

    async function fillProfileDirectionForm(user) {
        const facultySelect = document.getElementById('profileFacultyId');
        const courseSelect = document.getElementById('profileCourse');
        const form = document.getElementById('directionForm');
        if (!facultySelect || !courseSelect) return;

        const uniId = user.universityId || user.University?.id;
        if (!uniId) {
            facultySelect.innerHTML = '<option value="">Сначала укажите университет</option>';
            return;
        }

        try {
            const res = await fetch(`${API_URL}/tests/faculties?universityId=${encodeURIComponent(uniId)}`, {
                headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {}
            });
            const faculties = res.ok ? await res.json() : [];
            facultySelect.innerHTML = faculties.length
                ? faculties.map((f) => `<option value="${f.id}">${f.name}</option>`).join('')
                : '<option value="">Нет факультетов</option>';
            if (user.facultyId) facultySelect.value = String(user.facultyId);
            if (user.course) courseSelect.value = String(user.course);
            await fillProfileGroupSelect(user);
        } catch (e) {
            facultySelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        }

        if (facultySelect && !facultySelect.dataset.groupBound) {
            facultySelect.dataset.groupBound = '1';
            facultySelect.addEventListener('change', () => fillProfileGroupSelect(currentUser));
        }
        if (courseSelect && !courseSelect.dataset.groupBound) {
            courseSelect.dataset.groupBound = '1';
            courseSelect.addEventListener('change', () => fillProfileGroupSelect(currentUser));
        }

        if (form && !form.dataset.bound) {
            form.dataset.bound = '1';
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const groupSelect = document.getElementById('profileGroupId');
                    const groupOption = groupSelect?.selectedOptions?.[0];
                    const kgmaGroupId = groupSelect?.value || '';
                    const payload = {
                        facultyId: parseInt(facultySelect.value, 10),
                        course: parseInt(courseSelect.value, 10)
                    };
                    if (kgmaGroupId) {
                        payload.kgmaGroupId = kgmaGroupId;
                        payload.groupName = groupOption?.dataset?.name || groupOption?.textContent || '';
                    } else if (groupSelect) {
                        payload.kgmaGroupId = '';
                        payload.groupName = '';
                    }

                    const res = await fetch(`${API_URL}/auth/direction`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${currentToken}`
                        },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');
                    currentUser = data.user;
                    await fillProfileGroupSelect(currentUser);
                    await loadMyScheduleProfile(currentUser);
                    showNotification('Направление сохранено', 'success');
                } catch (err) {
                    showNotification(err.message || 'Ошибка сохранения', 'error');
                }
            });
        }
    }

    const MY_SCHEDULE_DAY_NAMES = {
        1: 'Понедельник',
        2: 'Вторник',
        3: 'Среда',
        4: 'Четверг',
        5: 'Пятница',
        6: 'Суббота',
        7: 'Воскресенье'
    };

    function renderMyScheduleWeek(week) {
        const box = document.getElementById('myScheduleContent');
        if (!box) return;

        if (week.empty || !(week.days || []).length) {
            box.innerHTML = `<p class="schedule-empty">${escapeHtmlStr(week.message || 'На эту неделю занятий нет')}</p>`;
            return;
        }

        box.innerHTML = (week.days || []).map((day) => {
            const lessons = (day.lessons || []).map((les) => `
                <li class="schedule-lesson">
                    <div class="schedule-lesson-time">${escapeHtmlStr(les.timeLabel || `${les.timeStart || ''}-${les.timeEnd || ''}`)}</div>
                    <div>
                        <div class="schedule-lesson-subject">${escapeHtmlStr(les.subjectName)}</div>
                        <div class="schedule-lesson-meta">${escapeHtmlStr(les.lessonTypeLabel || '')}${les.room ? ` · ${escapeHtmlStr(les.room)}` : ''}${les.teacher ? ` · ${escapeHtmlStr(les.teacher)}` : ''}</div>
                    </div>
                </li>
            `).join('');

            const title = `${MY_SCHEDULE_DAY_NAMES[day.dayOfWeek] || day.date} · ${day.date}`;
            return `
                <section class="schedule-day-block">
                    <h2 class="schedule-day-title">${escapeHtmlStr(title)}</h2>
                    <ul class="schedule-lesson-list">${lessons}</ul>
                </section>
            `;
        }).join('');
    }

    async function loadMyScheduleProfile(user) {
        const card = document.getElementById('myScheduleCard');
        const box = document.getElementById('myScheduleContent');
        const weekLabel = document.getElementById('myScheduleWeekLabel');
        const groupLabel = document.getElementById('myScheduleGroupLabel');
        if (!card || !box) return;

        const hasGroup = !!(user?.kgmaGroupId || user?.groupName);
        if (!hasGroup) {
            card.style.display = 'none';
            return;
        }

        card.style.display = '';
        box.innerHTML = '<p class="schedule-empty">Загрузка…</p>';
        if (groupLabel) {
            groupLabel.textContent = user.groupName
                ? `Группа: ${user.groupName}`
                : 'Группа указана в профиле';
        }

        try {
            const res = await fetch(`${API_URL}/schedule/my/week`, {
                headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {}
            });
            const week = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(week.error || 'Ошибка загрузки');

            if (weekLabel && week.weekStart && week.weekEnd) {
                weekLabel.textContent = `Неделя ${week.weekStart} — ${week.weekEnd}`;
            }
            renderMyScheduleWeek(week);
        } catch (error) {
            box.innerHTML = `<p class="schedule-empty">${escapeHtmlStr(error.message || 'Не удалось загрузить расписание')}</p>`;
        }
    }

    async function loadProfile() {
        if (!currentUser || !currentToken) {
            console.error('Пользователь не авторизован');
            return;
        }

        try {
            // Загружаем информацию о пользователе
            const userResponse = await fetch(`${API_URL}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            if (!userResponse.ok) {
                console.error('❌ Failed to load user data:', {
                    status: userResponse.status,
                    statusText: userResponse.statusText
                });
                if (userResponse.status === 401) {
                    logout();
                    window.location.href = '/login';
                    return;
                }
                throw new Error(`Failed to load user: ${userResponse.status}`);
            }

            if (userResponse.ok) {
                const userData = await userResponse.json();
                const user = userData.user;

                console.log('📋 User data loaded:', {
                    id: user?.id,
                    username: user?.username,
                    email: user?.email,
                    subscriptionEndDate: user?.subscriptionEndDate,
                    coins: user?.coins
                });

                const usernameEl = document.getElementById('userUsername');
                const emailEl = document.getElementById('userEmail');
                const createdAtEl = document.getElementById('userCreatedAt');

                if (usernameEl && user.username) usernameEl.textContent = user.username;
                if (emailEl && user.email) emailEl.textContent = user.email;
                const universityEl = document.getElementById('userUniversity');
                const uniLabel = user.University
                    ? `${user.University.shortName} — ${user.University.name}`
                    : 'Не указан';
                if (universityEl) {
                    universityEl.textContent = uniLabel;
                }

                const heroName = document.getElementById('profileHeroName');
                const heroAvatar = document.getElementById('profileHeroAvatar');
                const heroLine = document.getElementById('profileHeroLine');
                const heroSubBadge = document.getElementById('profileHeroSubBadge');
                const heroCoinsBadge = document.getElementById('profileHeroCoinsBadge');
                const displayName = user.username || 'Студент';
                if (heroName) heroName.textContent = displayName;
                if (heroAvatar) heroAvatar.textContent = userInitials(displayName);
                if (heroLine) {
                    heroLine.textContent = [user.email, uniLabel !== 'Не указан' ? uniLabel : null].filter(Boolean).join(' · ');
                }
                if (heroCoinsBadge) heroCoinsBadge.textContent = `${user.coins || 0} монет`;
                if (heroSubBadge) {
                    const end = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
                    const active = end && !Number.isNaN(end.getTime()) && end > new Date();
                    heroSubBadge.textContent = active ? 'Подписка активна' : 'Нет подписки';
                    heroSubBadge.classList.toggle('is-ok', !!active);
                    heroSubBadge.classList.toggle('is-warn', !active);
                }

                // Направление: факультет + курс
                await fillProfileDirectionForm(user);
                await loadMyScheduleProfile(user);
                if (createdAtEl && user.createdAt) {
                    const createdAt = new Date(user.createdAt);
                    if (!isNaN(createdAt.getTime())) {
                        createdAtEl.textContent = createdAt.toLocaleDateString('ru-RU', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        });
                    } else {
                        createdAtEl.textContent = '-';
                    }
                }

                // Обновляем баланс монеток
                const coinsEl = document.getElementById('userCoins');
                if (coinsEl) {
                    coinsEl.textContent = user.coins || 0;
                }

                // Обновляем дату окончания подписки
                const subscriptionEndEl = document.getElementById('userSubscriptionEnd');
                console.log('🔍 Subscription debug:', {
                    elementFound: !!subscriptionEndEl,
                    subscriptionEndDate: user.subscriptionEndDate,
                    subscriptionEndDateType: typeof user.subscriptionEndDate,
                    subscriptionEndDateValue: user.subscriptionEndDate,
                    userKeys: Object.keys(user),
                    fullUserData: user
                });

                if (subscriptionEndEl) {
                    // Проверяем subscriptionEndDate - может быть null, undefined, или строкой/датой
                    const subscriptionDate = user.subscriptionEndDate;

                    if (subscriptionDate !== null && subscriptionDate !== undefined && subscriptionDate !== '') {
                        try {
                            const endDate = new Date(subscriptionDate);
                            const now = new Date();

                            // Проверяем валидность даты
                            if (isNaN(endDate.getTime())) {
                                console.error('❌ Invalid subscriptionEndDate:', subscriptionDate, 'Type:', typeof subscriptionDate);
                                subscriptionEndEl.textContent = 'Ошибка формата даты';
                                subscriptionEndEl.style.color = 'var(--danger-color)';
                            } else {
                                const isActive = endDate > now;

                                // Форматируем дату с временем
                                const formattedDate = endDate.toLocaleDateString('ru-RU', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                });
                                const formattedTime = endDate.toLocaleTimeString('ru-RU', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });

                                subscriptionEndEl.textContent = `${formattedDate} в ${formattedTime}`;

                                // Добавляем стиль в зависимости от статуса
                                if (isActive) {
                                    subscriptionEndEl.style.color = 'var(--success-color)';
                                    // Показываем сколько дней осталось
                                    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
                                    if (daysLeft <= 7) {
                                        subscriptionEndEl.textContent += ` (осталось ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'})`;
                                        subscriptionEndEl.style.color = 'var(--warning-color, #f59e0b)';
                                    }
                                    console.log('✅ Subscription is active, ends:', formattedDate, 'Days left:', daysLeft);
                                } else {
                                    subscriptionEndEl.style.color = 'var(--danger-color)';
                                    subscriptionEndEl.textContent += ' (истекла)';
                                    console.log('⚠️ Subscription expired on:', formattedDate);
                                }
                            }
                        } catch (error) {
                            console.error('❌ Error parsing subscriptionEndDate:', error, 'Value:', subscriptionDate);
                            subscriptionEndEl.textContent = 'Ошибка обработки даты';
                            subscriptionEndEl.style.color = 'var(--danger-color)';
                        }
                    } else {
                        console.log('ℹ️ No subscriptionEndDate for user (null/undefined/empty)');
                        subscriptionEndEl.textContent = 'Нет активной подписки';
                        subscriptionEndEl.style.color = 'var(--text-secondary)';
                    }

                    // Показываем кнопку продления
                    const renewBtn = document.getElementById('renewSubscriptionBtn');
                    if (renewBtn) {
                        renewBtn.style.display = 'inline-block';
                    }
                } else {
                    console.error('❌ Element userSubscriptionEnd not found in DOM');
                }

                // Обновляем реферальную ссылку
                const referralLinkEl = document.getElementById('referralLink');
                if (referralLinkEl) {
                    if (user.referralCode) {
                        // Используем более надежный способ получения базового URL
                        let baseUrl = window.location.origin;
                        // Если origin пустой, используем протокол + хост
                        if (!baseUrl || baseUrl === 'null' || baseUrl === 'undefined') {
                            baseUrl = `${window.location.protocol}//${window.location.host}`;
                        }
                        // Если и это не работает, используем дефолтный домен
                        if (!baseUrl || baseUrl === 'null' || baseUrl === 'undefined') {
                            baseUrl = 'https://stud.kg'; // Замените на ваш реальный домен
                        }
                        const referralUrl = `${baseUrl}/register?ref=${user.referralCode}`;
                        referralLinkEl.value = referralUrl;
                        referralLinkEl.disabled = false;
                        console.log('✅ Реферальная ссылка установлена:', referralUrl);
                    } else {
                        // Если кода нет, показываем сообщение
                        referralLinkEl.value = 'Генерация кода...';
                        referralLinkEl.disabled = true;
                        console.log('⏳ Реферальный код отсутствует, ожидаем генерацию...');
                        // Перезагружаем данные пользователя через секунду
                        setTimeout(async () => {
                            await fetchUser();
                            await loadProfile();
                        }, 1000);
                    }
                }

                // Обработчик кнопки копирования
                const copyBtn = document.getElementById('copyReferralLink');
                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        if (referralLinkEl && referralLinkEl.value) {
                            referralLinkEl.select();
                            referralLinkEl.setSelectionRange(0, 99999); // Для мобильных
                            document.execCommand('copy');
                            showNotification('Реферальная ссылка скопирована!', 'success');
                        }
                    });
                }
            }

            // Загружаем статистику
            const response = await fetch(`${API_URL}/stats`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Токен недействителен
                    logout();
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Ошибка загрузки статистики');
            }

            const data = await response.json();
            const stats = data.stats;

            // Обновляем статистику
            const statTestsEl = document.getElementById('statTests');
            const statQuestionsEl = document.getElementById('statQuestions');
            const statAccuracyEl = document.getElementById('statAccuracy');
            const statStreakEl = document.getElementById('statStreak');
            const statLongestStreakEl = document.getElementById('statLongestStreak');
            const statTimeSpentEl = document.getElementById('statTimeSpent');

            if (statTestsEl) statTestsEl.textContent = stats.totalTestsCompleted || 0;
            if (statQuestionsEl) statQuestionsEl.textContent = stats.totalQuestionsAnswered || 0;
            if (statAccuracyEl) statAccuracyEl.textContent = `${stats.accuracy || 0}%`;
            if (statStreakEl) statStreakEl.textContent = stats.currentStreak || 0;
            if (statLongestStreakEl) statLongestStreakEl.textContent = stats.longestStreak || 0;

            // Вычисляем общее время, проведенное в тестах
            let totalTimeSpent = 0;
            if (data.recentResults && Array.isArray(data.recentResults)) {
                totalTimeSpent = data.recentResults.reduce((sum, result) => {
                    return sum + (result.timeSpent || 0);
                }, 0);
            }

            // Конвертируем секунды в часы и минуты
            const hours = Math.floor(totalTimeSpent / 3600);
            const minutes = Math.floor((totalTimeSpent % 3600) / 60);
            if (statTimeSpentEl) {
                if (hours > 0) {
                    statTimeSpentEl.textContent = `${hours} ч ${minutes} мин`;
                } else {
                    statTimeSpentEl.textContent = `${minutes} мин`;
                }
            }

            const recentList = document.getElementById('recentResultsList');
            console.log('Загружено результатов:', data.recentResults?.length || 0);
            console.log('Данные результатов:', data.recentResults);

            if (data.recentResults && data.recentResults.length > 0) {
                recentList.innerHTML = data.recentResults.map(result => {
                    const percentage = Math.round((result.score / result.totalQuestions) * 100);
                    const date = new Date(result.createdAt);
                    const testName = result.Test?.name || 'Неизвестный тест';
                    const subjectName = result.Test?.Subject?.name || '';
                    const timeSpentMinutes = result.timeSpent ? Math.floor(result.timeSpent / 60) : 0;
                    const timeSpentSeconds = result.timeSpent ? result.timeSpent % 60 : 0;

                    return `
                    <div class="test-history-item" style="padding: 1.5rem; margin: 0.75rem 0; background: linear-gradient(135deg, var(--card-bg) 0%, var(--bg-secondary) 100%); border-radius: var(--radius-lg); border: 1px solid var(--border-light); border-left: 4px solid ${percentage >= 80 ? 'var(--success-color)' : percentage >= 60 ? 'var(--primary-color)' : 'var(--danger-color)'}; box-shadow: var(--shadow); transition: all 0.3s ease;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
                            <div style="flex: 1; min-width: 200px;">
                                <h4 style="font-size: 1.1rem; font-weight: 600; color: var(--text-color); margin-bottom: 0.5rem;">
                                    ${testName}
                                </h4>
                                ${subjectName ? `<p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0.5rem;">${subjectName}</p>` : ''}
                                <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; margin-top: 0.75rem;">
                                    <div>
                                        <p style="font-size: 1.5rem; font-weight: 700; color: var(--primary-color); line-height: 1;">
                                            ${result.score}/${result.totalQuestions}
                                        </p>
                                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Правильных ответов</p>
                                    </div>
                                    <div>
                                        <p style="font-size: 1.5rem; font-weight: 700; color: ${percentage >= 80 ? 'var(--success-color)' : percentage >= 60 ? 'var(--primary-color)' : 'var(--danger-color)'}; line-height: 1;">
                                            ${percentage}%
                                        </p>
                                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Точность</p>
                                    </div>
                                    ${result.timeSpent ? `
                                        <div>
                                            <p style="font-size: 1.5rem; font-weight: 700; color: var(--text-secondary); line-height: 1;">
                                                ${timeSpentMinutes}:${timeSpentSeconds.toString().padStart(2, '0')}
                                            </p>
                                            <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Время</p>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid var(--border-light); flex-wrap: wrap; gap: 1rem;">
                            <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0;">
                                ${date.toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                            </p>
                            <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                                <span style="padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.875rem; font-weight: 600; background-color: ${percentage >= 80 ? 'rgba(16, 185, 129, 0.1)' : percentage >= 60 ? 'rgba(37, 99, 235, 0.1)' : 'rgba(220, 38, 38, 0.1)'}; color: ${percentage >= 80 ? 'var(--success-color)' : percentage >= 60 ? 'var(--primary-color)' : 'var(--danger-color)'};">
                                    ${percentage >= 80 ? 'Отлично' : percentage >= 60 ? 'Хорошо' : 'Нужно улучшить'}
                                </span>
                                <button class="btn btn-secondary" onclick="showTestAnalysis(${result.id})" style="padding: 0.5rem 1rem; font-size: 0.875rem;">
                                    Разбор
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                }).join('');
            } else {
                if (recentList) {
                    recentList.innerHTML = `
                    <div style="text-align: center; padding: 3rem 2rem; background-color: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px solid var(--border-light);">
                        <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: var(--text-muted);">Нет результатов</div>
                        <h3 style="margin-bottom: 0.5rem; color: var(--text-color);">Нет результатов прохождения тестов</h3>
                        <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Начните прохождение тестов, чтобы увидеть здесь свою статистику</p>
                        <a href="/tests" class="btn btn-primary">Начать тестирование</a>
                    </div>
                `;
                }
            }

        } catch (error) {
            console.error('Ошибка загрузки профиля:', error);
            if (error.message && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
                logout();
                window.location.href = '/login';
            } else {
                showNotification('Ошибка загрузки профиля', 'error');
            }
        }
    }

    // Изменение пароля
    async function handleChangePassword(e) {
        e.preventDefault();

        if (!currentUser || !currentToken) {
            showNotification('Необходимо войти в систему', 'error');
            return;
        }

        const formData = new FormData(e.target);
        const currentPassword = formData.get('currentPassword');
        const newPassword = formData.get('newPassword');
        const confirmNewPassword = formData.get('confirmNewPassword');

        // Валидация
        if (newPassword.length < 6) {
            showNotification('Новый пароль должен содержать минимум 6 символов', 'error');
            return;
        }

        if (newPassword !== confirmNewPassword) {
            showNotification('Пароли не совпадают', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            const result = await response.json();

            if (response.ok) {
                showNotification('Пароль успешно изменен', 'success');
                e.target.reset();
            } else {
                showNotification(result.error || 'Ошибка изменения пароля', 'error');
            }
        } catch (error) {
            console.error('Ошибка изменения пароля:', error);
            showNotification('Ошибка соединения', 'error');
        }
    }

    // Уведомления
    function showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        if (!notification) return;

        // Убираем предыдущее уведомление, если оно есть
        notification.classList.remove('show');
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(400px) scale(0.9)';

        // Небольшая задержка для плавного перехода
        setTimeout(() => {
            notification.textContent = message;
            notification.className = `notification ${type}`;
            notification.style.opacity = '';
            notification.style.transform = '';

            // Добавляем класс show для анимации появления
            setTimeout(() => {
                notification.classList.add('show');
            }, 10);

            // Убираем уведомление через 3 секунды
            setTimeout(() => {
                notification.classList.remove('show');
                // Дополнительная задержка для завершения анимации скрытия
                setTimeout(() => {
                    notification.textContent = '';
                    notification.className = 'notification';
                }, 400);
            }, 3000);
        }, 50);
    }

    function showSubscriptionRequiredModal() {
        const modal = document.getElementById('registerModal');
        if (!modal) {
            window.location.href = currentUser ? '/subscriptions' : '/register';
            return;
        }

        const titleEl = document.getElementById('registerModalTitle');
        const textEl = document.getElementById('registerModalText');
        const primaryBtn = document.getElementById('subscriptionModalPrimaryBtn');
        const secondaryBtn = document.getElementById('subscriptionModalSecondaryBtn');

        if (titleEl) {
            titleEl.textContent = getProgramType() === 'usmle'
                ? 'Нужна подписка USMLE'
                : 'Подписка требуется';
        }
        if (textEl) {
            if (getProgramType() === 'usmle') {
                textEl.textContent = currentUser
                    ? 'USMLE — отдельная подписка. Оформите её во вкладке «Подписки», чтобы открыть платные тесты USMLE.'
                    : 'Зарегистрируйтесь, затем оформите отдельную подписку USMLE.';
            } else {
                textEl.textContent = currentUser
                    ? 'Оформите или продлите подписку во вкладке «Подписки», чтобы открыть платные тесты.'
                    : 'Зарегистрируйтесь бесплатно, затем оформите подписку для доступа ко всем тестам.';
            }
        }
        if (primaryBtn) {
            primaryBtn.href = currentUser ? '/subscriptions' : '/register';
            primaryBtn.textContent = currentUser ? 'К подпискам' : 'Зарегистрироваться';
        }
        if (secondaryBtn) {
            if (currentUser) {
                secondaryBtn.style.display = 'none';
            } else {
                secondaryBtn.style.display = 'inline-flex';
                secondaryBtn.href = '/login';
                secondaryBtn.textContent = 'Войти';
            }
        }

        modal.style.display = 'block';

        if (!modal.dataset.boundClose) {
            modal.dataset.boundClose = '1';
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeRegisterModal();
            });
            const closeBtn = document.getElementById('registerModalClose');
            if (closeBtn) closeBtn.addEventListener('click', closeRegisterModal);
        }
    }

    function showRegisterModal() {
        showSubscriptionRequiredModal();
    }

    function closeRegisterModal() {
        const modal = document.getElementById('registerModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async function toggleFavorite(questionId) {
        if (!currentUser) {
            showNotification('Необходимо войти в систему', 'error');
            return;
        }

        try {
            const checkResponse = await fetch(`${API_URL}/questions/${questionId}/favorite`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });
            const checkData = await checkResponse.json();
            const isFavorite = checkData.isFavorite;

            const method = isFavorite ? 'DELETE' : 'POST';
            const response = await fetch(`${API_URL}/questions/${questionId}/favorite`, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            if (response.ok) {
                const message = isFavorite ? 'Вопрос удален из избранного' : 'Вопрос добавлен в избранное';
                showNotification(message, 'success');
                updateFavoriteButton(questionId, !isFavorite);
            }
        } catch (error) {
            console.error('Ошибка изменения избранного:', error);
            showNotification('Ошибка изменения избранного', 'error');
        }
    }

    async function checkFavoriteStatus(questionId) {
        try {
            const response = await fetch(`${API_URL}/questions/${questionId}/favorite`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });
            const data = await response.json();
            updateFavoriteButton(questionId, data.isFavorite);
        } catch (error) {
            console.error('Ошибка проверки избранного:', error);
        }
    }

    function updateFavoriteButton(questionId, isFavorite) {
        const btn = document.getElementById(`favoriteBtn${questionId}`);
        const icon = document.getElementById(`favoriteIcon${questionId}`);
        if (btn && icon) {
            icon.textContent = isFavorite ? '⭐' : '☆';
            btn.title = isFavorite ? 'Удалить из избранного' : 'Добавить в избранное';
            if (isFavorite) {
                btn.classList.add('favorite-active');
            } else {
                btn.classList.remove('favorite-active');
            }
        }
    }


    // Новости
    async function loadNews() {
        const newsList = document.getElementById('newsList');
        if (!newsList) return;

        try {
            const response = await fetch(`${API_URL}/news`);
            if (!response.ok) {
                throw new Error('Ошибка загрузки новостей');
            }

            const news = await response.json();
            if (!news || news.length === 0) {
                newsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Пока нет опубликованных новостей</p>';
                return;
            }

            newsList.innerHTML = news.map((item, index) => {
                const date = new Date(item.publishedAt || item.createdAt);
                return `
                <article class="news-card" style="animation-delay: ${index * 0.15}s;">
                    <div class="news-card-header">
                        <div class="news-icon">${item.icon || '📰'}</div>
                        <div class="news-meta">
                            <span class="news-category">${item.category || 'Обновления'}</span>
                            <span class="news-date">${date.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        </div>
                    </div>
                    <h3 class="news-title">${item.title}</h3>
                    <p class="news-content">${item.content}</p>
                </article>
            `;
            }).join('');
        } catch (error) {
            console.error('Ошибка загрузки новостей:', error);
            newsList.innerHTML = '<p style="color: var(--error-color); text-align: center; padding: 2rem;">Не удалось загрузить новости</p>';
        }
    }

    // Обратная связь
    async function handleContact(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);

        try {
            const response = await fetch(`${API_URL}/contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                showNotification('Спасибо за ваше сообщение! Мы свяжемся с вами в ближайшее время.', 'success');
                e.target.reset();
            } else {
                if (result.errors && Array.isArray(result.errors)) {
                    const errorMessages = result.errors.map(err => err.msg || err.message).join(', ');
                    showNotification(errorMessages, 'error');
                } else {
                    showNotification(result.error || 'Ошибка отправки сообщения', 'error');
                }
            }
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            showNotification('Ошибка соединения. Попробуйте позже.', 'error');
        }
    }

    function openQuestionErrorModal() {
        const modal = document.getElementById('questionErrorModal');
        const reason = document.getElementById('errorReason');
        if (!modal) return;
        modal.style.display = 'block';
        if (reason) reason.focus();
    }

    function closeQuestionErrorModal() {
        const modal = document.getElementById('questionErrorModal');
        const reason = document.getElementById('errorReason');
        if (!modal) return;
        modal.style.display = 'none';
        if (reason) reason.value = '';
    }

    async function handleQuestionErrorReport(e) {
        e.preventDefault();
        const question = currentQuestions[currentQuestionIndex];
        if (!question) {
            showNotification('Не удалось определить текущий вопрос', 'error');
            return;
        }

        const reasonEl = document.getElementById('errorReason');
        const reason = String(reasonEl?.value || '').trim();
        if (reason.length < 5) {
            showNotification('Опишите проблему подробнее (минимум 5 символов)', 'error');
            return;
        }

        const payload = {
            questionId: question.id,
            testId: currentTestId || window.currentTestId || question.testId,
            questionNumber: currentQuestionIndex + 1,
            questionText: question.text || '',
            reason
        };

        if (currentUser?.username) {
            payload.guestName = currentUser.username;
        }
        if (currentUser?.email) {
            payload.guestEmail = currentUser.email;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (currentToken) {
                headers.Authorization = `Bearer ${currentToken}`;
            }

            const response = await fetch(`${API_URL}/test-error-report`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                if (result.errors && Array.isArray(result.errors)) {
                    const errorMessages = result.errors.map(err => err.msg || err.message).join(', ');
                    showNotification(errorMessages, 'error');
                } else {
                    showNotification(result.error || 'Ошибка отправки отчета', 'error');
                }
                return;
            }

            showNotification('Отчет отправлен администратору. Спасибо!', 'success');
            closeQuestionErrorModal();
        } catch (error) {
            console.error('Ошибка отправки отчета об ошибке вопроса:', error);
            showNotification('Ошибка соединения. Попробуйте позже.', 'error');
        }
    }

    // Продление подписки — на странице /subscriptions
    function renewSubscription() {
        if (document.getElementById('subsPlans')) {
            document.getElementById('subsPlans')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        window.location.href = '/subscriptions';
    }

    let selectedPlan = { months: 1, price: 500, programType: 'university' };

    function formatPlanPriceHtml(price, oldPrice) {
        const p = Math.round(Number(price));
        if (oldPrice != null && Number(oldPrice) > Number(price)) {
            return `<span class="old">${Math.round(Number(oldPrice))}</span>${p} сом`;
        }
        return `${p} сом`;
    }

    function planDesc(months) {
        if (months === 12) return 'Максимальная выгода';
        if (months === 3) return 'Полный доступ на 3 месяца';
        return 'Полный доступ на 1 месяц';
    }

    async function fetchSubscriptionPlans(programType) {
        const token = currentToken || localStorage.getItem('token');
        if (!token) return null;
        const program = programType || selectedPlan.programType || 'university';
        const response = await fetch(`/api/payments/plans?program=${encodeURIComponent(program)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Не удалось загрузить тарифы');
        }
        return response.json();
    }

    function renderSubscriptionPlans(plans, { preferMonths, programType, containerId } = {}) {
        const program = programType || selectedPlan.programType || 'university';
        const subsPlans = document.getElementById(containerId || (program === 'usmle' ? 'usmleSubsPlans' : 'subsPlans'));
        const renewalPlans = program === 'university' ? document.getElementById('renewalPlans') : null;
        const list = Array.isArray(plans) ? plans.filter((p) => p.isActive !== false) : [];

        if (!list.length) {
            const empty = '<p style="color: var(--text-muted);">Нет доступных тарифов</p>';
            if (subsPlans) subsPlans.innerHTML = empty;
            if (renewalPlans) renewalPlans.innerHTML = empty;
            return;
        }

        const pickMonths = preferMonths && list.some((p) => Number(p.months) === Number(preferMonths))
            ? Number(preferMonths)
            : Number(list[0].months);

        if (subsPlans) {
            subsPlans.innerHTML = list.map((p) => {
                const selected = Number(p.months) === pickMonths ? ' selected' : '';
                const months = Number(p.months);
                const isBest = months === 12 || (p.oldPrice != null && Number(p.oldPrice) > Number(p.price) * 1.2);
                const badge = months === 12
                    ? '<span class="subs-plan-badge">Выгодно</span>'
                    : (months === 3 ? '<span class="subs-plan-badge">Популярный</span>' : '');
                const bestClass = isBest ? ' subs-plan--best' : '';
                return `
                <div class="subs-plan${selected}${bestClass}" data-months="${p.months}" data-price="${p.price}" data-program="${program}" onclick="selectPlan(this)" role="button" tabindex="0">
                    ${badge}
                    <div class="subs-plan-name">${p.title || planDesc(months)}</div>
                    <div class="subs-plan-price">${formatPlanPriceHtml(p.price, p.oldPrice)}</div>
                    <div class="subs-plan-desc">${planDesc(months)}</div>
                    <span class="subs-plan-check" aria-hidden="true"></span>
                </div>`;
            }).join('');
        }

        if (renewalPlans) {
            renewalPlans.innerHTML = list.map((p) => {
                const selected = Number(p.months) === pickMonths ? ' selected' : '';
                const priceInner = p.oldPrice != null && Number(p.oldPrice) > Number(p.price)
                    ? `<span style="text-decoration: line-through; color: var(--text-muted); margin-right: 0.25rem;">${Math.round(Number(p.oldPrice))}</span>${Math.round(Number(p.price))} сом`
                    : `${Math.round(Number(p.price))} сом`;
                return `
                <div class="plan-card${selected}" data-months="${p.months}" data-price="${p.price}" data-program="${program}" onclick="selectPlan(this)">
                    <div class="plan-header">
                        <span class="plan-name">${p.title || planDesc(p.months)}</span>
                        <span class="plan-price">${priceInner}</span>
                    </div>
                </div>`;
            }).join('');
        }

        const first = list.find((p) => Number(p.months) === pickMonths) || list[0];
        selectedPlan = {
            months: Number(first.months),
            price: Math.round(Number(first.price)),
            programType: program
        };
        updateRenewalTotal();
    }

    async function loadAndRenderSubscriptionPlans(preferMonths, programType) {
        try {
            const program = programType || 'university';
            const data = await fetchSubscriptionPlans(program);
            if (!data) return;
            renderSubscriptionPlans(data.plans || [], {
                preferMonths: preferMonths || selectedPlan.months,
                programType: program
            });
        } catch (error) {
            console.error('loadAndRenderSubscriptionPlans:', error);
            const msg = `<p style="color: var(--text-muted);">${error.message || 'Ошибка загрузки тарифов'}</p>`;
            const el = document.getElementById(programType === 'usmle' ? 'usmleSubsPlans' : 'subsPlans');
            if (el) el.innerHTML = msg;
        }
    }

    function updateRenewalTotal() {
        const program = selectedPlan.programType === 'usmle' ? 'usmle' : 'university';
        const coinsToUseInput = document.getElementById(program === 'usmle' ? 'usmleRenewalCoinsToUse' : 'renewalCoinsToUse')
            || document.getElementById('renewalCoinsToUse');
        const totalEl = document.getElementById(program === 'usmle' ? 'usmleTotalPrice' : 'totalPrice')
            || document.getElementById('totalPrice');
        if (!totalEl) return;
        let price = selectedPlan.price;
        const promoInput = document.getElementById(program === 'usmle' ? 'usmleSubsPromoCode' : 'subsPromoCode');
        const promoHint = document.getElementById('subsPromoHint');
        const discountPercent = Number(document.getElementById('subsPromoDiscount')?.value || 0);
        if (discountPercent > 0 && discountPercent <= 100) {
            price = Math.max(0.01, price - (price * discountPercent) / 100);
        }
        const coinsToUse = Math.min(
            parseInt(coinsToUseInput?.value, 10) || 0,
            Math.floor(price),
            (currentUser && (currentUser.coins !== undefined)) ? currentUser.coins : 0
        );
        const toPay = Math.max(0, Math.round((price - coinsToUse) * 100) / 100);
        totalEl.textContent = toPay + ' сом';
        if (promoHint && discountPercent > 0) {
            promoHint.textContent = `Скидка ${discountPercent}% учтена`;
            promoHint.style.display = 'block';
        } else if (promoHint) {
            promoHint.style.display = 'none';
        }
    }

    function selectPlan(card) {
        if (card.classList.contains('disabled')) return;
        document.querySelectorAll('.plan-card, .subs-plan').forEach(c => {
            if (c.dataset.program === (card.dataset.program || 'university') || (!c.dataset.program && !card.dataset.program)) {
                c.classList.remove('selected');
            }
        });
        card.classList.add('selected');

        selectedPlan = {
            months: parseInt(card.dataset.months),
            price: parseInt(card.dataset.price),
            programType: card.dataset.program === 'usmle' ? 'usmle' : 'university'
        };

        const coinsToUseInput = document.getElementById('renewalCoinsToUse');
        const userCoins = (currentUser && (currentUser.coins !== undefined)) ? currentUser.coins : 0;
        if (coinsToUseInput) {
            coinsToUseInput.max = Math.min(selectedPlan.price, userCoins);
            coinsToUseInput.value = Math.min(parseInt(coinsToUseInput.value, 10) || 0, selectedPlan.price, userCoins);
        }
        updateRenewalTotal();
    }

    async function proceedToPayment(programTypeArg) {
        if (programTypeArg === 'usmle' || programTypeArg === 'university') {
            selectedPlan.programType = programTypeArg;
            const containerId = programTypeArg === 'usmle' ? 'usmleSubsPlans' : 'subsPlans';
            const card = document.querySelector(
                `#${containerId} .subs-plan.selected, #${containerId} .plan-card.selected, #${containerId} [data-months].selected`
            );
            if (card?.dataset?.months && card?.dataset?.price) {
                selectedPlan.months = parseInt(card.dataset.months, 10);
                selectedPlan.price = parseInt(card.dataset.price, 10);
            }
        }

        const programType = selectedPlan.programType === 'usmle' ? 'usmle' : 'university';
        const paymentType = programType === 'usmle' ? 'usmle_subscription' : 'subscription';
        const planLabel = selectedPlan.months === 12
            ? '1 год'
            : `${selectedPlan.months} ${getMonthDeclension(selectedPlan.months)}`;
        const description = programType === 'usmle'
            ? `Подписка USMLE: ${planLabel}`
            : `Подписка: ${planLabel}`;
        const subscriptionType = selectedPlan.months.toString();

        const payBtn = document.getElementById(programType === 'usmle' ? 'usmleSubsPayBtn' : 'subsPayBtn')
            || document.querySelector('#renewalModal .btn-primary');
        const originalText = payBtn ? payBtn.textContent : '';
        if (payBtn) {
            payBtn.disabled = true;
            payBtn.textContent = 'Создание платежа...';
        }

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            } else if (typeof currentToken !== 'undefined' && currentToken) {
                headers['Authorization'] = `Bearer ${currentToken}`;
            } else {
                showNotification('Ошибка авторизации. Пожалуйста, войдите в систему.', 'error');
                setTimeout(() => window.location.href = '/login?next=/subscriptions', 1500);
                return;
            }

            const coinsInputId = programType === 'usmle' ? 'usmleRenewalCoinsToUse' : 'renewalCoinsToUse';
            const coinsToUseInput = document.getElementById(coinsInputId) || document.getElementById('renewalCoinsToUse');
            const coinsToUse = Math.min(
                parseInt(coinsToUseInput?.value, 10) || 0,
                selectedPlan.price,
                (currentUser && (currentUser.coins !== undefined)) ? currentUser.coins : 0
            );

            const promoCode = (document.getElementById(programType === 'usmle' ? 'usmleSubsPromoCode' : 'subsPromoCode')?.value || '').trim();

            const body = {
                amount: selectedPlan.price,
                description: description,
                paymentType: paymentType,
                programType: programType,
                subscriptionType: subscriptionType,
                coinsToUse: coinsToUse
            };
            if (promoCode) body.promoCode = promoCode;

            const response = await fetch('/api/payments/create', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (response.ok && data.success && data.paymentUrl) {
                window.location.href = data.paymentUrl;
            } else {
                console.error('Payment creation failed:', data);
                showNotification(data.error || data.message || 'Ошибка создания платежа', 'error');
                if (payBtn) {
                    payBtn.disabled = false;
                    payBtn.textContent = originalText;
                }
            }
        } catch (error) {
            console.error('Error proceeding to payment:', error);
            showNotification('Ошибка соединения с сервером', 'error');
            if (payBtn) {
                payBtn.disabled = false;
                payBtn.textContent = originalText;
            }
        }
    }

    function getMonthDeclension(months) {
        if (months === 1) return 'месяц';
        if (months >= 2 && months <= 4) return 'месяца';
        return 'месяцев';
    }

    async function loadSubscriptionsPage() {
        const statusBox = document.getElementById('subsStatus');
        const statusText = document.getElementById('subsStatusText');
        const historyEl = document.getElementById('subsHistory');
        if (!statusBox || !historyEl) return;

        const token = currentToken || localStorage.getItem('token');
        if (!token) {
            statusText.textContent = 'Войдите, чтобы видеть подписки';
            return;
        }

        try {
            // Актуализируем пользователя
            if (typeof fetchUser === 'function') {
                await fetchUser();
            } else if (typeof loadUser === 'function') {
                await loadUser();
            }

            const response = await fetch('/api/payments/transactions', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Не удалось загрузить историю');
            const data = await response.json();

            const end = data.subscriptionEndDate ? new Date(data.subscriptionEndDate) : null;
            const active = !!data.subscriptionActive;
            statusBox.classList.toggle('active', active);
            statusBox.classList.toggle('inactive', !active);

            const statusPill = document.getElementById('subsStatusPill');
            const statusIcon = document.getElementById('subsStatusIcon');
            if (active && end) {
                const daysLeft = Math.max(0, Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24)));
                statusText.innerHTML = `Университет: подписка <strong>активна</strong> до <strong>${end.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</strong> (осталось ${daysLeft} дн.).`;
                if (statusPill) {
                    statusPill.textContent = 'Активна';
                    statusPill.className = 'subs-pill on';
                }
                if (statusIcon) statusIcon.textContent = '✓';
            } else if (end) {
                statusText.innerHTML = `Университет: подписка <strong>истекла</strong> ${end.toLocaleDateString('ru-RU')}.`;
                if (statusPill) {
                    statusPill.textContent = 'Истекла';
                    statusPill.className = 'subs-pill off';
                }
                if (statusIcon) statusIcon.textContent = '!';
            } else {
                statusText.innerHTML = 'Университет: подписки пока нет. Выберите тариф ниже.';
                if (statusPill) {
                    statusPill.textContent = 'Нет доступа';
                    statusPill.className = 'subs-pill off';
                }
                if (statusIcon) statusIcon.textContent = '⏱';
            }

            const usmleBox = document.getElementById('usmleSubsStatus');
            const usmleText = document.getElementById('usmleSubsStatusText');
            const usmlePill = document.getElementById('usmleSubsStatusPill');
            const usmleEnd = data.usmleSubscriptionEndDate ? new Date(data.usmleSubscriptionEndDate) : null;
            const usmleActive = !!data.usmleSubscriptionActive;
            if (usmleBox) {
                usmleBox.classList.toggle('active', usmleActive);
                usmleBox.classList.toggle('inactive', !usmleActive);
            }
            if (usmleText) {
                if (usmleActive && usmleEnd) {
                    const daysLeft = Math.max(0, Math.ceil((usmleEnd - new Date()) / (1000 * 60 * 60 * 24)));
                    usmleText.innerHTML = `USMLE: подписка <strong>активна</strong> до <strong>${usmleEnd.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</strong> (осталось ${daysLeft} дн.).`;
                } else if (usmleEnd) {
                    usmleText.innerHTML = `USMLE: подписка <strong>истекла</strong> ${usmleEnd.toLocaleDateString('ru-RU')}.`;
                } else {
                    usmleText.innerHTML = 'USMLE: отдельная подписка. Купите тариф ниже, чтобы открыть программу.';
                }
            }
            if (usmlePill) {
                usmlePill.textContent = usmleActive ? 'Активна' : (usmleEnd ? 'Истекла' : 'Нет доступа');
                usmlePill.className = usmleActive ? 'subs-pill on' : 'subs-pill off';
            }

            await loadAndRenderSubscriptionPlans(selectedPlan.months, 'university');
            await loadAndRenderSubscriptionPlans(1, 'usmle');

            const coinsBalanceEl = document.getElementById('renewalCoinsBalance');
            const coinsToUseInput = document.getElementById('renewalCoinsToUse');
            const userCoins = data.coins ?? currentUser?.coins ?? 0;
            if (currentUser) currentUser.coins = userCoins;
            if (coinsBalanceEl) coinsBalanceEl.textContent = userCoins;
            if (coinsToUseInput) {
                coinsToUseInput.max = Math.min(selectedPlan.price, userCoins);
                if (!coinsToUseInput.dataset.bound) {
                    coinsToUseInput.dataset.bound = '1';
                    coinsToUseInput.addEventListener('input', updateRenewalTotal);
                }
            }
            updateRenewalTotal();

            const txs = (Array.isArray(data.transactions) ? data.transactions : [])
                .filter((t) => t.status !== 'PENDING');
            if (!txs.length) {
                historyEl.innerHTML = '<p style="color: var(--text-muted);">Пока нет оплаченных подписок</p>';
            } else {
                const statusBadge = (s) => {
                    if (s === 'SUCCEEDED') return '<span class="subs-badge ok">Оплачено</span>';
                    return '<span class="subs-badge fail">Ошибка</span>';
                };
                historyEl.innerHTML = `
                    <table class="subs-history-table">
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Тариф</th>
                                <th>Сумма</th>
                                <th>Статус</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${txs.map((t) => {
                                const d = new Date(t.createdAt);
                                const dateStr = isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU');
                                const renewBtn = t.status === 'SUCCEEDED'
                                    ? `<button type="button" class="btn btn-secondary btn-sm" onclick="renewSubscription()">Продлить</button>`
                                    : '';
                                return `<tr>
                                    <td>${dateStr}</td>
                                    <td>${t.planLabel || 'Подписка'}${t.promoCode ? ` <small>(${t.promoCode})</small>` : ''}</td>
                                    <td>${t.amount} сом${t.coinsUsed ? ` <small>(−${t.coinsUsed} монет)</small>` : ''}</td>
                                    <td>${statusBadge(t.status)}</td>
                                    <td>${renewBtn}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            }
        } catch (error) {
            console.error('loadSubscriptionsPage:', error);
            statusText.textContent = 'Не удалось загрузить данные подписки';
            historyEl.innerHTML = '<p style="color: var(--danger-color);">Ошибка загрузки истории</p>';
        }
    }

    // Глобальные функции для onclick
    window.selectPlan = selectPlan;
    window.proceedToPayment = proceedToPayment;
    window.loadAndRenderSubscriptionPlans = loadAndRenderSubscriptionPlans;
    // Экспорт функций для использования в HTML
    window.loadUser = loadUser;
    window.fetchUser = fetchUser;
    window.initTheme = initTheme;
    window.setupEventListeners = setupEventListeners;
    window.loadSubjectTests = loadSubjectTests;
    window.handleTestCardClick = handleTestCardClick;
    window.showSubscriptionRequiredModal = showSubscriptionRequiredModal;
    window.showRegisterModal = showRegisterModal;
    window.loadTestSettings = loadTestSettings;
    window.loadSubjects = loadSubjects;
    window.setProgramType = setProgramType;
    window.getProgramType = getProgramType;
    window.applyMedicalLinkify = applyMedicalLinkify;
    window.toggleUsmleTag = toggleUsmleTag;
    window.clearUsmleTags = clearUsmleTags;
    window.loadUsmleTagFilters = loadUsmleTagFilters;
    window.hasActiveUsmleSubscription = hasActiveUsmleSubscription;
    window.loadHomepageTests = loadHomepageTests;
    window.loadHomepageStats = loadHomepageStats;
    window.startFavoriteTest = startFavoriteTest;
    window.filterSubjects = filterSubjects;
    window.navigateTo = navigateTo;
    window.selectAnswer = selectAnswer;
    window.removeFavorite = removeFavorite;
    window.toggleFavorite = toggleFavorite;
    window.showTestResults = showTestResults;
    window.showQuestion = showQuestion;
    window.startTimer = startTimer;
    window.nextQuestion = nextQuestion;
    window.prevQuestion = prevQuestion;
    window.finishTest = finishTest;
    window.loadProfile = loadProfile;
    window.loadNews = loadNews;
    window.handleChangePassword = handleChangePassword;
    window.showNotification = showNotification;
    window.renewSubscription = renewSubscription;
    window.loadSubscriptionsPage = loadSubscriptionsPage;
    window.toggleTestCatalogFavorite = toggleTestCatalogFavorite;
    window.toggleSubjectCatalogFavorite = toggleSubjectCatalogFavorite;
    window.ensureSubscriptionAlertVisibility = ensureSubscriptionAlertVisibility;

    // Экспорт переменных состояния для доступа из inline скриптов
    Object.defineProperty(window, 'currentUser', {
        get: () => currentUser,
        set: (value) => { currentUser = value; },
        configurable: true
    });

    // Разбор теста — отдельная страница
    async function showTestAnalysis(resultId) {
        const id = Number(resultId);
        if (Number.isFinite(id) && id > 0) {
            window.location.href = `/test-review?resultId=${id}`;
            return;
        }
        window.location.href = '/test-review';
    }

    // Экспорт функции для использования в HTML
    window.showTestAnalysis = showTestAnalysis;
    window.renderQuestionExplanationHtml = renderQuestionExplanationHtml;
    window.goToQuestion = goToQuestion;

    Object.defineProperty(window, 'currentQuestions', {
        get: () => currentQuestions,
        set: (value) => { currentQuestions = value; },
        configurable: true
    });

    Object.defineProperty(window, 'currentAnswers', {
        get: () => currentAnswers,
        set: (value) => { currentAnswers = value; },
        configurable: true
    });

    Object.defineProperty(window, 'currentQuestionIndex', {
        get: () => currentQuestionIndex,
        set: (value) => { currentQuestionIndex = value; },
        configurable: true
    });

    Object.defineProperty(window, 'instantFeedbackMode', {
        get: () => instantFeedbackMode,
        set: (value) => { instantFeedbackMode = Boolean(value); },
        configurable: true
    });

    Object.defineProperty(window, 'instantFeedbackLockedQuestions', {
        get: () => instantFeedbackLockedQuestions,
        set: (value) => { instantFeedbackLockedQuestions = value || {}; },
        configurable: true
    });

    Object.defineProperty(window, 'testStartTime', {
        get: () => testStartTime,
        set: (value) => { testStartTime = value; },
        configurable: true
    });

} // Закрываем блок else для страницы админки

