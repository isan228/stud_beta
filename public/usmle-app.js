(function () {
    const STEP_LABELS = { step1: 'USMLE Step 1', step2: 'USMLE Step 2', step3: 'USMLE Step 3' };
    const BANK_KEY = 'usmleSelectedBank';

    function escHtml(str) {
        return String(str || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function svgIcon(paths, viewBox = '0 0 24 24') {
        return `<svg class="usmle-ico" viewBox="${viewBox}" aria-hidden="true" focusable="false">${paths}</svg>`;
    }

    const ICONS = {
        banks: svgIcon('<path d="M3 7h18M3 12h18M3 17h12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        welcome: svgIcon('<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>'),
        create: svgIcon('<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        history: svgIcon('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M12 8v4.5l3 1.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>'),
        performance: svgIcon('<path d="M5 19V10M12 19V5M19 19v-7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        library: svgIcon('<path d="M5 4h4v16H5V4Zm5 0h4v16h-4V4Zm5 0h4v16h-4V4Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>'),
        search: svgIcon('<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        notes: svgIcon('<path d="M7 3h8l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M15 3v5h5M9 13h6M9 17h6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        flashcards: svgIcon('<rect x="4" y="6" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M8 4h10a2 2 0 0 1 2 2v10" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        notebook: svgIcon('<path d="M7 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9 7h7M9 11h7M9 15h5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        help: svgIcon('<circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.35-1.15.9-1.15 1.7V14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/>'),
        settings: svgIcon('<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.4l1.6 1.6M17.5 16l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.6l1.6-1.6M17.5 8l1.6-1.6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        logo: svgIcon('<path d="M6 5h8.5a3.5 3.5 0 0 1 0 7H9v7M9 12h6.5a3.5 3.5 0 0 1 0 7H6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>'),
        menu: svgIcon('<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        moon: svgIcon('<path d="M18 13.5A7 7 0 0 1 10.5 6 6.5 6.5 0 1 0 18 13.5Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>'),
        sun: svgIcon('<circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M12 3v2.2M12 18.8V21M4.2 12H6.4M17.6 12h2.2M6.2 6.2l1.6 1.6M16.2 16.2l1.6 1.6M6.2 17.8l1.6-1.6M16.2 7.8l1.6-1.6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>'),
        review: svgIcon('<path d="M7 4h10a1 1 0 0 1 1 1v15l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M9 9h6M9 13h4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>')
    };

    function getStoredStep() {
        try { return localStorage.getItem('usmleActiveStep') || 'step1'; }
        catch { return 'step1'; }
    }

    function setStoredStep(step) {
        try { localStorage.setItem('usmleActiveStep', step); } catch (_) {}
    }

    function getSelectedBank() {
        try {
            const raw = localStorage.getItem(BANK_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !data.id) return null;
            return {
                id: Number(data.id),
                name: String(data.name || ''),
                step: data.step || getStoredStep()
            };
        } catch {
            return null;
        }
    }

    function setSelectedBank(bank) {
        try {
            localStorage.setItem(BANK_KEY, JSON.stringify({
                id: Number(bank.id),
                name: bank.name || '',
                step: bank.step || getStoredStep()
            }));
            if (bank.step) setStoredStep(bank.step);
        } catch (_) {}
    }

    function clearSelectedBank() {
        try { localStorage.removeItem(BANK_KEY); } catch (_) {}
    }

    function requireSelectedBank(redirectTo = '/usmle') {
        const bank = getSelectedBank();
        if (bank && bank.id) return bank;
        window.location.href = redirectTo;
        return null;
    }

    function bankQuery(bank) {
        const b = bank || getSelectedBank();
        if (!b) return '';
        const name = encodeURIComponent(b.name || '');
        return `testId=${b.id}&name=${name}&step=${encodeURIComponent(b.step || 'step1')}`;
    }

    function navHref(id, bank) {
        const q = bankQuery(bank);
        if (id === 'welcome') return q ? `/usmle-home?${q}` : '/usmle';
        if (id === 'create') return q ? `/usmle-test-builder?${q}` : '/usmle';
        if (id === 'history') return q ? `/usmle-history?${q}` : '/usmle';
        if (id === 'flashcards') return q ? `/usmle-flashcards?${q}` : '/usmle-flashcards';
        if (id === 'banks') return '/usmle';
        if (id === 'help') return 'https://t.me/stud_kg';
        if (id === 'settings') return '/profile';
        return '#';
    }

    function buildNav(bank) {
        return [
            { id: 'banks', href: '/usmle', icon: ICONS.banks, label: 'Сменить банк' },
            { id: 'welcome', href: navHref('welcome', bank), icon: ICONS.welcome, label: 'Добро пожаловать' },
            { id: 'create', href: navHref('create', bank), icon: ICONS.create, label: 'Создать тест' },
            { id: 'history', href: navHref('history', bank), icon: ICONS.history, label: 'История тестов' },
            { id: 'performance', href: '#', icon: ICONS.performance, label: 'Производительность', soon: true },
            { id: 'library', href: '#', icon: ICONS.library, label: 'Мед. библиотека', soon: true },
            { id: 'search', href: '#', icon: ICONS.search, label: 'Поиск', soon: true },
            { id: 'notes', href: '#', icon: ICONS.notes, label: 'Заметки', soon: true },
            { id: 'flashcards', href: navHref('flashcards', bank), icon: ICONS.flashcards, label: 'Карточки' },
            { id: 'notebook', href: '#', icon: ICONS.notebook, label: 'Мой блокнот', soon: true },
            { id: 'help', href: 'https://t.me/stud_kg', icon: ICONS.help, label: 'Telegram', external: true },
            { id: 'settings', href: '/profile', icon: ICONS.settings, label: 'Настройки' }
        ];
    }

    function hasActiveUsmleSubscription() {
        const user = window.currentUser;
        if (!user) return false;
        if (user.isAdminAccount === true || user.usmleSubscriptionActive === true) return true;
        if (!user.usmleSubscriptionEndDate) return false;
        return new Date(user.usmleSubscriptionEndDate) > new Date();
    }

    /**
     * Весь раздел USMLE — только с активной подпиской USMLE.
     * Возвращает true если доступ есть.
     */
    function requireUsmleAccess(options = {}) {
        const { redirectTo = '/subscriptions?program=usmle' } = options;
        const token = localStorage.getItem('token');
        if (!token || !window.currentUser) {
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
            return false;
        }
        if (!hasActiveUsmleSubscription()) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('Раздел USMLE доступен только с активной подпиской USMLE', 'error');
            }
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }

    function setThemeButton(btn, theme) {
        if (!btn) return;
        btn.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
    }

    function renderShell(options = {}) {
        const bank = options.bank || getSelectedBank();
        const {
            activeNav = 'welcome',
            pageTitle = 'USMLE',
            step = (bank && bank.step) || getStoredStep()
        } = options;

        const user = window.currentUser;
        const userName = user?.username || user?.name || 'Гость';
        const subLabel = (user && (user.isAdminAccount || hasActiveUsmleSubscription()))
            ? (user.isAdminAccount ? 'Админ · полный доступ' : 'Подписка USMLE активна')
            : (user ? 'Нет подписки USMLE' : 'Войдите в аккаунт');

        const bankLabel = bank?.name
            ? `${STEP_LABELS[step] || step} · ${bank.name}`
            : (STEP_LABELS[step] || step);

        const navHtml = buildNav(bank).map((item) => {
            const active = item.id === activeNav ? ' active' : '';
            const disabled = item.soon ? ' disabled' : '';
            const badge = item.soon ? '<span class="usmle-nav-badge">скоро</span>' : '';
            return `<a href="${item.href}" class="usmle-nav-link${active}${disabled}" data-nav="${item.id}"${item.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>
                <span class="usmle-nav-icon">${item.icon}</span>
                <span>${item.label}</span>${badge}
            </a>`;
        }).join('');

        return `
        <div class="usmle-app" id="usmleAppRoot">
            <button type="button" class="usmle-sidebar-backdrop" id="usmleSidebarBackdrop" aria-label="Закрыть меню"></button>
            <aside class="usmle-sidebar" id="usmleSidebar">
                <div class="usmle-sidebar-brand">
                    <div class="usmle-sidebar-logo">${ICONS.logo}</div>
                    <h2>stud.kg</h2>
                    <div class="usmle-sidebar-step">${escHtml(bankLabel)}</div>
                </div>
                <nav class="usmle-nav" aria-label="USMLE">${navHtml}</nav>
                <div class="usmle-sidebar-user">
                    <strong>${escHtml(userName)}</strong>
                    <span>${escHtml(subLabel)}</span>
                </div>
            </aside>
            <div class="usmle-main">
                <header class="usmle-topbar">
                    <div class="usmle-topbar-left">
                        <button type="button" class="usmle-topbar-toggle" id="usmleSidebarToggle" aria-label="Меню">${ICONS.menu}</button>
                        <h1>${escHtml(pageTitle)}</h1>
                    </div>
                    <div class="usmle-topbar-actions">
                        <button type="button" class="theme-toggle usmle-icon-btn" id="usmleThemeToggle" aria-label="Тема">${ICONS.moon}</button>
                        <a href="/usmle" class="btn btn-secondary btn-sm">Банки</a>
                        <a href="/" class="btn btn-secondary btn-sm btn-hide-sm">На сайт</a>
                    </div>
                </header>
                <div class="usmle-content" id="usmlePageContent"></div>
            </div>
        </div>`;
    }

    function setSidebarOpen(open) {
        const sidebar = document.getElementById('usmleSidebar');
        const backdrop = document.getElementById('usmleSidebarBackdrop');
        if (!sidebar) return;
        sidebar.classList.toggle('open', open);
        if (backdrop) backdrop.classList.toggle('show', open);
        document.body.classList.toggle('usmle-nav-open', open);
    }

    function bindShellEvents() {
        const toggle = document.getElementById('usmleSidebarToggle');
        const sidebar = document.getElementById('usmleSidebar');
        const backdrop = document.getElementById('usmleSidebarBackdrop');
        if (toggle && sidebar) {
            toggle.addEventListener('click', () => {
                setSidebarOpen(!sidebar.classList.contains('open'));
            });
        }
        if (backdrop) {
            backdrop.addEventListener('click', () => setSidebarOpen(false));
        }
        if (sidebar) {
            sidebar.querySelectorAll('a.usmle-nav-link:not(.disabled)').forEach((link) => {
                link.addEventListener('click', () => setSidebarOpen(false));
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setSidebarOpen(false);
        });
        const themeBtn = document.getElementById('usmleThemeToggle');
        if (themeBtn && typeof window.initTheme === 'function') {
            const cur = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light';
            setThemeButton(themeBtn, cur);
            themeBtn.addEventListener('click', () => {
                const html = document.documentElement;
                const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                html.setAttribute('data-theme', next);
                localStorage.setItem('theme', next);
                setThemeButton(themeBtn, next);
            });
        }
    }

    function syncBankFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const testId = parseInt(params.get('testId'), 10);
        if (!Number.isFinite(testId) || testId <= 0) return getSelectedBank();
        let name = params.get('name') || '';
        try { name = decodeURIComponent(name); } catch (_) {}
        const step = params.get('step') || getStoredStep();
        const bank = { id: testId, name, step };
        setSelectedBank(bank);
        return bank;
    }

    function mountUsmlePage(options, renderContent) {
        if (!requireUsmleAccess()) return null;
        const bank = options.bank || syncBankFromUrl() || getSelectedBank();
        if (!bank || !bank.id) {
            window.location.href = '/usmle';
            return null;
        }
        setSelectedBank(bank);
        const mount = document.getElementById('usmleAppMount');
        if (!mount) return bank;
        mount.innerHTML = renderShell({ ...options, bank });
        const content = document.getElementById('usmlePageContent');
        if (content && typeof renderContent === 'function') {
            renderContent(content, bank);
        }
        bindShellEvents();
        return bank;
    }

    function donutHtml(pct, label) {
        const p = Math.max(0, Math.min(100, Number(pct) || 0));
        return `<div class="usmle-donut-wrap">
            <div class="usmle-donut" style="--pct: ${p * 3.6}deg"><span>${p.toFixed(1)}%</span></div>
            <div><strong>${escHtml(label)}</strong></div>
        </div>`;
    }

    function statRows(rows) {
        return `<div class="usmle-stat-rows">${rows.map(([k, v]) =>
            `<div class="usmle-stat-row"><span>${escHtml(k)}</span><strong>${escHtml(String(v))}</strong></div>`
        ).join('')}</div>`;
    }

    window.UsmleApp = {
        mountUsmlePage,
        renderShell,
        bindShellEvents,
        getStoredStep,
        setStoredStep,
        getSelectedBank,
        setSelectedBank,
        clearSelectedBank,
        requireSelectedBank,
        requireUsmleAccess,
        hasActiveUsmleSubscription,
        syncBankFromUrl,
        bankQuery,
        STEP_LABELS,
        ICONS,
        escHtml,
        donutHtml,
        statRows
    };
})();
