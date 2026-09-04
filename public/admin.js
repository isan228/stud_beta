// API базовый URL
const ADMIN_API_URL = '/api/admin';

// Состояние админки
let currentAdmin = null;
let currentAdminToken = null;
let currentChatUserId = null;
let adminChatUsers = [];
let adminChatsPollInterval = null;
let adminChatMessagesPollInterval = null;
const TEST_ERROR_PREFIX = 'Отчет об ошибке в вопросе теста';
const ADMIN_LIST_CACHE_MS = 60000;
const adminListCache = {
    subjectsCompact: { data: null, at: 0 },
    testsCompact: { data: null, at: 0 }
};
let analyticsPeriod = '30d';
let analyticsView = 'all';
let analyticsDataCache = null;

function invalidateAdminListCache() {
    adminListCache.subjectsCompact = { data: null, at: 0 };
    adminListCache.testsCompact = { data: null, at: 0 };
}

function adminAuthHeaders() {
    return { 'Authorization': `Bearer ${currentAdminToken}` };
}

async function fetchAdminSubjectsCompact(force = false) {
    const now = Date.now();
    if (!force && adminListCache.subjectsCompact.data && now - adminListCache.subjectsCompact.at < ADMIN_LIST_CACHE_MS) {
        return adminListCache.subjectsCompact.data;
    }
    const response = await fetch(`${ADMIN_API_URL}/subjects?compact=1`, { headers: adminAuthHeaders() });
    if (!response.ok) {
        throw new Error('Ошибка загрузки предметов');
    }
    const data = await response.json();
    adminListCache.subjectsCompact = { data, at: now };
    return data;
}

async function fetchAdminTestsCompact(force = false) {
    const now = Date.now();
    if (!force && adminListCache.testsCompact.data && now - adminListCache.testsCompact.at < ADMIN_LIST_CACHE_MS) {
        return adminListCache.testsCompact.data;
    }
    const response = await fetch(`${ADMIN_API_URL}/tests?compact=1`, { headers: adminAuthHeaders() });
    if (!response.ok) {
        throw new Error('Ошибка загрузки тестов');
    }
    const data = await response.json();
    adminListCache.testsCompact = { data, at: now };
    return data;
}

// Функция уведомлений (если не определена в app.js)
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
    }
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

function isTestErrorMessage(message) {
    return message && message.subject === 'bug' && String(message.message || '').startsWith(TEST_ERROR_PREFIX);
}

function getMessageSubjectLabel(message) {
    if (isTestErrorMessage(message)) {
        return 'Ошибка в вопросе теста';
    }
    const subjectLabels = {
        question: 'Вопрос',
        suggestion: 'Предложение',
        feedback: 'Отзыв',
        bug: 'Ошибка',
        other: 'Другое'
    };
    return subjectLabels[message?.subject] || message?.subject || 'Сообщение';
}

// Функции для работы с темой
function initTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
    console.log('Theme initialized:', theme);
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
    
    console.log('Theme toggled to:', newTheme);
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

// Инициализация
function initAdmin() {
    console.log('Инициализация админ-панели');
    initTheme();
    setupAdminEventListeners();
    checkAdminAuth();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}

// Проверка авторизации администратора
function checkAdminAuth() {
    const token = localStorage.getItem('adminToken');
    if (token) {
        currentAdminToken = token;
        fetchAdmin();
    } else {
        showAdminLogin();
    }
}

async function fetchAdmin() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/me`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            currentAdmin = data.admin;
            showAdminDashboard();
            loadDashboard();
        } else {
            showAdminLogin();
        }
    } catch (error) {
        console.error('Ошибка загрузки администратора:', error);
        showAdminLogin();
    }
}

function showAdminLogin() {
    document.getElementById('adminLoginPage').style.display = 'block';
    document.getElementById('adminDashboardPage').style.display = 'none';
}

function showAdminDashboard() {
    document.getElementById('adminLoginPage').style.display = 'none';
    document.getElementById('adminDashboardPage').style.display = 'block';
}

// Вход администратора
async function handleAdminLogin(e) {
    e.preventDefault();
    e.stopImmediatePropagation(); // Останавливаем все другие обработчики
    
    // Проверяем, что это действительно форма админки
    const form = e.target;
    if (!form || form.id !== 'adminLoginForm') {
        console.error('Попытка входа не через форму админки!');
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    console.log('Попытка входа администратора с данными:', { username: data.username });
    console.log('Отправка запроса на:', `${ADMIN_API_URL}/login`);

    try {
        const response = await fetch(`${ADMIN_API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        console.log('Ответ сервера:', { status: response.status, result });

        if (response.ok) {
            currentAdminToken = result.token;
            currentAdmin = result.admin;
            localStorage.setItem('adminToken', currentAdminToken);
            
            // Используем функцию из app.js или alert
            if (typeof showNotification === 'function') {
                showNotification('Вход выполнен успешно', 'success');
            } else {
                alert('Вход выполнен успешно');
            }
            
            showAdminDashboard();
            loadDashboard();
        } else {
            const errorMsg = result.error || result.message || 'Ошибка входа';
            console.error('Ошибка входа:', errorMsg);
            
            if (typeof showNotification === 'function') {
                showNotification(errorMsg, 'error');
            } else {
                alert(errorMsg);
            }
        }
    } catch (error) {
        console.error('Ошибка входа:', error);
        const errorMsg = 'Ошибка соединения: ' + error.message;
        
        if (typeof showNotification === 'function') {
            showNotification(errorMsg, 'error');
        } else {
            alert(errorMsg);
        }
    }
}

// Выход
function adminLogout() {
    currentAdmin = null;
    currentAdminToken = null;
    localStorage.removeItem('adminToken');
    showAdminLogin();
}

// Загрузка дашборда
async function loadDashboard() {
    try {
        const headers = adminAuthHeaders();
        const [statsResponse, contactStatsResponse, messagesResponse] = await Promise.all([
            fetch(`${ADMIN_API_URL}/dashboard/stats`, { headers }),
            fetch(`${ADMIN_API_URL}/dashboard/contact-stats`, { headers }),
            fetch(`${ADMIN_API_URL}/contact-messages?page=1&limit=5`, { headers })
        ]);

        if (!statsResponse.ok) {
            throw new Error('Ошибка загрузки статистики');
        }

        const data = await statsResponse.json();
        const stats = data.stats;

        document.getElementById('statTotalUsers').textContent = stats.totalUsers || 0;
        document.getElementById('statTotalSubjects').textContent = stats.totalSubjects || 0;
        document.getElementById('statTotalTests').textContent = stats.totalTests || 0;
        document.getElementById('statTotalQuestions').textContent = stats.totalQuestions || 0;
        document.getElementById('statTotalResults').textContent = stats.totalResults || 0;

        const breakdown = data.usersBreakdown || {};
        const freeEl = document.getElementById('statFreeRegistration');
        const uniPaidEl = document.getElementById('statUniversityPaid');
        const usmlePaidEl = document.getElementById('statUsmlePaid');
        const activeUniEl = document.getElementById('statActiveUniversity');
        const activeUsmleEl = document.getElementById('statActiveUsmle');
        if (freeEl) freeEl.textContent = breakdown.freeRegistration ?? stats.freeRegistrationCount ?? 0;
        if (uniPaidEl) uniPaidEl.textContent = breakdown.universityPaid ?? stats.universityPaidUsers ?? 0;
        if (usmlePaidEl) usmlePaidEl.textContent = breakdown.usmlePaid ?? stats.usmlePaidUsers ?? 0;
        if (activeUniEl) activeUniEl.textContent = breakdown.activeUniversity ?? stats.activeUniversitySubscriptions ?? 0;
        if (activeUsmleEl) activeUsmleEl.textContent = breakdown.activeUsmle ?? stats.activeUsmleSubscriptions ?? 0;

        const uniBreakdownList = document.getElementById('universityPaidBreakdown');
        if (uniBreakdownList) {
            const rows = Array.isArray(breakdown.byUniversity) ? breakdown.byUniversity : [];
            if (rows.length) {
                uniBreakdownList.innerHTML = rows.map((uni) => `
                    <div class="admin-list-item">
                        <div>
                            <strong>${uni.shortName || uni.name || 'Университет'}</strong>
                            <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0.25rem 0 0;">
                                ${uni.name && uni.shortName && uni.name !== uni.shortName ? uni.name : ''}
                            </p>
                        </div>
                        <span style="font-weight: 700; font-size: 1.1rem;">${uni.paidUsers || 0}</span>
                    </div>
                `).join('');
            } else {
                uniBreakdownList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1.5rem;">Пока нет оплативших университет</p>';
            }
        }

        if (contactStatsResponse.ok) {
            const contactStats = await contactStatsResponse.json();
            document.getElementById('statNewMessages').textContent = contactStats.newMessages || 0;
            const testErrorBadge = document.getElementById('testErrorBadge');
            if (testErrorBadge) {
                const totalTestErrors = contactStats.testErrorReports || 0;
                const newTestErrors = contactStats.newTestErrorReports || 0;
                if (totalTestErrors > 0) {
                    testErrorBadge.style.display = 'inline-block';
                    testErrorBadge.textContent = `Ошибки в вопросах: ${totalTestErrors}${newTestErrors > 0 ? ` (новых: ${newTestErrors})` : ''}`;
                } else {
                    testErrorBadge.style.display = 'none';
                    testErrorBadge.textContent = '';
                }
            }
        }

        if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            const recentMessagesList = document.getElementById('recentMessagesList');
            if (messagesData.messages && messagesData.messages.length > 0) {
                recentMessagesList.innerHTML = messagesData.messages.map(msg => {
                        const date = new Date(msg.createdAt);
                        const statusLabels = {
                            'new': 'Новое',
                            'read': 'Прочитано',
                            'replied': 'Отвечено',
                            'archived': 'Архив'
                        };
                        const statusColors = {
                            'new': 'var(--primary-color)',
                            'read': 'var(--text-muted)',
                            'replied': 'var(--success-color)',
                            'archived': 'var(--text-secondary)'
                        };
                        return `
                            <div class="admin-list-item" onclick="viewMessage(${msg.id})" style="cursor: pointer;">
                                <div>
                                    <strong>${msg.name}</strong>
                                    <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0.25rem 0 0;">
                                        ${getMessageSubjectLabel(msg)} - ${msg.email}
                                    </p>
                                    ${isTestErrorMessage(msg) ? '<span style="display: inline-block; margin-top: 0.35rem; background: #dc2626; color: #fff; padding: 0.12rem 0.5rem; border-radius: 0.25rem; font-size: 0.7rem; font-weight: 600;">ОШИБКА В ВОПРОСЕ</span>' : ''}
                                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin: 0.25rem 0 0; max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        ${msg.message}
                                    </p>
                                </div>
                                <div style="text-align: right;">
                                    <span style="color: var(--text-muted); font-size: 0.875rem; display: block;">
                                        ${date.toLocaleDateString('ru-RU')}
                                    </span>
                                    <span style="color: ${statusColors[msg.status] || 'var(--text-muted)'}; font-size: 0.75rem; font-weight: 600; margin-top: 0.25rem; display: block;">
                                        ${statusLabels[msg.status] || msg.status}
                                    </span>
                                </div>
                            </div>
                        `;
                    }).join('');
            } else {
                recentMessagesList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Нет сообщений</p>';
            }
        }

        loadDeviceAlerts();

        // Последние пользователи
        const recentUsersList = document.getElementById('recentUsersList');
        if (data.recentUsers && data.recentUsers.length > 0) {
            recentUsersList.innerHTML = data.recentUsers.map(user => {
                const date = new Date(user.createdAt);
                return `
                    <div class="admin-list-item">
                        <div>
                            <strong>${user.username}</strong>
                            <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0.25rem 0 0;">${user.email}</p>
                        </div>
                        <span style="color: var(--text-muted); font-size: 0.875rem;">
                            ${date.toLocaleDateString('ru-RU')}
                        </span>
                    </div>
                `;
            }).join('');
        } else {
            recentUsersList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Нет пользователей</p>';
        }

        // Последние результаты
        const recentResultsList = document.getElementById('recentResultsList');
        if (data.recentResults && data.recentResults.length > 0) {
            recentResultsList.innerHTML = data.recentResults.map(result => {
                const date = new Date(result.createdAt);
                const percentage = Math.round((result.score / result.totalQuestions) * 100);
                return `
                    <div class="admin-list-item">
                        <div>
                            <strong>${result.Test?.name || 'Неизвестный тест'}</strong>
                            <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0.25rem 0 0;">
                                ${result.User?.username || 'Неизвестный'} - ${result.score}/${result.totalQuestions} (${percentage}%)
                            </p>
                        </div>
                        <span style="color: var(--text-muted); font-size: 0.875rem;">
                            ${date.toLocaleDateString('ru-RU')}
                        </span>
                    </div>
                `;
            }).join('');
        } else {
            recentResultsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Нет результатов</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки дашборда:', error);
        showNotification('Ошибка загрузки дашборда', 'error');
    }
}

// Загрузка уведомлений о входах с новых устройств
let currentDeviceAlerts = [];

function renderDeviceAlerts() {
    const deviceAlertsList = document.getElementById('deviceAlertsList');
    if (!deviceAlertsList) return;

    const dateFilter = document.getElementById('deviceAlertsDateFilter')?.value || '';
    const loginSearch = (document.getElementById('deviceAlertsLoginSearch')?.value || '').trim().toLowerCase();

    let filteredAlerts = dateFilter
        ? currentDeviceAlerts.filter(alert => {
            const alertDate = new Date(alert.createdAt);
            if (Number.isNaN(alertDate.getTime())) return false;
            return alertDate.toISOString().slice(0, 10) === dateFilter;
        })
        : currentDeviceAlerts;

    if (loginSearch) {
        filteredAlerts = filteredAlerts.filter(alert => {
            const username = String(alert.username || '').toLowerCase();
            return username.includes(loginSearch);
        });
    }

    if (!filteredAlerts.length) {
        if (dateFilter || loginSearch) {
            deviceAlertsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">По выбранным фильтрам входов не найдено</p>';
        } else {
            deviceAlertsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">Новых входов с других устройств нет</p>';
        }
        return;
    }

    deviceAlertsList.innerHTML = filteredAlerts.map(alert => {
        const createdAt = new Date(alert.createdAt);
        const shortUa = (alert.userAgent || '').length > 90
            ? `${alert.userAgent.slice(0, 90)}...`
            : (alert.userAgent || 'unknown');
        return `
            <div class="admin-list-item" style="${alert.isRead ? 'opacity: 0.75;' : 'border-left: 4px solid var(--primary-color);'}">
                <div style="flex: 1;">
                    <strong>${alert.username}</strong>
                    <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0.25rem 0 0;">${alert.email}</p>
                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin: 0.25rem 0 0;">IP: ${alert.ipAddress || 'unknown'}</p>
                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin: 0.25rem 0 0;">${shortUa}</p>
                </div>
                <div style="text-align: right; min-width: 170px;">
                    <span style="display: block; color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.5rem;">
                        ${createdAt.toLocaleString('ru-RU')}
                    </span>
                    ${alert.isRead
                        ? '<span style="font-size: 0.75rem; color: var(--text-muted);">Прочитано</span>'
                        : `<button class="btn btn-secondary btn-sm" onclick="markDeviceAlertRead(${alert.id})">Отметить прочитанным</button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

async function loadDeviceAlerts(limit = 10) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/device-alerts?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки уведомлений о новых устройствах');
        }

        const data = await response.json();
        const alerts = (data.alerts || []).slice().sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        const unreadCount = data.unreadCount || 0;
        currentDeviceAlerts = alerts;

        const statNewDevices = document.getElementById('statNewDevices');
        if (statNewDevices) {
            statNewDevices.textContent = unreadCount;
        }

        renderDeviceAlerts();
    } catch (error) {
        console.error('Ошибка загрузки уведомлений о новых устройствах:', error);
    }
}

// Отметить уведомление о новом устройстве как прочитанное
async function markDeviceAlertRead(alertId) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/device-alerts/${alertId}/read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка обновления уведомления');
        }

        const devicesTab = document.getElementById('devicesTab');
        const isDevicesTabActive = devicesTab && devicesTab.classList.contains('active');
        await loadDeviceAlerts(isDevicesTabActive ? 50 : 10);
    } catch (error) {
        console.error('Ошибка обновления уведомления:', error);
        showNotification('Не удалось отметить уведомление', 'error');
    }
}

// Загрузка пользователей
let currentUsersPage = 1;
async function loadUsers(page = 1) {
    try {
        const search = document.getElementById('usersSearch')?.value || '';
        const universityId = document.getElementById('usersUniversityFilter')?.value || '';
        const params = new URLSearchParams({
            page: String(page),
            limit: '20',
            search
        });
        if (universityId) params.set('universityId', universityId);
        const response = await fetch(`${ADMIN_API_URL}/users?${params}`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки пользователей');
        }

        const data = await response.json();
        currentUsersPage = page;

        const usersList = document.getElementById('usersList');
        if (data.users && data.users.length > 0) {
            usersList.innerHTML = `
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Никнейм</th>
                            <th>Email</th>
                            <th>Университет</th>
                            <th>Бонусы</th>
                            <th>Тестов пройдено</th>
                            <th>Точность</th>
                            <th>Дата регистрации</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.users.map(user => {
                            const date = new Date(user.createdAt);
                            const stats = user.UserStats || user.UserStat || {};
                            const accuracy = stats.totalQuestionsAnswered > 0 
                                ? Math.round((stats.correctAnswers / stats.totalQuestionsAnswered) * 100) 
                                : 0;
                            const uniLabel = user.University?.shortName || '—';
                            return `
                                <tr>
                                    <td>${user.id}</td>
                                    <td>${user.username}</td>
                                    <td>${user.email}</td>
                                    <td>${uniLabel}</td>
                                    <td>${user.coins || 0}</td>
                                    <td>${stats.totalTestsCompleted || 0}</td>
                                    <td>${accuracy}%</td>
                                    <td>${date.toLocaleDateString('ru-RU')}</td>
                                    <td>
                                        <button class="btn btn-primary btn-sm" onclick="openUpdateCoinsModal(${user.id}, '${String(user.username).replace(/'/g, "\\'")}', ${user.coins || 0})">Изменить монеты</button>
                                        <button class="btn btn-secondary btn-sm" onclick="openResetPasswordModal(${user.id}, '${String(user.username).replace(/'/g, "\\'")}')">Сменить пароль</button>
                                        <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id})">Удалить</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        } else {
            usersList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Пользователи не найдены</p>';
        }

        // Пагинация
        const pagination = document.getElementById('usersPagination');
        if (pagination && data.pagination) {
            const { totalPages, page: currentPage } = data.pagination;
            let paginationHTML = '';
            for (let i = 1; i <= totalPages; i++) {
                paginationHTML += `<button class="admin-pagination-btn ${i === currentPage ? 'active' : ''}" onclick="loadUsers(${i})">${i}</button>`;
            }
            pagination.innerHTML = paginationHTML;
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        showNotification('Ошибка загрузки пользователей', 'error');
    }
}

// Загрузка университетов
async function loadUniversities() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/universities`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки университетов');
        }

        const universities = await response.json();
        const list = document.getElementById('universitiesList');

        if (universities && universities.length > 0) {
            list.innerHTML = universities.map(uni => `
                <div class="admin-list-item">
                    <div style="flex: 1;">
                        <h4>${uni.shortName} ${uni.isActive ? '' : '<span style="background:#ef4444;color:white;padding:0.15rem 0.4rem;border-radius:4px;font-size:0.7rem;">выкл</span>'}</h4>
                        <p style="color: var(--text-muted); margin: 0.5rem 0;">${uni.name}</p>
                        ${uni.description ? `<p style="color: var(--text-secondary); font-size: 0.875rem;">${uni.description}</p>` : ''}
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                            Тестов: ${uni.testCount ?? 0}
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="btn btn-secondary btn-sm" onclick="openFacultiesModal(${uni.id}, '${String(uni.shortName || '').replace(/'/g, "\\'")}')">Факультеты</button>
                        <button class="btn btn-primary btn-sm" onclick="editUniversity(${uni.id})">Редактировать</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteUniversity(${uni.id})">Удалить</button>
                    </div>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Нет университетов</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки университетов:', error);
        showNotification('Ошибка загрузки университетов', 'error');
    }
}

async function fetchAdminUniversitiesCompact() {
    const response = await fetch(`${ADMIN_API_URL}/universities?compact=1`, {
        headers: adminAuthHeaders()
    });
    if (!response.ok) throw new Error('Ошибка загрузки университетов');
    return response.json();
}

async function editUniversity(id) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/universities/${id}`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('Не найден');
        const uni = await response.json();
        document.getElementById('universityId').value = uni.id;
        document.getElementById('universityName').value = uni.name || '';
        document.getElementById('universityShortName').value = uni.shortName || '';
        document.getElementById('universityDescription').value = uni.description || '';
        document.getElementById('universityIsActive').checked = uni.isActive !== false;
        document.getElementById('universityModalTitle').textContent = 'Редактировать университет';
        document.getElementById('universityModal').style.display = 'block';
    } catch (error) {
        console.error(error);
        showNotification('Ошибка загрузки университета', 'error');
    }
}

async function saveUniversity(e) {
    e.preventDefault();
    const id = document.getElementById('universityId').value;
    const name = document.getElementById('universityName').value.trim();
    const shortName = document.getElementById('universityShortName').value.trim();
    const description = document.getElementById('universityDescription').value.trim();
    const isActive = document.getElementById('universityIsActive').checked;

    try {
        const url = id ? `${ADMIN_API_URL}/universities/${id}` : `${ADMIN_API_URL}/universities`;
        const method = id ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({ name, shortName, description, isActive })
        });
        if (response.ok) {
            showNotification(id ? 'Университет обновлен' : 'Университет создан', 'success');
            document.getElementById('universityModal').style.display = 'none';
            document.getElementById('universityForm').reset();
            loadUniversities();
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        console.error(error);
        showNotification('Ошибка сохранения университета', 'error');
    }
}

async function deleteUniversity(id) {
    if (!confirm('Удалить университет? Можно только если нет привязанных тестов и пользователей.')) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/universities/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (response.ok) {
            showNotification('Университет удален', 'success');
            loadUniversities();
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error(error);
        showNotification('Ошибка удаления университета', 'error');
    }
}

// Загрузка предметов
async function loadSubjects() {
    try {
        const universityId = document.getElementById('subjectsUniversityFilter')?.value || '';
        const programType = document.getElementById('subjectsProgramFilter')?.value || '';
        const facultyId = document.getElementById('subjectsFacultyFilter')?.value || '';
        const course = document.getElementById('subjectsCourseFilter')?.value || '';
        const params = new URLSearchParams();
        if (universityId) params.set('universityId', universityId);
        if (programType) params.set('programType', programType);
        if (facultyId) params.set('facultyId', facultyId);
        if (course) params.set('course', course);
        const qs = params.toString();
        const response = await fetch(`${ADMIN_API_URL}/subjects${qs ? `?${qs}` : ''}`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки предметов');
        }

        const subjects = await response.json();
        const subjectsList = document.getElementById('subjectsList');

        if (subjects && subjects.length > 0) {
            subjectsList.innerHTML = subjects.map(subject => {
                const isUsmle = subject.programType === 'usmle';
                const programBadge = isUsmle
                    ? '<span style="background:#0f766e;color:white;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.75rem;margin-left:0.5rem;">USMLE</span>'
                    : (subject.University?.shortName
                        ? `<span style="background: var(--bg-secondary); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">${subject.University.shortName}</span>`
                        : '');
                const facultyNames = (subject.Faculties || []).map((f) => f.shortName || f.name).join(', ');
                const courses = (subject.courses || []).join(', ');
                return `
                <div class="admin-list-item">
                    <div style="flex: 1;">
                        <h4>${subject.name} ${programBadge}</h4>
                        ${subject.description ? `<p style="color: var(--text-muted); margin: 0.5rem 0;">${subject.description}</p>` : ''}
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                            ${isUsmle
                                ? 'Программа: USMLE'
                                : `Университет: ${subject.University?.shortName || '—'} | Факультеты: ${facultyNames || '—'} | Курсы: ${courses || '—'}`}
                            | Тестов: ${subject.testCount ?? subject.Tests?.length ?? 0}
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="editSubject(${subject.id})">Редактировать</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteSubject(${subject.id})">Удалить</button>
                    </div>
                </div>
            `;
            }).join('');
        } else {
            subjectsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Нет предметов</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки предметов:', error);
        showNotification('Ошибка загрузки предметов', 'error');
    }
}

async function fetchAdminFaculties(universityId) {
    if (!universityId) return [];
    const response = await fetch(`${ADMIN_API_URL}/faculties?universityId=${encodeURIComponent(universityId)}`, {
        headers: adminAuthHeaders()
    });
    if (!response.ok) throw new Error('Ошибка загрузки факультетов');
    return response.json();
}

async function fillSubjectsFacultyFilter() {
    const uniId = document.getElementById('subjectsUniversityFilter')?.value || '';
    const select = document.getElementById('subjectsFacultyFilter');
    if (!select) return;
    select.innerHTML = '<option value="">Все факультеты</option>';
    if (!uniId) return;
    try {
        const faculties = await fetchAdminFaculties(uniId);
        select.innerHTML += faculties.map((f) =>
            `<option value="${f.id}">${f.shortName} — ${f.name}</option>`
        ).join('');
    } catch (e) {
        console.warn(e);
    }
}

async function fillSubjectFacultyCheckboxes(universityId, selectedIds = []) {
    const box = document.getElementById('subjectFacultiesCheckboxes');
    if (!box) return;
    const selected = new Set((selectedIds || []).map(Number));
    if (!universityId) {
        box.innerHTML = '<span style="color:var(--text-muted);font-size:0.875rem;">Сначала выберите университет</span>';
        return;
    }
    try {
        const faculties = await fetchAdminFaculties(universityId);
        if (!faculties.length) {
            box.innerHTML = '<span style="color:var(--text-muted);font-size:0.875rem;">Нет факультетов</span>';
            return;
        }
        box.innerHTML = faculties.map((f) => `
            <label class="admin-check-chip">
                <input type="checkbox" name="subjectFaculty" value="${f.id}" ${selected.has(f.id) ? 'checked' : ''}>
                <span>${f.shortName}</span>
            </label>
        `).join('');
    } catch (e) {
        box.innerHTML = '<span style="color:var(--danger-color);">Ошибка загрузки факультетов</span>';
    }
}

function setSubjectCourseCheckboxes(courses = [1]) {
    const set = new Set((courses || []).map(Number));
    document.querySelectorAll('input[name="subjectCourse"]').forEach((el) => {
        el.checked = set.has(Number(el.value));
    });
}

function getSelectedSubjectFacultyIds() {
    return [...document.querySelectorAll('input[name="subjectFaculty"]:checked')].map((el) => Number(el.value));
}

function getSelectedSubjectCourses() {
    return [...document.querySelectorAll('input[name="subjectCourse"]:checked')].map((el) => Number(el.value));
}

async function openFacultiesModal(universityId, shortName) {
    document.getElementById('facultyUniversityId').value = universityId;
    document.getElementById('facultyModalUniversityLabel').textContent = shortName || '';
    resetFacultyForm();
    document.getElementById('facultyModal').style.display = 'block';
    await loadFacultiesForModal(universityId);
}

function resetFacultyForm() {
    document.getElementById('facultyId').value = '';
    document.getElementById('facultyName').value = '';
    document.getElementById('facultyShortName').value = '';
    document.getElementById('facultySortOrder').value = '0';
    document.getElementById('facultyIsActive').checked = true;
    document.getElementById('facultyFormSubmitBtn').textContent = 'Добавить факультет';
}

async function loadFacultiesForModal(universityId) {
    const list = document.getElementById('facultiesList');
    if (!list) return;
    try {
        const faculties = await fetchAdminFaculties(universityId);
        window.__adminFacultiesCache = faculties;
        if (!faculties.length) {
            list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:1rem;">Нет факультетов</p>';
            return;
        }
        list.innerHTML = faculties.map((f) => `
            <div class="admin-list-item">
                <div style="flex:1;">
                    <strong>${f.shortName}</strong> ${f.isActive ? '' : '<span style="color:#ef4444;font-size:0.75rem;">выкл</span>'}
                    <p style="margin:0.25rem 0 0;color:var(--text-muted);font-size:0.875rem;">${f.name}</p>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <button type="button" class="btn btn-primary btn-sm" onclick="editFacultyInModal(${f.id})">Изменить</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteFaculty(${f.id})">Удалить</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:var(--danger-color);">Ошибка загрузки</p>';
    }
}

function editFacultyInModal(facultyId) {
    const faculty = (window.__adminFacultiesCache || []).find((f) => Number(f.id) === Number(facultyId));
    if (!faculty) return;
    document.getElementById('facultyId').value = faculty.id;
    document.getElementById('facultyUniversityId').value = faculty.universityId;
    document.getElementById('facultyName').value = faculty.name || '';
    document.getElementById('facultyShortName').value = faculty.shortName || '';
    document.getElementById('facultySortOrder').value = faculty.sortOrder ?? 0;
    document.getElementById('facultyIsActive').checked = faculty.isActive !== false;
    document.getElementById('facultyFormSubmitBtn').textContent = 'Сохранить факультет';
}

async function saveFaculty(e) {
    e.preventDefault();
    const id = document.getElementById('facultyId').value;
    const universityId = parseInt(document.getElementById('facultyUniversityId').value, 10);
    const payload = {
        name: document.getElementById('facultyName').value.trim(),
        shortName: document.getElementById('facultyShortName').value.trim(),
        sortOrder: parseInt(document.getElementById('facultySortOrder').value, 10) || 0,
        isActive: document.getElementById('facultyIsActive').checked,
        universityId
    };
    try {
        const url = id ? `${ADMIN_API_URL}/faculties/${id}` : `${ADMIN_API_URL}/faculties`;
        const method = id ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || 'Ошибка сохранения');
        }
        showNotification(id ? 'Факультет обновлён' : 'Факультет создан', 'success');
        resetFacultyForm();
        await loadFacultiesForModal(universityId);
        fillSubjectsFacultyFilter();
    } catch (error) {
        showNotification(error.message || 'Ошибка сохранения факультета', 'error');
    }
}

async function deleteFaculty(id) {
    if (!confirm('Удалить факультет?')) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/faculties/${id}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || 'Ошибка удаления');
        }
        showNotification('Факультет удалён', 'success');
        const universityId = document.getElementById('facultyUniversityId').value;
        await loadFacultiesForModal(universityId);
        fillSubjectsFacultyFilter();
    } catch (error) {
        showNotification(error.message || 'Ошибка удаления факультета', 'error');
    }
}

async function fillSubjectUniversitySelect(selectedId) {
    const select = document.getElementById('subjectUniversityId');
    if (!select) return;
    const universities = await fetchAdminUniversitiesCompact();
    select.innerHTML = '<option value="">Выберите университет</option>' +
        universities.map(u => `<option value="${u.id}">${u.shortName} — ${u.name}</option>`).join('');
    if (selectedId) select.value = String(selectedId);
}

// Загрузка тестов
async function loadTests() {
    try {
        const subjectId = document.getElementById('testsSubjectFilter')?.value || '';
        const universityId = document.getElementById('testsUniversityFilter')?.value || '';
        const programType = document.getElementById('testsProgramFilter')?.value || '';
        const params = new URLSearchParams();
        if (subjectId) params.set('subjectId', subjectId);
        if (universityId) params.set('universityId', universityId);
        if (programType) params.set('programType', programType);
        const qs = params.toString();
        const url = `${ADMIN_API_URL}/tests${qs ? `?${qs}` : ''}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки тестов');
        }

        const tests = await response.json();
        const testsList = document.getElementById('testsList');

        if (tests && tests.length > 0) {
            testsList.innerHTML = tests.map(test => {
                const isUsmle = test.programType === 'usmle' || test.Subject?.programType === 'usmle';
                const programBadge = isUsmle
                    ? '<span style="background:#0f766e;color:white;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.75rem;margin-left:0.5rem;">USMLE</span>'
                    : (test.University?.shortName
                        ? `<span style="background: var(--bg-secondary); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">${test.University.shortName}</span>`
                        : '');
                return `
                <div class="admin-list-item">
                    <div style="flex: 1;">
                        <h4>${test.name} ${test.isFree ? '<span style="background: #10b981; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">БЕСПЛАТНЫЙ</span>' : ''} ${programBadge}</h4>
                        ${test.description ? `<p style="color: var(--text-muted); margin: 0.5rem 0;">${test.description}</p>` : ''}
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                            Предмет: ${test.Subject?.name || 'Неизвестно'} | ${isUsmle ? 'Программа: USMLE' : `Университет: ${test.University?.shortName || '—'}`} | Вопросов: ${test.questionCount ?? test.Questions?.length ?? 0}
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="editTest(${test.id})">Редактировать</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteTest(${test.id})">Удалить</button>
                    </div>
                </div>
            `;
            }).join('');
        } else {
            testsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Нет тестов</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки тестов:', error);
        showNotification('Ошибка загрузки тестов', 'error');
    }
}

function renderQuestionsSelectPrompt() {
    const questionsList = document.getElementById('questionsList');
    if (questionsList) {
        questionsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Выберите тест, чтобы увидеть вопросы</p>';
    }
}

async function loadQuestionSearchSuggestions() {
    try {
        const testId = document.getElementById('questionsTestFilter')?.value || '';
        const query = document.getElementById('questionsSearch')?.value || '';
        const datalist = document.getElementById('questionsSearchSuggestions');
        if (!datalist) return;

        if (!testId) {
            datalist.innerHTML = '';
            return;
        }

        const url = `${ADMIN_API_URL}/questions/suggestions?testId=${encodeURIComponent(testId)}&query=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });
        if (!response.ok) {
            return;
        }
        const data = await response.json();
        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        datalist.innerHTML = suggestions.map(text => `<option value="${String(text).replace(/"/g, '&quot;')}"></option>`).join('');
    } catch (error) {
        console.error('Ошибка загрузки подсказок поиска вопросов:', error);
    }
}

// Загрузка вопросов
async function loadQuestions() {
    try {
        const testId = document.getElementById('questionsTestFilter')?.value || '';
        const search = document.getElementById('questionsSearch')?.value || '';
        if (!testId) {
            renderQuestionsSelectPrompt();
            return;
        }

        const url = `${ADMIN_API_URL}/questions?testId=${encodeURIComponent(testId)}&search=${encodeURIComponent(search)}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки вопросов');
        }

        const questions = await response.json();
        const questionsList = document.getElementById('questionsList');

        if (questions && questions.length > 0) {
            questionsList.innerHTML = questions.map(question => {
                const correctAnswer = question.Answers?.find(a => a.isCorrect);
                const hasExplanation = !!(question.explanation && String(question.explanation).trim());
                const hasImage = !!(question.imageUrl && String(question.imageUrl).trim());
                return `
                    <div class="admin-list-item">
                        <div style="flex: 1;">
                            <h4>${escapeAdminHtml(question.text)}</h4>
                            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                                Тест: ${escapeAdminHtml(question.Test?.name || 'Неизвестно')} | Ответов: ${question.Answers?.length || 0}
                                ${correctAnswer ? ` | Правильный: ${escapeAdminHtml(correctAnswer.text)}` : ''}
                                ${hasExplanation ? ' | <span style="color: var(--primary-color); font-weight: 600;">Есть объяснение</span>' : ''}
                                ${hasImage ? ' | <span style="color: var(--primary-color); font-weight: 600;">Есть картинка</span>' : ''}
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-primary btn-sm" onclick="editQuestion(${question.id})">Редактировать</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${question.id})">Удалить</button>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            questionsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Нет вопросов</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки вопросов:', error);
        showNotification('Ошибка загрузки вопросов', 'error');
    }
}

// Удаление пользователя
async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) {
        return;
    }

    try {
        const response = await fetch(`${ADMIN_API_URL}/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (response.ok) {
            showNotification('Пользователь удален', 'success');
            loadUsers(currentUsersPage);
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        showNotification('Ошибка удаления пользователя', 'error');
    }
}

function openResetPasswordModal(userId, username) {
    const modal = document.getElementById('resetPasswordModal');
    const userIdInput = document.getElementById('resetPasswordUserId');
    const usernameInput = document.getElementById('resetPasswordUsername');
    const newPasswordInput = document.getElementById('resetPasswordNew');

    if (!modal || !userIdInput || !usernameInput || !newPasswordInput) return;

    userIdInput.value = String(userId);
    usernameInput.value = username || '';
    newPasswordInput.value = '';
    modal.style.display = 'block';
}

async function handleResetPassword(e) {
    e.preventDefault();
    const userId = document.getElementById('resetPasswordUserId')?.value;
    const newPassword = document.getElementById('resetPasswordNew')?.value || '';

    if (!userId) {
        showNotification('Не выбран пользователь', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showNotification('Новый пароль должен быть минимум 6 символов', 'error');
        return;
    }

    try {
        const response = await fetch(`${ADMIN_API_URL}/users/${userId}/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({ newPassword })
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok) {
            showNotification(result.message || 'Пароль обновлен', 'success');
            const modal = document.getElementById('resetPasswordModal');
            const form = document.getElementById('resetPasswordForm');
            if (form) form.reset();
            if (modal) modal.style.display = 'none';
        } else {
            showNotification(result.error || 'Ошибка смены пароля', 'error');
        }
    } catch (error) {
        console.error('Ошибка смены пароля:', error);
        showNotification('Ошибка смены пароля', 'error');
    }
}

function openUpdateCoinsModal(userId, username, coins) {
    const modal = document.getElementById('updateCoinsModal');
    const userIdInput = document.getElementById('updateCoinsUserId');
    const usernameInput = document.getElementById('updateCoinsUsername');
    const currentCoinsInput = document.getElementById('updateCoinsCurrent');
    const coinsInput = document.getElementById('updateCoinsValue');

    if (!modal || !userIdInput || !usernameInput || !coinsInput || !currentCoinsInput) return;

    userIdInput.value = String(userId);
    usernameInput.value = username || '';
    currentCoinsInput.value = Number.isFinite(Number(coins)) ? String(coins) : '0';
    coinsInput.value = '0';
    modal.style.display = 'block';
}

async function handleUpdateCoins(e) {
    e.preventDefault();
    const userId = document.getElementById('updateCoinsUserId')?.value;
    const coinsDeltaRaw = document.getElementById('updateCoinsValue')?.value ?? '';
    const coinsDelta = parseInt(coinsDeltaRaw, 10);

    if (!userId) {
        showNotification('Не выбран пользователь', 'error');
        return;
    }

    if (!Number.isInteger(coinsDelta)) {
        showNotification('Введите целое число (можно с минусом)', 'error');
        return;
    }

    try {
        const response = await fetch(`${ADMIN_API_URL}/users/${userId}/coins`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({ coinsDelta })
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok) {
            showNotification(result.message || 'Монеты обновлены', 'success');
            const modal = document.getElementById('updateCoinsModal');
            const form = document.getElementById('updateCoinsForm');
            if (form) form.reset();
            if (modal) modal.style.display = 'none';
            loadUsers(currentUsersPage);
        } else {
            showNotification(result.error || 'Ошибка обновления монет', 'error');
        }
    } catch (error) {
        console.error('Ошибка обновления монет:', error);
        showNotification('Ошибка обновления монет', 'error');
    }
}

// Удаление предмета
async function deleteSubject(subjectId) {
    if (!confirm('Вы уверены, что хотите удалить этот предмет? Все связанные тесты также будут удалены.')) {
        return;
    }

    try {
        const response = await fetch(`${ADMIN_API_URL}/subjects/${subjectId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (response.ok) {
            invalidateAdminListCache();
            showNotification('Предмет удален', 'success');
            loadSubjects();
            if (document.getElementById('usmleTab')?.classList.contains('active')) {
                loadUsmleAdminPanel();
            }
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления предмета:', error);
        showNotification('Ошибка удаления предмета', 'error');
    }
}

// Удаление теста
async function deleteTest(testId) {
    if (!confirm('Вы уверены, что хотите удалить этот тест? Все связанные вопросы также будут удалены.')) {
        return;
    }

    try {
        const response = await fetch(`${ADMIN_API_URL}/tests/${testId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (response.ok) {
            invalidateAdminListCache();
            showNotification('Тест удален', 'success');
            loadTests();
            if (document.getElementById('usmleTab')?.classList.contains('active')) {
                loadUsmleAdminPanel();
            }
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления теста:', error);
        showNotification('Ошибка удаления теста', 'error');
    }
}

// Удаление вопроса
async function deleteQuestion(questionId) {
    if (!confirm('Вы уверены, что хотите удалить этот вопрос?')) {
        return;
    }

    try {
        const response = await fetch(`${ADMIN_API_URL}/questions/${questionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (response.ok) {
            showNotification('Вопрос удален', 'success');
            loadQuestions();
            if (document.getElementById('usmleTab')?.classList.contains('active')) {
                loadUsmleTestsAdmin().then(() => loadUsmleQuestionsAdmin());
            }
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления вопроса:', error);
        showNotification('Ошибка удаления вопроса', 'error');
    }
}

function toDateTimeLocalValue(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60000));
    return localDate.toISOString().slice(0, 16);
}

const SCHEDULE_DAY_NAMES = {
    1: 'Понедельник',
    2: 'Вторник',
    3: 'Среда',
    4: 'Четверг',
    5: 'Пятница',
    6: 'Суббота'
};

const SCHEDULE_LESSON_TYPE_LABELS = {
    lecture: 'Лекция',
    practice: 'Практика',
    lab: 'Лабораторная',
    seminar: 'Семинар',
    other: 'Другое'
};

const SCHEDULE_WEEK_PARITY_LABELS = {
    all: 'Каждую',
    odd: 'Нечётная',
    even: 'Чётная'
};

const SCHEDULE_SEMESTER_LABELS = {
    autumn: 'Осенний',
    spring: 'Весенний'
};

function getDefaultAcademicYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    if (month >= 9) {
        return `${year}-${year + 1}`;
    }
    return `${year - 1}-${year}`;
}

function getDefaultSemester() {
    const month = new Date().getMonth() + 1;
    return month >= 2 && month <= 8 ? 'spring' : 'autumn';
}

let kgmaMetaCache = null;

async function loadKgmaMetaAdmin() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/schedule/kgma/meta`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error();
        kgmaMetaCache = await response.json();

        const facultySelect = document.getElementById('kgmaFacultyFilter');
        if (facultySelect) {
            const keep = facultySelect.value;
            facultySelect.innerHTML = '<option value="">Факультет КГМА</option>'
                + (kgmaMetaCache.faculty || []).map((f) =>
                    `<option value="${f.id}">${escapeAdminHtml(f.name)}</option>`
                ).join('');
            if (keep) facultySelect.value = keep;
        }

        const weekInput = document.getElementById('kgmaWeekStart');
        if (weekInput && !weekInput.value) {
            const wk = await fetch('/api/schedule/kgma/current-week-start').then((r) => r.json()).catch(() => null);
            if (wk?.weekStart) weekInput.value = wk.weekStart;
        }
    } catch (error) {
        console.error('Ошибка загрузки meta КГМА:', error);
    }
}

async function fillKgmaCourseGroupFilters() {
    const facultyId = document.getElementById('kgmaFacultyFilter')?.value || '';
    const courseSelect = document.getElementById('kgmaCourseFilter');
    const groupSelect = document.getElementById('kgmaGroupFilter');
    if (!courseSelect || !groupSelect) return;

    if (!facultyId) {
        courseSelect.innerHTML = '<option value="">Курс</option>';
        groupSelect.innerHTML = '<option value="">Все группы</option>';
        return;
    }

    try {
        const response = await fetch(
            `${ADMIN_API_URL}/schedule/kgma/meta?facultyId=${encodeURIComponent(facultyId)}`,
            { headers: adminAuthHeaders() }
        );
        if (!response.ok) throw new Error();
        const data = await response.json();

        courseSelect.innerHTML = '<option value="">Курс</option>'
            + (data.courses || []).map((c) => `<option value="${c}">${c} курс</option>`).join('');
        groupSelect.innerHTML = '<option value="">Все группы</option>';
    } catch (error) {
        console.error('Ошибка курсов КГМА:', error);
    }
}

async function fillKgmaGroupFilter() {
    const facultyId = document.getElementById('kgmaFacultyFilter')?.value || '';
    const course = document.getElementById('kgmaCourseFilter')?.value || '';
    const groupSelect = document.getElementById('kgmaGroupFilter');
    if (!groupSelect || !facultyId || !course) return;

    try {
        const response = await fetch(
            `${ADMIN_API_URL}/schedule/kgma/meta?facultyId=${encodeURIComponent(facultyId)}&course=${encodeURIComponent(course)}`,
            { headers: adminAuthHeaders() }
        );
        if (!response.ok) throw new Error();
        const data = await response.json();
        const keep = groupSelect.value;
        groupSelect.innerHTML = '<option value="">Все группы</option>'
            + (data.groups || []).map((g) =>
                `<option value="${g.id}">${escapeAdminHtml(g.name)}</option>`
            ).join('');
        if (keep) groupSelect.value = keep;
    } catch (error) {
        console.error('Ошибка групп КГМА:', error);
    }
}

function renderKgmaWeekPreview(week, groupLabel) {
    const container = document.getElementById('kgmaSchedulePreview');
    if (!container) return;

    if (!week || week.empty) {
        container.innerHTML = `<p style="color:var(--text-muted);padding:1rem;text-align:center;">${escapeAdminHtml(week?.message || 'На эту неделю занятий нет')}</p>`;
        return;
    }

    const header = `<p style="font-size:0.85rem;color:var(--text-muted);margin:0 0 0.75rem;">Неделя ${escapeAdminHtml(week.weekStart)} — ${escapeAdminHtml(week.weekEnd)}${groupLabel ? ` · ${escapeAdminHtml(groupLabel)}` : ''}</p>`;

    const blocks = (week.days || []).map((day) => {
        const rows = (day.lessons || []).map((les) => `
            <tr>
                <td>${escapeAdminHtml(les.timeLabel || `${les.timeStart || ''}-${les.timeEnd || ''}`)}</td>
                <td><strong>${escapeAdminHtml(les.subjectName)}</strong></td>
                <td>${escapeAdminHtml(les.lessonTypeLabel || les.lessonType)}</td>
                <td>${escapeAdminHtml(les.room || '—')}</td>
            </tr>
        `).join('');

        const title = `${SCHEDULE_DAY_NAMES[day.dayOfWeek] || day.date} · ${day.date}`;
        return `
            <div class="admin-schedule-day-block">
                <h3 class="admin-schedule-day-title">${escapeAdminHtml(title)}</h3>
                <table class="admin-table">
                    <thead><tr><th>Время</th><th>Предмет</th><th>Тип</th><th>Аудитория</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }).join('');

    container.innerHTML = header + blocks;
}

async function viewKgmaScheduleAdmin() {
    const facultyId = document.getElementById('kgmaFacultyFilter')?.value;
    const course = document.getElementById('kgmaCourseFilter')?.value;
    const kgmaGroupId = document.getElementById('kgmaGroupFilter')?.value;
    const weekStart = document.getElementById('kgmaWeekStart')?.value;

    if (!facultyId || !course) {
        showNotification('Выберите факультет и курс КГМА', 'error');
        return;
    }
    if (!kgmaGroupId) {
        showNotification('Для просмотра выберите группу', 'error');
        return;
    }

    try {
        const params = new URLSearchParams({ kgmaGroupId });
        if (weekStart) params.set('weekStart', weekStart);
        const response = await fetch(`${ADMIN_API_URL}/schedule/kgma/week?${params}`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Ошибка загрузки');
        }
        const week = await response.json();
        const groupName = document.getElementById('kgmaGroupFilter')?.selectedOptions?.[0]?.textContent || '';
        renderKgmaWeekPreview(week, groupName);
    } catch (error) {
        showNotification(error.message || 'Не удалось загрузить с КГМА', 'error');
    }
}

async function importKgmaScheduleAdmin() {
    const kgmaFacultyId = document.getElementById('kgmaFacultyFilter')?.value;
    const course = document.getElementById('kgmaCourseFilter')?.value;
    const kgmaGroupId = document.getElementById('kgmaGroupFilter')?.value || '';
    const weekStart = document.getElementById('kgmaWeekStart')?.value;
    const importAllGroups = !kgmaGroupId;

    if (!kgmaFacultyId || !course) {
        showNotification('Выберите факультет и курс КГМА', 'error');
        return;
    }

    const label = importAllGroups ? 'все группы' : `группу ${document.getElementById('kgmaGroupFilter')?.selectedOptions?.[0]?.textContent || ''}`;
    if (!confirm(`Импортировать расписание (${label}) с kgma.kg в локальную базу?`)) return;

    const btn = document.getElementById('kgmaImportBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Импорт…'; }

    try {
        const response = await fetch(`${ADMIN_API_URL}/schedule/kgma/import`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify({
                kgmaFacultyId,
                course: parseInt(course, 10),
                kgmaGroupId: kgmaGroupId || undefined,
                importAllGroups,
                weekStart: weekStart || undefined,
                academicYear: document.getElementById('scheduleYearFilter')?.value?.trim() || undefined,
                semester: document.getElementById('scheduleSemesterFilter')?.value || undefined
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Ошибка импорта');

        showNotification(`Импорт: +${result.imported || 0}, обновлено ${result.updated || 0}`, 'success');
        await loadScheduleAdmin();
        if (kgmaGroupId) await viewKgmaScheduleAdmin();
    } catch (error) {
        showNotification(error.message || 'Ошибка импорта', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Импорт в базу'; }
    }
}

async function loadKgmaSyncStatus() {
    const el = document.getElementById('kgmaSyncStatus');
    if (!el) return;

    try {
        const response = await fetch(`${ADMIN_API_URL}/schedule/kgma/sync-status`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        const last = data.lastResult;
        const parts = [];

        if (data.schedulerEnabled === false) {
            parts.push('Автосинхронизация отключена (KGMA_SYNC_ENABLED=false).');
        } else {
            parts.push(`Автосинхронизация: каждое воскресенье в ${String(data.syncHour).padStart(2, '0')}:${String(data.syncMinute).padStart(2, '0')}.`);
        }

        if (last?.finishedAt) {
            const when = new Date(last.finishedAt).toLocaleString('ru-RU');
            parts.push(
                `Последний полный синк: ${when}, неделя с ${last.weekStart || '—'}, `
                + `групп ${last.groupsProcessed || 0}/${last.totalGroups || 0}, `
                + `+${last.imported || 0} / ~${last.updated || 0}, ошибок ${last.errors || 0}.`
            );
        } else if (data.lastSyncDate) {
            parts.push(`Последний синк: ${data.lastSyncDate}.`);
        } else {
            parts.push('Полная синхронизация ещё не выполнялась.');
        }

        el.textContent = parts.join(' ');
    } catch (error) {
        el.textContent = 'Не удалось загрузить статус автосинхронизации.';
    }
}

async function syncAllKgmaSchedulesAdmin() {
    if (!confirm('Запустить полную синхронизацию всех факультетов и групп с kgma.kg? Это может занять длительное время.')) {
        return;
    }

    const btn = document.getElementById('kgmaSyncAllBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Синхронизация…'; }

    try {
        const response = await fetch(`${ADMIN_API_URL}/schedule/kgma/sync-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify({ force: true })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Ошибка запуска');

        showNotification(result.message || 'Синхронизация запущена в фоне', 'success');
        setTimeout(() => {
            loadKgmaSyncStatus();
            loadScheduleAdmin();
        }, 5000);
    } catch (error) {
        showNotification(error.message || 'Не удалось запустить синхронизацию', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Синхронизировать всё'; }
    }
}

function formatScheduleTimeRange(entry) {
    if (entry.timeStart && entry.timeEnd) return `${entry.timeStart}–${entry.timeEnd}`;
    if (entry.timeStart) return `с ${entry.timeStart}`;
    if (entry.lessonNumber) return `пара ${entry.lessonNumber}`;
    return '—';
}

function getScheduleFilterParams() {
    const params = new URLSearchParams();
    const universityId = document.getElementById('scheduleUniversityFilter')?.value || '';
    const facultyId = document.getElementById('scheduleFacultyFilter')?.value || '';
    const course = document.getElementById('scheduleCourseFilter')?.value || '';
    const groupName = document.getElementById('scheduleGroupFilter')?.value?.trim() || '';
    const academicYear = document.getElementById('scheduleYearFilter')?.value?.trim() || '';
    const semester = document.getElementById('scheduleSemesterFilter')?.value || '';
    const dayOfWeek = document.getElementById('scheduleDayFilter')?.value || '';

    if (universityId) params.set('universityId', universityId);
    if (facultyId) params.set('facultyId', facultyId);
    if (course) params.set('course', course);
    if (groupName) params.set('groupName', groupName);
    if (academicYear) params.set('academicYear', academicYear);
    if (semester) params.set('semester', semester);
    if (dayOfWeek) params.set('dayOfWeek', dayOfWeek);
    return params;
}

async function fillScheduleUniversitySelects(selectedId) {
    const selects = [
        document.getElementById('scheduleUniversityFilter'),
        document.getElementById('scheduleUniversityId')
    ].filter(Boolean);

    try {
        const response = await fetch(`${ADMIN_API_URL}/universities`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error();
        const universities = await response.json();
        window.__adminUniversitiesCache = universities;

        selects.forEach((select) => {
            const keepValue = select.value;
            select.innerHTML = select.id === 'scheduleUniversityFilter'
                ? '<option value="">Университет</option>'
                : '';
            universities.forEach((u) => {
                select.innerHTML += `<option value="${u.id}">${escapeAdminHtml(u.shortName || u.name)}</option>`;
            });
            if (selectedId) {
                select.value = String(selectedId);
            } else if (keepValue) {
                select.value = keepValue;
            }
        });
    } catch (error) {
        console.error('Ошибка загрузки университетов для расписания:', error);
    }
}

async function fillScheduleFacultySelect(universityId, selectEl, selectedId) {
    if (!selectEl) return;
    if (!universityId) {
        selectEl.innerHTML = selectEl.id === 'scheduleFacultyFilter'
            ? '<option value="">Факультет</option>'
            : '';
        return;
    }

    try {
        const faculties = await fetchAdminFaculties(universityId);
        const placeholder = selectEl.id === 'scheduleFacultyFilter'
            ? '<option value="">Факультет</option>'
            : '';
        selectEl.innerHTML = placeholder + faculties.map((f) =>
            `<option value="${f.id}">${escapeAdminHtml(f.shortName || f.name)}</option>`
        ).join('');
        if (selectedId) selectEl.value = String(selectedId);
    } catch (error) {
        console.error('Ошибка загрузки факультетов для расписания:', error);
    }
}

async function fillScheduleGroupFilter(selectedValue) {
    const select = document.getElementById('scheduleGroupFilter');
    if (!select) return;

    const keepValue = selectedValue != null ? selectedValue : select.value;

    try {
        const params = getScheduleFilterParams();
        params.delete('groupName');
        const response = await fetch(`${ADMIN_API_URL}/schedule/groups?${params.toString()}`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error();
        const groups = await response.json();

        select.innerHTML = '<option value="">Все группы</option>'
            + groups.map((g) => `<option value="${escapeAdminHtml(g)}">${escapeAdminHtml(g)}</option>`).join('');

        if (keepValue && (keepValue === '' || groups.includes(keepValue))) {
            select.value = keepValue;
        } else {
            select.value = '';
        }
    } catch (error) {
        console.error('Ошибка загрузки групп расписания:', error);
        select.innerHTML = '<option value="">Все группы</option>';
        select.value = '';
    }
}

function renderScheduleAdminTable(entries) {
    const container = document.getElementById('scheduleAdminList');
    if (!container) return;

    if (!entries.length) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Занятий не найдено. Добавьте первое занятие или измените фильтры.</p>';
        return;
    }

    const byDay = new Map();
    entries.forEach((entry) => {
        const day = entry.dayOfWeek || 1;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(entry);
    });

    const days = [...byDay.keys()].sort((a, b) => a - b);
    container.innerHTML = days.map((day) => {
        const rows = byDay.get(day).map((entry) => {
            const inactive = entry.isActive === false ? ' style="opacity:0.55;"' : '';
            const meta = [
                entry.University?.shortName || entry.University?.name || '—',
                entry.Faculty?.shortName || entry.Faculty?.name || '—',
                `${entry.course} курс`,
                SCHEDULE_SEMESTER_LABELS[entry.semester] || entry.semester,
                entry.academicYear || '—'
            ].join(' · ');

            return `
                <tr${inactive}>
                    <td>${formatScheduleTimeRange(entry)}</td>
                    <td>${escapeAdminHtml(entry.groupName || 'Все')}</td>
                    <td><strong>${escapeAdminHtml(entry.subjectName)}</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">${escapeAdminHtml(meta)}</span></td>
                    <td>${escapeAdminHtml(SCHEDULE_LESSON_TYPE_LABELS[entry.lessonType] || entry.lessonType)}</td>
                    <td>${escapeAdminHtml(entry.teacher || '—')}</td>
                    <td>${escapeAdminHtml(entry.room || '—')}</td>
                    <td>${escapeAdminHtml(SCHEDULE_WEEK_PARITY_LABELS[entry.weekParity] || entry.weekParity)}</td>
                    <td>
                        <button class="btn btn-primary btn-sm" onclick="editScheduleEntry(${entry.id})">Изменить</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteScheduleEntry(${entry.id})">Удалить</button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="admin-schedule-day-block">
                <h3 class="admin-schedule-day-title">${SCHEDULE_DAY_NAMES[day] || `День ${day}`}</h3>
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Время</th>
                            <th>Группа</th>
                            <th>Предмет</th>
                            <th>Тип</th>
                            <th>Преподаватель</th>
                            <th>Аудитория</th>
                            <th>Неделя</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }).join('');
}

async function loadScheduleAdmin() {
    try {
        await fillScheduleUniversitySelects();
        await loadKgmaMetaAdmin();
        await loadKgmaSyncStatus();

        const yearFilter = document.getElementById('scheduleYearFilter');
        if (yearFilter && !yearFilter.value) {
            yearFilter.value = getDefaultAcademicYear();
        }
        const semesterFilter = document.getElementById('scheduleSemesterFilter');
        if (semesterFilter && !semesterFilter.value) {
            semesterFilter.value = getDefaultSemester();
        }

        const groupFilter = document.getElementById('scheduleGroupFilter');
        const selectedGroup = groupFilter?.value || '';
        await fillScheduleGroupFilter(selectedGroup);

        const params = getScheduleFilterParams();
        const response = await fetch(`${ADMIN_API_URL}/schedule?${params.toString()}`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error('Ошибка загрузки расписания');

        const entries = await response.json();
        window.__adminScheduleCache = entries;
        renderScheduleAdminTable(entries);
    } catch (error) {
        console.error('Ошибка загрузки расписания:', error);
        showNotification('Ошибка загрузки расписания', 'error');
    }
}

function resetScheduleForm() {
    document.getElementById('scheduleId').value = '';
    document.getElementById('scheduleGroupName').value = '';
    document.getElementById('scheduleLessonNumber').value = '';
    document.getElementById('scheduleTimeStart').value = '';
    document.getElementById('scheduleTimeEnd').value = '';
    document.getElementById('scheduleSubjectName').value = '';
    document.getElementById('scheduleTeacher').value = '';
    document.getElementById('scheduleRoom').value = '';
    document.getElementById('scheduleNotes').value = '';
    document.getElementById('scheduleCourse').value = '1';
    document.getElementById('scheduleDayOfWeek').value = '1';
    document.getElementById('scheduleLessonType').value = 'lecture';
    document.getElementById('scheduleWeekParity').value = 'all';
    document.getElementById('scheduleSemester').value = getDefaultSemester();
    document.getElementById('scheduleAcademicYear').value = getDefaultAcademicYear();
    document.getElementById('scheduleIsActive').checked = true;
    document.getElementById('scheduleModalTitle').textContent = 'Добавить занятие';
}

async function openScheduleModal(entry) {
    resetScheduleForm();
    await fillScheduleUniversitySelects(entry?.universityId || document.getElementById('scheduleUniversityFilter')?.value);

    const universityId = entry?.universityId
        || document.getElementById('scheduleUniversityFilter')?.value
        || document.getElementById('scheduleUniversityId')?.options?.[0]?.value;
    const facultySelect = document.getElementById('scheduleFacultyId');
    await fillScheduleFacultySelect(universityId, facultySelect, entry?.facultyId);

    if (entry) {
        document.getElementById('scheduleId').value = entry.id;
        document.getElementById('scheduleUniversityId').value = String(entry.universityId);
        await fillScheduleFacultySelect(entry.universityId, facultySelect, entry.facultyId);
        document.getElementById('scheduleCourse').value = String(entry.course);
        document.getElementById('scheduleGroupName').value = entry.groupName || '';
        document.getElementById('scheduleAcademicYear').value = entry.academicYear || getDefaultAcademicYear();
        document.getElementById('scheduleSemester').value = entry.semester || getDefaultSemester();
        document.getElementById('scheduleDayOfWeek').value = String(entry.dayOfWeek);
        document.getElementById('scheduleLessonNumber').value = entry.lessonNumber || '';
        document.getElementById('scheduleTimeStart').value = entry.timeStart || '';
        document.getElementById('scheduleTimeEnd').value = entry.timeEnd || '';
        document.getElementById('scheduleSubjectName').value = entry.subjectName || '';
        document.getElementById('scheduleTeacher').value = entry.teacher || '';
        document.getElementById('scheduleRoom').value = entry.room || '';
        document.getElementById('scheduleLessonType').value = entry.lessonType || 'lecture';
        document.getElementById('scheduleWeekParity').value = entry.weekParity || 'all';
        document.getElementById('scheduleNotes').value = entry.notes || '';
        document.getElementById('scheduleIsActive').checked = entry.isActive !== false;
        document.getElementById('scheduleModalTitle').textContent = 'Редактировать занятие';
    } else {
        const filterCourse = document.getElementById('scheduleCourseFilter')?.value;
        if (filterCourse) document.getElementById('scheduleCourse').value = filterCourse;
        const filterGroup = document.getElementById('scheduleGroupFilter')?.value;
        if (filterGroup) document.getElementById('scheduleGroupName').value = filterGroup;
        const filterYear = document.getElementById('scheduleYearFilter')?.value;
        if (filterYear) document.getElementById('scheduleAcademicYear').value = filterYear;
        const filterSemester = document.getElementById('scheduleSemesterFilter')?.value;
        if (filterSemester) document.getElementById('scheduleSemester').value = filterSemester;
    }

    document.getElementById('scheduleModal').style.display = 'block';
}

async function editScheduleEntry(entryId) {
    try {
        let entry = (window.__adminScheduleCache || []).find((e) => Number(e.id) === Number(entryId));
        if (!entry) {
            const response = await fetch(`${ADMIN_API_URL}/schedule/${entryId}`, {
                headers: adminAuthHeaders()
            });
            if (!response.ok) throw new Error();
            entry = await response.json();
        }
        await openScheduleModal(entry);
    } catch (error) {
        console.error('Ошибка загрузки занятия:', error);
        showNotification('Не удалось загрузить занятие', 'error');
    }
}

async function deleteScheduleEntry(entryId) {
    if (!confirm('Удалить это занятие из расписания?')) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/schedule/${entryId}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || 'Ошибка удаления');
        }
        showNotification('Занятие удалено', 'success');
        loadScheduleAdmin();
    } catch (error) {
        console.error('Ошибка удаления занятия:', error);
        showNotification(error.message || 'Ошибка удаления', 'error');
    }
}

async function saveScheduleEntry(e) {
    e.preventDefault();

    const id = document.getElementById('scheduleId').value;
    const payload = {
        universityId: parseInt(document.getElementById('scheduleUniversityId').value, 10),
        facultyId: parseInt(document.getElementById('scheduleFacultyId').value, 10),
        course: parseInt(document.getElementById('scheduleCourse').value, 10),
        groupName: document.getElementById('scheduleGroupName').value.trim(),
        academicYear: document.getElementById('scheduleAcademicYear').value.trim(),
        semester: document.getElementById('scheduleSemester').value,
        dayOfWeek: parseInt(document.getElementById('scheduleDayOfWeek').value, 10),
        lessonNumber: document.getElementById('scheduleLessonNumber').value,
        timeStart: document.getElementById('scheduleTimeStart').value,
        timeEnd: document.getElementById('scheduleTimeEnd').value,
        subjectName: document.getElementById('scheduleSubjectName').value.trim(),
        teacher: document.getElementById('scheduleTeacher').value.trim(),
        room: document.getElementById('scheduleRoom').value.trim(),
        lessonType: document.getElementById('scheduleLessonType').value,
        weekParity: document.getElementById('scheduleWeekParity').value,
        notes: document.getElementById('scheduleNotes').value.trim(),
        isActive: document.getElementById('scheduleIsActive').checked
    };

    if (!payload.universityId || !payload.facultyId || !payload.subjectName || !payload.academicYear) {
        showNotification('Заполните университет, факультет, предмет и учебный год', 'error');
        return;
    }

    try {
        const url = id ? `${ADMIN_API_URL}/schedule/${id}` : `${ADMIN_API_URL}/schedule`;
        const method = id ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            const errMsg = result.error
                || (Array.isArray(result.errors) ? result.errors.map((x) => x.msg).join(', ') : null)
                || 'Ошибка сохранения';
            throw new Error(errMsg);
        }

        showNotification(id ? 'Занятие обновлено' : 'Занятие добавлено', 'success');
        document.getElementById('scheduleModal').style.display = 'none';
        loadScheduleAdmin();
    } catch (error) {
        console.error('Ошибка сохранения занятия:', error);
        showNotification(error.message || 'Ошибка сохранения', 'error');
    }
}

function setupScheduleEventListeners() {
    const addBtn = document.getElementById('addScheduleBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openScheduleModal());
    }

    const form = document.getElementById('scheduleForm');
    if (form) {
        form.addEventListener('submit', saveScheduleEntry);
    }

    const applyBtn = document.getElementById('scheduleApplyFiltersBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', loadScheduleAdmin);
    }

    const uniFilter = document.getElementById('scheduleUniversityFilter');
    if (uniFilter) {
        uniFilter.addEventListener('change', async () => {
            await fillScheduleFacultySelect(uniFilter.value, document.getElementById('scheduleFacultyFilter'));
            const groupFilter = document.getElementById('scheduleGroupFilter');
            if (groupFilter) groupFilter.value = '';
            await fillScheduleGroupFilter('');
        });
    }

    const facultyFilter = document.getElementById('scheduleFacultyFilter');
    if (facultyFilter) {
        facultyFilter.addEventListener('change', async () => {
            const groupFilter = document.getElementById('scheduleGroupFilter');
            if (groupFilter) groupFilter.value = '';
            await fillScheduleGroupFilter('');
        });
    }

    const courseFilter = document.getElementById('scheduleCourseFilter');
    if (courseFilter) {
        courseFilter.addEventListener('change', async () => {
            const groupFilter = document.getElementById('scheduleGroupFilter');
            if (groupFilter) groupFilter.value = '';
            await fillScheduleGroupFilter('');
        });
    }

    const groupFilter = document.getElementById('scheduleGroupFilter');
    if (groupFilter) {
        groupFilter.addEventListener('change', loadScheduleAdmin);
    }

    const kgmaFaculty = document.getElementById('kgmaFacultyFilter');
    if (kgmaFaculty) {
        kgmaFaculty.addEventListener('change', async () => {
            await fillKgmaCourseGroupFilters();
        });
    }
    const kgmaCourse = document.getElementById('kgmaCourseFilter');
    if (kgmaCourse) {
        kgmaCourse.addEventListener('change', fillKgmaGroupFilter);
    }
    const kgmaViewBtn = document.getElementById('kgmaViewBtn');
    if (kgmaViewBtn) kgmaViewBtn.addEventListener('click', viewKgmaScheduleAdmin);
    const kgmaImportBtn = document.getElementById('kgmaImportBtn');
    if (kgmaImportBtn) kgmaImportBtn.addEventListener('click', importKgmaScheduleAdmin);
    const kgmaSyncAllBtn = document.getElementById('kgmaSyncAllBtn');
    if (kgmaSyncAllBtn) kgmaSyncAllBtn.addEventListener('click', syncAllKgmaSchedulesAdmin);

    const uniModal = document.getElementById('scheduleUniversityId');
    if (uniModal) {
        uniModal.addEventListener('change', async () => {
            await fillScheduleFacultySelect(uniModal.value, document.getElementById('scheduleFacultyId'));
        });
    }
}

// Загрузка новостей в админке
async function loadNewsAdmin() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/news`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки новостей');
        }

        const news = await response.json();
        const newsList = document.getElementById('newsAdminList');

        if (news && news.length > 0) {
            newsList.innerHTML = news.map(item => {
                const date = item.publishedAt || item.createdAt;
                return `
                    <div class="admin-list-item">
                        <div style="flex: 1;">
                            <h4>${item.icon || '📰'} ${item.title}</h4>
                            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                                Категория: ${item.category || 'Обновления'} | ${item.isPublished ? 'Опубликовано' : 'Черновик'} | 
                                ${date ? new Date(date).toLocaleString('ru-RU') : 'Без даты'}
                            </p>
                            <p style="color: var(--text-muted); margin-top: 0.5rem;">
                                ${item.content}
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-primary btn-sm" onclick="editNews(${item.id})">Редактировать</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteNews(${item.id})">Удалить</button>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            newsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Новостей пока нет</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки новостей:', error);
        showNotification('Ошибка загрузки новостей', 'error');
    }
}

// Удаление новости
async function deleteNews(newsId) {
    if (!confirm('Вы уверены, что хотите удалить эту новость?')) {
        return;
    }

    try {
        const response = await fetch(`${ADMIN_API_URL}/news/${newsId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (response.ok) {
            showNotification('Новость удалена', 'success');
            loadNewsAdmin();
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления новости:', error);
        showNotification('Ошибка удаления новости', 'error');
    }
}

// Редактирование предмета
async function editSubject(subjectId) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/subjects/${subjectId}`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) {
            throw new Error('Предмет не найден');
        }
        const subject = await response.json();

        if (subject) {
            const programType = subject.programType === 'usmle' ? 'usmle' : 'university';
            const programEl = document.getElementById('subjectProgramType');
            if (programEl) programEl.value = programType;
            await fillSubjectUniversitySelect(subject.universityId);
            toggleSubjectUniversityField();
            document.getElementById('subjectId').value = subject.id;
            document.getElementById('subjectName').value = subject.name;
            document.getElementById('subjectDescription').value = subject.description || '';
            const stepSel = document.getElementById('subjectStepGroupSelect');
            if (stepSel) stepSel.value = subject.stepGroup || 'step1';
            const facultyIds = (subject.Faculties || []).map((f) => f.id);
            await fillSubjectFacultyCheckboxes(subject.universityId, facultyIds);
            setSubjectCourseCheckboxes(subject.courses?.length ? subject.courses : [1]);
            document.getElementById('subjectModalTitle').textContent = 'Редактировать предмет';
            document.getElementById('subjectModal').style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка загрузки предмета:', error);
        showNotification('Ошибка загрузки предмета', 'error');
    }
}

function toggleSubjectUniversityField() {
    const program = document.getElementById('subjectProgramType')?.value;
    const group = document.getElementById('subjectUniversityGroup');
    const select = document.getElementById('subjectUniversityId');
    const stepGroup = document.getElementById('subjectStepGroup');
    const facultiesGroup = document.getElementById('subjectFacultiesGroup');
    const coursesGroup = document.getElementById('subjectCoursesGroup');
    if (!group) return;
    const isUsmle = program === 'usmle';
    group.style.display = isUsmle ? 'none' : '';
    if (stepGroup) stepGroup.style.display = isUsmle ? '' : 'none';
    if (facultiesGroup) facultiesGroup.style.display = isUsmle ? 'none' : '';
    if (coursesGroup) coursesGroup.style.display = isUsmle ? 'none' : '';
    if (select) select.required = !isUsmle;
    if (!isUsmle && select?.value) {
        fillSubjectFacultyCheckboxes(select.value, getSelectedSubjectFacultyIds());
    }
}

function fillTestSubjectOptions(subjects, selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Выберите предмет</option>' +
        subjects.map(s => {
            const isUsmle = s.programType === 'usmle';
            const tag = isUsmle ? 'USMLE' : (s.University?.shortName || '');
            return `<option value="${s.id}" data-university-id="${s.universityId || ''}" data-program-type="${isUsmle ? 'usmle' : 'university'}">${s.name}${tag ? ` (${tag})` : ''}</option>`;
        }).join('');
}

function syncTestFormProgramFromSubject() {
    const subjectSelect = document.getElementById('testSubjectId');
    const opt = subjectSelect?.selectedOptions?.[0];
    const isUsmle = opt?.getAttribute('data-program-type') === 'usmle';
    const uniSelect = document.getElementById('testUniversityId');
    const uniGroup = document.getElementById('testUniversityGroup');
    const hint = document.getElementById('testUniversityHint');
    if (uniSelect) {
        uniSelect.required = !isUsmle;
        if (isUsmle) {
            uniSelect.value = '';
        } else if (!uniSelect.value && opt?.getAttribute('data-university-id')) {
            uniSelect.value = opt.getAttribute('data-university-id');
        }
    }
    if (hint) hint.style.display = isUsmle ? 'block' : 'none';
    if (uniGroup && uniSelect) {
        uniSelect.disabled = isUsmle;
    }
}

function bindTestSubjectProgramSync(subjectSelect) {
    if (!subjectSelect || subjectSelect.dataset.boundProgramSync) return;
    subjectSelect.dataset.boundProgramSync = '1';
    subjectSelect.addEventListener('change', syncTestFormProgramFromSubject);
}

// Редактирование теста
async function editTest(testId) {
    try {
        const [subjects, universities, testResponse] = await Promise.all([
            fetchAdminSubjectsCompact(),
            fetchAdminUniversitiesCompact(),
            fetch(`${ADMIN_API_URL}/tests/${testId}`, { headers: adminAuthHeaders() })
        ]);
        const subjectSelect = document.getElementById('testSubjectId');
        fillTestSubjectOptions(subjects, subjectSelect);
        bindTestSubjectProgramSync(subjectSelect);
        const universitySelect = document.getElementById('testUniversityId');
        if (universitySelect) {
            universitySelect.innerHTML = '<option value="">Выберите университет</option>' +
                universities.map(u => `<option value="${u.id}">${u.shortName} — ${u.name}</option>`).join('');
            if (!universitySelect.dataset.boundSubjectFilter) {
                universitySelect.dataset.boundSubjectFilter = '1';
                universitySelect.addEventListener('change', () => filterTestSubjectsByUniversity());
            }
        }

        if (!testResponse.ok) {
            throw new Error('Тест не найден');
        }
        const test = await testResponse.json();

        if (test) {
            document.getElementById('testId').value = test.id;
            document.getElementById('testName').value = test.name;
            document.getElementById('testDescription').value = test.description || '';
            if (universitySelect) universitySelect.value = test.universityId || '';
            filterTestSubjectsByUniversity();
            document.getElementById('testSubjectId').value = test.subjectId;
            syncTestFormProgramFromSubject();
            document.getElementById('testIsFree').checked = test.isFree || false;
            const testHasExplEl = document.getElementById('testHasExplanations');
            if (testHasExplEl) testHasExplEl.checked = !!test.hasExplanations;
            document.getElementById('testModalTitle').textContent = 'Редактировать тест';
            document.getElementById('testModal').style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка загрузки теста:', error);
        showNotification('Ошибка загрузки теста', 'error');
    }
}

async function populateQuestionTestSelect(selectedTestId) {
    const select = document.getElementById('questionTestId');
    if (!select) return;

    const tests = await fetchAdminTestsCompact();
    select.innerHTML = '<option value="">Выберите тест</option>' +
        tests.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

    if (selectedTestId != null && selectedTestId !== '') {
        select.value = String(selectedTestId);
        const editingId = document.getElementById('questionId')?.value;
        if (!editingId) {
            await applyQuestionExplanationForTestId(selectedTestId);
        }
    }
}

async function applyQuestionExplanationForTestId(testId) {
    if (!testId || typeof setQuestionExplanationFormState !== 'function') return;
    try {
        const tests = await fetchAdminTestsCompact();
        const test = tests.find((t) => String(t.id) === String(testId));
        if (test) {
            setQuestionExplanationFormState({ testHasExplanations: test.hasExplanations });
        }
    } catch (error) {
        console.warn('Не удалось загрузить флаг объяснений теста:', error);
    }
}

// Редактирование вопроса
async function fillQuestionTagsSelect(selectedIds = []) {
    const select = document.getElementById('questionTagIds');
    if (!select) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/question-tags`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error('tags');
        const tags = await response.json();
        const selected = new Set((selectedIds || []).map(Number));
        select.innerHTML = (tags || []).map((t) =>
            `<option value="${t.id}" ${selected.has(t.id) ? 'selected' : ''}>${t.name}</option>`
        ).join('');
    } catch (e) {
        console.error('fillQuestionTagsSelect', e);
        select.innerHTML = '';
    }
}

async function editQuestion(questionId) {
    try {
        const questionResponse = await fetch(`${ADMIN_API_URL}/questions/${questionId}`, {
            headers: adminAuthHeaders()
        });
        if (!questionResponse.ok) {
            throw new Error('Ошибка загрузки вопроса');
        }
        const question = await questionResponse.json();

        if (question) {
            await populateQuestionTestSelect(question.testId ?? question.Test?.id);
            await fillQuestionTagsSelect((question.Tags || []).map((t) => t.id));

            document.getElementById('questionId').value = question.id;
            document.getElementById('questionText').value = question.text;
            if (typeof setQuestionExplanationFormState === 'function') {
                setQuestionExplanationFormState({
                    testHasExplanations: question.Test?.hasExplanations,
                    explanation: question.explanation,
                    explanationImageUrl: question.explanationImageUrl
                });
            }
            if (typeof showQuestionImagePreview === 'function') {
                showQuestionImagePreview(question.imageUrl || null);
            }
            
            // Заполняем ответы
            const answersList = document.getElementById('answersList');
            answersList.innerHTML = question.Answers.map((answer, index) => `
                <div class="answer-item-admin" style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius);">
                    <div class="form-group">
                        <input type="hidden" class="answer-id" value="${answer.id}">
                        <input type="text" class="answer-text" value="${escapeAdminHtml(answer.text)}" placeholder="Текст ответа" required>
                    </div>
                    <div class="form-group checkbox-group">
                        <label>
                            <input type="checkbox" class="answer-correct" ${answer.isCorrect ? 'checked' : ''}>
                            <span>Правильный ответ</span>
                        </label>
                    </div>
                    <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.answer-item-admin').remove()">Удалить</button>
                </div>
            `).join('');
            
            document.getElementById('questionModalTitle').textContent = 'Редактировать вопрос';
            document.getElementById('questionModal').style.display = 'block';
        } else {
            showNotification('Вопрос не найден', 'error');
        }
    } catch (error) {
        console.error('Ошибка загрузки вопроса:', error);
        showNotification('Ошибка загрузки вопроса', 'error');
    }
}

// Редактирование новости
async function editNews(newsId) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/news`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });
        const news = await response.json();
        const item = news.find(n => n.id === newsId);

        if (item) {
            document.getElementById('newsId').value = item.id;
            document.getElementById('newsTitle').value = item.title || '';
            document.getElementById('newsCategory').value = item.category || 'Обновления';
            document.getElementById('newsIcon').value = item.icon || '📰';
            document.getElementById('newsPublishedAt').value = toDateTimeLocalValue(item.publishedAt);
            document.getElementById('newsIsPublished').checked = item.isPublished !== false;
            document.getElementById('newsContent').value = item.content || '';
            document.getElementById('newsModalTitle').textContent = 'Редактировать новость';
            document.getElementById('newsModal').style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка загрузки новости:', error);
        showNotification('Ошибка загрузки новости', 'error');
    }
}

// Сохранение предмета
async function saveSubject(e) {
    e.preventDefault();
    const id = document.getElementById('subjectId').value;
    const name = document.getElementById('subjectName').value;
    const description = document.getElementById('subjectDescription').value;
    const programType = document.getElementById('subjectProgramType')?.value === 'usmle' ? 'usmle' : 'university';
    const universityIdRaw = document.getElementById('subjectUniversityId').value;
    const universityId = universityIdRaw ? parseInt(universityIdRaw, 10) : null;

    if (programType === 'university' && !universityId) {
        showNotification('Выберите университет', 'error');
        return;
    }

    try {
        const url = id ? `${ADMIN_API_URL}/subjects/${id}` : `${ADMIN_API_URL}/subjects`;
        const method = id ? 'PUT' : 'POST';
        const stepGroup = document.getElementById('subjectStepGroupSelect')?.value || 'step1';
        const payload = { name, description, programType };
        if (programType === 'university') {
            payload.universityId = universityId;
            payload.facultyIds = getSelectedSubjectFacultyIds();
            payload.courses = getSelectedSubjectCourses();
        }
        if (programType === 'usmle') payload.stepGroup = stepGroup;

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            invalidateAdminListCache();
            showNotification(id ? 'Предмет обновлен' : 'Предмет создан', 'success');
            document.getElementById('subjectModal').style.display = 'none';
            document.getElementById('subjectForm').reset();
            loadSubjects();
            if (document.getElementById('usmleTab')?.classList.contains('active')) {
                loadUsmleAdminPanel();
            }
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения предмета:', error);
        showNotification('Ошибка сохранения предмета', 'error');
    }
}

// Сохранение теста
async function saveTest(e) {
    e.preventDefault();
    const id = document.getElementById('testId').value;
    const name = document.getElementById('testName').value;
    const description = document.getElementById('testDescription').value;
    const subjectId = parseInt(document.getElementById('testSubjectId').value);
    const subjectOpt = document.getElementById('testSubjectId')?.selectedOptions?.[0];
    const isUsmle = subjectOpt?.getAttribute('data-program-type') === 'usmle';
    const universityRaw = document.getElementById('testUniversityId')?.value || '';
    const universityId = universityRaw ? parseInt(universityRaw, 10) : null;
    const isFree = document.getElementById('testIsFree').checked;
    const hasExplanations = document.getElementById('testHasExplanations')?.checked || false;

    if (!subjectId) {
        showNotification('Выберите предмет', 'error');
        return;
    }
    if (!isUsmle && !universityId) {
        showNotification('Выберите университет', 'error');
        return;
    }

    try {
        const url = id ? `${ADMIN_API_URL}/tests/${id}` : `${ADMIN_API_URL}/tests`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({
                name,
                description,
                subjectId,
                universityId: isUsmle ? null : universityId,
                isFree,
                hasExplanations
            })
        });

        if (response.ok) {
            invalidateAdminListCache();
            showNotification(id ? 'Тест обновлен' : 'Тест создан', 'success');
            document.getElementById('testModal').style.display = 'none';
            document.getElementById('testForm').reset();
            loadTests();
            if (document.getElementById('usmleTab')?.classList.contains('active')) {
                loadUsmleAdminPanel();
            }
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения теста:', error);
        showNotification('Ошибка сохранения теста', 'error');
    }
}

// Сохранение вопроса
async function saveQuestion(e) {
    e.preventDefault();
    const id = document.getElementById('questionId').value;
    const text = document.getElementById('questionText').value;
    const withExplanations = document.getElementById('questionTestWithExplanations')?.checked || false;
    const explanation = withExplanations
        ? (document.getElementById('questionExplanation')?.value?.trim() || '')
        : '';
    const testId = parseInt(document.getElementById('questionTestId').value);
    
    const answerItems = document.querySelectorAll('.answer-item-admin');
    const answers = Array.from(answerItems).map(item => {
        const answer = {
            text: item.querySelector('.answer-text').value,
            isCorrect: item.querySelector('.answer-correct').checked
        };
        const answerId = item.querySelector('.answer-id')?.value;
        if (answerId) {
            answer.id = parseInt(answerId, 10);
        }
        return answer;
    });

    if (answers.length < 2) {
        showNotification('Должно быть минимум 2 ответа', 'error');
        return;
    }

    if (!answers.some(a => a.isCorrect)) {
        showNotification('Должен быть хотя бы один правильный ответ', 'error');
        return;
    }

    try {
        const url = id ? `${ADMIN_API_URL}/questions/${id}` : `${ADMIN_API_URL}/questions`;
        const method = id ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({
                text,
                testId,
                answers,
                explanation: withExplanations && explanation ? explanation : null,
                setTestWithExplanations: withExplanations,
                tagIds: Array.from(document.getElementById('questionTagIds')?.selectedOptions || []).map((o) => parseInt(o.value, 10))
            })
        });

        if (response.ok) {
            const saved = await response.json();
            const questionId = id || saved.id;
            let imageWarning = '';
            const imgOpts = { apiBase: ADMIN_API_URL, getAuthHeaders: adminAuthHeaders };
            if (questionId && typeof syncQuestionImageAfterSave === 'function') {
                const imgResult = await syncQuestionImageAfterSave(questionId, imgOpts);
                if (!imgResult.ok) imageWarning = imgResult.error || 'Ошибка изображения вопроса';
            }
            if (questionId && typeof syncExplanationImageAfterSave === 'function') {
                const explImg = await syncExplanationImageAfterSave(questionId, imgOpts);
                if (!explImg.ok) {
                    imageWarning = imageWarning
                        ? `${imageWarning}; ${explImg.error}`
                        : (explImg.error || 'Ошибка картинки объяснения');
                }
            }
            if (imageWarning) {
                showNotification(`${id ? 'Вопрос обновлен' : 'Вопрос создан'}, но: ${imageWarning}`, 'error');
            } else {
                showNotification(id ? 'Вопрос обновлен' : 'Вопрос создан', 'success');
            }
            document.getElementById('questionModal').style.display = 'none';
            document.getElementById('questionForm').reset();
            if (typeof resetQuestionImageUI === 'function') resetQuestionImageUI();
            if (typeof resetQuestionExplanationForm === 'function') resetQuestionExplanationForm();
            loadQuestions();
            if (document.getElementById('usmleTab')?.classList.contains('active')) {
                loadUsmleTestsAdmin().then(() => loadUsmleQuestionsAdmin());
            }
        } else {
            const result = await response.json();
            const validationError = result.errors?.[0]?.msg;
            showNotification(validationError || result.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения вопроса:', error);
        showNotification('Ошибка сохранения вопроса', 'error');
    }
}

// Сохранение новости
async function saveNews(e) {
    e.preventDefault();

    const id = document.getElementById('newsId').value;
    const title = document.getElementById('newsTitle').value.trim();
    const category = document.getElementById('newsCategory').value.trim() || 'Обновления';
    const icon = document.getElementById('newsIcon').value.trim() || '📰';
    const publishedAtValue = document.getElementById('newsPublishedAt').value;
    const isPublished = document.getElementById('newsIsPublished').checked;
    const content = document.getElementById('newsContent').value.trim();

    if (!title || !content) {
        showNotification('Заполните заголовок и текст новости', 'error');
        return;
    }

    try {
        const url = id ? `${ADMIN_API_URL}/news/${id}` : `${ADMIN_API_URL}/news`;
        const method = id ? 'PUT' : 'POST';
        const payload = {
            title,
            content,
            category,
            icon,
            isPublished,
            publishedAt: publishedAtValue ? new Date(publishedAtValue).toISOString() : null
        };

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showNotification(id ? 'Новость обновлена' : 'Новость создана', 'success');
            document.getElementById('newsModal').style.display = 'none';
            document.getElementById('newsForm').reset();
            document.getElementById('newsIsPublished').checked = true;
            loadNewsAdmin();
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения новости:', error);
        showNotification('Ошибка сохранения новости', 'error');
    }
}

// Добавление ответа в форму вопроса
function addAnswer() {
    const answersList = document.getElementById('answersList');
    const answerItem = document.createElement('div');
    answerItem.className = 'answer-item-admin';
    answerItem.style.cssText = 'margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius);';
    answerItem.innerHTML = `
        <div class="form-group">
            <input type="text" class="answer-text" placeholder="Текст ответа" required>
        </div>
        <div class="form-group checkbox-group">
            <label>
                <input type="checkbox" class="answer-correct">
                <span>Правильный ответ</span>
            </label>
        </div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.answer-item-admin').remove()">Удалить</button>
    `;
    answersList.appendChild(answerItem);
}

// Настройка обработчиков событий
let eventListenersSetup = false; // Флаг для предотвращения двойной инициализации

function setupAdminEventListeners() {
    if (typeof initQuestionImageForm === 'function') {
        initQuestionImageForm();
    }
    // Предотвращаем двойную инициализацию
    if (eventListenersSetup) {
        console.log('Обработчики событий уже настроены, пропускаем...');
        return;
    }
    eventListenersSetup = true;
    
    // Вход - привязываем обработчик с максимальным приоритетом
    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        // Удаляем все предыдущие обработчики, если есть
        const newForm = adminLoginForm.cloneNode(true);
        adminLoginForm.parentNode.replaceChild(newForm, adminLoginForm);
        
        // Привязываем обработчик с максимальным приоритетом
        // Используем capture phase (true) для выполнения первым
        newForm.addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopImmediatePropagation(); // Останавливаем все другие обработчики
            e.stopPropagation(); // Останавливаем всплытие события
            console.log('admin.js: Обработчик формы админки вызван');
            handleAdminLogin(e);
        }, true); // useCapture = true для приоритета
        
        // Также добавляем обработчик в bubble phase для надежности
        newForm.addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            console.log('admin.js: Резервный обработчик формы админки вызван');
            handleAdminLogin(e);
        }, false);
        
        console.log('✅ Обработчик формы админки привязан к:', newForm.id);
    } else {
        console.warn('⚠️ Форма adminLoginForm не найдена');
    }

    // Выход
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', adminLogout);
    }

    // Тема
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // Табы
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // Кнопки добавления
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    if (addSubjectBtn) {
        addSubjectBtn.addEventListener('click', async () => {
            document.getElementById('subjectId').value = '';
            document.getElementById('subjectName').value = '';
            document.getElementById('subjectDescription').value = '';
            const programEl = document.getElementById('subjectProgramType');
            if (programEl) programEl.value = 'university';
            try {
                await fillSubjectUniversitySelect();
            } catch (e) {
                console.error(e);
            }
            toggleSubjectUniversityField();
            await fillSubjectFacultyCheckboxes(document.getElementById('subjectUniversityId')?.value || '', []);
            setSubjectCourseCheckboxes([1]);
            document.getElementById('subjectModalTitle').textContent = 'Добавить предмет';
            document.getElementById('subjectModal').style.display = 'block';
        });
    }

    const subjectProgramType = document.getElementById('subjectProgramType');
    if (subjectProgramType) {
        subjectProgramType.addEventListener('change', toggleSubjectUniversityField);
    }

    const subjectUniversityId = document.getElementById('subjectUniversityId');
    if (subjectUniversityId) {
        subjectUniversityId.addEventListener('change', () => {
            fillSubjectFacultyCheckboxes(subjectUniversityId.value, []);
        });
    }

    const addTestBtn = document.getElementById('addTestBtn');
    if (addTestBtn) {
        addTestBtn.addEventListener('click', async () => {
            // Загружаем предметы и университеты для выбора
            try {
                const [subjects, universities] = await Promise.all([
                    fetchAdminSubjectsCompact(),
                    fetchAdminUniversitiesCompact()
                ]);
                const select = document.getElementById('testSubjectId');
                fillTestSubjectOptions(subjects, select);
                bindTestSubjectProgramSync(select);
                const uniSelect = document.getElementById('testUniversityId');
                if (uniSelect) {
                    uniSelect.disabled = false;
                    uniSelect.innerHTML = '<option value="">Выберите университет</option>' +
                        universities.map(u => `<option value="${u.id}">${u.shortName} — ${u.name}</option>`).join('');
                    if (!uniSelect.dataset.boundSubjectFilter) {
                        uniSelect.dataset.boundSubjectFilter = '1';
                        uniSelect.addEventListener('change', () => filterTestSubjectsByUniversity());
                    }
                }
            } catch (error) {
                console.error('Ошибка загрузки предметов:', error);
            }

            document.getElementById('testId').value = '';
            document.getElementById('testName').value = '';
            document.getElementById('testDescription').value = '';
            document.getElementById('testModalTitle').textContent = 'Добавить тест';
            syncTestFormProgramFromSubject();
            document.getElementById('testModal').style.display = 'block';
        });
    }

    const addUsmleSubjectBtn = document.getElementById('addUsmleSubjectBtn');
    if (addUsmleSubjectBtn) {
        addUsmleSubjectBtn.addEventListener('click', async () => {
            document.getElementById('subjectId').value = '';
            document.getElementById('subjectName').value = '';
            document.getElementById('subjectDescription').value = '';
            const programEl = document.getElementById('subjectProgramType');
            if (programEl) programEl.value = 'usmle';
            try {
                await fillSubjectUniversitySelect();
            } catch (e) {
                console.error(e);
            }
            toggleSubjectUniversityField();
            document.getElementById('subjectModalTitle').textContent = 'Добавить предмет USMLE';
            document.getElementById('subjectModal').style.display = 'block';
        });
    }

    const addUsmleTestBtn = document.getElementById('addUsmleTestBtn');
    if (addUsmleTestBtn) {
        addUsmleTestBtn.addEventListener('click', async () => {
            try {
                const subjects = await fetchAdminSubjectsCompact(true);
                const usmleSubjects = subjects.filter(s => s.programType === 'usmle');
                const select = document.getElementById('testSubjectId');
                fillTestSubjectOptions(usmleSubjects, select);
                bindTestSubjectProgramSync(select);
                const preferredSubject = document.getElementById('usmleTestsSubjectFilter')?.value || '';
                if (preferredSubject && select) select.value = preferredSubject;
                const uniSelect = document.getElementById('testUniversityId');
                if (uniSelect) {
                    uniSelect.innerHTML = '<option value="">—</option>';
                    uniSelect.value = '';
                }
            } catch (error) {
                console.error('Ошибка загрузки предметов USMLE:', error);
            }
            document.getElementById('testId').value = '';
            document.getElementById('testName').value = '';
            document.getElementById('testDescription').value = '';
            document.getElementById('testModalTitle').textContent = 'Добавить тест USMLE';
            syncTestFormProgramFromSubject();
            document.getElementById('testModal').style.display = 'block';
        });
    }

    const addUsmleQuestionBtn = document.getElementById('addUsmleQuestionBtn');
    if (addUsmleQuestionBtn) {
        addUsmleQuestionBtn.addEventListener('click', () => openAddUsmleQuestionModal());
    }
    const uploadUsmleTxtExplainedBtn = document.getElementById('uploadUsmleTxtExplainedBtn');
    if (uploadUsmleTxtExplainedBtn) {
        uploadUsmleTxtExplainedBtn.addEventListener('click', () => openUsmleTxtExplainedUploadModal());
    }
    const uploadUsmleTxtLinkedBtn = document.getElementById('uploadUsmleTxtLinkedBtn');
    if (uploadUsmleTxtLinkedBtn) {
        uploadUsmleTxtLinkedBtn.addEventListener('click', () => openUsmleTxtLinkedUploadModal());
    }
    const addUsmleFlashcardBtn = document.getElementById('addUsmleFlashcardBtn');
    if (addUsmleFlashcardBtn) addUsmleFlashcardBtn.addEventListener('click', () => openAddUsmleFlashcardModal());
    const uploadUsmleTxtFlashcardsBtn = document.getElementById('uploadUsmleTxtFlashcardsBtn');
    if (uploadUsmleTxtFlashcardsBtn) {
        uploadUsmleTxtFlashcardsBtn.addEventListener('click', () => openUsmleTxtFlashcardsUploadModal());
    }
    const seedDemoFlashcardsBtn = document.getElementById('seedDemoFlashcardsBtn');
    if (seedDemoFlashcardsBtn) {
        seedDemoFlashcardsBtn.addEventListener('click', () => seedDemoUsmleFlashcards());
    }
    const addUsmleFlashcardWithImagesBtn = document.getElementById('addUsmleFlashcardWithImagesBtn');
    if (addUsmleFlashcardWithImagesBtn) {
        addUsmleFlashcardWithImagesBtn.addEventListener('click', () => openAddUsmleFlashcardWithImagesModal());
    }
    ['usmleFlashcardsTestFilter', 'usmleFlashcardsTagFilter', 'usmleFlashcardsStepFilter'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadUsmleFlashcardsAdmin());
    });
    const flashcardForm = document.getElementById('flashcardForm');
    if (flashcardForm && !flashcardForm.dataset.bound) {
        flashcardForm.dataset.bound = '1';
        flashcardForm.addEventListener('submit', saveFlashcardAdmin);
    }
    const flashcardPreviewBtn = document.getElementById('flashcardPreviewBtn');
    if (flashcardPreviewBtn) flashcardPreviewBtn.addEventListener('click', previewFlashcardAdmin);
    const flashcardImageForm = document.getElementById('flashcardImageForm');
    if (flashcardImageForm && !flashcardImageForm.dataset.bound) {
        flashcardImageForm.dataset.bound = '1';
        flashcardImageForm.addEventListener('submit', saveFlashcardWithImagesAdmin);
    }
    initFcImgFormControls();

    const addUniFlashcardBtn = document.getElementById('addUniFlashcardBtn');
    if (addUniFlashcardBtn) addUniFlashcardBtn.addEventListener('click', () => openAddUniFlashcardModal());
    const uniFlashcardForm = document.getElementById('uniFlashcardForm');
    if (uniFlashcardForm && !uniFlashcardForm.dataset.bound) {
        uniFlashcardForm.dataset.bound = '1';
        uniFlashcardForm.addEventListener('submit', saveUniFlashcardAdmin);
    }
    const uniFcUniversityFilter = document.getElementById('uniFcUniversityFilter');
    if (uniFcUniversityFilter) {
        uniFcUniversityFilter.addEventListener('change', async () => {
            await fillUniFcSubjects(uniFcUniversityFilter.value, '', 'uniFcSubjectFilter');
            await loadUniFlashcardsAdmin();
        });
    }
    const uniFcSubjectFilter = document.getElementById('uniFcSubjectFilter');
    if (uniFcSubjectFilter) {
        uniFcSubjectFilter.addEventListener('change', () => loadUniFlashcardsAdmin());
    }
    const uniFcUniversityId = document.getElementById('uniFcUniversityId');
    if (uniFcUniversityId) {
        uniFcUniversityId.addEventListener('change', () => {
            fillUniFcSubjects(uniFcUniversityId.value, '', 'uniFcSubjectId');
        });
    }

    const usmleTestsSubjectFilter = document.getElementById('usmleTestsSubjectFilter');
    if (usmleTestsSubjectFilter) {
        usmleTestsSubjectFilter.addEventListener('change', () => {
            loadUsmleTestsAdmin();
        });
    }
    const usmleQuestionsTestFilter = document.getElementById('usmleQuestionsTestFilter');
    if (usmleQuestionsTestFilter) {
        usmleQuestionsTestFilter.addEventListener('change', () => {
            loadUsmleQuestionsAdmin();
        });
    }

    const addUniversityBtn = document.getElementById('addUniversityBtn');
    if (addUniversityBtn) {
        addUniversityBtn.addEventListener('click', () => {
            document.getElementById('universityId').value = '';
            document.getElementById('universityForm').reset();
            document.getElementById('universityIsActive').checked = true;
            document.getElementById('universityModalTitle').textContent = 'Добавить университет';
            document.getElementById('universityModal').style.display = 'block';
        });
    }

    const universityForm = document.getElementById('universityForm');
    if (universityForm) {
        universityForm.addEventListener('submit', saveUniversity);
    }

    // Загрузка PDF
    const uploadPdfBtn = document.getElementById('uploadPdfBtn');
    if (uploadPdfBtn) {
        uploadPdfBtn.addEventListener('click', async () => {
            try {
                adminQuestionUploadSource = 'questions';
                const tests = await fetchAdminTestsCompact();
                const select = document.getElementById('pdfTestId');
                const presetTestId = document.getElementById('questionsTestFilter')?.value || '';
                select.innerHTML = '<option value="">Выберите тест</option>' +
                    tests.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                if (presetTestId) select.value = String(presetTestId);
                document.getElementById('pdfUploadModal').style.display = 'block';
            } catch (error) {
                console.error('Ошибка загрузки тестов:', error);
                showNotification('Ошибка загрузки тестов', 'error');
            }
        });
    }

    const uploadTxtExplainedPlainBtn = document.getElementById('uploadTxtExplainedPlainBtn');
    if (uploadTxtExplainedPlainBtn) {
        uploadTxtExplainedPlainBtn.addEventListener('click', () => openTxtExplainedPlainUploadModal());
    }

    const pdfUploadForm = document.getElementById('pdfUploadForm');
    if (pdfUploadForm) {
        pdfUploadForm.addEventListener('submit', handlePdfUpload);
    }

    const txtExplainedPlainUploadForm = document.getElementById('txtExplainedPlainUploadForm');
    if (txtExplainedPlainUploadForm) {
        txtExplainedPlainUploadForm.addEventListener('submit', handleTxtExplainedPlainUpload);
    }

    const txtExplainedUploadForm = document.getElementById('txtExplainedUploadForm');
    if (txtExplainedUploadForm) {
        txtExplainedUploadForm.addEventListener('submit', handleTxtExplainedUpload);
    }
    const txtLinkedUploadForm = document.getElementById('txtLinkedUploadForm');
    if (txtLinkedUploadForm) {
        txtLinkedUploadForm.addEventListener('submit', handleTxtLinkedUpload);
    }
    const txtFlashcardsUploadForm = document.getElementById('txtFlashcardsUploadForm');
    if (txtFlashcardsUploadForm) {
        txtFlashcardsUploadForm.addEventListener('submit', handleTxtFlashcardsUpload);
    }

    const addQuestionBtn = document.getElementById('addQuestionBtn');
    if (addQuestionBtn) {
        addQuestionBtn.addEventListener('click', async () => {
            const presetTestId = document.getElementById('questionsTestFilter')?.value || '';
            try {
                await populateQuestionTestSelect(presetTestId || undefined);
            } catch (error) {
                console.error('Ошибка загрузки тестов:', error);
                showNotification('Ошибка загрузки списка тестов', 'error');
            }

            document.getElementById('questionId').value = '';
            document.getElementById('questionText').value = '';
            if (typeof resetQuestionExplanationForm === 'function') resetQuestionExplanationForm();
            if (typeof resetQuestionImageUI === 'function') resetQuestionImageUI();
            if (presetTestId) await applyQuestionExplanationForTestId(presetTestId);
            document.getElementById('answersList').innerHTML = '';
            addAnswer(); // Добавляем первый ответ
            addAnswer(); // Добавляем второй ответ
            document.getElementById('questionModalTitle').textContent = 'Добавить вопрос';
            await fillQuestionTagsSelect([]);
            document.getElementById('questionModal').style.display = 'block';
        });
    }

    const questionTestIdSelect = document.getElementById('questionTestId');
    if (questionTestIdSelect && questionTestIdSelect.dataset.bound !== '1') {
        questionTestIdSelect.dataset.bound = '1';
        questionTestIdSelect.addEventListener('change', () => {
            applyQuestionExplanationForTestId(questionTestIdSelect.value);
        });
    }

    const addEditorBtn = document.getElementById('addEditorBtn');
    if (addEditorBtn) {
        addEditorBtn.addEventListener('click', () => {
            document.getElementById('editorId').value = '';
            document.getElementById('editorForm').reset();
            document.getElementById('editorIsActive').checked = true;
            openEditorModal(false);
        });
    }
    const editorForm = document.getElementById('editorForm');
    if (editorForm) {
        editorForm.addEventListener('submit', saveEditorAccount);
    }

    setupAuditEventListeners();
    setupScheduleEventListeners();

    const addNewsBtn = document.getElementById('addNewsBtn');
    if (addNewsBtn) {
        addNewsBtn.addEventListener('click', () => {
            document.getElementById('newsId').value = '';
            document.getElementById('newsTitle').value = '';
            document.getElementById('newsCategory').value = 'Обновления';
            document.getElementById('newsIcon').value = '📰';
            document.getElementById('newsPublishedAt').value = '';
            document.getElementById('newsIsPublished').checked = true;
            document.getElementById('newsContent').value = '';
            document.getElementById('newsModalTitle').textContent = 'Добавить новость';
            document.getElementById('newsModal').style.display = 'block';
        });
    }

    // Формы
    const subjectForm = document.getElementById('subjectForm');
    if (subjectForm) {
        subjectForm.addEventListener('submit', saveSubject);
    }

    const facultyForm = document.getElementById('facultyForm');
    if (facultyForm) {
        facultyForm.addEventListener('submit', saveFaculty);
    }
    const facultyFormResetBtn = document.getElementById('facultyFormResetBtn');
    if (facultyFormResetBtn) {
        facultyFormResetBtn.addEventListener('click', resetFacultyForm);
    }

    const testForm = document.getElementById('testForm');
    if (testForm) {
        testForm.addEventListener('submit', saveTest);
    }

    const questionForm = document.getElementById('questionForm');
    if (questionForm) {
        questionForm.addEventListener('submit', saveQuestion);
    }

    const newsForm = document.getElementById('newsForm');
    if (newsForm) {
        newsForm.addEventListener('submit', saveNews);
    }

    // pdfUploadForm уже обработан выше, не дублируем

    const addAnswerBtn = document.getElementById('addAnswerBtn');
    if (addAnswerBtn) {
        addAnswerBtn.addEventListener('click', addAnswer);
    }

    // Закрытие модальных окон
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (!modal) return;
            modal.style.display = 'none';
            if (modal.id === 'uploadPreviewModal') {
                refreshQuestionsAfterUpload();
            }
        });
    });

    // Поиск пользователей
    const usersSearch = document.getElementById('usersSearch');
    if (usersSearch) {
        let searchTimeout;
        usersSearch.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadUsers(1);
            }, 500);
        });
    }

    // Фильтры
    const testsSubjectFilter = document.getElementById('testsSubjectFilter');
    if (testsSubjectFilter) {
        testsSubjectFilter.addEventListener('change', () => {
            loadTests();
        });
    }
    const testsUniversityFilter = document.getElementById('testsUniversityFilter');
    if (testsUniversityFilter) {
        testsUniversityFilter.addEventListener('change', () => {
            loadSubjectsForFilters();
            loadTests();
        });
    }
    const testsProgramFilter = document.getElementById('testsProgramFilter');
    if (testsProgramFilter) {
        testsProgramFilter.addEventListener('change', () => {
            const program = testsProgramFilter.value;
            const uniFilter = document.getElementById('testsUniversityFilter');
            if (program === 'usmle' && uniFilter) uniFilter.value = '';
            loadSubjectsForFilters();
            loadTests();
        });
    }
    const subjectsUniversityFilter = document.getElementById('subjectsUniversityFilter');
    if (subjectsUniversityFilter) {
        subjectsUniversityFilter.addEventListener('change', async () => {
            await fillSubjectsFacultyFilter();
            loadSubjects();
        });
    }
    const subjectsProgramFilter = document.getElementById('subjectsProgramFilter');
    if (subjectsProgramFilter) {
        subjectsProgramFilter.addEventListener('change', async () => {
            const program = subjectsProgramFilter.value;
            const uniFilter = document.getElementById('subjectsUniversityFilter');
            if (program === 'usmle' && uniFilter) uniFilter.value = '';
            await fillSubjectsFacultyFilter();
            loadSubjects();
        });
    }
    const subjectsFacultyFilter = document.getElementById('subjectsFacultyFilter');
    if (subjectsFacultyFilter) {
        subjectsFacultyFilter.addEventListener('change', () => loadSubjects());
    }
    const subjectsCourseFilter = document.getElementById('subjectsCourseFilter');
    if (subjectsCourseFilter) {
        subjectsCourseFilter.addEventListener('change', () => loadSubjects());
    }
    const usersUniversityFilter = document.getElementById('usersUniversityFilter');
    if (usersUniversityFilter) {
        usersUniversityFilter.addEventListener('change', () => {
            loadUsers(1);
        });
    }
    const questionsProgramFilter = document.getElementById('questionsProgramFilter');
    if (questionsProgramFilter) {
        questionsProgramFilter.addEventListener('change', () => {
            const program = questionsProgramFilter.value;
            const uniFilter = document.getElementById('questionsUniversityFilter');
            if (program === 'usmle' && uniFilter) uniFilter.value = '';
            const testFilter = document.getElementById('questionsTestFilter');
            if (testFilter) testFilter.value = '';
            loadTestsForFilters();
            renderQuestionsSelectPrompt();
        });
    }
    const questionsUniversityFilter = document.getElementById('questionsUniversityFilter');
    if (questionsUniversityFilter) {
        questionsUniversityFilter.addEventListener('change', () => {
            const testFilter = document.getElementById('questionsTestFilter');
            if (testFilter) testFilter.value = '';
            loadTestsForFilters();
            renderQuestionsSelectPrompt();
        });
    }

    const questionsTestFilter = document.getElementById('questionsTestFilter');
    if (questionsTestFilter) {
        questionsTestFilter.addEventListener('change', () => {
            loadQuestionSearchSuggestions();
            loadQuestions();
        });
    }
    const questionsSearch = document.getElementById('questionsSearch');
    if (questionsSearch) {
        let questionsSearchTimeout;
        questionsSearch.addEventListener('input', () => {
            clearTimeout(questionsSearchTimeout);
            questionsSearchTimeout = setTimeout(() => {
                loadQuestionSearchSuggestions();
                loadQuestions();
            }, 400);
        });
    }

    // Фильтры и поиск для сообщений
    const messagesStatusFilter = document.getElementById('messagesStatusFilter');
    if (messagesStatusFilter) {
        messagesStatusFilter.addEventListener('change', () => {
            loadMessages(1);
        });
    }
    const messagesTypeFilter = document.getElementById('messagesTypeFilter');
    if (messagesTypeFilter) {
        messagesTypeFilter.addEventListener('change', () => {
            loadMessages(1);
        });
    }

    const messagesSearch = document.getElementById('messagesSearch');
    if (messagesSearch) {
        let searchTimeout;
        messagesSearch.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadMessages(1);
            }, 500);
        });
    }

    const deviceAlertsDateFilter = document.getElementById('deviceAlertsDateFilter');
    if (deviceAlertsDateFilter) {
        deviceAlertsDateFilter.addEventListener('change', renderDeviceAlerts);
    }

    const deviceAlertsLoginSearch = document.getElementById('deviceAlertsLoginSearch');
    if (deviceAlertsLoginSearch) {
        let deviceLoginSearchTimeout;
        deviceAlertsLoginSearch.addEventListener('input', () => {
            clearTimeout(deviceLoginSearchTimeout);
            deviceLoginSearchTimeout = setTimeout(() => {
                renderDeviceAlerts();
            }, 250);
        });
    }

    const clearDeviceAlertsDateFilter = document.getElementById('clearDeviceAlertsDateFilter');
    if (clearDeviceAlertsDateFilter) {
        clearDeviceAlertsDateFilter.addEventListener('click', () => {
            if (deviceAlertsDateFilter) {
                deviceAlertsDateFilter.value = '';
            }
            if (deviceAlertsLoginSearch) {
                deviceAlertsLoginSearch.value = '';
            }
            renderDeviceAlerts();
        });
    }

    // Кнопки в модальном окне сообщения
    const saveMessageStatusBtn = document.getElementById('saveMessageStatusBtn');
    if (saveMessageStatusBtn) {
        saveMessageStatusBtn.addEventListener('click', async () => {
            if (currentMessageId) {
                const status = document.getElementById('messageModalStatus').value;
                try {
                    const response = await fetch(`${ADMIN_API_URL}/contact-messages/${currentMessageId}/status`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${currentAdminToken}`
                        },
                        body: JSON.stringify({ status })
                    });

                    if (response.ok) {
                        showNotification('Статус обновлен', 'success');
                        loadMessages(currentMessagesPage);
                        loadDashboard();
                    } else {
                        const result = await response.json();
                        showNotification(result.error || 'Ошибка обновления', 'error');
                    }
                } catch (error) {
                    console.error('Ошибка обновления статуса:', error);
                    showNotification('Ошибка обновления статуса', 'error');
                }
            }
        });
    }

    const deleteMessageBtn = document.getElementById('deleteMessageBtn');
    if (deleteMessageBtn) {
        deleteMessageBtn.addEventListener('click', () => {
            if (currentMessageId) {
                deleteMessage(currentMessageId);
            }
        });
    }

    const saveDocsBtn = document.getElementById('saveDocsBtn');
    if (saveDocsBtn) {
        saveDocsBtn.addEventListener('click', saveDocumentsSettings);
    }

    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handleResetPassword);
    }
    const updateCoinsForm = document.getElementById('updateCoinsForm');
    if (updateCoinsForm) {
        updateCoinsForm.addEventListener('submit', handleUpdateCoins);
    }

    const promoForm = document.getElementById('promoForm');
    if (promoForm) {
        promoForm.addEventListener('submit', savePromoCode);
    }
    const promoResetBtn = document.getElementById('promoResetBtn');
    if (promoResetBtn) {
        promoResetBtn.addEventListener('click', resetPromoForm);
    }

    const subsAdminUniversity = document.getElementById('subsAdminUniversity');
    if (subsAdminUniversity) {
        subsAdminUniversity.addEventListener('change', fillSubscriptionPlansForm);
    }
    const subsAdminForm = document.getElementById('subsAdminForm');
    if (subsAdminForm) {
        subsAdminForm.addEventListener('submit', saveSubscriptionPlansAdmin);
    }
    const saveUsmlePlansBtn = document.getElementById('saveUsmlePlansBtn');
    if (saveUsmlePlansBtn) {
        saveUsmlePlansBtn.addEventListener('click', saveUsmlePlansAdmin);
    }
    const addQuestionTagBtn = document.getElementById('addQuestionTagBtn');
    if (addQuestionTagBtn) {
        addQuestionTagBtn.addEventListener('click', createQuestionTagAdmin);
    }
    const mergeQuestionTagsBtn = document.getElementById('mergeQuestionTagsBtn');
    if (mergeQuestionTagsBtn) {
        mergeQuestionTagsBtn.addEventListener('click', mergeQuestionTagsAdmin);
    }

    const adminChatForm = document.getElementById('adminChatForm');
    if (adminChatForm) {
        adminChatForm.addEventListener('submit', handleAdminChatSubmit);
    }
    const adminBroadcastForm = document.getElementById('adminBroadcastForm');
    if (adminBroadcastForm) {
        adminBroadcastForm.addEventListener('submit', handleAdminBroadcastSubmit);
    }

    document.querySelectorAll('.admin-analytics-period-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-analytics-period-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            analyticsPeriod = btn.dataset.period || '30d';
            const customRange = document.getElementById('analyticsCustomRange');
            if (customRange) {
                customRange.style.display = analyticsPeriod === 'custom' ? 'flex' : 'none';
            }
        });
    });
    const analyticsLoadBtn = document.getElementById('analyticsLoadBtn');
    if (analyticsLoadBtn) {
        analyticsLoadBtn.addEventListener('click', loadAdminAnalytics);
    }
    document.querySelectorAll('.admin-analytics-view-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            analyticsView = btn.dataset.view || 'all';
            applyAnalyticsView();
        });
    });
    const analyticsSearchIds = [
        'analyticsRegistrationsSearch',
        'analyticsRenewalsSearch',
        'analyticsExpiredSearch',
        'analyticsPaymentsSearch'
    ];
    analyticsSearchIds.forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', refreshAnalyticsTables);
        }
    });

    setupAdminChatUserPicker();

    const uploadOfferBtn = document.getElementById('uploadOfferBtn');
    const docPublicOfferFile = document.getElementById('docPublicOfferFile');
    if (uploadOfferBtn && docPublicOfferFile) {
        uploadOfferBtn.addEventListener('click', () => docPublicOfferFile.click());
        docPublicOfferFile.addEventListener('change', () => {
            if (docPublicOfferFile.files && docPublicOfferFile.files[0]) {
                uploadDocumentFile('offer', docPublicOfferFile.files[0], document.getElementById('docPublicOfferUrl'));
                docPublicOfferFile.value = '';
            }
        });
    }

    const uploadPrivacyBtn = document.getElementById('uploadPrivacyBtn');
    const docPrivacyPolicyFile = document.getElementById('docPrivacyPolicyFile');
    if (uploadPrivacyBtn && docPrivacyPolicyFile) {
        uploadPrivacyBtn.addEventListener('click', () => docPrivacyPolicyFile.click());
        docPrivacyPolicyFile.addEventListener('change', () => {
            if (docPrivacyPolicyFile.files && docPrivacyPolicyFile.files[0]) {
                uploadDocumentFile('privacy', docPrivacyPolicyFile.files[0], document.getElementById('docPrivacyPolicyUrl'));
                docPrivacyPolicyFile.value = '';
            }
        });
    }
}

// Загрузка и сохранение настроек документов (оферта, политика)
async function loadDocumentsSettings() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/settings/docs`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) return;
        const data = await response.json();
        const offerInput = document.getElementById('docPublicOfferUrl');
        const privacyInput = document.getElementById('docPrivacyPolicyUrl');
        if (offerInput) offerInput.value = data.publicOfferUrl || '';
        if (privacyInput) privacyInput.value = data.privacyPolicyUrl || '';
    } catch (error) {
        console.error('Ошибка загрузки настроек документов:', error);
    }
}

async function uploadDocumentFile(type, file, urlInput) {
    const formData = new FormData();
    const fieldName = type === 'privacy' ? 'documentPrivacy' : 'documentOffer';
    formData.append(fieldName, file);
    try {
        const response = await fetch(`${ADMIN_API_URL}/upload-document`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` },
            body: formData
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.url) {
            if (urlInput) urlInput.value = result.url;
            showNotification(result.message || 'Документ загружен', 'success');
        } else {
            showNotification(result.error || 'Ошибка загрузки', 'error');
        }
    } catch (error) {
        console.error('Ошибка загрузки документа:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    }
}

async function saveDocumentsSettings() {
    const offerInput = document.getElementById('docPublicOfferUrl');
    const privacyInput = document.getElementById('docPrivacyPolicyUrl');
    const publicOfferUrl = offerInput ? offerInput.value.trim() : '';
    const privacyPolicyUrl = privacyInput ? privacyInput.value.trim() : '';
    try {
        const response = await fetch(`${ADMIN_API_URL}/settings/docs`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({ publicOfferUrl, privacyPolicyUrl })
        });
        if (response.ok) {
            showNotification('Ссылки на документы сохранены', 'success');
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения настроек документов:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    }
}

function resetPromoForm() {
    const promoId = document.getElementById('promoId');
    const promoCode = document.getElementById('promoCode');
    const promoDiscountPercent = document.getElementById('promoDiscountPercent');
    const promoUsageLimit = document.getElementById('promoUsageLimit');
    const promoExpiresAt = document.getElementById('promoExpiresAt');
    const promoIsActive = document.getElementById('promoIsActive');
    if (promoId) promoId.value = '';
    if (promoCode) promoCode.value = '';
    if (promoDiscountPercent) promoDiscountPercent.value = '';
    if (promoUsageLimit) promoUsageLimit.value = '';
    if (promoExpiresAt) promoExpiresAt.value = '';
    if (promoIsActive) promoIsActive.checked = true;
}

async function loadPromoCodes() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/promo-codes`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('Ошибка загрузки промокодов');
        const data = await response.json();
        const list = document.getElementById('promoList');
        if (!list) return;
        const promoCodes = data.promoCodes || [];
        if (!promoCodes.length) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">Промокодов пока нет</p>';
            return;
        }
        list.innerHTML = promoCodes.map(item => `
            <div class="admin-list-item">
                <div style="flex: 1;">
                    <strong>${item.code}</strong>
                    <p style="margin: 0.25rem 0; color: var(--text-secondary);">
                        Скидка: ${item.discountPercent}% | Использовано: ${item.usedCount}${item.usageLimit ? `/${item.usageLimit}` : ''}
                    </p>
                    <p style="margin: 0; color: var(--text-muted); font-size: 0.875rem;">
                        ${item.isActive ? 'Активен' : 'Выключен'}${item.expiresAt ? ` | До: ${new Date(item.expiresAt).toLocaleString('ru-RU')}` : ''}
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-primary btn-sm" onclick="editPromoCode(${item.id})">Редактировать</button>
                    <button class="btn btn-danger btn-sm" onclick="deletePromoCode(${item.id})">Удалить</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки промокодов:', error);
        showNotification('Ошибка загрузки промокодов', 'error');
    }
}

async function editPromoCode(id) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/promo-codes`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('Ошибка загрузки промокодов');
        const data = await response.json();
        const item = (data.promoCodes || []).find(p => p.id === id);
        if (!item) return;
        document.getElementById('promoId').value = item.id;
        document.getElementById('promoCode').value = item.code || '';
        document.getElementById('promoDiscountPercent').value = item.discountPercent || '';
        document.getElementById('promoUsageLimit').value = item.usageLimit || '';
        document.getElementById('promoExpiresAt').value = toDateTimeLocalValue(item.expiresAt);
        document.getElementById('promoIsActive').checked = item.isActive !== false;
    } catch (error) {
        console.error('Ошибка редактирования промокода:', error);
        showNotification('Ошибка загрузки промокода', 'error');
    }
}

async function deletePromoCode(id) {
    if (!confirm('Удалить этот промокод?')) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/promo-codes/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showNotification(result.error || 'Ошибка удаления промокода', 'error');
            return;
        }
        showNotification('Промокод удален', 'success');
        await loadPromoCodes();
    } catch (error) {
        console.error('Ошибка удаления промокода:', error);
        showNotification('Ошибка удаления промокода', 'error');
    }
}

let adminSubscriptionPlansCache = [];

async function loadSubscriptionPlansAdmin() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/subscription-plans`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('Ошибка загрузки тарифов');
        adminSubscriptionPlansCache = await response.json();

        const select = document.getElementById('subsAdminUniversity');
        if (!select) return;

        const prev = select.value;
        select.innerHTML = adminSubscriptionPlansCache.map((u) =>
            `<option value="${u.universityId}">${u.shortName} — ${u.name}</option>`
        ).join('');

        if (!adminSubscriptionPlansCache.length) {
            select.innerHTML = '<option value="">Нет университетов</option>';
            const hint = document.getElementById('subsAdminHint');
            if (hint) hint.textContent = 'Сначала создайте университет во вкладке «Университеты».';
            return;
        }

        if (prev && adminSubscriptionPlansCache.some((u) => String(u.universityId) === String(prev))) {
            select.value = prev;
        }
        fillSubscriptionPlansForm();
    } catch (error) {
        console.error('Ошибка загрузки тарифов:', error);
        showNotification('Ошибка загрузки тарифов подписок', 'error');
    }
}

function fillSubscriptionPlansForm() {
    const select = document.getElementById('subsAdminUniversity');
    const hint = document.getElementById('subsAdminHint');
    if (!select) return;

    const uni = adminSubscriptionPlansCache.find((u) => String(u.universityId) === String(select.value));
    if (!uni) return;

    [1, 3, 12].forEach((months) => {
        const plan = (uni.plans || []).find((p) => Number(p.months) === months) || {};
        const priceEl = document.getElementById(`subsPrice${months}`);
        const oldEl = document.getElementById(`subsOldPrice${months}`);
        const activeEl = document.getElementById(`subsActive${months}`);
        if (priceEl) priceEl.value = plan.price != null ? plan.price : '';
        if (oldEl) oldEl.value = plan.oldPrice != null ? plan.oldPrice : '';
        if (activeEl) activeEl.checked = plan.isActive !== false;
    });

    if (hint) {
        hint.textContent = `Тарифы для ${uni.shortName}. После сохранения цены сразу применяются на странице «Подписки» у студентов этого университета.`;
    }
}

async function saveSubscriptionPlansAdmin(e) {
    e.preventDefault();
    const select = document.getElementById('subsAdminUniversity');
    if (!select || !select.value) {
        showNotification('Выберите университет', 'error');
        return;
    }

    const plans = [1, 3, 12].map((months) => {
        const price = parseFloat(document.getElementById(`subsPrice${months}`)?.value);
        const oldRaw = document.getElementById(`subsOldPrice${months}`)?.value;
        const oldPrice = oldRaw === '' || oldRaw == null ? null : parseFloat(oldRaw);
        const isActive = !!document.getElementById(`subsActive${months}`)?.checked;
        return { months, price, oldPrice, isActive };
    });

    for (const p of plans) {
        if (!Number.isFinite(p.price) || p.price < 0.01) {
            showNotification(`Укажите корректную цену для ${p.months} мес.`, 'error');
            return;
        }
    }

    try {
        const response = await fetch(`${ADMIN_API_URL}/subscription-plans/${select.value}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plans })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showNotification(result.error || 'Ошибка сохранения тарифов', 'error');
            return;
        }
        showNotification('Цены подписок сохранены', 'success');
        await loadSubscriptionPlansAdmin();
    } catch (error) {
        console.error('Ошибка сохранения тарифов:', error);
        showNotification('Ошибка сохранения тарифов', 'error');
    }
}

async function loadUsmleStatsAdmin() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/usmle-stats`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const data = await response.json();
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(val ?? '—');
        };
        set('usmleStatActive', data.activeSubscribers);
        set('usmleStatExpired', data.expiredSubscribers);
        set('usmleStatEver', data.everSubscribers);
        set('usmleStatPaid', data.paidTransactions);
        const rev = document.getElementById('usmleStatRevenue');
        if (rev) {
            const n = Number(data.revenue) || 0;
            rev.textContent = n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
        }
    } catch (e) {
        console.error('loadUsmleStatsAdmin', e);
    }
}

async function loadUsmlePlansAdmin() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/usmle-subscription-plans`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const data = await response.json();
        const box = document.getElementById('usmleAdminPlansBox');
        if (box) box.style.display = 'block';
        (data.plans || []).forEach((p) => {
            const el = document.getElementById(`usmlePrice${p.months}`);
            if (el) el.value = p.price;
        });
    } catch (e) {
        showNotification('Не удалось загрузить тарифы USMLE', 'error');
    }
}

async function loadUsmleSubjectsAdmin() {
    const list = document.getElementById('usmleSubjectsList');
    if (!list) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/subjects?programType=usmle`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const subjects = await response.json();

        const subjectFilter = document.getElementById('usmleTestsSubjectFilter');
        if (subjectFilter) {
            const current = subjectFilter.value;
            subjectFilter.innerHTML = '<option value="">Все предметы</option>' +
                subjects.map(s => `<option value="${s.id}">${escapeAdminHtml(s.name)}</option>`).join('');
            if (current && subjects.some(s => String(s.id) === String(current))) {
                subjectFilter.value = current;
            }
        }

        if (!subjects.length) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1.5rem;">Пока нет предметов USMLE — сначала добавьте предмет</p>';
            return;
        }
        list.innerHTML = subjects.map(subject => `
            <div class="admin-list-item">
                <div style="flex: 1;">
                    <h4>${escapeAdminHtml(subject.name)} <span style="background:#0f766e;color:white;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.75rem;margin-left:0.5rem;">USMLE</span></h4>
                    ${subject.description ? `<p style="color: var(--text-muted); margin: 0.5rem 0;">${escapeAdminHtml(subject.description)}</p>` : ''}
                    <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                        Тестов: ${subject.testCount ?? 0}
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="focusUsmleSubjectTests(${subject.id})">Тесты →</button>
                    <button class="btn btn-primary btn-sm" onclick="editSubject(${subject.id})">Редактировать</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSubject(${subject.id})">Удалить</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<p style="color: var(--danger-color);">Ошибка загрузки предметов USMLE</p>';
    }
}

function focusUsmleSubjectTests(subjectId) {
    const filter = document.getElementById('usmleTestsSubjectFilter');
    if (filter) filter.value = String(subjectId);
    loadUsmleTestsAdmin();
    document.getElementById('usmleTestsList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function focusUsmleTestQuestions(testId) {
    const filter = document.getElementById('usmleQuestionsTestFilter');
    if (filter) filter.value = String(testId);
    loadUsmleQuestionsAdmin();
    document.getElementById('usmleQuestionsList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadUsmleTestsAdmin() {
    const list = document.getElementById('usmleTestsList');
    if (!list) return;
    try {
        const subjectId = document.getElementById('usmleTestsSubjectFilter')?.value || '';
        const params = new URLSearchParams({ programType: 'usmle' });
        if (subjectId) params.set('subjectId', subjectId);
        const response = await fetch(`${ADMIN_API_URL}/tests?${params}`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const tests = await response.json();

        const questionsFilter = document.getElementById('usmleQuestionsTestFilter');
        if (questionsFilter) {
            const current = questionsFilter.value;
            questionsFilter.innerHTML = '<option value="">Выберите тест</option>' +
                tests.map(t => {
                    const subj = t.Subject?.name ? ` — ${t.Subject.name}` : '';
                    return `<option value="${t.id}">${escapeAdminHtml(t.name)}${escapeAdminHtml(subj)}</option>`;
                }).join('');
            if (current && tests.some(t => String(t.id) === String(current))) {
                questionsFilter.value = current;
            } else if (current) {
                questionsFilter.value = '';
                const qList = document.getElementById('usmleQuestionsList');
                if (qList) {
                    qList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1.5rem;">Выберите тест, чтобы увидеть вопросы</p>';
                }
            }
        }

        if (!tests.length) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1.5rem;">Пока нет тестов USMLE — добавьте тест к предмету</p>';
            return;
        }
        list.innerHTML = tests.map(test => `
            <div class="admin-list-item">
                <div style="flex: 1;">
                    <h4>${escapeAdminHtml(test.name)} <span style="background:#0f766e;color:white;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.75rem;margin-left:0.5rem;">USMLE</span></h4>
                    ${test.description ? `<p style="color: var(--text-muted); margin: 0.5rem 0;">${escapeAdminHtml(test.description)}</p>` : ''}
                    <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                        Предмет: ${escapeAdminHtml(test.Subject?.name || '—')} | Вопросов: ${test.questionCount ?? 0}
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="focusUsmleTestQuestions(${test.id})">Вопросы →</button>
                    <button class="btn btn-primary btn-sm" onclick="editTest(${test.id})">Редактировать</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteTest(${test.id})">Удалить</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<p style="color: var(--danger-color);">Ошибка загрузки тестов USMLE</p>';
    }
}

async function loadUsmleQuestionsAdmin() {
    const list = document.getElementById('usmleQuestionsList');
    if (!list) return;
    const testId = document.getElementById('usmleQuestionsTestFilter')?.value || '';
    if (!testId) {
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1.5rem;">Выберите тест, чтобы увидеть вопросы</p>';
        return;
    }
    try {
        const response = await fetch(`${ADMIN_API_URL}/questions?testId=${encodeURIComponent(testId)}`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const questions = await response.json();
        if (!questions.length) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1.5rem;">В этом тесте пока нет вопросов</p>';
            return;
        }
        list.innerHTML = questions.map(question => {
            const correctAnswer = question.Answers?.find(a => a.isCorrect);
            const tags = Array.isArray(question.Tags) ? question.Tags : (question.QuestionTags || []);
            const tagLabel = tags.length
                ? tags.map(t => escapeAdminHtml(t.name)).join(', ')
                : 'без тегов';
            return `
                <div class="admin-list-item">
                    <div style="flex: 1;">
                        <h4>${escapeAdminHtml(question.text)}</h4>
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                            Ответов: ${question.Answers?.length || 0}
                            ${correctAnswer ? ` | Правильный: ${escapeAdminHtml(correctAnswer.text)}` : ''}
                            | Теги: ${tagLabel}
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="editQuestion(${question.id})">Редактировать</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${question.id})">Удалить</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = '<p style="color: var(--danger-color);">Ошибка загрузки вопросов USMLE</p>';
    }
}

async function openAddUsmleQuestionModal() {
    const presetTestId = document.getElementById('usmleQuestionsTestFilter')?.value || '';
    try {
        const response = await fetch(`${ADMIN_API_URL}/tests?programType=usmle&compact=1`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error('tests');
        const tests = await response.json();
        const select = document.getElementById('questionTestId');
        if (select) {
            select.innerHTML = '<option value="">Выберите тест</option>' +
                tests.map(t => `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`).join('');
            if (presetTestId) {
                select.value = String(presetTestId);
                await applyQuestionExplanationForTestId(presetTestId);
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки тестов USMLE:', error);
        showNotification('Ошибка загрузки списка тестов USMLE', 'error');
        return;
    }

    document.getElementById('questionId').value = '';
    document.getElementById('questionText').value = '';
    if (typeof resetQuestionExplanationForm === 'function') resetQuestionExplanationForm();
    if (typeof resetQuestionImageUI === 'function') resetQuestionImageUI();
    document.getElementById('answersList').innerHTML = '';
    addAnswer();
    addAnswer();
    document.getElementById('questionModalTitle').textContent = 'Добавить вопрос USMLE';
    await fillQuestionTagsSelect([]);
    document.getElementById('questionModal').style.display = 'block';
}

let adminQuestionUploadSource = 'questions'; // 'questions' | 'usmle'
let lastQuestionUploadTestId = null;

async function fetchUsmleTestsCompact() {
    const response = await fetch(`${ADMIN_API_URL}/tests?programType=usmle&compact=1`, {
        headers: adminAuthHeaders()
    });
    if (!response.ok) throw new Error('tests');
    return response.json();
}

async function fillUploadTagsSelect(selectId) {
    const select = document.getElementById(selectId);
    try {
        const response = await fetch(`${ADMIN_API_URL}/question-tags`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error('tags');
        const tags = await response.json();
        if (select) {
            select.innerHTML = (tags || []).map((t) =>
                `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`
            ).join('');
        }
        return tags || [];
    } catch (e) {
        console.error('fillUploadTagsSelect', e);
        if (select) select.innerHTML = '';
        return [];
    }
}

function collectTagsFromUploadResult(questions) {
    const map = new Map();
    (questions || []).forEach((q) => {
        (q.tags || q.Tags || []).forEach((t) => {
            if (t?.id != null) map.set(Number(t.id), t);
        });
    });
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
}

let cachedUploadPreviewTags = [];

async function openUsmleTxtExplainedUploadModal() {
    try {
        const tests = await fetchUsmleTestsCompact();
        if (!tests.length) {
            showNotification('Сначала создайте тест USMLE', 'error');
            return;
        }
        const select = document.getElementById('txtExplainedTestId');
        const presetTestId = document.getElementById('usmleQuestionsTestFilter')?.value || '';
        if (select) {
            select.innerHTML = '<option value="">Выберите тест USMLE</option>' +
                tests.map(t => `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`).join('');
            if (presetTestId && tests.some(t => String(t.id) === String(presetTestId))) {
                select.value = String(presetTestId);
            }
        }
        cachedUploadPreviewTags = await fillUploadTagsSelect();
        adminQuestionUploadSource = 'usmle';
        const modal = document.getElementById('txtExplainedUploadModal');
        if (modal) modal.style.display = 'block';
    } catch (error) {
        console.error('Ошибка открытия загрузки USMLE:', error);
        showNotification('Ошибка загрузки тестов USMLE', 'error');
    }
}

async function openUsmleTxtLinkedUploadModal() {
    try {
        const tests = await fetchUsmleTestsCompact();
        if (!tests.length) {
            showNotification('Сначала создайте тест USMLE', 'error');
            return;
        }
        const select = document.getElementById('txtLinkedTestId');
        const presetTestId = document.getElementById('usmleQuestionsTestFilter')?.value || '';
        if (select) {
            select.innerHTML = '<option value="">Выберите тест USMLE</option>' +
                tests.map(t => `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`).join('');
            if (presetTestId && tests.some(t => String(t.id) === String(presetTestId))) {
                select.value = String(presetTestId);
            }
        }
        cachedUploadPreviewTags = await fillUploadTagsSelect();
        adminQuestionUploadSource = 'usmle';
        const modal = document.getElementById('txtLinkedUploadModal');
        if (modal) modal.style.display = 'block';
    } catch (error) {
        console.error('Ошибка открытия загрузки связанных USMLE:', error);
        showNotification('Ошибка загрузки тестов USMLE', 'error');
    }
}

async function openUsmleTxtFlashcardsUploadModal() {
    try {
        const tests = await fetchUsmleTestsCompact();
        const select = document.getElementById('txtFlashcardsTestId');
        const presetTestId = document.getElementById('usmleFlashcardsTestFilter')?.value || '';
        const presetStep = document.getElementById('usmleFlashcardsStepFilter')?.value || 'step1';
        if (select) {
            select.innerHTML = '<option value="">Без привязки к тесту</option>' +
                tests.map(t => `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`).join('');
            if (presetTestId && tests.some(t => String(t.id) === String(presetTestId))) {
                select.value = String(presetTestId);
            }
        }
        const stepSelect = document.getElementById('txtFlashcardsStepGroup');
        if (stepSelect && presetStep) stepSelect.value = presetStep;
        const modal = document.getElementById('txtFlashcardsUploadModal');
        if (modal) modal.style.display = 'block';
    } catch (error) {
        console.error('Ошибка открытия загрузки flashcards:', error);
        showNotification('Ошибка загрузки тестов USMLE', 'error');
    }
}

async function seedDemoUsmleFlashcards() {
    const testId = document.getElementById('usmleFlashcardsTestFilter')?.value || '';
    const stepGroup = document.getElementById('usmleFlashcardsStepFilter')?.value || 'step1';
    const btn = document.getElementById('seedDemoFlashcardsBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Загрузка…';
    }
    try {
        const response = await fetch(`${ADMIN_API_URL}/flashcards/seed-demo`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${currentAdminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                testId: testId || null,
                stepGroup: stepGroup || 'step1'
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Не удалось загрузить демо');
        }
        showNotification(
            data.message || `Демо: +${data.createdCount || 0} / ~${data.updatedCount || 0}`,
            'success'
        );
        await loadUsmleFlashcardsAdmin();
        await fillUsmleFlashcardFilters();
    } catch (error) {
        console.error('seedDemoUsmleFlashcards', error);
        showNotification(error.message || 'Ошибка демо flashcards', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🧪 Демо карточки';
        }
    }
}

function refreshQuestionsAfterUpload() {
    loadQuestions();
    if (adminQuestionUploadSource === 'usmle' || document.getElementById('usmleTab')?.classList.contains('active')) {
        const usmleFilter = document.getElementById('usmleQuestionsTestFilter');
        if (usmleFilter && lastQuestionUploadTestId) {
            if (![...usmleFilter.options].some(o => o.value === String(lastQuestionUploadTestId))) {
                const opt = document.createElement('option');
                opt.value = String(lastQuestionUploadTestId);
                opt.textContent = `Тест #${lastQuestionUploadTestId}`;
                usmleFilter.appendChild(opt);
            }
            usmleFilter.value = String(lastQuestionUploadTestId);
        }
        loadUsmleTestsAdmin().then(() => loadUsmleQuestionsAdmin());
    }
    adminQuestionUploadSource = 'questions';
}

async function loadUsmleAdminPanel() {
    await Promise.all([
        loadUsmleStatsAdmin(),
        loadUsmlePlansAdmin(),
        loadAdminQuestionTags(),
        loadUsmleSubjectsAdmin(),
        loadMedicalImages()
    ]);
    await loadUsmleTestsAdmin();
    await loadUsmleQuestionsAdmin();
    await loadUsmleFlashcardsAdmin();
    await fillUsmleFlashcardFilters();
}

async function saveUsmlePlansAdmin() {
    const plans = [1, 3, 12].map((months) => ({
        months,
        price: parseFloat(document.getElementById(`usmlePrice${months}`)?.value),
        isActive: true
    }));
    for (const p of plans) {
        if (!Number.isFinite(p.price) || p.price < 0.01) {
            showNotification(`Укажите цену USMLE для ${p.months} мес.`, 'error');
            return;
        }
    }
    try {
        const response = await fetch(`${ADMIN_API_URL}/usmle-subscription-plans`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plans })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showNotification(result.error || 'Ошибка сохранения USMLE', 'error');
            return;
        }
        showNotification('Тарифы USMLE сохранены', 'success');
    } catch (e) {
        showNotification('Ошибка сохранения USMLE', 'error');
    }
}

async function loadAdminQuestionTags() {
    const list = document.getElementById('adminQuestionTagsList');
    if (!list) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/question-tags`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const tags = await response.json();
        if (!tags.length) {
            list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Тегов пока нет</p>';
            return;
        }
        list.innerHTML = tags.map((t) => `
            <div id="qtag-row-${t.id}" style="display:flex;align-items:center;gap:0.4rem;padding:0.35rem 0;border-bottom:1px solid var(--border-light);">
                <span id="qtag-name-${t.id}" style="flex:1;font-weight:600;font-size:0.87rem;">${t.name}</span>
                <input id="qtag-input-${t.id}" type="text" value="${t.name.replace(/"/g, '&quot;')}"
                    style="flex:1;display:none;padding:0.25rem 0.4rem;font-size:0.87rem;border:1px solid var(--border-color);border-radius:6px;">
                <button type="button" class="btn btn-secondary btn-sm" id="qtag-edit-btn-${t.id}"
                    onclick="startEditQuestionTag(${t.id})" style="padding:0.2rem 0.5rem;font-size:0.75rem;">✏️</button>
                <button type="button" class="btn btn-primary btn-sm" id="qtag-save-btn-${t.id}"
                    onclick="saveEditQuestionTag(${t.id})" style="display:none;padding:0.2rem 0.5rem;font-size:0.75rem;">✓</button>
                <button type="button" class="btn btn-secondary btn-sm" id="qtag-cancel-btn-${t.id}"
                    onclick="cancelEditQuestionTag(${t.id})" style="display:none;padding:0.2rem 0.5rem;font-size:0.75rem;">✕</button>
                <button type="button" class="btn btn-danger btn-sm" id="qtag-del-btn-${t.id}"
                    onclick="deleteQuestionTagAdmin(${t.id})" style="padding:0.2rem 0.5rem;font-size:0.75rem;">🗑</button>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:var(--danger-color);">Ошибка загрузки тегов</p>';
    }
}

async function createQuestionTagAdmin() {
    const input = document.getElementById('newQuestionTagName');
    const name = (input?.value || '').trim();
    if (!name) {
        showNotification('Введите название тега', 'error');
        return;
    }
    try {
        const response = await fetch(`${ADMIN_API_URL}/question-tags`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showNotification(result.error || 'Ошибка создания тега', 'error');
            return;
        }
        if (input) input.value = '';
        showNotification('Тег создан', 'success');
        await loadAdminQuestionTags();
    } catch (e) {
        showNotification('Ошибка создания тега', 'error');
    }
}

async function mergeQuestionTagsAdmin() {
    if (!confirm('Слить совпадающие теги?\n\nНапример: Cardiology → Cardiovascular System, Endocrine → Endocrine, Diabetes & Metabolism.\nСвязи с вопросами сохранятся.')) {
        return;
    }
    try {
        const response = await fetch(`${ADMIN_API_URL}/question-tags/merge-duplicates`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showNotification(result.error || 'Ошибка слияния', 'error');
            return;
        }
        showNotification(result.message || 'Готово', 'success');
        await loadAdminQuestionTags();
    } catch (e) {
        showNotification('Ошибка слияния тегов', 'error');
    }
}

async function deleteQuestionTagAdmin(id) {
    if (!confirm('Удалить тег?')) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/question-tags/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) {
            showNotification('Не удалось удалить тег', 'error');
            return;
        }
        await loadAdminQuestionTags();
    } catch (e) {
        showNotification('Ошибка удаления тега', 'error');
    }
}

function startEditQuestionTag(id) {
    document.getElementById(`qtag-name-${id}`).style.display = 'none';
    document.getElementById(`qtag-input-${id}`).style.display = '';
    document.getElementById(`qtag-input-${id}`).focus();
    document.getElementById(`qtag-edit-btn-${id}`).style.display = 'none';
    document.getElementById(`qtag-del-btn-${id}`).style.display = 'none';
    document.getElementById(`qtag-save-btn-${id}`).style.display = '';
    document.getElementById(`qtag-cancel-btn-${id}`).style.display = '';
}

function cancelEditQuestionTag(id) {
    document.getElementById(`qtag-name-${id}`).style.display = '';
    document.getElementById(`qtag-input-${id}`).style.display = 'none';
    document.getElementById(`qtag-edit-btn-${id}`).style.display = '';
    document.getElementById(`qtag-del-btn-${id}`).style.display = '';
    document.getElementById(`qtag-save-btn-${id}`).style.display = 'none';
    document.getElementById(`qtag-cancel-btn-${id}`).style.display = 'none';
}

async function saveEditQuestionTag(id) {
    const newName = (document.getElementById(`qtag-input-${id}`)?.value || '').trim();
    if (!newName) { showNotification('Название не может быть пустым', 'error'); return; }
    try {
        const resp = await fetch(`${ADMIN_API_URL}/question-tags/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${currentAdminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok) { showNotification(result.error || 'Ошибка сохранения', 'error'); return; }
        showNotification('Тег обновлён', 'success');
        await loadAdminQuestionTags();
    } catch (e) {
        showNotification('Ошибка сохранения тега', 'error');
    }
}

window.startEditQuestionTag = startEditQuestionTag;
window.cancelEditQuestionTag = cancelEditQuestionTag;
window.saveEditQuestionTag = saveEditQuestionTag;
window.editUsmleFlashcardAdmin = editUsmleFlashcardAdmin;
window.deleteUsmleFlashcardAdmin = deleteUsmleFlashcardAdmin;

// ── Университетские карточки ──
async function fillSelectFromUniversities(selectId, selectedId = '') {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/universities`, { headers: adminAuthHeaders() });
        if (!response.ok) throw new Error('fail');
        const list = await response.json();
        const keepFirst = sel.options[0] && !sel.options[0].value ? sel.options[0].outerHTML : '';
        sel.innerHTML = keepFirst || '<option value="">Выберите университет</option>';
        list.forEach((u) => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.shortName || u.name;
            if (String(selectedId) === String(u.id)) opt.selected = true;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error(e);
    }
}

async function fillUniFcSubjects(universityId, selectedId = '', selectId = 'uniFcSubjectId') {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Без предмета / все</option>';
    if (!universityId) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/subjects?universityId=${encodeURIComponent(universityId)}&programType=university`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error('fail');
        const list = await response.json();
        list.forEach((s) => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            if (String(selectedId) === String(s.id)) opt.selected = true;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error(e);
    }
}

async function initUniFlashcardsAdmin() {
    await fillSelectFromUniversities('uniFcUniversityFilter');
    const uni = document.getElementById('uniFcUniversityFilter')?.value;
    await fillUniFcSubjects(uni, '', 'uniFcSubjectFilter');
    await loadUniFlashcardsAdmin();
}

async function loadUniFlashcardsAdmin() {
    const list = document.getElementById('uniFlashcardsList');
    if (!list) return;
    const universityId = document.getElementById('uniFcUniversityFilter')?.value;
    if (!universityId) {
        list.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1.5rem;">Выберите университет</p>';
        return;
    }
    const params = new URLSearchParams({ programType: 'university', universityId });
    const subjectId = document.getElementById('uniFcSubjectFilter')?.value;
    if (subjectId) params.set('subjectId', subjectId);
    list.innerHTML = '<p style="color:var(--text-muted); padding:1rem;">Загрузка…</p>';
    try {
        const response = await fetch(`${ADMIN_API_URL}/flashcards?${params}`, {
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const cards = await response.json();
        if (!cards.length) {
            list.innerHTML = '<p style="color:var(--text-muted); padding:1rem;">Карточек пока нет</p>';
            return;
        }
        list.innerHTML = cards.map((c) => `
            <div class="admin-list-item" style="align-items:flex-start;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; margin-bottom:0.35rem;">${escapeAdminHtml(c.frontText)}</div>
                    <div style="color:var(--text-secondary); font-size:0.88rem; margin-bottom:0.35rem;">${escapeAdminHtml(c.backText)}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">
                        ${escapeAdminHtml(c.Subject?.name || 'без предмета')}
                        ${c.isFree ? ' · 🆓 бесплатная' : ' · по подписке'}
                        ${(c.frontImageUrl || c.backImageUrl) ? ' · 🖼' : ''}
                    </div>
                </div>
                <div style="display:flex; gap:0.35rem; flex-shrink:0;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="editUniFlashcardAdmin(${c.id})">✏️</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteUniFlashcardAdmin(${c.id})">🗑</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:var(--danger-color); padding:1rem;">Ошибка загрузки</p>';
    }
}

async function openAddUniFlashcardModal() {
    document.getElementById('uniFcId').value = '';
    document.getElementById('uniFlashcardForm').reset();
    document.getElementById('uniFlashcardModalTitle').textContent = 'Добавить карточку';
    const presetUni = document.getElementById('uniFcUniversityFilter')?.value || '';
    await fillSelectFromUniversities('uniFcUniversityId', presetUni);
    await fillUniFcSubjects(presetUni || document.getElementById('uniFcUniversityId')?.value, '', 'uniFcSubjectId');
    document.getElementById('uniFlashcardModal').style.display = 'block';
}

async function editUniFlashcardAdmin(id) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/flashcards/${id}`, {
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const card = await response.json();
        document.getElementById('uniFcId').value = card.id;
        document.getElementById('uniFlashcardModalTitle').textContent = 'Редактировать карточку';
        document.getElementById('uniFcFrontText').value = card.frontText || '';
        document.getElementById('uniFcBackText').value = card.backText || '';
        document.getElementById('uniFcIsFree').checked = !!card.isFree;
        await fillSelectFromUniversities('uniFcUniversityId', card.universityId || '');
        await fillUniFcSubjects(card.universityId || '', card.subjectId || '', 'uniFcSubjectId');
        document.getElementById('uniFlashcardModal').style.display = 'block';
    } catch (e) {
        showNotification('Не удалось загрузить карточку', 'error');
    }
}

async function saveUniFlashcardAdmin(e) {
    e.preventDefault();
    const id = document.getElementById('uniFcId')?.value;
    const payload = {
        programType: 'university',
        frontText: document.getElementById('uniFcFrontText')?.value || '',
        backText: document.getElementById('uniFcBackText')?.value || '',
        universityId: document.getElementById('uniFcUniversityId')?.value || null,
        subjectId: document.getElementById('uniFcSubjectId')?.value || null,
        isFree: !!document.getElementById('uniFcIsFree')?.checked,
        keyword: null
    };
    const url = id ? `${ADMIN_API_URL}/flashcards/${id}` : `${ADMIN_API_URL}/flashcards`;
    const method = id ? 'PUT' : 'POST';
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Ошибка сохранения');
        document.getElementById('uniFlashcardModal').style.display = 'none';
        showNotification('Карточка сохранена', 'success');
        await loadUniFlashcardsAdmin();
    } catch (err) {
        showNotification(err.message || 'Ошибка сохранения', 'error');
    }
}

async function deleteUniFlashcardAdmin(id) {
    if (!confirm('Удалить карточку?')) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/flashcards/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        showNotification('Карточка удалена', 'success');
        await loadUniFlashcardsAdmin();
    } catch (e) {
        showNotification('Ошибка удаления', 'error');
    }
}

window.editUniFlashcardAdmin = editUniFlashcardAdmin;
window.deleteUniFlashcardAdmin = deleteUniFlashcardAdmin;

/** Сторона для Ctrl+V скриншота в модалке картинок */
let fcImgPasteSide = 'front';
/** После кнопки «Вставить» следующий Ctrl+V идёт в эту сторону */
let fcImgForcePasteSide = null;
/** Надёжное хранение файлов (input.files после paste иногда сбрасывается) */
const fcImgPendingFiles = { front: null, back: null };

function resetFcImgSideUI(side, { keepPendingRemove = false } = {}) {
    const isBack = side === 'back';
    const key = isBack ? 'back' : 'front';
    fcImgPendingFiles[key] = null;
    const input = document.getElementById(isBack ? 'fcImgBackFile' : 'fcImgFrontFile');
    const preview = document.getElementById(isBack ? 'fcImgBackPreview' : 'fcImgFrontPreview');
    const removeBtn = document.getElementById(isBack ? 'fcImgBackRemoveBtn' : 'fcImgFrontRemoveBtn');
    const pending = document.getElementById(isBack ? 'fcImgBackPendingRemove' : 'fcImgFrontPendingRemove');
    if (input) input.value = '';
    if (pending && !keepPendingRemove) pending.value = '0';
    if (removeBtn) removeBtn.style.display = 'none';
    if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }
}

function showFcImgSidePreview(side, imageUrl) {
    const isBack = side === 'back';
    const preview = document.getElementById(isBack ? 'fcImgBackPreview' : 'fcImgFrontPreview');
    const removeBtn = document.getElementById(isBack ? 'fcImgBackRemoveBtn' : 'fcImgFrontRemoveBtn');
    const pending = document.getElementById(isBack ? 'fcImgBackPendingRemove' : 'fcImgFrontPendingRemove');
    if (!preview) return;
    if (pending) pending.value = '0';
    const url = String(imageUrl || '').trim();
    if (url) {
        preview.innerHTML = `<img src="${escapeAdminHtml(url)}" alt="Flashcard ${side}" class="question-image-preview-img">`;
        preview.style.display = 'block';
        if (removeBtn) removeBtn.style.display = 'inline-block';
    } else {
        preview.innerHTML = '';
        preview.style.display = 'none';
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function resolveFcImgSide(sideOrEvent) {
    if (sideOrEvent === 'back' || sideOrEvent === 'front') return sideOrEvent;
    if (fcImgForcePasteSide === 'back' || fcImgForcePasteSide === 'front') {
        return fcImgForcePasteSide;
    }
    const el = sideOrEvent?.target || sideOrEvent || document.activeElement;
    if (el && el.closest) {
        if (el.closest('#fcImgBackDrop, #fcImgBackPasteBtn, #fcImgBackPickBtn, #fcImgBackText, #fcImgBackFile, #fcImgBackPreview')) {
            return 'back';
        }
        if (el.closest('#fcImgFrontDrop, #fcImgFrontPasteBtn, #fcImgFrontPickBtn, #fcImgFrontText, #fcImgFrontFile, #fcImgFrontPreview')) {
            return 'front';
        }
        const zone = el.closest('[data-side]');
        if (zone?.getAttribute('data-side') === 'back') return 'back';
        if (zone?.getAttribute('data-side') === 'front') return 'front';
    }
    return fcImgPasteSide === 'back' ? 'back' : 'front';
}

function applyFcImgFileToSide(side, file) {
    const key = side === 'back' ? 'back' : 'front';
    if (!file) {
        showNotification('В буфере нет изображения', 'error');
        return false;
    }
    const mime = String(file.type || '');
    const name = String(file.name || '');
    const looksImage = mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(name) || !mime;
    if (!looksImage) {
        showNotification('В буфере нет изображения', 'error');
        return false;
    }

    const isBack = key === 'back';
    const input = document.getElementById(isBack ? 'fcImgBackFile' : 'fcImgFrontFile');
    const removeBtn = document.getElementById(isBack ? 'fcImgBackRemoveBtn' : 'fcImgFrontRemoveBtn');
    const pending = document.getElementById(isBack ? 'fcImgBackPendingRemove' : 'fcImgFrontPendingRemove');
    const preview = document.getElementById(isBack ? 'fcImgBackPreview' : 'fcImgFrontPreview');
    if (!input || !preview) {
        showNotification(`Не найдены поля для ${isBack ? 'Back' : 'Front'}`, 'error');
        return false;
    }

    const rawExt = (mime.split('/')[1] || (name.includes('.') ? name.split('.').pop() : '') || 'png')
        .toLowerCase()
        .replace('jpeg', 'jpg');
    const ext = ['jpg', 'png', 'gif', 'webp'].includes(rawExt) ? rawExt : 'png';
    const named = new File(
        [file],
        `screenshot-${key}-${Date.now()}.${ext}`,
        { type: mime.startsWith('image/') ? mime : `image/${ext === 'jpg' ? 'jpeg' : ext}` }
    );

    fcImgPendingFiles[key] = named;
    fcImgPasteSide = key;
    fcImgForcePasteSide = null;

    try {
        const dt = new DataTransfer();
        dt.items.add(named);
        input.dataset.skipChange = '1';
        input.files = dt.files;
    } catch (err) {
        input.dataset.skipChange = '0';
        console.warn('DataTransfer set files failed', err);
    }

    if (pending) pending.value = '0';
    const url = URL.createObjectURL(named);
    preview.innerHTML = `<img src="${url}" alt="Preview ${key}" class="question-image-preview-img">`;
    preview.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'inline-block';
    showNotification(`Скриншот добавлен (${isBack ? 'Back' : 'Front'})`, 'success');
    return true;
}

async function pasteFcImgFromClipboard(side) {
    const key = side === 'back' ? 'back' : 'front';
    fcImgPasteSide = key;
    fcImgForcePasteSide = key;
    const drop = document.getElementById(key === 'back' ? 'fcImgBackDrop' : 'fcImgFrontDrop');
    if (drop) {
        try { drop.focus(); } catch (_) { /* ignore */ }
    }

    try {
        if (navigator.clipboard && navigator.clipboard.read) {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = (item.types || []).find((t) => String(t).startsWith('image/'));
                if (!type) continue;
                const blob = await item.getType(type);
                applyFcImgFileToSide(key, blob);
                return;
            }
        }
    } catch (err) {
        console.warn('clipboard.read failed', err);
    }
    showNotification(`Сторона ${key === 'back' ? 'Back' : 'Front'} выбрана — нажмите Ctrl+V`, 'info');
}

function initFcImgFormControls() {
    [
        { side: 'front', pick: 'fcImgFrontPickBtn', file: 'fcImgFrontFile', remove: 'fcImgFrontRemoveBtn', paste: 'fcImgFrontPasteBtn', drop: 'fcImgFrontDrop' },
        { side: 'back', pick: 'fcImgBackPickBtn', file: 'fcImgBackFile', remove: 'fcImgBackRemoveBtn', paste: 'fcImgBackPasteBtn', drop: 'fcImgBackDrop' }
    ].forEach(({ side, pick, file, remove, paste, drop }) => {
        const pickBtn = document.getElementById(pick);
        const fileInput = document.getElementById(file);
        const removeBtn = document.getElementById(remove);
        const pasteBtn = document.getElementById(paste);
        const dropzone = document.getElementById(drop);

        if (pickBtn && fileInput && pickBtn.dataset.bound !== '1') {
            pickBtn.dataset.bound = '1';
            pickBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fcImgPasteSide = side;
                fcImgForcePasteSide = side;
                fileInput.click();
            });
        }
        if (pasteBtn && pasteBtn.dataset.bound !== '1') {
            pasteBtn.dataset.bound = '1';
            pasteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                pasteFcImgFromClipboard(side);
            });
        }
        if (dropzone && dropzone.dataset.bound !== '1') {
            dropzone.dataset.bound = '1';
            const markSide = () => {
                fcImgPasteSide = side;
                fcImgForcePasteSide = side;
            };
            dropzone.addEventListener('mousedown', markSide);
            dropzone.addEventListener('click', markSide);
            dropzone.addEventListener('focus', markSide);
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('is-dragover');
            });
            dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('is-dragover');
                markSide();
                const f = e.dataTransfer?.files?.[0];
                if (f) applyFcImgFileToSide(side, f);
            });
            dropzone.addEventListener('paste', (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                    if (!item.type || !item.type.startsWith('image/')) continue;
                    e.preventDefault();
                    e.stopPropagation();
                    const file = item.getAsFile();
                    if (file) applyFcImgFileToSide(side, file);
                    break;
                }
            });
        }
        if (fileInput && fileInput.dataset.bound !== '1') {
            fileInput.dataset.bound = '1';
            fileInput.addEventListener('change', () => {
                // Не вызываем applyFcImgFileToSide — он сам ставит input.files и снова триггерит change
                if (fileInput.dataset.skipChange === '1') {
                    fileInput.dataset.skipChange = '0';
                    return;
                }
                const pending = document.getElementById(side === 'back' ? 'fcImgBackPendingRemove' : 'fcImgFrontPendingRemove');
                if (pending) pending.value = '0';
                const files = Array.from(fileInput.files || []);
                const preview = document.getElementById(side === 'back' ? 'fcImgBackPreview' : 'fcImgFrontPreview');
                if (files[0]) {
                    const f = files[0];
                    const named = new File(
                        [f],
                        f.name || `upload-${side}-${Date.now()}.png`,
                        { type: f.type || 'image/png' }
                    );
                    fcImgPendingFiles[side] = named;
                    fcImgPasteSide = side;
                    if (preview) {
                        const url = URL.createObjectURL(named);
                        preview.innerHTML = `<img src="${url}" alt="Preview" class="question-image-preview-img">`;
                        preview.style.display = 'block';
                    }
                }
                if (removeBtn) removeBtn.style.display = files.length ? 'inline-block' : 'none';
            });
        }
        if (removeBtn && removeBtn.dataset.bound !== '1') {
            removeBtn.dataset.bound = '1';
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const pending = document.getElementById(side === 'back' ? 'fcImgBackPendingRemove' : 'fcImgFrontPendingRemove');
                if (pending) pending.value = '1';
                resetFcImgSideUI(side, { keepPendingRemove: true });
            });
        }
    });

    if (!window.__fcImgPasteBound) {
        window.__fcImgPasteBound = true;
        document.addEventListener('paste', (e) => {
            const modal = document.getElementById('flashcardImageModal');
            if (!modal || getComputedStyle(modal).display === 'none') return;
            const items = e.clipboardData?.items;
            if (!items || !items.length) return;
            for (const item of items) {
                if (!item.type || !item.type.startsWith('image/')) continue;
                e.preventDefault();
                e.stopPropagation();
                const file = item.getAsFile();
                const side = resolveFcImgSide(e) || resolveFcImgSide(document.activeElement);
                if (file) applyFcImgFileToSide(side, file);
                break;
            }
        }, true);
    }
}

async function syncFcImgImagesAfterSave(flashcardId, { requireFrontOnCreate = false } = {}) {
    const frontPending = document.getElementById('fcImgFrontPendingRemove');
    const backPending = document.getElementById('fcImgBackPendingRemove');
    const frontInput = document.getElementById('fcImgFrontFile');
    const backInput = document.getElementById('fcImgBackFile');
    const frontRemove = frontPending && frontPending.value === '1';
    const backRemove = backPending && backPending.value === '1';
    const frontFile = fcImgPendingFiles.front || frontInput?.files?.[0] || null;
    const backFile = fcImgPendingFiles.back || backInput?.files?.[0] || null;

    if (requireFrontOnCreate && !frontFile && !backFile) {
        throw new Error('Загрузите хотя бы одну картинку (Front или Back)');
    }

    if (frontRemove) {
        const res = await fetch(`${ADMIN_API_URL}/flashcards/${flashcardId}/front-image`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Не удалось удалить изображение Front');
        }
        fcImgPendingFiles.front = null;
    } else if (frontFile) {
        const formData = new FormData();
        formData.append('image', frontFile, frontFile.name || `front-${Date.now()}.png`);
        const res = await fetch(`${ADMIN_API_URL}/flashcards/${flashcardId}/front-image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${currentAdminToken}` },
            body: formData
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Не удалось загрузить изображение Front');
        }
        fcImgPendingFiles.front = null;
    }

    if (backRemove) {
        const res = await fetch(`${ADMIN_API_URL}/flashcards/${flashcardId}/back-image`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Не удалось удалить изображение Back');
        }
        fcImgPendingFiles.back = null;
    } else if (backFile) {
        const formData = new FormData();
        formData.append('image', backFile, backFile.name || `back-${Date.now()}.png`);
        const res = await fetch(`${ADMIN_API_URL}/flashcards/${flashcardId}/back-image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${currentAdminToken}` },
            body: formData
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Не удалось загрузить изображение Back');
        }
        fcImgPendingFiles.back = null;
    }
}

async function fillFlashcardTagsSelect(selectedIds = [], selectId = 'flashcardTagIds') {
    const select = document.getElementById(selectId);
    if (!select) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/question-tags`, {
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        const tags = response.ok ? await response.json() : [];
        select.innerHTML = tags.map((t) => `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`).join('');
        const set = new Set((selectedIds || []).map(String));
        Array.from(select.options).forEach((opt) => { opt.selected = set.has(String(opt.value)); });
    } catch (e) {
        console.error('fillFlashcardTagsSelect', e);
    }
}

async function fillFlashcardTestsSelect(selectedId = '', selectId = 'flashcardTestId') {
    const select = document.getElementById(selectId);
    if (!select) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/tests?programType=usmle&compact=1`, {
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        const tests = response.ok ? await response.json() : [];
        select.innerHTML = '<option value="">Без привязки к тесту</option>'
            + tests.map((t) => `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`).join('');
        if (selectedId) select.value = String(selectedId);
    } catch (e) {
        console.error('fillFlashcardTestsSelect', e);
    }
}

async function fillUsmleFlashcardFilters() {
    const testFilter = document.getElementById('usmleFlashcardsTestFilter');
    const tagFilter = document.getElementById('usmleFlashcardsTagFilter');
    if (!testFilter && !tagFilter) return;
    try {
        const [testsRes, tagsRes] = await Promise.all([
            fetch(`${ADMIN_API_URL}/tests?programType=usmle&compact=1`, { headers: { Authorization: `Bearer ${currentAdminToken}` } }),
            fetch(`${ADMIN_API_URL}/question-tags`, { headers: { Authorization: `Bearer ${currentAdminToken}` } })
        ]);
        const tests = testsRes.ok ? await testsRes.json() : [];
        const tags = tagsRes.ok ? await tagsRes.json() : [];
        if (testFilter) {
            const keep = testFilter.value;
            testFilter.innerHTML = '<option value="">Все тесты</option>'
                + tests.map((t) => `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`).join('');
            if (keep) testFilter.value = keep;
        }
        if (tagFilter) {
            const keep = tagFilter.value;
            tagFilter.innerHTML = '<option value="">Все теги</option>'
                + tags.map((t) => `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`).join('');
            if (keep) tagFilter.value = keep;
        }
    } catch (e) {
        console.error('fillUsmleFlashcardFilters', e);
    }
}

async function loadUsmleFlashcardsAdmin() {
    const list = document.getElementById('usmleFlashcardsList');
    if (!list) return;
    const params = new URLSearchParams();
    const testId = document.getElementById('usmleFlashcardsTestFilter')?.value;
    const tagId = document.getElementById('usmleFlashcardsTagFilter')?.value;
    const stepGroup = document.getElementById('usmleFlashcardsStepFilter')?.value;
    if (testId) params.set('testId', testId);
    if (tagId) params.set('tagId', tagId);
    if (stepGroup) params.set('stepGroup', stepGroup);
    params.set('programType', 'usmle');

    list.innerHTML = '<p style="color:var(--text-muted); padding:1rem;">Загрузка…</p>';
    try {
        const response = await fetch(`${ADMIN_API_URL}/flashcards?${params.toString()}`, {
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const cards = await response.json();
        if (!cards.length) {
            list.innerHTML = '<p style="color:var(--text-muted); padding:1rem;">Flashcards пока нет</p>';
            return;
        }
        list.innerHTML = cards.map((c) => {
            const tags = (c.Tags || []).map((t) => t.name).join(', ') || '—';
            return `
                <div class="admin-list-item" style="align-items:flex-start;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; margin-bottom:0.35rem;">${escapeAdminHtml(c.frontText)}</div>
                        <div style="color:var(--text-secondary); font-size:0.88rem; margin-bottom:0.35rem;">${escapeAdminHtml(c.backText)}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">
                            ${escapeAdminHtml(c.stepGroup || '')} · ${escapeAdminHtml(c.Test?.name || 'без теста')} · ${escapeAdminHtml(tags)}
                            ${(c.frontImageUrl || c.backImageUrl) ? ' · 🖼' : ''}
                        </div>
                    </div>
                    <div style="display:flex; gap:0.35rem; flex-shrink:0;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="editUsmleFlashcardAdmin(${c.id})">✏️</button>
                        <button type="button" class="btn btn-danger btn-sm" onclick="deleteUsmleFlashcardAdmin(${c.id})">🗑</button>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:var(--danger-color); padding:1rem;">Ошибка загрузки flashcards</p>';
    }
}

async function openAddUsmleFlashcardModal() {
    document.getElementById('flashcardId').value = '';
    document.getElementById('flashcardForm').reset();
    document.getElementById('flashcardModalTitle').textContent = 'Добавить flashcard';
    document.getElementById('flashcardStepGroup').value = 'step1';
    document.getElementById('flashcardPreviewBox').style.display = 'none';
    const testFilter = document.getElementById('usmleFlashcardsTestFilter')?.value || '';
    await Promise.all([
        fillFlashcardTagsSelect([]),
        fillFlashcardTestsSelect(testFilter)
    ]);
    document.getElementById('flashcardModal').style.display = 'block';
}

async function openAddUsmleFlashcardWithImagesModal() {
    document.getElementById('fcImgId').value = '';
    document.getElementById('flashcardImageForm').reset();
    fcImgPendingFiles.front = null;
    fcImgPendingFiles.back = null;
    resetFcImgSideUI('front');
    resetFcImgSideUI('back');
    document.getElementById('flashcardImageModalTitle').textContent = 'Карточка с картинами';
    const presetStep = document.getElementById('usmleFlashcardsStepFilter')?.value || 'step1';
    document.getElementById('fcImgStepGroup').value = presetStep;
    const testFilter = document.getElementById('usmleFlashcardsTestFilter')?.value || '';
    fcImgPasteSide = 'front';
    fcImgForcePasteSide = null;
    await Promise.all([
        fillFlashcardTagsSelect([], 'fcImgTagIds'),
        fillFlashcardTestsSelect(testFilter, 'fcImgTestId')
    ]);
    document.getElementById('flashcardImageModal').style.display = 'block';
}

async function openEditFlashcardWithImagesModal(card) {
    document.getElementById('fcImgId').value = card.id;
    document.getElementById('fcImgFrontText').value = card.frontText || '';
    document.getElementById('fcImgBackText').value = card.backText || '';
    document.getElementById('fcImgStepGroup').value = card.stepGroup || 'step1';
    document.getElementById('flashcardImageModalTitle').textContent = 'Редактировать карточку с картинами';
    resetFcImgSideUI('front');
    resetFcImgSideUI('back');
    showFcImgSidePreview('front', card.frontImageUrl || '');
    showFcImgSidePreview('back', card.backImageUrl || '');
    fcImgPasteSide = 'front';
    fcImgForcePasteSide = null;
    await Promise.all([
        fillFlashcardTagsSelect((card.Tags || []).map((t) => t.id), 'fcImgTagIds'),
        fillFlashcardTestsSelect(card.testId || '', 'fcImgTestId')
    ]);
    document.getElementById('flashcardImageModal').style.display = 'block';
}

async function editUsmleFlashcardAdmin(id) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/flashcards/${id}`, {
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        const card = await response.json();
        // Всегда модалка с картинками — иначе к текстовой карточке нельзя добавить Back image
        await openEditFlashcardWithImagesModal(card);
    } catch (e) {
        showNotification('Не удалось загрузить flashcard', 'error');
    }
}

async function saveFlashcardAdmin(e) {
    e.preventDefault();
    const id = document.getElementById('flashcardId')?.value;
    const payload = {
        frontText: document.getElementById('flashcardFrontText')?.value || '',
        backText: document.getElementById('flashcardBackText')?.value || '',
        keyword: null,
        programType: 'usmle',
        stepGroup: document.getElementById('flashcardStepGroup')?.value || 'step1',
        testId: document.getElementById('flashcardTestId')?.value || null,
        tagIds: Array.from(document.getElementById('flashcardTagIds')?.selectedOptions || []).map((o) => parseInt(o.value, 10))
    };
    const url = id ? `${ADMIN_API_URL}/flashcards/${id}` : `${ADMIN_API_URL}/flashcards`;
    const method = id ? 'PUT' : 'POST';
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Ошибка сохранения');
        document.getElementById('flashcardModal').style.display = 'none';
        showNotification('Flashcard сохранена', 'success');
        await loadUsmleFlashcardsAdmin();
    } catch (err) {
        showNotification(err.message || 'Ошибка сохранения', 'error');
    }
}

async function saveFlashcardWithImagesAdmin(e) {
    e.preventDefault();
    const id = document.getElementById('fcImgId')?.value;
    const frontTextRaw = document.getElementById('fcImgFrontText')?.value || '';
    const backTextRaw = document.getElementById('fcImgBackText')?.value || '';
    const hasFrontImg = Boolean(fcImgPendingFiles.front || document.getElementById('fcImgFrontFile')?.files?.[0]
        || (document.getElementById('fcImgFrontPreview')?.querySelector('img') && document.getElementById('fcImgFrontPendingRemove')?.value !== '1'));
    const hasBackImg = Boolean(fcImgPendingFiles.back || document.getElementById('fcImgBackFile')?.files?.[0]
        || (document.getElementById('fcImgBackPreview')?.querySelector('img') && document.getElementById('fcImgBackPendingRemove')?.value !== '1'));

    if (!frontTextRaw.trim() && !hasFrontImg) {
        showNotification('Нужен текст или картинка Front', 'error');
        return;
    }
    if (!backTextRaw.trim() && !hasBackImg) {
        showNotification('Нужен текст или картинка Back', 'error');
        return;
    }

    const payload = {
        // Для image-only карточек (как UWorld ECG) текст может быть пустым
        frontText: frontTextRaw.trim() || ' ',
        backText: backTextRaw.trim() || ' ',
        keyword: null,
        programType: 'usmle',
        stepGroup: document.getElementById('fcImgStepGroup')?.value || 'step1',
        testId: document.getElementById('fcImgTestId')?.value || null,
        tagIds: Array.from(document.getElementById('fcImgTagIds')?.selectedOptions || []).map((o) => parseInt(o.value, 10))
    };
    const url = id ? `${ADMIN_API_URL}/flashcards/${id}` : `${ADMIN_API_URL}/flashcards`;
    const method = id ? 'PUT' : 'POST';
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Ошибка сохранения');
        const cardId = id || result.id;
        await syncFcImgImagesAfterSave(cardId, { requireFrontOnCreate: !id });
        document.getElementById('flashcardImageModal').style.display = 'none';
        showNotification('Карточка с картинами сохранена', 'success');
        await loadUsmleFlashcardsAdmin();
    } catch (err) {
        showNotification(err.message || 'Ошибка сохранения', 'error');
    }
}

async function deleteUsmleFlashcardAdmin(id) {
    if (!confirm('Удалить flashcard?')) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/flashcards/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) throw new Error('fail');
        showNotification('Flashcard удалена', 'success');
        await loadUsmleFlashcardsAdmin();
    } catch (e) {
        showNotification('Ошибка удаления', 'error');
    }
}

function previewFlashcardAdmin() {
    const box = document.getElementById('flashcardPreviewBox');
    const front = document.getElementById('flashcardFrontText')?.value || '';
    const back = document.getElementById('flashcardBackText')?.value || '';
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = `
        <div style="font-weight:700; margin-bottom:0.75rem;">Предпросмотр</div>
        <div style="margin-bottom:0.75rem;"><strong>Front:</strong><br>${escapeAdminHtml(front)}</div>
        <div><strong>Back:</strong><br>${escapeAdminHtml(back)}</div>
    `;
}

async function savePromoCode(e) {
    e.preventDefault();
    const promoId = document.getElementById('promoId')?.value || '';
    const payload = {
        code: document.getElementById('promoCode')?.value || '',
        discountPercent: parseInt(document.getElementById('promoDiscountPercent')?.value || '0', 10),
        usageLimit: document.getElementById('promoUsageLimit')?.value || null,
        expiresAt: document.getElementById('promoExpiresAt')?.value ? new Date(document.getElementById('promoExpiresAt').value).toISOString() : null,
        isActive: document.getElementById('promoIsActive')?.checked
    };
    const url = promoId ? `${ADMIN_API_URL}/promo-codes/${promoId}` : `${ADMIN_API_URL}/promo-codes`;
    const method = promoId ? 'PUT' : 'POST';
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showNotification(result.error || 'Ошибка сохранения промокода', 'error');
            return;
        }
        showNotification(promoId ? 'Промокод обновлен' : 'Промокод создан', 'success');
        resetPromoForm();
        await loadPromoCodes();
    } catch (error) {
        console.error('Ошибка сохранения промокода:', error);
        showNotification('Ошибка сохранения промокода', 'error');
    }
}

// Загрузка PDF
async function handlePdfUpload(e) {
    e.preventDefault();
    
    const testId = document.getElementById('pdfTestId').value;
    const fileInput = document.getElementById('pdfFile');
    
    if (!testId) {
        if (typeof showNotification === 'function') {
            showNotification('Выберите тест', 'error');
        } else {
            alert('Выберите тест');
        }
        return;
    }
    
    if (!fileInput.files || !fileInput.files[0]) {
        if (typeof showNotification === 'function') {
            showNotification('Выберите PDF файл', 'error');
        } else {
            alert('Выберите PDF файл');
        }
        return;
    }
    
    const formData = new FormData();
    formData.append('pdf', fileInput.files[0]);
    formData.append('testId', testId);
    
    const progressDiv = document.getElementById('pdfUploadProgress');
    const progressBar = document.getElementById('pdfUploadProgressBar');
    const statusText = document.getElementById('pdfUploadStatus');
    
    if (progressDiv) progressDiv.style.display = 'block';
    if (progressBar) progressBar.style.width = '30%';
    if (statusText) statusText.textContent = 'Загрузка файла...';
    
    try {
        const response = await fetch(`${ADMIN_API_URL}/upload-pdf`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: formData
        });
        
        if (progressBar) progressBar.style.width = '70%';
        if (statusText) statusText.textContent = 'Обработка TXT...';
        
        const result = await response.json();
        
        if (response.ok) {
            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = 'Готово!';
            
            setTimeout(() => {
                if (typeof showNotification === 'function') {
                    showNotification(`Успешно загружено ${result.questions.length} вопросов`, 'success');
                } else {
                    alert(`Успешно загружено ${result.questions.length} вопросов`);
                }
                lastQuestionUploadTestId = testId;
                const questionsFilter = document.getElementById('questionsTestFilter');
                if (questionsFilter) questionsFilter.value = String(testId);
                const modal = document.getElementById('pdfUploadModal');
                if (modal) modal.style.display = 'none';
                const form = document.getElementById('pdfUploadForm');
                if (form) form.reset();
                if (progressDiv) progressDiv.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';

                openUploadPreview(result.questions || [], {
                    title: `Загружено ${result.questions.length} вопросов`,
                    withExplanations: false
                });
            }, 500);
        } else {
            throw new Error(result.error || 'Ошибка загрузки TXT');
        }
    } catch (error) {
        console.error('Ошибка загрузки TXT:', error);
        if (typeof showNotification === 'function') {
            showNotification(error.message || 'Ошибка загрузки TXT', 'error');
        } else {
            alert(error.message || 'Ошибка загрузки TXT');
        }
        if (progressDiv) progressDiv.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
    }
}

async function openTxtExplainedPlainUploadModal() {
    try {
        adminQuestionUploadSource = 'questions';
        const tests = await fetchAdminTestsCompact();
        const select = document.getElementById('txtExplainedPlainTestId');
        const presetTestId = document.getElementById('questionsTestFilter')?.value || '';
        if (select) {
            select.innerHTML = '<option value="">Выберите тест</option>' +
                tests.map((t) => `<option value="${t.id}">${escapeAdminHtml(t.name)}</option>`).join('');
            if (presetTestId) select.value = String(presetTestId);
        }
        const modal = document.getElementById('txtExplainedPlainUploadModal');
        if (modal) modal.style.display = 'block';
    } catch (error) {
        console.error('Ошибка открытия загрузки TXT с объяснениями:', error);
        showNotification('Ошибка загрузки тестов', 'error');
    }
}

async function handleTxtExplainedPlainUpload(e) {
    e.preventDefault();

    const testId = document.getElementById('txtExplainedPlainTestId')?.value;
    const fileInput = document.getElementById('txtExplainedPlainFile');

    if (!testId) {
        showNotification('Выберите тест', 'error');
        return;
    }
    if (!fileInput?.files?.[0]) {
        showNotification('Выберите TXT файл', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('pdf', fileInput.files[0]);
    formData.append('testId', testId);

    const progressDiv = document.getElementById('txtExplainedPlainUploadProgress');
    const progressBar = document.getElementById('txtExplainedPlainUploadProgressBar');
    const statusText = document.getElementById('txtExplainedPlainUploadStatus');

    if (progressDiv) progressDiv.style.display = 'block';
    if (progressBar) progressBar.style.width = '30%';
    if (statusText) statusText.textContent = 'Загрузка файла...';

    try {
        const response = await fetch(`${ADMIN_API_URL}/upload-txt-explanations`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${currentAdminToken}` },
            body: formData
        });

        if (progressBar) progressBar.style.width = '70%';
        if (statusText) statusText.textContent = 'Обработка TXT...';

        const result = await response.json();

        if (response.ok) {
            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = 'Готово!';
            setTimeout(() => {
                showNotification(`Загружено ${result.questions.length} вопросов с объяснениями`, 'success');
                lastQuestionUploadTestId = testId;
                adminQuestionUploadSource = 'questions';
                const questionsFilter = document.getElementById('questionsTestFilter');
                if (questionsFilter) questionsFilter.value = String(testId);
                const modal = document.getElementById('txtExplainedPlainUploadModal');
                if (modal) modal.style.display = 'none';
                const form = document.getElementById('txtExplainedPlainUploadForm');
                if (form) form.reset();
                if (progressDiv) progressDiv.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';

                openUploadPreview(result.questions || [], {
                    title: `Загружено ${result.questions.length} вопросов с объяснениями`,
                    withExplanations: true
                });
                if (typeof loadQuestions === 'function') loadQuestions();
            }, 500);
        } else {
            throw new Error(result.error || 'Ошибка загрузки TXT');
        }
    } catch (error) {
        console.error('Ошибка загрузки TXT с объяснениями:', error);
        showNotification(error.message || 'Ошибка загрузки TXT', 'error');
        if (progressDiv) progressDiv.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
    }
}

async function handleTxtExplainedUpload(e) {
    e.preventDefault();

    const testId = document.getElementById('txtExplainedTestId')?.value;
    const fileInput = document.getElementById('txtExplainedFile');

    if (!testId) {
        showNotification('Выберите тест USMLE', 'error');
        return;
    }
    if (!fileInput?.files?.[0]) {
        showNotification('Выберите TXT файл', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('pdf', fileInput.files[0]);
    formData.append('testId', testId);

    const progressDiv = document.getElementById('txtExplainedUploadProgress');
    const progressBar = document.getElementById('txtExplainedUploadProgressBar');
    const statusText = document.getElementById('txtExplainedUploadStatus');

    if (progressDiv) progressDiv.style.display = 'block';
    if (progressBar) progressBar.style.width = '30%';
    if (statusText) statusText.textContent = 'Загрузка файла...';

    try {
        const response = await fetch(`${ADMIN_API_URL}/upload-txt-explained`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` },
            body: formData
        });

        if (progressBar) progressBar.style.width = '70%';
        if (statusText) statusText.textContent = 'Обработка TXT...';

        const result = await response.json();

        if (response.ok) {
            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = 'Готово!';
            setTimeout(() => {
                showNotification(`Загружено ${result.questions.length} вопросов с объяснениями и тегами`, 'success');
                lastQuestionUploadTestId = testId;
                adminQuestionUploadSource = 'usmle';
                const questionsFilter = document.getElementById('questionsTestFilter');
                if (questionsFilter) questionsFilter.value = String(testId);
                cachedUploadPreviewTags = [
                    ...collectTagsFromUploadResult(result.questions),
                    ...cachedUploadPreviewTags
                ].reduce((acc, t) => {
                    if (!acc.some((x) => Number(x.id) === Number(t.id))) acc.push(t);
                    return acc;
                }, []);
                if (typeof loadAdminQuestionTags === 'function') loadAdminQuestionTags();
                const modal = document.getElementById('txtExplainedUploadModal');
                if (modal) modal.style.display = 'none';
                const form = document.getElementById('txtExplainedUploadForm');
                if (form) form.reset();
                if (progressDiv) progressDiv.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';

                openUploadPreview(result.questions || [], {
                    title: `Загружено ${result.questions.length} вопросов с объяснениями и тегами`,
                    withExplanations: true
                });
            }, 500);
        } else {
            throw new Error(result.error || 'Ошибка загрузки TXT');
        }
    } catch (error) {
        console.error('Ошибка загрузки TXT с объяснениями:', error);
        showNotification(error.message || 'Ошибка загрузки TXT', 'error');
        if (progressDiv) progressDiv.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
    }
}

async function handleTxtLinkedUpload(e) {
    e.preventDefault();
    const testId = document.getElementById('txtLinkedTestId')?.value;
    const fileInput = document.getElementById('txtLinkedFile');

    if (!testId) {
        showNotification('Выберите тест USMLE', 'error');
        return;
    }
    if (!fileInput?.files?.[0]) {
        showNotification('Выберите TXT файл', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('pdf', fileInput.files[0]);
    formData.append('testId', testId);

    const progressDiv = document.getElementById('txtLinkedUploadProgress');
    const progressBar = document.getElementById('txtLinkedUploadProgressBar');
    const statusText = document.getElementById('txtLinkedUploadStatus');

    if (progressDiv) progressDiv.style.display = 'block';
    if (progressBar) progressBar.style.width = '30%';
    if (statusText) statusText.textContent = 'Загрузка файла...';

    try {
        const response = await fetch(`${ADMIN_API_URL}/upload-txt-linked`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` },
            body: formData
        });

        if (progressBar) progressBar.style.width = '70%';
        if (statusText) statusText.textContent = 'Обработка TXT...';

        const result = await response.json();

        if (response.ok) {
            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = 'Готово!';
            setTimeout(() => {
                showNotification(`Загружено ${result.questions.length} связанных USMLE вопросов`, 'success');
                lastQuestionUploadTestId = testId;
                adminQuestionUploadSource = 'usmle';
                const questionsFilter = document.getElementById('questionsTestFilter');
                if (questionsFilter) questionsFilter.value = String(testId);
                cachedUploadPreviewTags = [
                    ...collectTagsFromUploadResult(result.questions),
                    ...cachedUploadPreviewTags
                ].reduce((acc, t) => {
                    if (!acc.some((x) => Number(x.id) === Number(t.id))) acc.push(t);
                    return acc;
                }, []);
                if (typeof loadAdminQuestionTags === 'function') loadAdminQuestionTags();
                const modal = document.getElementById('txtLinkedUploadModal');
                if (modal) modal.style.display = 'none';
                const form = document.getElementById('txtLinkedUploadForm');
                if (form) form.reset();
                if (progressDiv) progressDiv.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';

                openUploadPreview(result.questions || [], {
                    title: `Загружено ${result.questions.length} связанных USMLE вопросов`,
                    withExplanations: true
                });
            }, 500);
        } else {
            throw new Error(result.error || 'Ошибка загрузки TXT');
        }
    } catch (error) {
        console.error('Ошибка загрузки связанных USMLE вопросов:', error);
        showNotification(error.message || 'Ошибка загрузки TXT', 'error');
        if (progressDiv) progressDiv.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
    }
}

async function handleTxtFlashcardsUpload(e) {
    e.preventDefault();

    const testId = document.getElementById('txtFlashcardsTestId')?.value || '';
    const stepGroup = document.getElementById('txtFlashcardsStepGroup')?.value || 'step1';
    const fileInput = document.getElementById('txtFlashcardsFile');

    if (!fileInput?.files?.[0]) {
        showNotification('Выберите TXT файл', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('pdf', fileInput.files[0]);
    if (testId) formData.append('testId', testId);
    formData.append('stepGroup', stepGroup);

    const progressDiv = document.getElementById('txtFlashcardsUploadProgress');
    const progressBar = document.getElementById('txtFlashcardsUploadProgressBar');
    const statusText = document.getElementById('txtFlashcardsUploadStatus');

    if (progressDiv) progressDiv.style.display = 'block';
    if (progressBar) progressBar.style.width = '30%';
    if (statusText) statusText.textContent = 'Загрузка файла...';

    try {
        const response = await fetch(`${ADMIN_API_URL}/upload-txt-flashcards`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` },
            body: formData
        });

        if (progressBar) progressBar.style.width = '70%';
        if (statusText) statusText.textContent = 'Обработка TXT...';

        const result = await response.json();

        if (response.ok) {
            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = 'Готово!';
            setTimeout(async () => {
                showNotification(result.message || `Загружено ${result.cards.length} flashcards`, 'success');
                const testFilter = document.getElementById('usmleFlashcardsTestFilter');
                if (testId && testFilter) testFilter.value = String(testId);
                const stepFilter = document.getElementById('usmleFlashcardsStepFilter');
                if (stepFilter && stepGroup) stepFilter.value = stepGroup;
                const modal = document.getElementById('txtFlashcardsUploadModal');
                if (modal) modal.style.display = 'none';
                const form = document.getElementById('txtFlashcardsUploadForm');
                if (form) form.reset();
                if (progressDiv) progressDiv.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';
                if (typeof loadAdminQuestionTags === 'function') await loadAdminQuestionTags();
                await fillUsmleFlashcardFilters();
                await loadUsmleFlashcardsAdmin();
            }, 500);
        } else {
            throw new Error(result.error || 'Ошибка загрузки TXT flashcards');
        }
    } catch (error) {
        console.error('Ошибка загрузки TXT flashcards:', error);
        showNotification(error.message || 'Ошибка загрузки TXT flashcards', 'error');
        if (progressDiv) progressDiv.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
    }
}

function escapeUploadPreviewHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizePreviewImageUrls(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
    }
    if (typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return [...new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean))];
            }
        } catch (_) { /* ignore */ }
    }
    return [trimmed];
}

function renderUploadPreviewMedia(url, emptyLabel) {
    const urls = normalizePreviewImageUrls(url);
    if (urls.length) {
        return urls.map((item, index) =>
            `<img src="${escapeUploadPreviewHtml(item)}" alt="Превью ${index + 1}" class="upload-preview-thumb">`
        ).join('');
    }
    return `<span class="upload-preview-media-empty">${escapeUploadPreviewHtml(emptyLabel)}</span>`;
}

function openUploadPreview(questions, options = {}) {
    const modal = document.getElementById('uploadPreviewModal');
    const list = document.getElementById('uploadPreviewList');
    const title = document.getElementById('uploadPreviewTitle');
    if (!modal || !list) return;

    if (title) {
        title.textContent = options.title || 'Предпросмотр загруженных вопросов';
    }

    if (!Array.isArray(questions) || questions.length === 0) {
        list.innerHTML = '<p class="upload-preview-empty">Вопросы не найдены</p>';
        modal.style.display = 'block';
        return;
    }

    list.innerHTML = questions.map((q, index) => {
        const answers = Array.isArray(q.answers) ? q.answers : [];
        const explanationHtml = (options.withExplanations || q.explanation)
            ? `<div class="upload-preview-explanation">
                    <strong>Объяснение:</strong>
                    <span>${escapeUploadPreviewHtml(q.explanation || '—')}</span>
                    <div class="upload-preview-media" data-media-for="explanation" data-question-id="${q.id}" style="margin-top:0.75rem;">
                        ${renderUploadPreviewMedia(q.explanationImageUrls || q.explanationImageUrl, 'Нет фото в объяснении')}
                    </div>
                    <div class="upload-preview-media-actions">
                        <label class="btn btn-secondary btn-sm upload-preview-file-btn">
                            📷 Фото объяснения
                            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" data-upload-kind="explanation" data-question-id="${q.id}" multiple hidden>
                        </label>
                        <button type="button" class="btn btn-secondary btn-sm" data-remove-kind="explanation" data-question-id="${q.id}" ${normalizePreviewImageUrls(q.explanationImageUrls || q.explanationImageUrl).length ? '' : 'style="display:none"'}>Удалить все</button>
                    </div>
               </div>`
            : '';

        const answersHtml = answers.map((a, aIndex) => `
            <div class="upload-preview-answer ${a.isCorrect ? 'is-correct' : ''}" data-answer-id="${a.id}">
                <div class="upload-preview-answer-main">
                    <span class="upload-preview-answer-label">${aIndex + 1}.</span>
                    <span class="upload-preview-answer-text">${escapeUploadPreviewHtml(a.text)}</span>
                    ${a.isCorrect ? '<span class="upload-preview-correct-badge">правильный</span>' : ''}
                </div>
                <div class="upload-preview-media" data-media-for="answer" data-answer-id="${a.id}">
                    ${renderUploadPreviewMedia(a.imageUrls || a.imageUrl, 'Нет фото')}
                </div>
                <div class="upload-preview-media-actions">
                    <label class="btn btn-secondary btn-sm upload-preview-file-btn">
                        📷 Фото ответа
                        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" data-upload-kind="answer" data-answer-id="${a.id}" multiple hidden>
                    </label>
                    <button type="button" class="btn btn-secondary btn-sm" data-remove-kind="answer" data-answer-id="${a.id}" ${normalizePreviewImageUrls(a.imageUrls || a.imageUrl).length ? '' : 'style="display:none"'}>Удалить все</button>
                </div>
            </div>
        `).join('');

        const selectedTagIds = new Set((q.tags || q.Tags || []).map((t) => Number(t.id)));
        const tagsOptions = (cachedUploadPreviewTags || []).map((t) =>
            `<option value="${t.id}" ${selectedTagIds.has(Number(t.id)) ? 'selected' : ''}>${escapeUploadPreviewHtml(t.name)}</option>`
        ).join('');
        const tagsHtml = `
            <div class="upload-preview-tags" style="margin-top:0.75rem;">
                <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Теги USMLE</label>
                <select multiple size="4" data-preview-tags-for="${q.id}" style="width:100%;min-height:5rem;">
                    ${tagsOptions || '<option disabled>Нет тегов — создайте во вкладке USMLE</option>'}
                </select>
                <button type="button" class="btn btn-secondary btn-sm" data-save-tags-for="${q.id}" style="margin-top:0.5rem;">Сохранить теги</button>
            </div>
        `;

        return `
            <article class="upload-preview-card" data-question-id="${q.id}">
                <header class="upload-preview-card-header">
                    <h3>Вопрос ${index + 1}</h3>
                    <span class="upload-preview-id">ID: ${q.id}</span>
                </header>
                <p class="upload-preview-question-text">${escapeUploadPreviewHtml(q.text)}</p>
                <div class="upload-preview-question-media-row">
                    <div class="upload-preview-media" data-media-for="question" data-question-id="${q.id}">
                        ${renderUploadPreviewMedia(q.imageUrls || q.imageUrl, 'Нет фото вопроса')}
                    </div>
                    <div class="upload-preview-media-actions">
                        <label class="btn btn-secondary btn-sm upload-preview-file-btn">
                            📷 Фото вопроса
                            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" data-upload-kind="question" data-question-id="${q.id}" multiple hidden>
                        </label>
                        <button type="button" class="btn btn-secondary btn-sm" data-remove-kind="question" data-question-id="${q.id}" ${normalizePreviewImageUrls(q.imageUrls || q.imageUrl).length ? '' : 'style="display:none"'}>Удалить все</button>
                    </div>
                </div>
                <div class="upload-preview-answers">
                    ${answersHtml || '<p class="upload-preview-empty">Нет ответов</p>'}
                </div>
                ${explanationHtml}
                ${tagsHtml}
            </article>
        `;
    }).join('');

    if (!cachedUploadPreviewTags.length) {
        fillUploadTagsSelect().then((tags) => {
            cachedUploadPreviewTags = tags;
        }).catch(() => {});
    }

    modal.style.display = 'block';
    bindUploadPreviewEvents();
}

function bindUploadPreviewEvents() {
    const list = document.getElementById('uploadPreviewList');
    const doneBtn = document.getElementById('uploadPreviewDoneBtn');
    if (doneBtn && doneBtn.dataset.bound !== '1') {
        doneBtn.dataset.bound = '1';
        doneBtn.addEventListener('click', closeUploadPreview);
    }
    if (!list || list.dataset.bound === '1') return;
    list.dataset.bound = '1';

    list.addEventListener('change', async (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
        const files = Array.from(input.files || []);
        if (!files.length) return;

        const kind = input.dataset.uploadKind;
        try {
            if (kind === 'question') {
                await uploadPreviewQuestionImages(input.dataset.questionId, files, input);
            } else if (kind === 'explanation') {
                await uploadPreviewExplanationImages(input.dataset.questionId, files, input);
            } else if (kind === 'answer') {
                await uploadPreviewAnswerImages(input.dataset.answerId, files, input);
            }
        } catch (error) {
            console.error('Ошибка загрузки фото в предпросмотре:', error);
            showNotification(error.message || 'Ошибка загрузки фото', 'error');
        } finally {
            input.value = '';
        }
    });

    list.addEventListener('click', async (e) => {
        const saveTagsBtn = e.target.closest('[data-save-tags-for]');
        if (saveTagsBtn) {
            const questionId = saveTagsBtn.dataset.saveTagsFor;
            const select = list.querySelector(`select[data-preview-tags-for="${questionId}"]`);
            const tagIds = Array.from(select?.selectedOptions || [])
                .map((o) => parseInt(o.value, 10))
                .filter((n) => Number.isFinite(n) && n > 0);
            try {
                const response = await fetch(`${ADMIN_API_URL}/questions/${questionId}/tags`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentAdminToken}`
                    },
                    body: JSON.stringify({ tagIds })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(result.error || 'Не удалось сохранить теги');
                }
                showNotification('Теги сохранены', 'success');
            } catch (error) {
                console.error('Ошибка сохранения тегов в предпросмотре:', error);
                showNotification(error.message || 'Ошибка сохранения тегов', 'error');
            }
            return;
        }

        const btn = e.target.closest('[data-remove-kind]');
        if (!btn) return;
        const kind = btn.dataset.removeKind;
        try {
            if (kind === 'question') {
                await removePreviewQuestionImage(btn.dataset.questionId, btn);
            } else if (kind === 'explanation') {
                await removePreviewExplanationImage(btn.dataset.questionId, btn);
            } else if (kind === 'answer') {
                await removePreviewAnswerImage(btn.dataset.answerId, btn);
            }
        } catch (error) {
            console.error('Ошибка удаления фото в предпросмотре:', error);
            showNotification(error.message || 'Ошибка удаления фото', 'error');
        }
    });
}

function updatePreviewMediaNode(selector, imageUrl, emptyLabel) {
    const media = document.querySelector(selector);
    if (!media) return;
    media.innerHTML = renderUploadPreviewMedia(imageUrl, emptyLabel);
}

function findPreviewRemoveBtn(kind, id) {
    if (kind === 'question') {
        return document.querySelector(`[data-remove-kind="question"][data-question-id="${id}"]`);
    }
    if (kind === 'explanation') {
        return document.querySelector(`[data-remove-kind="explanation"][data-question-id="${id}"]`);
    }
    return document.querySelector(`[data-remove-kind="answer"][data-answer-id="${id}"]`);
}

async function uploadPreviewQuestionImages(questionId, files, inputEl) {
    let result = {};
    for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);
        const response = await fetch(`${ADMIN_API_URL}/questions/${questionId}/image${i > 0 ? '?append=true' : ''}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` },
            body: formData
        });
        result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || 'Не удалось загрузить фото вопроса');
        }
    }
    updatePreviewMediaNode(
        `.upload-preview-media[data-media-for="question"][data-question-id="${questionId}"]`,
        result.imageUrls || result.imageUrl,
        'Нет фото вопроса'
    );
    const removeBtn = findPreviewRemoveBtn('question', questionId);
    if (removeBtn) removeBtn.style.display = '';
    if (inputEl) inputEl.value = '';
    showNotification('Фото вопроса загружено', 'success');
}

async function uploadPreviewAnswerImages(answerId, files, inputEl) {
    let result = {};
    for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);
        const response = await fetch(`${ADMIN_API_URL}/answers/${answerId}/image${i > 0 ? '?append=true' : ''}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` },
            body: formData
        });
        result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || 'Не удалось загрузить фото ответа');
        }
    }
    updatePreviewMediaNode(
        `.upload-preview-media[data-media-for="answer"][data-answer-id="${answerId}"]`,
        result.imageUrls || result.imageUrl,
        'Нет фото'
    );
    const removeBtn = findPreviewRemoveBtn('answer', answerId);
    if (removeBtn) removeBtn.style.display = '';
    if (inputEl) inputEl.value = '';
    showNotification('Фото ответа загружено', 'success');
}

async function uploadPreviewExplanationImages(questionId, files, inputEl) {
    let result = {};
    for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);
        const response = await fetch(`${ADMIN_API_URL}/questions/${questionId}/explanation-image${i > 0 ? '?append=true' : ''}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` },
            body: formData
        });
        result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || 'Не удалось загрузить фото объяснения');
        }
    }
    updatePreviewMediaNode(
        `.upload-preview-media[data-media-for="explanation"][data-question-id="${questionId}"]`,
        result.imageUrls || result.imageUrl,
        'Нет фото в объяснении'
    );
    const removeBtn = findPreviewRemoveBtn('explanation', questionId);
    if (removeBtn) removeBtn.style.display = '';
    if (inputEl) inputEl.value = '';
    showNotification('Фото объяснения загружено', 'success');
}

async function removePreviewQuestionImage(questionId, btn) {
    const response = await fetch(`${ADMIN_API_URL}/questions/${questionId}/image`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || 'Не удалось удалить фото вопроса');
    }
    updatePreviewMediaNode(
        `.upload-preview-media[data-media-for="question"][data-question-id="${questionId}"]`,
        null,
        'Нет фото вопроса'
    );
    if (btn) btn.style.display = 'none';
    showNotification('Фото вопроса удалено', 'success');
}

async function removePreviewExplanationImage(questionId, btn) {
    const response = await fetch(`${ADMIN_API_URL}/questions/${questionId}/explanation-image`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || 'Не удалось удалить фото объяснения');
    }
    updatePreviewMediaNode(
        `.upload-preview-media[data-media-for="explanation"][data-question-id="${questionId}"]`,
        null,
        'Нет фото в объяснении'
    );
    if (btn) btn.style.display = 'none';
    showNotification('Фото объяснения удалено', 'success');
}

async function removePreviewAnswerImage(answerId, btn) {
    const response = await fetch(`${ADMIN_API_URL}/answers/${answerId}/image`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || 'Не удалось удалить фото ответа');
    }
    updatePreviewMediaNode(
        `.upload-preview-media[data-media-for="answer"][data-answer-id="${answerId}"]`,
        null,
        'Нет фото'
    );
    if (btn) btn.style.display = 'none';
    showNotification('Фото ответа удалено', 'success');
}

function closeUploadPreview() {
    const modal = document.getElementById('uploadPreviewModal');
    if (modal) modal.style.display = 'none';
    refreshQuestionsAfterUpload();
}

// Редакторы вопросов
async function loadEditors() {
    const list = document.getElementById('editorsList');
    if (!list) return;

    try {
        const response = await fetch(`${ADMIN_API_URL}/editors`, { headers: adminAuthHeaders() });
        if (!response.ok) throw new Error();
        const editors = await response.json();

        if (!editors.length) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Редакторов пока нет</p>';
            return;
        }

        list.innerHTML = editors.map(ed => `
            <div class="admin-list-item">
                <div style="flex: 1;">
                    <strong>${escapeAdminHtml(ed.username)}</strong>
                    ${ed.displayName ? `<span style="color: var(--text-muted); margin-left: 0.5rem;">(${escapeAdminHtml(ed.displayName)})</span>` : ''}
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0.35rem 0 0;">
                        ${ed.isActive ? 'Активен' : 'Отключён'} • создан ${new Date(ed.createdAt).toLocaleDateString('ru-RU')}
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="editEditorAccount(${ed.id})">Изменить</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteEditorAccount(${ed.id})">Удалить</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки редакторов:', error);
        showNotification('Ошибка загрузки редакторов', 'error');
    }
}

function openEditorModal(isEdit = false) {
    document.getElementById('editorModalTitle').textContent = isEdit ? 'Редактировать аккаунт' : 'Добавить редактора';
    document.getElementById('editorUsername').disabled = isEdit;
    document.getElementById('editorActiveGroup').style.display = isEdit ? 'block' : 'none';
    document.getElementById('editorPassword').required = !isEdit;
    document.getElementById('editorPasswordHint').textContent = isEdit
        ? '(оставьте пустым, чтобы не менять)'
        : '(мин. 6 символов)';
    document.getElementById('editorModal').style.display = 'block';
}

window.editEditorAccount = async function(editorId) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/editors`, { headers: adminAuthHeaders() });
        if (!response.ok) throw new Error();
        const editors = await response.json();
        const ed = editors.find(e => e.id === editorId);
        if (!ed) {
            showNotification('Редактор не найден', 'error');
            return;
        }
        document.getElementById('editorId').value = ed.id;
        document.getElementById('editorUsername').value = ed.username;
        document.getElementById('editorDisplayName').value = ed.displayName || '';
        document.getElementById('editorPassword').value = '';
        document.getElementById('editorIsActive').checked = ed.isActive !== false;
        openEditorModal(true);
    } catch (error) {
        showNotification('Ошибка загрузки редактора', 'error');
    }
};

window.deleteEditorAccount = async function(editorId) {
    if (!confirm('Удалить аккаунт редактора?')) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/editors/${editorId}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        if (response.ok) {
            showNotification('Редактор удалён', 'success');
            loadEditors();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        showNotification('Ошибка удаления', 'error');
    }
};

async function saveEditorAccount(e) {
    e.preventDefault();
    const id = document.getElementById('editorId').value;
    const username = document.getElementById('editorUsername').value.trim();
    const displayName = document.getElementById('editorDisplayName').value.trim();
    const password = document.getElementById('editorPassword').value;
    const isActive = document.getElementById('editorIsActive').checked;

    try {
        if (id) {
            const body = { displayName: displayName || null, isActive };
            if (password) body.password = password;
            const response = await fetch(`${ADMIN_API_URL}/editors/${id}`, {
                method: 'PUT',
                headers: { ...adminAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const data = await response.json();
                showNotification(data.errors?.[0]?.msg || data.error || 'Ошибка', 'error');
                return;
            }
            showNotification('Редактор обновлён', 'success');
        } else {
            if (!password || password.length < 6) {
                showNotification('Укажите пароль (мин. 6 символов)', 'error');
                return;
            }
            const response = await fetch(`${ADMIN_API_URL}/editors`, {
                method: 'POST',
                headers: { ...adminAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, displayName: displayName || null })
            });
            if (!response.ok) {
                const data = await response.json();
                showNotification(data.errors?.[0]?.msg || data.error || 'Ошибка', 'error');
                return;
            }
            showNotification('Редактор создан', 'success');
        }
        document.getElementById('editorModal').style.display = 'none';
        document.getElementById('editorForm').reset();
        document.getElementById('editorId').value = '';
        loadEditors();
    } catch (error) {
        showNotification('Ошибка сохранения', 'error');
    }
}

// Журнал правок
let currentAuditPage = 1;

const AUDIT_ACTION_LABELS = {
    create: 'Создание',
    update: 'Изменение',
    delete: 'Удаление',
    error_report: 'Отчёт об ошибке'
};

function formatAuditDateInput(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function initAuditDateFilters() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    const fromEl = document.getElementById('auditDateFrom');
    const toEl = document.getElementById('auditDateTo');
    if (fromEl && !fromEl.value) fromEl.value = formatAuditDateInput(from);
    if (toEl && !toEl.value) toEl.value = formatAuditDateInput(to);
}

function setAuditDatePreset(days) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    document.getElementById('auditDateFrom').value = formatAuditDateInput(from);
    document.getElementById('auditDateTo').value = formatAuditDateInput(to);
    loadAuditLogs(1);
}

async function populateAuditEditorFilter() {
    const select = document.getElementById('auditEditorFilter');
    if (!select) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/editors`, { headers: adminAuthHeaders() });
        if (!response.ok) return;
        const editors = await response.json();
        const current = select.value;
        select.innerHTML = '<option value="">Все редакторы</option>' +
            editors.map(ed => `<option value="${ed.id}">${escapeAdminHtml(ed.username)}</option>`).join('');
        select.value = current;
    } catch (e) {
        console.error(e);
    }
}

async function loadAuditLogs(page = 1) {
    const list = document.getElementById('auditLogsList');
    if (!list) return;

    initAuditDateFilters();

    const from = document.getElementById('auditDateFrom')?.value || '';
    const to = document.getElementById('auditDateTo')?.value || '';
    const actorType = document.getElementById('auditActorType')?.value || '';
    const editorId = document.getElementById('auditEditorFilter')?.value || '';
    const action = document.getElementById('auditActionFilter')?.value || '';
    const search = document.getElementById('auditSearch')?.value || '';

    const params = new URLSearchParams({
        page: String(page),
        limit: '30',
        from,
        to,
        search
    });
    if (action) params.set('action', action);
    if (actorType) params.set('actorType', actorType);
    if (editorId && (!actorType || actorType === 'editor')) params.set('editorId', editorId);

    list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Загрузка…</p>';

    try {
        const response = await fetch(`${ADMIN_API_URL}/audit-logs?${params}`, { headers: adminAuthHeaders() });
        if (!response.ok) throw new Error();
        const data = await response.json();
        currentAuditPage = page;

        if (!data.logs?.length) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">За выбранный период записей нет</p>';
        } else {
            list.innerHTML = data.logs.map(log => {
                const dt = new Date(log.createdAt);
                const actionLabel = AUDIT_ACTION_LABELS[log.action] || log.action;
                const actorBadge = log.actorType === 'admin'
                    ? '<span style="background: #2563eb; color: #fff; padding: 0.1rem 0.45rem; border-radius: 0.25rem; font-size: 0.7rem;">Админ</span>'
                    : '<span style="background: #0d9488; color: #fff; padding: 0.1rem 0.45rem; border-radius: 0.25rem; font-size: 0.7rem;">Редактор</span>';
                const actionColor = log.action === 'delete' ? '#dc2626' : (log.action === 'create' ? '#059669' : 'var(--text-secondary)');

                let textBlock = '';
                if (log.questionTextBefore || log.questionTextAfter) {
                    if (log.action === 'update') {
                        textBlock = `
                            <p style="font-size: 0.8rem; margin: 0.35rem 0 0; color: var(--text-muted);"><strong>Было:</strong> ${escapeAdminHtml(log.questionTextBefore || '—')}</p>
                            <p style="font-size: 0.8rem; margin: 0.2rem 0 0; color: var(--text-secondary);"><strong>Стало:</strong> ${escapeAdminHtml(log.questionTextAfter || '—')}</p>
                        `;
                    } else if (log.action === 'create') {
                        textBlock = `<p style="font-size: 0.8rem; margin: 0.35rem 0 0;">${escapeAdminHtml(log.questionTextAfter || '')}</p>`;
                    } else if (log.action === 'delete') {
                        textBlock = `<p style="font-size: 0.8rem; margin: 0.35rem 0 0; color: var(--text-muted);">${escapeAdminHtml(log.questionTextBefore || '')}</p>`;
                    }
                }

                const meta = [];
                if (log.testName) meta.push(escapeAdminHtml(log.testName));
                if (log.testId) meta.push(`тест #${log.testId}`);
                if (log.questionId) meta.push(`вопрос #${log.questionId}`);

                return `
                    <div class="admin-list-item" style="align-items: flex-start;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.35rem;">
                                <strong>${escapeAdminHtml(log.actorUsername)}</strong>
                                ${actorBadge}
                                <span style="color: ${actionColor}; font-weight: 600; font-size: 0.875rem;">${actionLabel}</span>
                            </div>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">${meta.join(' · ')}</p>
                            ${textBlock}
                            ${log.details ? `<p style="font-size: 0.78rem; color: var(--text-secondary); margin: 0.35rem 0 0;">${escapeAdminHtml(log.details)}</p>` : ''}
                        </div>
                        <div style="text-align: right; white-space: nowrap; font-size: 0.8rem; color: var(--text-muted);">
                            ${dt.toLocaleDateString('ru-RU')}<br>
                            ${dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                `;
            }).join('');
        }

        const pagination = document.getElementById('auditLogsPagination');
        if (pagination && data.pagination) {
            const { totalPages, page: currentPage, total } = data.pagination;
            if (totalPages <= 1) {
                pagination.innerHTML = total ? `<span style="color: var(--text-muted); font-size: 0.875rem;">Всего: ${total}</span>` : '';
            } else {
                let html = '';
                const start = Math.max(1, currentPage - 2);
                const end = Math.min(totalPages, currentPage + 2);
                for (let i = start; i <= end; i++) {
                    html += `<button type="button" class="admin-pagination-btn ${i === currentPage ? 'active' : ''}" onclick="loadAuditLogs(${i})">${i}</button>`;
                }
                pagination.innerHTML = html + `<span style="color: var(--text-muted); font-size: 0.875rem; margin-left: 0.5rem;">${total} записей</span>`;
            }
        }
    } catch (error) {
        console.error('Ошибка журнала правок:', error);
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Ошибка загрузки</p>';
        showNotification('Ошибка загрузки журнала', 'error');
    }
}

window.loadAuditLogs = loadAuditLogs;

function setupAuditEventListeners() {
    document.getElementById('auditApplyFilters')?.addEventListener('click', () => loadAuditLogs(1));
    document.getElementById('auditPreset7d')?.addEventListener('click', () => setAuditDatePreset(7));
    document.getElementById('auditPreset30d')?.addEventListener('click', () => setAuditDatePreset(30));
    document.getElementById('auditActorType')?.addEventListener('change', () => {
        const editorFilter = document.getElementById('auditEditorFilter');
        if (editorFilter) {
            editorFilter.disabled = document.getElementById('auditActorType').value === 'admin';
        }
    });
    let auditSearchTimeout;
    document.getElementById('auditSearch')?.addEventListener('input', () => {
        clearTimeout(auditSearchTimeout);
        auditSearchTimeout = setTimeout(() => loadAuditLogs(1), 450);
    });
}

// Переключение табов
function switchTab(tabName) {
    // Убираем активный класс со всех табов и контента
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.remove('active'));

    // Активируем выбранный таб
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');

    // Загружаем данные для таба
    if (tabName !== 'chats') {
        stopAdminChatsPolling();
        stopAdminChatMessagesPolling();
    }

    switch(tabName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'users':
            loadUsers();
            loadUniversitiesForUsersFilter();
            break;
        case 'devices':
            loadDeviceAlerts(50);
            break;
        case 'universities':
            loadUniversities();
            break;
        case 'subjects':
            loadSubjects();
            loadUniversitiesForSubjectFilters();
            break;
        case 'tests':
            loadTests();
            loadSubjectsForFilters();
            loadUniversitiesForFilters();
            break;
        case 'questions':
            loadUniversitiesForQuestionsFilter();
            loadTestsForFilters();
            renderQuestionsSelectPrompt();
            break;
        case 'uniFlashcards':
            initUniFlashcardsAdmin();
            break;
        case 'editors':
            loadEditors();
            break;
        case 'audit':
            populateAuditEditorFilter();
            loadAuditLogs(1);
            break;
        case 'news':
            loadNewsAdmin();
            break;
        case 'schedule':
            loadScheduleAdmin();
            break;
        case 'messages':
            loadMessages();
            break;
        case 'chats':
            loadAdminBroadcastHistory();
            loadAdminChats();
            startAdminChatsPolling();
            break;
        case 'documents':
            loadDocumentsSettings();
            break;
        case 'promo':
            loadPromoCodes();
            break;
        case 'subscriptions':
            loadSubscriptionPlansAdmin();
            break;
        case 'usmle':
            loadUsmleAdminPanel();
            break;
        case 'analytics':
            loadAdminAnalytics();
            break;
    }
}

function formatAnalyticsDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU');
}

function formatSom(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escapeAnalyticsAttr(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/\n/g, ' ');
}

/** Запасной вариант: старый API без purchaseTimeSeries — строим те же точки из payments */
function buildPurchaseTimeSeriesFromRangeAndPayments(range, payments) {
    if (!range || !payments || !payments.length) return [];
    const dayMs = 24 * 60 * 60 * 1000;
    const from = new Date(range.from);
    const to = new Date(range.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];

    const buckets = new Map();
    for (const p of payments) {
        const key = new Date(p.paidAt).toISOString().slice(0, 10);
        const cur = buckets.get(key) || { count: 0, revenue: 0 };
        cur.count += 1;
        cur.revenue += Number(p.amount) || 0;
        buckets.set(key, cur);
    }

    const startUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const endUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    const series = [];
    for (let t = startUtc; t <= endUtc; t += dayMs) {
        const key = new Date(t).toISOString().slice(0, 10);
        const agg = buckets.get(key) || { count: 0, revenue: 0 };
        series.push({
            date: key,
            count: agg.count,
            revenue: Math.round(agg.revenue * 100) / 100
        });
    }
    return series;
}

/** series: { date, count, revenue }[] — все успешные оплаты по дням (с бэкенда) */
function renderAnalyticsPurchasesChart(series) {
    const wrap = document.getElementById('analyticsPurchasesChartWrap');
    const hintEl = document.getElementById('analyticsPurchasesChartHint');
    if (!wrap) return;

    if (hintEl) {
        hintEl.textContent =
            'Столбики — число успешных оплат за день (регистрация с оплатой, первая подписка, продление и пр.). ' +
            'Наведите на столбец: сумма за день. Ось времени по календарным суткам UTC.';
    }

    if (!Array.isArray(series) || !series.length) {
        wrap.innerHTML =
            '<p class="admin-analytics-chart-empty" style="color: var(--text-muted); text-align: center; padding: 1rem 0;">Нет данных за период (обновите сервер и нажмите «Показать»). Либо за интервал нет ни одного дня.</p>';
        return;
    }

    const totalPayments = series.reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    const maxC = Math.max(1, ...series.map((s) => Number(s.count) || 0));
    const barMaxPx = 160;
    const labelEvery = series.length <= 14 ? 1 : series.length <= 35 ? Math.ceil(series.length / 14) : Math.ceil(series.length / 12);

    const cols = series.map((s, i) => {
        const cnt = Number(s.count) || 0;
        const hPx = cnt <= 0
            ? 6
            : Math.max(8, Math.round((cnt / maxC) * barMaxPx));
        const tp = `${s.date}: ${cnt} ${cnt === 1 ? 'оплата' : cnt === 0 ? 'оплат нет' : 'оплат'}, ${formatSom(s.revenue ?? 0)} сом`;
        const showLab = i % labelEvery === 0 || i === series.length - 1;
        const dt = new Date(`${s.date}T12:00:00Z`);
        const lab = Number.isNaN(dt.getTime())
            ? s.date.slice(5)
            : dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        const barClass = cnt <= 0 ? 'admin-analytics-bar admin-analytics-bar--zero' : 'admin-analytics-bar';
        return `
            <div class="admin-analytics-bar-col-simple" title="${escapeAnalyticsAttr(tp)}">
                <div class="${barClass}" style="height:${hPx}px" role="presentation"></div>
                <span class="admin-analytics-bar-xlabel"${showLab ? '' : ' style="opacity:0"'}>${escapeAnalyticsAttr(lab)}</span>
            </div>
        `;
    }).join('');

    const zerosNote = totalPayments === 0
        ? `<p class="admin-analytics-chart-zero-note">За эти даты успешных оплат не было — серые столбики соответствуют нулям по дням.</p>`
        : '';

    wrap.innerHTML = `
        ${zerosNote}
        <div class="admin-analytics-bars-scroll">
            <div class="admin-analytics-bars-simple" style="--analytics-bar-cols:${series.length}">
                ${cols}
            </div>
        </div>
    `;
}

function renderAnalyticsEmpty(container, text) {
    if (container) {
        container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 1.5rem;">${escapeAdminHtml(text)}</p>`;
    }
}

function analyticsMatchesQuery(row, query, keys) {
    if (!query) return true;
    const q = query.toLowerCase();
    return keys.some((key) => String(row[key] || '').toLowerCase().includes(q));
}

function applyAnalyticsView() {
    document.querySelectorAll('.admin-analytics-view-btn').forEach((btn) => {
        btn.classList.toggle('active', (btn.dataset.view || 'all') === analyticsView);
    });

    document.querySelectorAll('.admin-analytics-section').forEach((section) => {
        const key = section.dataset.analyticsSection;
        let show = false;
        if (analyticsView === 'all') {
            show = true;
        } else if (analyticsView === 'registrations') {
            show = key === 'registrations';
        } else if (analyticsView === 'renewals') {
            show = key === 'renewals';
        } else if (analyticsView === 'expired') {
            show = key === 'expired';
        } else if (analyticsView === 'reg_payments' || analyticsView === 'payments') {
            show = key === 'payments';
        }
        section.style.display = show ? '' : 'none';
    });

    const paymentsTitle = document.querySelector('[data-analytics-section="payments"] h3');
    if (paymentsTitle) {
        paymentsTitle.textContent = analyticsView === 'reg_payments'
            ? 'Оплата при регистрации'
            : 'Все оплаты за период';
    }

    refreshAnalyticsTables();
}

function refreshAnalyticsTables() {
    if (!analyticsDataCache) return;

    const regQuery = (document.getElementById('analyticsRegistrationsSearch')?.value || '').trim();
    const renQuery = (document.getElementById('analyticsRenewalsSearch')?.value || '').trim();
    const expQuery = (document.getElementById('analyticsExpiredSearch')?.value || '').trim();
    const payQuery = (document.getElementById('analyticsPaymentsSearch')?.value || '').trim();

    const registrations = (analyticsDataCache.registrations || []).filter((row) =>
        analyticsMatchesQuery(row, regQuery, ['username', 'email'])
    );
    const renewals = (analyticsDataCache.renewals || []).filter((row) =>
        analyticsMatchesQuery(row, renQuery, ['username', 'email'])
    );
    const expired = (analyticsDataCache.expiredSubscriptions || []).filter((row) =>
        analyticsMatchesQuery(row, expQuery, ['username', 'email'])
    );

    let payments = analyticsDataCache.payments || [];
    if (analyticsView === 'reg_payments') {
        payments = payments.filter((p) => p.kind === 'registration');
    }
    payments = payments.filter((row) =>
        analyticsMatchesQuery(row, payQuery, ['username', 'email', 'kindLabel', 'promoCode'])
    );

    renderAnalyticsRegistrationsTable(registrations);
    renderAnalyticsRenewalsTable(renewals);
    renderAnalyticsExpiredTable(expired);
    const paymentsEmpty = analyticsView === 'reg_payments'
        ? 'Оплат при регистрации за период нет'
        : 'Оплат за период нет';
    renderAnalyticsPaymentsTable(payments, paymentsEmpty);
}

function renderAnalyticsRegistrationsTable(rows) {
    const el = document.getElementById('analyticsRegistrationsList');
    if (!el) return;
    if (!rows.length) {
        renderAnalyticsEmpty(el, 'За период регистраций нет');
        return;
    }
    el.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Никнейм</th>
                    <th>Email</th>
                    <th>Дата регистрации</th>
                    <th>Подписка до</th>
                    <th>Оплата при рег.</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((u) => `
                    <tr>
                        <td>${u.id}</td>
                        <td>${escapeAdminHtml(u.username)}</td>
                        <td>${escapeAdminHtml(u.email)}</td>
                        <td>${formatAnalyticsDate(u.createdAt)}</td>
                        <td>${u.subscriptionEndDate ? formatAnalyticsDate(u.subscriptionEndDate) : '—'}</td>
                        <td>${u.hasPaidRegistration ? 'Да' : 'Нет'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderAnalyticsPaymentsTable(rows, emptyText) {
    const el = document.getElementById('analyticsPaymentsList');
    if (!el) return;
    if (!rows.length) {
        renderAnalyticsEmpty(el, emptyText);
        return;
    }
    el.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Дата оплаты</th>
                    <th>Пользователь</th>
                    <th>Email</th>
                    <th>Тип</th>
                    <th>Тариф</th>
                    <th>Сумма, сом</th>
                    <th>Промокод</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((p) => `
                    <tr>
                        <td>${formatAnalyticsDate(p.paidAt)}</td>
                        <td>${escapeAdminHtml(p.username || '—')}</td>
                        <td>${escapeAdminHtml(p.email || '—')}</td>
                        <td>${escapeAdminHtml(p.kindLabel)}</td>
                        <td>${escapeAdminHtml(p.subscriptionLabel || '—')}</td>
                        <td><strong>${formatSom(p.amount)}</strong></td>
                        <td>${escapeAdminHtml(p.promoCode || '—')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderAnalyticsRenewalsTable(rows) {
    const el = document.getElementById('analyticsRenewalsList');
    if (!el) return;
    if (!rows.length) {
        renderAnalyticsEmpty(el, 'Продлений подписки за период нет');
        return;
    }
    el.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Дата оплаты</th>
                    <th>Никнейм</th>
                    <th>Email</th>
                    <th>Регистрация аккаунта</th>
                    <th>Тариф</th>
                    <th>Сумма, сом</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((p) => `
                    <tr>
                        <td>${formatAnalyticsDate(p.paidAt)}</td>
                        <td>${escapeAdminHtml(p.username || '—')}</td>
                        <td>${escapeAdminHtml(p.email || '—')}</td>
                        <td>${p.userRegisteredAt ? formatAnalyticsDate(p.userRegisteredAt) : '—'}</td>
                        <td>${escapeAdminHtml(p.subscriptionLabel || '—')}</td>
                        <td><strong>${formatSom(p.amount)}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderAnalyticsExpiredTable(rows) {
    const el = document.getElementById('analyticsExpiredList');
    if (!el) return;
    if (!rows.length) {
        renderAnalyticsEmpty(el, 'За период истечений подписки нет');
        return;
    }
    el.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Никнейм</th>
                    <th>Email</th>
                    <th>Дата окончания</th>
                    <th>Дней без подписки</th>
                    <th>Регистрация аккаунта</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((u) => `
                    <tr>
                        <td>${u.id}</td>
                        <td>${escapeAdminHtml(u.username)}</td>
                        <td>${escapeAdminHtml(u.email)}</td>
                        <td>${formatAnalyticsDate(u.subscriptionEndDate)}</td>
                        <td>${u.daysSinceExpired != null ? u.daysSinceExpired : '—'}</td>
                        <td>${formatAnalyticsDate(u.createdAt)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadAdminAnalytics() {
    if (!currentAdminToken) return;

    const params = new URLSearchParams({ period: analyticsPeriod });
    if (analyticsPeriod === 'custom') {
        const from = document.getElementById('analyticsDateFrom')?.value;
        const to = document.getElementById('analyticsDateTo')?.value;
        if (!from || !to) {
            showNotification('Укажите даты «с» и «по»', 'error');
            return;
        }
        params.set('from', from);
        params.set('to', to);
    }

    const rangeLabel = document.getElementById('analyticsRangeLabel');
    if (rangeLabel) rangeLabel.textContent = 'Загрузка…';

    try {
        const response = await fetch(`${ADMIN_API_URL}/analytics?${params}`, {
            headers: adminAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка загрузки аналитики');
        }

        const s = data.summary || {};
        const set = (id, val) => {
            const node = document.getElementById(id);
            if (node) node.textContent = val;
        };
        set('analyticsRegistrations', s.registrationsCount ?? 0);
        set('analyticsPayments', s.paymentsCount ?? 0);
        set('analyticsRevenue', formatSom(s.revenueTotal ?? 0));
        set('analyticsRenewals', s.renewalPaymentsCount ?? 0);
        set('analyticsUniqueRenewalUsers', s.uniqueRenewalUsersCount ?? 0);
        set('analyticsRenewalRevenue', formatSom(s.renewalRevenue ?? 0));
        set('analyticsRegPayments', s.registrationPaymentsCount ?? 0);
        set('analyticsExpiredSubs', s.expiredSubscriptionsCount ?? 0);

        const renewalsHint = document.getElementById('analyticsRenewalsHint');
        if (renewalsHint) {
            const unique = s.uniqueRenewalUsersCount ?? 0;
            const rev = formatSom(s.renewalRevenue ?? 0);
            renewalsHint.textContent =
                'Учтены оплаты подписки после даты регистрации (не первая оплата в день регистрации). ' +
                `Уникальных пользователей: ${unique}, выручка: ${rev} сом.`;
        }

        const expiredHint = document.getElementById('analyticsExpiredHint');
        if (expiredHint) {
            const count = s.expiredSubscriptionsCount ?? 0;
            expiredHint.textContent =
                'Пользователи, у которых дата окончания подписки попала в выбранный период и уже прошла (подписка не активна). ' +
                `Всего: ${count}.`;
        }

        let purchaseSeries = Array.isArray(data.purchaseTimeSeries) && data.purchaseTimeSeries.length
            ? data.purchaseTimeSeries
            : buildPurchaseTimeSeriesFromRangeAndPayments(data.range, data.payments);

        renderAnalyticsPurchasesChart(purchaseSeries);

        analyticsDataCache = {
            registrations: data.registrations || [],
            renewals: data.renewals || [],
            expiredSubscriptions: data.expiredSubscriptions || [],
            payments: data.payments || []
        };

        if (rangeLabel && data.range) {
            const fromD = new Date(data.range.from).toLocaleDateString('ru-RU');
            const toD = new Date(data.range.to).toLocaleDateString('ru-RU');
            let extra = '';
            if (s.revenueNet != null) {
                extra = ` · к зачислению (net): ${formatSom(s.revenueNet)} сом`;
            }
            if (s.averagePayment > 0) {
                extra += ` · средний чек: ${formatSom(s.averagePayment)} сом`;
            }
            rangeLabel.textContent = `Период: ${fromD} — ${toD}${extra}`;
        }

        applyAnalyticsView();
    } catch (error) {
        console.error('Ошибка аналитики:', error);
        if (rangeLabel) rangeLabel.textContent = '';
        const chartWrap = document.getElementById('analyticsPurchasesChartWrap');
        if (chartWrap) {
            chartWrap.innerHTML =
                '<p class="admin-analytics-chart-empty" style="color: var(--text-muted); text-align: center; padding: 1rem 0;">График недоступен — ошибка загрузки</p>';
        }
        const chartHint = document.getElementById('analyticsPurchasesChartHint');
        if (chartHint) chartHint.textContent = '';
        showNotification(error.message || 'Ошибка загрузки аналитики', 'error');
    }
}

// Загрузка предметов для фильтров
async function loadSubjectsForFilters() {
    try {
        const universityId = document.getElementById('testsUniversityFilter')?.value || '';
        const programType = document.getElementById('testsProgramFilter')?.value || '';
        const qs = new URLSearchParams({ compact: '1' });
        if (universityId) qs.set('universityId', universityId);
        if (programType) qs.set('programType', programType);
        const response = await fetch(`${ADMIN_API_URL}/subjects?${qs}`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error('subjects');
        const subjects = await response.json();
        const testsFilter = document.getElementById('testsSubjectFilter');
        if (testsFilter) {
            const current = testsFilter.value;
            testsFilter.innerHTML = '<option value="">Все предметы</option>' +
                subjects.map(s => {
                    const tag = s.programType === 'usmle' ? 'USMLE' : '';
                    return `<option value="${s.id}">${s.name}${tag ? ` (${tag})` : ''}</option>`;
                }).join('');
            if (current && subjects.some(s => String(s.id) === String(current))) {
                testsFilter.value = current;
            } else {
                testsFilter.value = '';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки предметов для фильтра:', error);
    }
}

async function loadUniversitiesForFilters() {
    try {
        const universities = await fetchAdminUniversitiesCompact();
        const filter = document.getElementById('testsUniversityFilter');
        if (filter) {
            const current = filter.value;
            filter.innerHTML = '<option value="">Все университеты</option>' +
                universities.map(u => `<option value="${u.id}">${u.shortName}</option>`).join('');
            if (current) filter.value = current;
        }
    } catch (error) {
        console.error('Ошибка загрузки университетов для фильтра:', error);
    }
}

async function loadUniversitiesForSubjectFilters() {
    try {
        const universities = await fetchAdminUniversitiesCompact();
        const filter = document.getElementById('subjectsUniversityFilter');
        if (filter) {
            const current = filter.value;
            filter.innerHTML = '<option value="">Все университеты</option>' +
                universities.map(u => `<option value="${u.id}">${u.shortName}</option>`).join('');
            if (current) filter.value = current;
        }
    } catch (error) {
        console.error('Ошибка загрузки университетов для фильтра предметов:', error);
    }
}

async function loadUniversitiesForUsersFilter() {
    try {
        const universities = await fetchAdminUniversitiesCompact();
        const filter = document.getElementById('usersUniversityFilter');
        if (filter) {
            const current = filter.value;
            filter.innerHTML = '<option value="">Все университеты</option>' +
                universities.map(u => `<option value="${u.id}">${u.shortName}</option>`).join('');
            if (current) filter.value = current;
        }
    } catch (error) {
        console.error('Ошибка загрузки университетов для фильтра пользователей:', error);
    }
}

async function loadUniversitiesForQuestionsFilter() {
    try {
        const universities = await fetchAdminUniversitiesCompact();
        const filter = document.getElementById('questionsUniversityFilter');
        if (filter) {
            const current = filter.value;
            filter.innerHTML = '<option value="">Все университеты</option>' +
                universities.map(u => `<option value="${u.id}">${u.shortName}</option>`).join('');
            if (current) filter.value = current;
        }
    } catch (error) {
        console.error('Ошибка загрузки университетов для фильтра вопросов:', error);
    }
}

function filterTestSubjectsByUniversity() {
    const uniSelect = document.getElementById('testUniversityId');
    const subjectSelect = document.getElementById('testSubjectId');
    if (!uniSelect || !subjectSelect) return;
    const uniId = uniSelect.value;
    const current = subjectSelect.value;
    Array.from(subjectSelect.options).forEach((opt, idx) => {
        if (idx === 0) {
            opt.hidden = false;
            return;
        }
        const optUni = opt.getAttribute('data-university-id') || '';
        const isUsmle = opt.getAttribute('data-program-type') === 'usmle';
        const match = isUsmle ? !uniId : (!uniId || !optUni || optUni === uniId);
        opt.hidden = !match;
        if (!match && opt.value === current) {
            subjectSelect.value = '';
        }
    });
}

// Загрузка тестов для фильтров
async function loadTestsForFilters() {
    try {
        const universityId = document.getElementById('questionsUniversityFilter')?.value || '';
        const programType = document.getElementById('questionsProgramFilter')?.value || '';
        const qs = new URLSearchParams({ compact: '1' });
        if (universityId) qs.set('universityId', universityId);
        if (programType) qs.set('programType', programType);
        const response = await fetch(`${ADMIN_API_URL}/tests?${qs}`, {
            headers: adminAuthHeaders()
        });
        if (!response.ok) throw new Error('tests');
        const tests = await response.json();
        const questionsFilter = document.getElementById('questionsTestFilter');
        if (questionsFilter) {
            const current = questionsFilter.value;
            questionsFilter.innerHTML = '<option value="">Выберите тест</option>' +
                tests.map(t => {
                    const tag = t.programType === 'usmle' ? ' USMLE' : '';
                    return `<option value="${t.id}">${t.name}${tag}</option>`;
                }).join('');
            if (current && tests.some(t => String(t.id) === String(current))) {
                questionsFilter.value = current;
            } else {
                questionsFilter.value = '';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки тестов для фильтра:', error);
    }
}

// Загрузка сообщений обратной связи
let currentMessagesPage = 1;
let currentMessageId = null;

async function loadMessages(page = 1) {
    try {
        const status = document.getElementById('messagesStatusFilter')?.value || '';
        const reportType = document.getElementById('messagesTypeFilter')?.value || '';
        const search = document.getElementById('messagesSearch')?.value || '';
        const url = `${ADMIN_API_URL}/contact-messages?page=${page}&limit=20&status=${encodeURIComponent(status)}&reportType=${encodeURIComponent(reportType)}&search=${encodeURIComponent(search)}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки сообщений');
        }

        const data = await response.json();
        currentMessagesPage = page;

        const messagesList = document.getElementById('messagesList');
        if (data.messages && data.messages.length > 0) {
            const statusLabels = {
                'new': 'Новое',
                'read': 'Прочитано',
                'replied': 'Отвечено',
                'archived': 'Архив'
            };
            const statusColors = {
                'new': 'var(--primary-color)',
                'read': 'var(--text-muted)',
                'replied': 'var(--success-color)',
                'archived': 'var(--text-secondary)'
            };

            messagesList.innerHTML = data.messages.map(msg => {
                const date = new Date(msg.createdAt);
                const isNew = msg.status === 'new';
                const isTestError = isTestErrorMessage(msg);
                return `
                    <div class="admin-list-item ${isNew ? 'new-message' : ''}" onclick="viewMessage(${msg.id})" style="cursor: pointer; ${isNew ? 'border-left: 4px solid var(--primary-color);' : ''}">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                <strong>${msg.name}</strong>
                                ${isNew ? '<span style="background: var(--primary-color); color: white; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600;">НОВОЕ</span>' : ''}
                                ${isTestError ? '<span style="background: #dc2626; color: #fff; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.72rem; font-weight: 600;">ОШИБКА В ВОПРОСЕ</span>' : ''}
                            </div>
                            <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0.25rem 0;">
                                ${msg.email} • ${getMessageSubjectLabel(msg)}
                            </p>
                            <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0.5rem 0 0; max-width: 600px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                                ${msg.message}
                            </p>
                        </div>
                        <div style="text-align: right; min-width: 120px;">
                            <span style="color: var(--text-muted); font-size: 0.875rem; display: block;">
                                ${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </span>
                            <span style="color: ${statusColors[msg.status] || 'var(--text-muted)'}; font-size: 0.75rem; font-weight: 600; margin-top: 0.25rem; display: block;">
                                ${statusLabels[msg.status] || msg.status}
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            messagesList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Сообщения не найдены</p>';
        }

        // Пагинация
        const pagination = document.getElementById('messagesPagination');
        if (pagination && data.pagination) {
            const { totalPages, page: currentPage } = data.pagination;
            let paginationHTML = '';
            for (let i = 1; i <= totalPages; i++) {
                paginationHTML += `<button class="admin-pagination-btn ${i === currentPage ? 'active' : ''}" onclick="loadMessages(${i})">${i}</button>`;
            }
            pagination.innerHTML = paginationHTML;
        }
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
        showNotification('Ошибка загрузки сообщений', 'error');
    }
}

// Просмотр сообщения
async function viewMessage(messageId) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/contact-messages/${messageId}`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки сообщения');
        }

        const message = await response.json();
        currentMessageId = message.id;

        document.getElementById('messageModalName').textContent = message.name;
        document.getElementById('messageModalEmail').textContent = message.email;
        document.getElementById('messageModalSubject').textContent = getMessageSubjectLabel(message);
        document.getElementById('messageModalMessage').textContent = message.message;
        document.getElementById('messageModalDate').textContent = new Date(message.createdAt).toLocaleString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('messageModalStatus').value = message.status;

        // Если сообщение новое, автоматически помечаем как прочитанное
        if (message.status === 'new') {
            await updateMessageStatus(messageId, 'read');
        }

        document.getElementById('messageModal').style.display = 'block';
    } catch (error) {
        console.error('Ошибка загрузки сообщения:', error);
        showNotification('Ошибка загрузки сообщения', 'error');
    }
}

// Обновление статуса сообщения
async function updateMessageStatus(messageId, status) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/contact-messages/${messageId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            loadMessages(currentMessagesPage);
            if (document.getElementById('messagesTab').classList.contains('active')) {
                // Обновляем только если мы на вкладке сообщений
            } else {
                loadDashboard(); // Обновляем дашборд для обновления статистики
            }
        }
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
    }
}

// Удаление сообщения
async function deleteMessage(messageId) {
    if (!confirm('Вы уверены, что хотите удалить это сообщение?')) {
        return;
    }

    try {
        const response = await fetch(`${ADMIN_API_URL}/contact-messages/${messageId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (response.ok) {
            showNotification('Сообщение удалено', 'success');
            document.getElementById('messageModal').style.display = 'none';
            loadMessages(currentMessagesPage);
            loadDashboard();
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления сообщения:', error);
        showNotification('Ошибка удаления сообщения', 'error');
    }
}

function escapeAdminHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function loadAdminBroadcastHistory() {
    const listEl = document.getElementById('adminBroadcastHistory');
    if (!listEl) return;
    try {
        const response = await fetch(`${ADMIN_API_URL}/broadcast-notifications?limit=15`, {
            headers: adminAuthHeaders()
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            listEl.innerHTML = '<p style="color: var(--text-muted);">Не удалось загрузить историю</p>';
            return;
        }
        const items = data.broadcasts || [];
        if (!items.length) {
            listEl.innerHTML = '<p style="color: var(--text-muted);">Рассылок пока не было</p>';
            return;
        }
        listEl.innerHTML = items.map((item) => {
            const when = item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '';
            const count = item.recipientCount != null ? item.recipientCount : '—';
            return `
                <div class="admin-broadcast-item">
                    <div class="admin-broadcast-item-meta">${escapeAdminHtml(when)} · получателей: ${count}</div>
                    <h4 style="margin:0 0 0.35rem;font-size:0.95rem;">${escapeAdminHtml(item.title)}</h4>
                    <p>${escapeAdminHtml(item.message)}</p>
                </div>`;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки рассылок:', error);
        listEl.innerHTML = '<p style="color: var(--text-muted);">Ошибка загрузки</p>';
    }
}

async function handleAdminBroadcastSubmit(e) {
    e.preventDefault();
    const titleInput = document.getElementById('adminBroadcastTitle');
    const messageInput = document.getElementById('adminBroadcastMessage');
    const title = titleInput ? titleInput.value.trim() : '';
    const message = messageInput ? messageInput.value.trim() : '';
    if (!title || !message) {
        showNotification('Заполните заголовок и текст', 'error');
        return;
    }
    if (!confirm('Отправить это уведомление всем пользователям? Оно появится в колокольчике у каждого.')) {
        return;
    }
    try {
        const response = await fetch(`${ADMIN_API_URL}/broadcast-notifications`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify({ title, message })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const errText = result.error || (result.errors && result.errors[0]?.msg) || 'Ошибка отправки';
            showNotification(errText, 'error');
            return;
        }
        if (titleInput) titleInput.value = '';
        if (messageInput) messageInput.value = '';
        const count = result.recipientCount != null ? result.recipientCount : '';
        showNotification(`Уведомление отправлено (${count} пользователей)`, 'success');
        await loadAdminBroadcastHistory();
    } catch (error) {
        console.error('Ошибка рассылки:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    }
}

async function loadAdminChats() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/chats`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) {
            throw new Error('Ошибка загрузки чатов');
        }

        const data = await response.json();
        const listEl = document.getElementById('adminChatsList');
        if (!listEl) return;

        const chats = data.chats || [];
        adminChatUsers = chats.map(chat => chat.user);
        if (!chats.length) {
            listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">Чатов пока нет</p>';
            const headerEl = document.getElementById('adminChatHeader');
            const messagesEl = document.getElementById('adminChatMessages');
            if (headerEl) headerEl.textContent = 'Выберите чат слева';
            if (messagesEl) messagesEl.innerHTML = '';
            currentChatUserId = null;
            return;
        }

        listEl.innerHTML = chats.map(chat => {
            const preview = chat.lastMessage?.text || 'Нет сообщений';
            const unread = chat.unreadCount || 0;
            const activeClass = currentChatUserId === chat.user.id ? 'active' : '';
            return `
                <div class="admin-list-item admin-chat-user ${activeClass}" onclick="openAdminChat(${chat.user.id})">
                    <div>
                        <strong>${chat.user.username}</strong>
                        <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.2rem;">${chat.user.email}</p>
                        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.3rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${preview}</p>
                    </div>
                    ${unread > 0 ? `<span style="background: var(--danger-color); color: white; border-radius: 999px; padding: 0.15rem 0.5rem; font-size: 0.75rem; font-weight: 600;">${unread}</span>` : ''}
                </div>
            `;
        }).join('');

        if (!currentChatUserId && chats[0]) {
            await openAdminChat(chats[0].user.id);
        }
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов', 'error');
    }
}

function renderAdminChatMessages(messages) {
    const messagesEl = document.getElementById('adminChatMessages');
    if (!messagesEl) return;
    const shouldStickToBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    messagesEl.innerHTML = (messages || []).map(msg => `
            <div class="admin-chat-bubble ${msg.isAdmin ? 'admin' : 'user'}">
                ${msg.text}
                <div style="margin-top: 0.3rem; font-size: 0.72rem; opacity: 0.75;">
                    ${new Date(msg.createdAt).toLocaleString('ru-RU')}
                </div>
            </div>
        `).join('');
    if (shouldStickToBottom) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
}

async function refreshAdminChatMessages(userId) {
    const response = await fetch(`${ADMIN_API_URL}/chats/${userId}/messages`, {
        headers: adminAuthHeaders()
    });
    if (!response.ok) {
        throw new Error('Ошибка загрузки диалога');
    }
    const data = await response.json();
    if (currentChatUserId === userId) {
        renderAdminChatMessages(data.messages);
    }
    return data;
}

async function openAdminChat(userId) {
    currentChatUserId = userId;
    try {
        const data = await refreshAdminChatMessages(userId);
        const headerEl = document.getElementById('adminChatHeader');
        if (headerEl && data?.user) {
            headerEl.textContent = `Чат: ${data.user.username} (${data.user.email})`;
        }

        await fetch(`${ADMIN_API_URL}/chats/${userId}/read`, {
            method: 'PUT',
            headers: adminAuthHeaders()
        });
        await loadAdminChats();
        startAdminChatMessagesPolling();
    } catch (error) {
        console.error('Ошибка загрузки диалога:', error);
        showNotification('Ошибка загрузки диалога', 'error');
    }
}

async function handleAdminChatSubmit(e) {
    e.preventDefault();
    if (!currentChatUserId) {
        showNotification('Сначала выберите чат', 'error');
        return;
    }

    const input = document.getElementById('adminChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    try {
        const response = await fetch(`${ADMIN_API_URL}/chats/${currentChatUserId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || 'Ошибка отправки сообщения');
        }

        input.value = '';
        await openAdminChat(currentChatUserId);
    } catch (error) {
        console.error('Ошибка отправки сообщения админа:', error);
        showNotification(error.message || 'Ошибка отправки сообщения', 'error');
    }
}

function startAdminChatsPolling() {
    stopAdminChatsPolling();
    adminChatsPollInterval = setInterval(() => {
        if (document.getElementById('chatsTab')?.classList.contains('active')) {
            loadAdminChats();
        }
    }, 8000);
}

function stopAdminChatsPolling() {
    if (adminChatsPollInterval) {
        clearInterval(adminChatsPollInterval);
        adminChatsPollInterval = null;
    }
}

function startAdminChatMessagesPolling() {
    stopAdminChatMessagesPolling();
    adminChatMessagesPollInterval = setInterval(async () => {
        if (!currentChatUserId) return;
        if (!document.getElementById('chatsTab')?.classList.contains('active')) return;
        await refreshAdminChatMessages(currentChatUserId);
    }, 8000);
}

function stopAdminChatMessagesPolling() {
    if (adminChatMessagesPollInterval) {
        clearInterval(adminChatMessagesPollInterval);
        adminChatMessagesPollInterval = null;
    }
}

function setupAdminChatUserPicker() {
    const searchInput = document.getElementById('adminChatUserSearch');
    const startBtn = document.getElementById('adminStartChatBtn');
    if (!searchInput || !startBtn) return;

    startBtn.addEventListener('click', async () => {
        const query = (searchInput.value || '').trim().toLowerCase();
        if (!query) {
            showNotification('Введите имя или email пользователя', 'error');
            return;
        }

        // Сначала ищем среди уже загруженных чатов
        let user = adminChatUsers.find(u =>
            String(u.username || '').toLowerCase().includes(query) ||
            String(u.email || '').toLowerCase().includes(query)
        );

        // Если не нашли, подгружаем список пользователей из админского API
        if (!user) {
            try {
                const response = await fetch(`${ADMIN_API_URL}/users?page=1&limit=1000&search=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Bearer ${currentAdminToken}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.users && data.users[0]) {
                        user = data.users[0];
                    }
                }
            } catch (error) {
                console.error('Ошибка поиска пользователя для чата:', error);
            }
        }

        if (!user) {
            showNotification('Пользователь не найден', 'error');
            return;
        }

        searchInput.value = '';
        await openAdminChat(user.id);
    });
}

// Экспорт функций для использования в HTML
window.deleteUser = deleteUser;
window.openResetPasswordModal = openResetPasswordModal;
window.openUpdateCoinsModal = openUpdateCoinsModal;
window.deleteSubject = deleteSubject;
window.deleteTest = deleteTest;
window.deleteQuestion = deleteQuestion;
window.editSubject = editSubject;
window.editTest = editTest;
window.editUniversity = editUniversity;
window.deleteUniversity = deleteUniversity;
window.editQuestion = editQuestion;
window.focusUsmleSubjectTests = focusUsmleSubjectTests;
window.focusUsmleTestQuestions = focusUsmleTestQuestions;
window.editNews = editNews;
window.editScheduleEntry = editScheduleEntry;
window.deleteScheduleEntry = deleteScheduleEntry;
window.loadUsers = loadUsers;
window.addAnswer = addAnswer;
window.loadMessages = loadMessages;
window.viewMessage = viewMessage;
window.deleteMessage = deleteMessage;
window.deleteNews = deleteNews;
window.markDeviceAlertRead = markDeviceAlertRead;
window.openAdminChat = openAdminChat;
window.editPromoCode = editPromoCode;
window.deletePromoCode = deletePromoCode;

// ─────────────────────────────────────────────────────
// Медицинский глоссарий (MedicalImages)
// ─────────────────────────────────────────────────────

let medicalImages = [];
let editingMedicalImageId = null;
let pendingMedicalImageFile = null;

async function loadMedicalImages() {
    try {
        const resp = await fetch('/api/medical-images', { headers: adminAuthHeaders() });
        if (!resp.ok) throw new Error(await resp.text());
        medicalImages = await resp.json();
        renderMedicalImagesList();
    } catch (err) {
        console.error('Ошибка загрузки медицинских изображений:', err);
    }
}

function renderMedicalImagesList() {
    const container = document.getElementById('medicalImagesList');
    if (!container) return;
    if (!medicalImages.length) {
        container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; margin:0;">Нет изображений</p>';
        return;
    }
    container.innerHTML = medicalImages.map(img => {
        const kws = (img.keywords || []).slice(0, 3).join(', ');
        const more = img.keywords && img.keywords.length > 3 ? ` +${img.keywords.length - 3}` : '';
        return `<div style="display:flex; align-items:center; gap:0.6rem; background:var(--bg-secondary); border-radius:8px; padding:0.5rem 0.6rem;">
            <img src="${img.imageUrl}" alt="" style="width:42px; height:42px; object-fit:cover; border-radius:6px; flex-shrink:0; cursor:pointer;"
                onclick="viewMedicalImage(${img.id})">
            <div style="flex:1; min-width:0;">
                <div style="font-size:0.82rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${img.title || '—'}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${kws}${more}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="openEditMedicalImageModal(${img.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem;">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteMedicalImage(${img.id})" style="padding:0.25rem 0.5rem; font-size:0.75rem;">🗑</button>
        </div>`;
    }).join('');
}

function openAddMedicalImageModal() {
    editingMedicalImageId = null;
    pendingMedicalImageFile = null;
    document.getElementById('medicalImageModalTitle').textContent = 'Добавить изображение';
    document.getElementById('medicalImageFile').value = '';
    document.getElementById('medicalImageTitle').value = '';
    document.getElementById('medicalImageKeywords').value = '';
    document.getElementById('medicalImageDescription').value = '';
    document.getElementById('medicalImagePreviewWrap').innerHTML = '';
    document.getElementById('medicalImageModal').style.display = 'flex';
}

function openEditMedicalImageModal(id) {
    const img = medicalImages.find(m => m.id === id);
    if (!img) return;
    editingMedicalImageId = id;
    pendingMedicalImageFile = null;
    document.getElementById('medicalImageModalTitle').textContent = 'Редактировать изображение';
    document.getElementById('medicalImageFile').value = '';
    document.getElementById('medicalImageTitle').value = img.title || '';
    document.getElementById('medicalImageKeywords').value = (img.keywords || []).join(', ');
    document.getElementById('medicalImageDescription').value = img.description || '';
    document.getElementById('medicalImagePreviewWrap').innerHTML =
        `<img src="${img.imageUrl}" alt="" style="max-height:120px; border-radius:6px; margin-bottom:0.4rem; display:block;">`;
    document.getElementById('medicalImageModal').style.display = 'flex';
}

function closeMedicalImageModal() {
    document.getElementById('medicalImageModal').style.display = 'none';
    editingMedicalImageId = null;
    pendingMedicalImageFile = null;
}

function viewMedicalImage(id) {
    const img = medicalImages.find(m => m.id === id);
    if (!img) return;
    document.getElementById('medicalImageViewTitle').textContent = img.title || 'Изображение';
    document.getElementById('medicalImageViewImg').src = img.imageUrl;
    document.getElementById('medicalImageViewImg').alt = img.title || '';
    document.getElementById('medicalImageViewDesc').textContent = img.description || '';
    document.getElementById('medicalImageViewModal').style.display = 'flex';
}

async function saveMedicalImage() {
    const title = document.getElementById('medicalImageTitle').value.trim();
    const kwRaw = document.getElementById('medicalImageKeywords').value.trim();
    const description = document.getElementById('medicalImageDescription').value.trim();
    const fileInput = document.getElementById('medicalImageFile');
    const file = fileInput.files[0] || pendingMedicalImageFile;

    if (!editingMedicalImageId && !file) {
        showNotification('Выберите изображение', 'error'); return;
    }
    if (!kwRaw) {
        showNotification('Введите хотя бы одно ключевое слово', 'error'); return;
    }

    const keywords = kwRaw.split(',').map(s => s.trim()).filter(Boolean);
    const formData = new FormData();
    if (file) formData.append('image', file);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('keywords', JSON.stringify(keywords));

    const btn = document.getElementById('saveMedicalImageBtn');
    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        const url = editingMedicalImageId
            ? `/api/admin/medical-images/${editingMedicalImageId}`
            : '/api/admin/medical-images';
        const method = editingMedicalImageId ? 'PUT' : 'POST';
        const resp = await fetch(url, { method, headers: adminAuthHeaders(), body: formData });
        if (!resp.ok) throw new Error(await resp.text());
        showNotification(editingMedicalImageId ? 'Обновлено' : 'Добавлено', 'success');
        closeMedicalImageModal();
        await loadMedicalImages();
    } catch (err) {
        showNotification('Ошибка: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Сохранить';
    }
}

async function deleteMedicalImage(id) {
    if (!confirm('Удалить изображение и все его ключевые слова?')) return;
    try {
        const resp = await fetch(`/api/admin/medical-images/${id}`, { method: 'DELETE', headers: adminAuthHeaders() });
        if (!resp.ok) throw new Error(await resp.text());
        showNotification('Удалено', 'success');
        await loadMedicalImages();
    } catch (err) {
        showNotification('Ошибка: ' + err.message, 'error');
    }
}

// Предпросмотр выбранного файла
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('medicalImageFile');
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;
            pendingMedicalImageFile = file;
            const reader = new FileReader();
            reader.onload = e => {
                document.getElementById('medicalImagePreviewWrap').innerHTML =
                    `<img src="${e.target.result}" alt="" style="max-height:120px; border-radius:6px; margin-bottom:0.4rem; display:block;">`;
            };
            reader.readAsDataURL(file);
        });
    }

    const addBtn = document.getElementById('addMedicalImageBtn');
    if (addBtn) addBtn.addEventListener('click', openAddMedicalImageModal);
});

window.openAddMedicalImageModal = openAddMedicalImageModal;
window.openEditMedicalImageModal = openEditMedicalImageModal;
window.closeMedicalImageModal = closeMedicalImageModal;
window.saveMedicalImage = saveMedicalImage;
window.deleteMedicalImage = deleteMedicalImage;
window.viewMedicalImage = viewMedicalImage;

// Загрузка заявок на регистрацию

