// Полностью отключаем app.js на странице админки
if (window.location.pathname.includes('/admin') || document.getElementById('adminLoginForm')) {
    console.log('app.js: Страница админки обнаружена, скрипт отключен');
    // Не выполняем никакой код на странице админки
} else {
    // API базовый URL
    const API_URL = '/api';

    // Состояние приложения
    let currentUser = null;
    let currentToken = null;
    let currentTest = null;
    let currentQuestions = [];
    let currentAnswers = {};
    let currentQuestionIndex = 0;
    let testTimer = null;
    let testStartTime = null;

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
        if (themeToggle) {
            const icon = themeToggle.querySelector('.theme-icon');
            if (icon) {
                icon.textContent = theme === 'dark' ? '☀️' : '🌙';
            } else {
                // Если нет .theme-icon, обновляем текст кнопки
                themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
            }
        }
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
                updateUI();
                console.log('Пользователь загружен:', currentUser);
                return true; // Успешная загрузка
            } else {
                // Токен невалидный
                if (response.status === 401) {
                    currentUser = null;
                    currentToken = null;
                    localStorage.removeItem('token');
                }
                return false;
            }
        } catch (error) {
            console.error('Ошибка загрузки пользователя:', error);
            currentUser = null;
            return false;
        }
    }

    function updateUI() {
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const profileLink = document.getElementById('profileLink');
        const favoritesLink = document.getElementById('favoritesLink');

        if (currentUser) {
            if (loginBtn) loginBtn.style.display = 'none';
            if (registerBtn) registerBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'block';
            if (profileLink) profileLink.style.display = 'block';
            if (favoritesLink) favoritesLink.style.display = 'block';
        } else {
            if (loginBtn) loginBtn.style.display = 'block';
            if (registerBtn) registerBtn.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (profileLink) profileLink.style.display = 'none';
            if (favoritesLink) favoritesLink.style.display = 'none';
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
                const questionsCount = params.get('questions');
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
                    timerGroup.style.display = e.target.checked ? 'block' : 'none';
                }
            });
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
                        if (!currentUser) {
                            e.preventDefault();
                            showRegisterModal();
                        } else {
                            loadSubjects();
                        }
                    }
                }
            });
        });

        // Обратная связь
        document.getElementById('contactForm')?.addEventListener('submit', handleContact);

        // Мобильное меню - инициализируем только один раз
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        const navMenu = document.getElementById('navMenu');

        if (mobileMenuToggle && navMenu) {
            // Проверяем, не инициализировано ли уже меню
            if (mobileMenuToggle.dataset.initialized === 'true') {
                return;
            }

            // Помечаем как инициализированное
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
                el.href = (data.privacyPolicyUrl && data.privacyPolicyUrl.trim()) ? data.privacyPolicyUrl.trim() : '/contact';
            });
            document.querySelectorAll('[data-doc="offer"]').forEach(el => {
                el.href = (data.publicOfferUrl && data.publicOfferUrl.trim()) ? data.publicOfferUrl.trim() : '/contact';
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

            const result = await response.json();

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
            showNotification('Ошибка соединения', 'error');
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

            const result = await response.json();

            if (response.ok) {
                currentToken = result.token;
                currentUser = result.user;
                localStorage.setItem('token', currentToken);
                showNotification('Вход выполнен успешно!', 'success');
                window.location.href = '/';
            } else {
                showNotification(result.error || 'Ошибка входа', 'error');
            }
        } catch (error) {
            console.error('Ошибка входа:', error);
            showNotification('Ошибка соединения', 'error');
        }
    }

    function logout() {
        currentUser = null;
        currentToken = null;
        localStorage.removeItem('token');
        showNotification('Вы вышли из системы', 'success');
        window.location.href = '/';
    }

    // Предметы и тесты
    let allSubjects = []; // Храним все предметы для фильтрации

    async function loadSubjects() {
        // Для неавторизованных пользователей показываем предметы с бесплатными тестами
        try {
            const container = document.getElementById('subjectsList');
            if (!container) return;

            const response = await fetch(`${API_URL}/tests/subjects`);
            allSubjects = await response.json();

            // Проверяем количество избранных вопросов (только для авторизованных)
            let favoritesCount = 0;
            if (currentUser) {
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
                <div class="subject-card card-animate" style="animation-delay: ${delay}s;" onclick="window.location.href='/subject-tests?id=${subject.id}&name=${name}&desc=${desc}'">
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

    async function loadSubjectTests(subjectId, subjectName, subjectDescription = '') {
        currentSubjectId = subjectId;
        currentSubjectName = subjectName;
        currentSubjectDescription = subjectDescription;

        try {
            // Если пользователь не авторизован или нет активной подписки, загружаем только бесплатные тесты
            let url = `${API_URL}/tests/subjects/${subjectId}/tests`;
            
            const hasSubscription = currentUser && currentUser.subscriptionEndDate && new Date(currentUser.subscriptionEndDate) > new Date();
            
            if (!currentUser || !hasSubscription) {
                url = `${API_URL}/tests/subjects/${subjectId}/tests/free`;
            }

            const response = await fetch(url);
            const tests = await response.json();

            const subjectNameEl = document.getElementById('subjectName');
            if (subjectNameEl) {
                subjectNameEl.textContent = subjectName;
            }

            const descEl = document.getElementById('subjectDescription');
            if (descEl) {
                if (!currentUser) {
                    descEl.textContent = 'Бесплатные тесты доступны без регистрации. Войдите или зарегистрируйтесь для полного доступа.';
                } else if (!hasSubscription) {
                     descEl.textContent = 'У вас нет активной подписки. Вам доступны только бесплатные тесты. Оформите подписку для доступа ко всем материалам.';
                } else {
                    descEl.textContent = subjectDescription || `Выберите тест для прохождения. Каждый тест можно настроить под свои потребности.`;
                }
            }

            const container = document.getElementById('testsList');
            if (container) {
                if (tests.length === 0) {
                    if (!currentUser) {
                        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 3rem;">Бесплатные тесты по данному предмету пока не добавлены. <a href="/register" style="color: var(--primary-color);">Зарегистрируйтесь</a> и оформите подписку для доступа ко всем тестам.</p>';
                    } else if (!hasSubscription) {
                        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 3rem;">Бесплатные тесты по данному предмету пока не добавлены. <a href="/profile" style="color: var(--primary-color);">Оформите подписку</a> для доступа к платным тестам.</p>';
                    } else {
                        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 3rem;">Тесты по данному предмету пока не добавлены</p>';
                    }
                } else {
                    container.innerHTML = tests.map((test, index) => {
                        const testName = encodeURIComponent(test.name);
                        const isFree = test.isFree || false;
                        return `
                    <div class="test-card card-animate" style="animation-delay: ${index * 0.1}s;" onclick="window.location.href='/test-settings?id=${test.id}&name=${testName}&questions=${test.Questions?.length || 0}'">
                        <h3>${test.name} ${isFree ? '<span style="background: #10b981; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">БЕСПЛАТНО</span>' : ''}</h3>
                        <p><strong>Вопросов:</strong> ${test.Questions?.length || 0}</p>
                        ${test.description ? `<p style="margin-top: 0.5rem; font-size: 0.9rem;">${test.description}</p>` : ''}
                    </div>
                `;
                    }).join('');
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки тестов:', error);
            showNotification('Ошибка загрузки тестов', 'error');
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
            
            // Проверяем подписку
            const hasSubscription = currentUser && currentUser.subscriptionEndDate && new Date(currentUser.subscriptionEndDate) > new Date();
            
            // Если нет подписки, запрашиваем только бесплатные
            if (!currentUser || !hasSubscription) {
                url += '?free=true';
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch tests');
            
            const tests = await response.json();

            if (tests.length > 0) {
            console.log('Displaying', tests.length, 'tests on homepage');
                container.innerHTML = tests.map((test, index) => {
                    const testName = encodeURIComponent(test.name);
                    const isFree = test.isFree || false;
                    return `
                    <div class="test-card card-animate" style="animation-delay: ${index * 0.1}s;" onclick="window.location.href='/test-settings?id=${test.id}&name=${testName}&questions=${test.Questions?.length || 0}'">
                        <h3>${test.name} ${isFree ? '<span style="background: #10b981; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">БЕСПЛАТНО</span>' : ''}</h3>
                        <p><strong>Вопросов:</strong> ${test.Questions?.length || 0}</p>
                        ${test.description ? `<p style="margin-top: 0.5rem; font-size: 0.9rem;">${test.description}</p>` : ''}
                    </div>
                `;
                }).join('');
                section.style.display = 'block';
            } else {
                section.style.display = 'none';
            }
        } catch (error) {
            console.error('Ошибка загрузки тестов на главной:', error);
            section.style.display = 'none';
        }
    }

    let currentTestId = null;
    let currentTestQuestionCount = 0;

    async function loadTestSettings(testId, testName, questionCount = 0) {
        currentTestId = testId;
        currentTestQuestionCount = questionCount;
        const testNameEl = document.getElementById('testName');
        if (testNameEl) {
            testNameEl.textContent = testName;
        }

        // Устанавливаем максимальное количество вопросов
        const questionCountInput = document.getElementById('questionCount');
        if (questionCountInput && questionCount > 0) {
            questionCountInput.max = questionCount;
            questionCountInput.value = Math.min(10, questionCount);
        }
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

        // Если тест не бесплатный, требуется авторизация
        if (!isFreeTest && !currentUser) {
            showNotification('Для этого теста необходима регистрация и подписка', 'error');
            return;
        }

        const questionCount = parseInt(document.getElementById('questionCount').value) || 10;
        const randomizeAnswers = document.getElementById('randomizeAnswers').checked;
        const useTimer = document.getElementById('useTimer').checked;
        const timerMinutes = parseInt(document.getElementById('timerMinutes').value) || 30;

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
                body: JSON.stringify({ questionCount, randomizeAnswers })
            });

            if (!response.ok) {
                throw new Error('Ошибка загрузки вопросов');
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
            testStartTime = Date.now();

            // Сохраняем данные теста в sessionStorage для загрузки на странице теста
            sessionStorage.setItem('testData', JSON.stringify({
                testId: currentTestId,
                questions: currentQuestions,
                answers: currentAnswers,
                questionIndex: currentQuestionIndex,
                startTime: testStartTime,
                timer: useTimer ? timerMinutes * 60 : null
            }));

            // Переходим на страницу теста
            window.location.href = '/test';
        } catch (error) {
            console.error('Ошибка начала теста:', error);
            showNotification('Ошибка загрузки теста', 'error');
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
        const progress = ((currentQuestionIndex + 1) / currentQuestions.length) * 100;

        const progressFillEl = document.getElementById('progressFill');
        const progressTextEl = document.getElementById('progressText');
        const content = document.getElementById('testContent');

        if (!progressFillEl || !progressTextEl || !content) {
            console.error('Элементы теста не найдены на странице');
            showNotification('Ошибка: элементы теста не найдены', 'error');
            return;
        }

        progressFillEl.style.width = `${progress}%`;
        progressTextEl.textContent =
            `Вопрос ${currentQuestionIndex + 1} из ${currentQuestions.length}`;

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

        content.innerHTML = `
        <div class="question-item">
            <h3>${question.text.replace(/\n/g, '<br>')}</h3>
            <div class="answers-list">
                ${question.Answers.map(answer => `
                    <div class="answer-item" data-answer-id="${answer.id}" onclick="selectAnswer(${answer.id})">
                        ${answer.text}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

        // Проверяем, в избранном ли вопрос
        if (currentUser) {
            checkFavoriteStatus(question.id);
        }

        // Выделяем выбранный ответ
        const selectedAnswerId = currentAnswers[question.id];
        if (selectedAnswerId) {
            document.querySelector(`[data-answer-id="${selectedAnswerId}"]`)?.classList.add('selected');
        }

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
            finishBtn.style.display = currentQuestionIndex === currentQuestions.length - 1 ? 'block' : 'none';
        }
    }

    function selectAnswer(answerId) {
        const question = currentQuestions[currentQuestionIndex];
        currentAnswers[question.id] = answerId;

        // Обновляем визуальное выделение
        document.querySelectorAll('.answer-item').forEach(item => {
            item.classList.remove('selected');
        });
        document.querySelector(`[data-answer-id="${answerId}"]`)?.classList.add('selected');
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

        const timeSpent = Math.floor((Date.now() - testStartTime) / 1000);

        try {
            let result;

            // КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ
            console.error('=== FINISH TEST START ===');
            console.error('currentTestId:', currentTestId);
            console.error('currentTestId type:', typeof currentTestId);
            console.error('currentTestId defined:', currentTestId !== null && currentTestId !== undefined);
            console.error('hasUser:', !!currentUser);
            console.error('currentQuestions.length:', currentQuestions.length);
            console.error('currentAnswers:', Object.keys(currentAnswers).length);

            // Пробуем использовать window.currentTestId если currentTestId не установлен
            if (!currentTestId && window.currentTestId) {
                console.error('⚠️ currentTestId is null, using window.currentTestId:', window.currentTestId);
                currentTestId = window.currentTestId;
            }

            // Если это тест из избранного, проверяем локально
            if (!currentTestId) {
                console.error('⚠️ currentTestId is null/undefined - using local check');
                result = checkFavoriteTestAnswers();
            } else {
                console.error('✅ currentTestId exists - sending request to server');
                const questionIds = currentQuestions.map(q => q.id);
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
            let fullQuestions = currentQuestions;
            console.log('🔍 Начало finishTest:', {
                currentTestId,
                hasUser: !!currentUser,
                currentQuestionsCount: currentQuestions.length,
                firstQuestionHasAnswers: currentQuestions[0]?.Answers?.length || 0,
                firstQuestionId: currentQuestions[0]?.id
            });

            if (currentTestId && currentUser) {
                try {
                    console.log('📥 Загрузка полного теста с сервера...', { testId: currentTestId, API_URL });
                    const fullTestResponse = await fetch(`${API_URL}/tests/tests/${currentTestId}`, {
                        headers: {
                            'Authorization': `Bearer ${currentToken}`
                        }
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
                        fullQuestions = currentQuestions.map(q => {
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
                questions: questionsToSave, // Сохраняем вопросы с нормализованными правильными ответами
                answers: currentAnswers,
                timeSpent,
                testId: currentTestId || window.currentTestId || null // Сохраняем testId для разбора (пробуем разные источники)
            }));

            // Переходим на страницу результатов
            window.location.href = '/test-result';
        } catch (error) {
            console.error('Ошибка завершения теста:', error);
            showNotification('Ошибка завершения теста', 'error');
        }
    }

    function checkFavoriteTestAnswers() {
        let correctCount = 0;
        const results = {};

        currentQuestions.forEach(question => {
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
            total: currentQuestions.length,
            percentage: Math.round((correctCount / currentQuestions.length) * 100),
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
                    isCorrect: a.isCorrect // Сохраняем для проверки
                }))
            }));

            currentAnswers = {};
            currentQuestionIndex = 0;
            testStartTime = Date.now();
            currentTestId = null; // Специальный тест из избранного

            // Сохраняем данные теста в sessionStorage для загрузки на странице теста
            sessionStorage.setItem('testData', JSON.stringify({
                testId: null, // Специальный тест из избранного
                questions: currentQuestions,
                answers: currentAnswers,
                questionIndex: currentQuestionIndex,
                startTime: testStartTime,
                timer: null
            }));

            // Переходим на страницу теста
            window.location.href = '/test';
        } catch (error) {
            console.error('Ошибка начала теста из избранного:', error);
            showNotification('Ошибка загрузки теста', 'error');
        }
    }

    // Профиль
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
                                    📊 Разбор
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
                        <div style="font-size: 4rem; margin-bottom: 1rem;">📊</div>
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

    // Модальное окно регистрации
    function showRegisterModal() {
        const modal = document.getElementById('registerModal');
        if (modal) {
            modal.style.display = 'block';

            // Закрытие по клику на фон
            modal.addEventListener('click', function (e) {
                if (e.target === modal) {
                    closeRegisterModal();
                }
            });

            // Закрытие по клику на крестик
            const closeBtn = document.getElementById('registerModalClose');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeRegisterModal);
            }
        }
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

    // Продление подписки
    function renewSubscription() {
        const modal = document.getElementById('renewalModal');
        if (modal) {
            modal.style.display = 'block';

            const coinsBalanceEl = document.getElementById('renewalCoinsBalance');
            const coinsToUseInput = document.getElementById('renewalCoinsToUse');
            const userCoins = (currentUser && (currentUser.coins !== undefined)) ? currentUser.coins : 0;
            if (coinsBalanceEl) coinsBalanceEl.textContent = userCoins;
            if (coinsToUseInput) {
                coinsToUseInput.max = Math.min(selectedPlan.price, userCoins);
                coinsToUseInput.value = Math.min(parseInt(coinsToUseInput.value, 10) || 0, selectedPlan.price, userCoins);
                coinsToUseInput.addEventListener('input', updateRenewalTotal);
            }
            updateRenewalTotal();

            const closeBtn = document.getElementById('renewalModalClose');
            if (closeBtn) {
                closeBtn.onclick = () => modal.style.display = 'none';
            }

            window.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };
        }
    }

    let selectedPlan = { months: 1, price: 150 };

    function updateRenewalTotal() {
        const coinsToUseInput = document.getElementById('renewalCoinsToUse');
        const totalEl = document.getElementById('totalPrice');
        if (!totalEl) return;
        const coinsToUse = Math.min(
            parseInt(coinsToUseInput?.value, 10) || 0,
            selectedPlan.price,
            (currentUser && (currentUser.coins !== undefined)) ? currentUser.coins : 0
        );
        const toPay = Math.max(0, selectedPlan.price - coinsToUse);
        totalEl.textContent = toPay + ' сом';
    }

    function selectPlan(card) {
        document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        selectedPlan = {
            months: parseInt(card.dataset.months),
            price: parseInt(card.dataset.price)
        };

        const coinsToUseInput = document.getElementById('renewalCoinsToUse');
        const userCoins = (currentUser && (currentUser.coins !== undefined)) ? currentUser.coins : 0;
        if (coinsToUseInput) {
            coinsToUseInput.max = Math.min(selectedPlan.price, userCoins);
            coinsToUseInput.value = Math.min(parseInt(coinsToUseInput.value, 10) || 0, selectedPlan.price, userCoins);
        }
        updateRenewalTotal();
    }

    async function proceedToPayment() {
        const paymentType = 'subscription';
        // Формируем описание: "Продление подписки: 1 месяц"
        const description = `Продление подписки: ${selectedPlan.months} ${getMonthDeclension(selectedPlan.months)}`;
        const subscriptionType = selectedPlan.months.toString();

        // Показываем индикатор загрузки
        const payBtn = document.querySelector('#renewalModal .btn-primary');
        const originalText = payBtn.textContent;
        payBtn.disabled = true;
        payBtn.textContent = 'Создание платежа...';

        try {
            // Получаем токен из localStorage
            const token = localStorage.getItem('token');
            const headers = {
                'Content-Type': 'application/json'
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            } else {
                // Если токена нет, пробуем глобальную переменную или перенаправляем на логин
                if (typeof currentToken !== 'undefined' && currentToken) {
                    headers['Authorization'] = `Bearer ${currentToken}`;
                } else {
                    console.error('No auth token found');
                    showNotification('Ошибка авторизации. Пожалуйста, войдите в систему.', 'error');
                    setTimeout(() => window.location.href = '/login', 2000);
                    return;
                }
            }

            const coinsToUseInput = document.getElementById('renewalCoinsToUse');
            const coinsToUse = Math.min(
                parseInt(coinsToUseInput?.value, 10) || 0,
                selectedPlan.price,
                (currentUser && (currentUser.coins !== undefined)) ? currentUser.coins : 0
            );

            const response = await fetch('/api/payments/create', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    amount: selectedPlan.price,
                    description: description,
                    paymentType: paymentType,
                    subscriptionType: subscriptionType,
                    coinsToUse: coinsToUse
                })
            });

            const data = await response.json();

            if (response.ok && data.success && data.paymentUrl) {
                // Успешно, перенаправляем на страницу оплаты Finik
                window.location.href = data.paymentUrl;
            } else {
                console.error('Payment creation failed:', data);
                showNotification(data.error || data.message || 'Ошибка создания платежа', 'error');
                payBtn.disabled = false;
                payBtn.textContent = originalText;
            }
        } catch (error) {
            console.error('Error proceeding to payment:', error);
            showNotification('Ошибка соединения с сервером', 'error');
            payBtn.disabled = false;
            payBtn.textContent = originalText;
        }
    }

    function getMonthDeclension(months) {
        if (months === 1) return 'месяц';
        if (months >= 2 && months <= 4) return 'месяца';
        return 'месяцев';
    }

    // Глобальные функции для onclick
    window.selectPlan = selectPlan;
    window.proceedToPayment = proceedToPayment;
    // Экспорт функций для использования в HTML
    window.loadUser = loadUser;
    window.fetchUser = fetchUser;
    window.initTheme = initTheme;
    window.setupEventListeners = setupEventListeners;
    window.loadSubjectTests = loadSubjectTests;
    window.loadTestSettings = loadTestSettings;
    window.loadSubjects = loadSubjects;
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

    // Экспорт переменных состояния для доступа из inline скриптов
    Object.defineProperty(window, 'currentUser', {
        get: () => currentUser,
        set: (value) => { currentUser = value; },
        configurable: true
    });

    // Разбор теста
    async function showTestAnalysis(resultId) {
        const modal = document.getElementById('testAnalysisModal');
        const content = document.getElementById('testAnalysisContent');
        const title = document.getElementById('testAnalysisTitle');

        if (!modal || !content) {
            showNotification('Модальное окно не найдено', 'error');
            return;
        }

        // Показываем модальное окно
        modal.style.display = 'block';
        content.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="spinner" style="border: 4px solid var(--bg-secondary); border-top: 4px solid var(--primary-color); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
            <p style="margin-top: 1rem; color: var(--text-secondary);">Загрузка разбора...</p>
        </div>
    `;

        try {
            const response = await fetch(`${API_URL}/stats/test-result/${resultId}`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Ошибка загрузки разбора');
            }

            const data = await response.json();
            const result = data.result;

            if (!result.questions || !result.results) {
                content.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <p style="color: var(--text-secondary);">Детальная информация о тесте недоступна. Эта функция доступна только для тестов, пройденных после обновления системы.</p>
                </div>
            `;
                return;
            }

            const testName = result.Test?.name || 'Неизвестный тест';
            const subjectName = result.Test?.Subject?.name || '';
            const percentage = Math.round((result.score / result.totalQuestions) * 100);
            const date = new Date(result.createdAt);
            const timeSpentMinutes = result.timeSpent ? Math.floor(result.timeSpent / 60) : 0;
            const timeSpentSeconds = result.timeSpent ? result.timeSpent % 60 : 0;

            title.textContent = `Разбор: ${testName}`;

            // Подсчитываем статистику
            const correctCount = result.score;
            const incorrectCount = result.totalQuestions - result.score;
            const correctPercentage = percentage;

            content.innerHTML = `
            <div style="margin-bottom: 2rem; padding: 1.5rem; background: linear-gradient(135deg, var(--card-bg) 0%, var(--bg-secondary) 100%); border-radius: var(--radius-lg); border: 1px solid var(--border-light);">
                <h3 style="margin-bottom: 1rem; color: var(--text-color);">Общая информация</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                    <div>
                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">Тест</p>
                        <p style="font-weight: 600; color: var(--text-color);">${testName}</p>
                    </div>
                    ${subjectName ? `
                        <div>
                            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">Предмет</p>
                            <p style="font-weight: 600; color: var(--text-color);">${subjectName}</p>
                        </div>
                    ` : ''}
                    <div>
                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">Дата прохождения</p>
                        <p style="font-weight: 600; color: var(--text-color);">${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    ${result.timeSpent ? `
                        <div>
                            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">Время</p>
                            <p style="font-weight: 600; color: var(--text-color);">${timeSpentMinutes}:${timeSpentSeconds.toString().padStart(2, '0')}</p>
                        </div>
                    ` : ''}
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-light);">
                    <div style="text-align: center;">
                        <p style="font-size: 2rem; font-weight: 700; color: var(--primary-color); line-height: 1;">${result.score}/${result.totalQuestions}</p>
                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Правильных ответов</p>
                    </div>
                    <div style="text-align: center;">
                        <p style="font-size: 2rem; font-weight: 700; color: ${correctPercentage >= 80 ? 'var(--success-color)' : correctPercentage >= 60 ? 'var(--primary-color)' : 'var(--danger-color)'}; line-height: 1;">${correctPercentage}%</p>
                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Точность</p>
                    </div>
                    <div style="text-align: center;">
                        <p style="font-size: 2rem; font-weight: 700; color: var(--success-color); line-height: 1;">${correctCount}</p>
                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Правильно</p>
                    </div>
                    <div style="text-align: center;">
                        <p style="font-size: 2rem; font-weight: 700; color: var(--danger-color); line-height: 1;">${incorrectCount}</p>
                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Ошибок</p>
                    </div>
                </div>
            </div>
            
            <h3 style="margin-bottom: 1rem; color: var(--text-color);">Детальный разбор по вопросам</h3>
            ${result.questions.map((question, index) => {
                const questionResult = result.results[question.id];
                if (!questionResult) return '';

                const userAnswerId = result.answers[question.id];
                const userAnswer = question.Answers?.find(a => a.id === parseInt(userAnswerId));
                // Ищем правильный ответ: сначала по correctAnswerId из результатов, потом по isCorrect
                let correctAnswer = null;

                if (questionResult.correctAnswerId) {
                    correctAnswer = question.Answers?.find(a => a.id === questionResult.correctAnswerId);
                }
                if (!correctAnswer) {
                    // Ищем по isCorrect (проверяем все возможные форматы)
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
                }

                // Если все еще не найден, пробуем найти первый ответ с isCorrect
                if (!correctAnswer && question.Answers) {
                    for (const answer of question.Answers) {
                        let isCorrect = false;
                        if (answer.isCorrect === true) {
                            isCorrect = true;
                        } else if (answer.isCorrect === false || answer.isCorrect === null || answer.isCorrect === undefined) {
                            isCorrect = false;
                        } else if (answer.isCorrect === 1 || answer.isCorrect === '1') {
                            isCorrect = true;
                        } else if (answer.isCorrect === 0 || answer.isCorrect === '0') {
                            isCorrect = false;
                        } else if (typeof answer.isCorrect === 'string') {
                            const str = answer.isCorrect.toLowerCase().trim();
                            isCorrect = str === 'true' || str === 't' || str === '1';
                        } else {
                            isCorrect = Boolean(answer.isCorrect);
                        }
                        if (isCorrect) {
                            correctAnswer = answer;
                            break;
                        }
                    }
                }

                const isCorrect = questionResult.correct;

                return `
                    <div class="test-analysis-item ${isCorrect ? 'correct' : 'incorrect'}">
                        <div style="display: flex; align-items: start; gap: 1rem; margin-bottom: 1rem;">
                            <div style="min-width: 2rem; height: 2rem; border-radius: 50%; background: ${isCorrect ? 'var(--success-color)' : 'var(--danger-color)'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.875rem;">
                                ${index + 1}
                            </div>
                            <div style="flex: 1;">
                                <div class="test-analysis-question">${question.text}</div>
                                <div style="margin-top: 0.75rem;">
                                    <span style="padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.875rem; font-weight: 600; background-color: ${isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(220, 38, 38, 0.1)'}; color: ${isCorrect ? 'var(--success-color)' : 'var(--danger-color)'};">
                                        ${isCorrect ? '✓ Правильно' : '✗ Неправильно'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        ${!isCorrect ? `
                            <div style="margin-top: 1rem;">
                                <div class="test-analysis-label" style="color: var(--danger-color);">Ваш ответ:</div>
                                <div class="test-analysis-answer user-answer">
                                    ${userAnswer?.text || 'Не отвечено'}
                                </div>
                            </div>
                        ` : ''}
                        <div style="margin-top: ${!isCorrect ? '1rem' : '0'};">
                            <div class="test-analysis-label" style="color: var(--success-color);">Правильный ответ:</div>
                            <div class="test-analysis-answer correct-answer">
                                ${correctAnswer?.text || (question.Answers && question.Answers.length > 0 ?
                        '<span style="color: var(--danger-color);">⚠️ Правильный ответ не отмечен в тесте. Проверьте настройки теста в админ-панели.</span>' :
                        'Не найден')}
                            </div>
                        </div>
                        ${!isCorrect && question.Answers && question.Answers.length > 0 ? `
                            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-light);">
                                <div class="test-analysis-label">Все варианты ответов:</div>
                                ${question.Answers.map(answer => `
                                    ${(() => {
                                // Нормализуем isCorrect для отображения
                                let isAnswerCorrect = false;
                                if (answer.isCorrect === true) {
                                    isAnswerCorrect = true;
                                } else if (answer.isCorrect === false || answer.isCorrect === null || answer.isCorrect === undefined) {
                                    isAnswerCorrect = false;
                                } else if (answer.isCorrect === 1 || answer.isCorrect === '1') {
                                    isAnswerCorrect = true;
                                } else if (answer.isCorrect === 0 || answer.isCorrect === '0') {
                                    isAnswerCorrect = false;
                                } else if (typeof answer.isCorrect === 'string') {
                                    const str = answer.isCorrect.toLowerCase().trim();
                                    isAnswerCorrect = str === 'true' || str === 't' || str === '1';
                                } else {
                                    isAnswerCorrect = Boolean(answer.isCorrect);
                                }
                                return `
                                    <div class="test-analysis-answer" style="border: ${isAnswerCorrect ? '2px solid var(--success-color)' : answer.id === parseInt(userAnswerId) ? '2px solid var(--danger-color)' : '1px solid var(--border-light)'}; background: ${isAnswerCorrect ? 'rgba(16, 185, 129, 0.1)' : answer.id === parseInt(userAnswerId) ? 'rgba(220, 38, 38, 0.1)' : 'var(--card-bg)'};">
                                        ${isAnswerCorrect ? '✓ ' : answer.id === parseInt(userAnswerId) ? '✗ ' : ''}${answer.text}
                                    </div>
                                        `;
                            })()}
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
        `;

            // Обработчик закрытия модального окна
            const closeBtn = document.getElementById('testAnalysisModalClose');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    modal.style.display = 'none';
                };
            }

            // Закрытие по клику вне модального окна
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            };

        } catch (error) {
            console.error('Ошибка загрузки разбора:', error);
            content.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <p style="color: var(--danger-color);">Ошибка загрузки разбора теста. Попробуйте позже.</p>
            </div>
        `;
        }
    }

    // Экспорт функции для использования в HTML
    window.showTestAnalysis = showTestAnalysis;

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

    Object.defineProperty(window, 'testStartTime', {
        get: () => testStartTime,
        set: (value) => { testStartTime = value; },
        configurable: true
    });

} // Закрываем блок else для страницы админки

