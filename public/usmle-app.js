(function () {
    const STEP_LABELS = { step1: 'USMLE Step 1', step2: 'USMLE Step 2', step3: 'USMLE Step 3' };
    const BANK_KEY = 'usmleSelectedBank';

    function escHtml(str) {
        return String(str || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

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
        if (id === 'banks') return '/usmle';
        if (id === 'help') return '/contact';
        if (id === 'settings') return '/profile';
        return '#';
    }

    function buildNav(bank) {
        return [
            { id: 'banks', href: '/usmle', icon: '📂', label: 'Сменить банк' },
            { id: 'welcome', href: navHref('welcome', bank), icon: '🏠', label: 'Добро пожаловать' },
            { id: 'create', href: navHref('create', bank), icon: '➕', label: 'Создать тест' },
            { id: 'history', href: navHref('history', bank), icon: '🕐', label: 'История тестов' },
            { id: 'performance', href: '#', icon: '📊', label: 'Производительность', soon: true },
            { id: 'library', href: '#', icon: '📚', label: 'Мед. библиотека', soon: true },
            { id: 'search', href: '#', icon: '🔍', label: 'Поиск', soon: true },
            { id: 'notes', href: '#', icon: '📝', label: 'Заметки', soon: true },
            { id: 'flashcards', href: '#', icon: '⚡', label: 'Карточки', soon: true },
            { id: 'notebook', href: '#', icon: '📒', label: 'Мой блокнот', soon: true },
            { id: 'help', href: '/contact', icon: '❓', label: 'Помощь' },
            { id: 'settings', href: '/profile', icon: '⚙️', label: 'Настройки' }
        ];
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
        const subLabel = user?.usmleSubscriptionActive
            ? 'Подписка USMLE активна'
            : (user ? 'Нет подписки USMLE' : 'Войдите в аккаунт');

        const bankLabel = bank?.name
            ? `${STEP_LABELS[step] || step} · ${bank.name}`
            : (STEP_LABELS[step] || step);

        const navHtml = buildNav(bank).map((item) => {
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
                        <button type="button" class="usmle-topbar-toggle" id="usmleSidebarToggle" aria-label="Меню">☰</button>
                        <h1>${escHtml(pageTitle)}</h1>
                    </div>
                    <div class="usmle-topbar-actions">
                        <button type="button" class="theme-toggle" id="usmleThemeToggle" aria-label="Тема">🌙</button>
                        <a href="/usmle" class="btn btn-secondary btn-sm">Банки</a>
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
        getStoredStep,
        setStoredStep,
        getSelectedBank,
        setSelectedBank,
        clearSelectedBank,
        requireSelectedBank,
        syncBankFromUrl,
        bankQuery,
        STEP_LABELS,
        escHtml,
        donutHtml,
        statRows
    };
})();
