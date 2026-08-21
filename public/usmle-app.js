(function () {
    const STEP_LABELS = { step1: 'USMLE Step 1', step2: 'USMLE Step 2', step3: 'USMLE Step 3' };

    const NAV = [
        { id: 'welcome', href: '/usmle', icon: '🏠', label: 'Добро пожаловать' },
        { id: 'create', href: '/usmle-create', icon: '➕', label: 'Создать тест' },
        { id: 'history', href: '/usmle-history', icon: '🕐', label: 'История тестов' },
        { id: 'performance', href: '/usmle', icon: '📊', label: 'Производительность', soon: true },
        { id: 'library', href: '#', icon: '📚', label: 'Мед. библиотека', soon: true },
        { id: 'search', href: '#', icon: '🔍', label: 'Поиск', soon: true },
        { id: 'notes', href: '#', icon: '📝', label: 'Заметки', soon: true },
        { id: 'flashcards', href: '#', icon: '⚡', label: 'Карточки', soon: true },
        { id: 'notebook', href: '#', icon: '📒', label: 'Мой блокнот', soon: true },
        { id: 'help', href: '/contact', icon: '❓', label: 'Помощь' },
        { id: 'settings', href: '/profile', icon: '⚙️', label: 'Настройки' }
    ];

    function escHtml(str) {
        return String(str || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function getStoredStep() {
        try {
            return localStorage.getItem('usmleActiveStep') || 'step1';
        } catch {
            return 'step1';
        }
    }

    function setStoredStep(step) {
        try { localStorage.setItem('usmleActiveStep', step); } catch (_) {}
    }

    function renderShell(options = {}) {
        const {
            activeNav = 'welcome',
            pageTitle = 'USMLE',
            step = getStoredStep()
        } = options;

        const user = window.currentUser;
        const userName = user?.username || user?.name || 'Гость';
        const subLabel = user?.usmleSubscriptionActive
            ? 'Подписка USMLE активна'
            : (user ? 'Нет подписки USMLE' : 'Войдите в аккаунт');

        const navHtml = NAV.map((item) => {
            const active = item.id === activeNav ? ' active' : '';
            const disabled = item.soon ? ' disabled' : '';
            const badge = item.soon ? '<span class="usmle-nav-badge">скоро</span>' : '';
            return `<a href="${item.href}" class="usmle-nav-link${active}${disabled}" data-nav="${item.id}">
                <span class="usmle-nav-icon">${item.icon}</span>
                <span>${item.label}</span>${badge}
            </a>`;
        }).join('');

        return `
        <div class="usmle-app" id="usmleAppRoot">
            <aside class="usmle-sidebar" id="usmleSidebar">
                <div class="usmle-sidebar-brand">
                    <div class="usmle-sidebar-logo">📘</div>
                    <h2>stud.kg</h2>
                    <div class="usmle-sidebar-step">${STEP_LABELS[step] || step}</div>
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
                        <button type="button" class="usmle-topbar-toggle" id="usmleSidebarToggle" aria-label="Меню">☰</button>
                        <h1>${escHtml(pageTitle)}</h1>
                    </div>
                    <div class="usmle-topbar-actions">
                        <button type="button" class="theme-toggle" id="usmleThemeToggle" aria-label="Тема">🌙</button>
                        <a href="/" class="btn btn-secondary btn-sm">На сайт</a>
                    </div>
                </header>
                <div class="usmle-content" id="usmlePageContent"></div>
            </div>
        </div>`;
    }

    function bindShellEvents() {
        const toggle = document.getElementById('usmleSidebarToggle');
        const sidebar = document.getElementById('usmleSidebar');
        if (toggle && sidebar) {
            toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
        }
        const themeBtn = document.getElementById('usmleThemeToggle');
        if (themeBtn && typeof window.initTheme === 'function') {
            themeBtn.addEventListener('click', () => {
                const html = document.documentElement;
                const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                html.setAttribute('data-theme', next);
                localStorage.setItem('theme', next);
                themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
            });
            const cur = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light';
            themeBtn.textContent = cur === 'dark' ? '☀️' : '🌙';
        }
    }

    function mountUsmlePage(options, renderContent) {
        const mount = document.getElementById('usmleAppMount');
        if (!mount) return;
        mount.innerHTML = renderShell(options);
        const content = document.getElementById('usmlePageContent');
        if (content && typeof renderContent === 'function') {
            renderContent(content);
        }
        bindShellEvents();
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
        getStoredStep,
        setStoredStep,
        STEP_LABELS,
        escHtml,
        donutHtml,
        statRows,
        NAV
    };
})();
