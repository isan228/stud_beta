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
        const response = await fetch(`${ADMIN_API_URL}/dashboard/stats`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки статистики');
        }

        const data = await response.json();
        const stats = data.stats;

        document.getElementById('statTotalUsers').textContent = stats.totalUsers || 0;
        document.getElementById('statTotalSubjects').textContent = stats.totalSubjects || 0;
        document.getElementById('statTotalTests').textContent = stats.totalTests || 0;
        document.getElementById('statTotalQuestions').textContent = stats.totalQuestions || 0;
        document.getElementById('statTotalResults').textContent = stats.totalResults || 0;

        // Загружаем статистику сообщений
        try {
            const contactStatsResponse = await fetch(`${ADMIN_API_URL}/dashboard/contact-stats`, {
                headers: {
                    'Authorization': `Bearer ${currentAdminToken}`
                }
            });
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
        } catch (error) {
            console.error('Ошибка загрузки статистики сообщений:', error);
        }

        // Загружаем последние сообщения
        try {
            const messagesResponse = await fetch(`${ADMIN_API_URL}/contact-messages?page=1&limit=5`, {
                headers: {
                    'Authorization': `Bearer ${currentAdminToken}`
                }
            });
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
        } catch (error) {
            console.error('Ошибка загрузки последних сообщений:', error);
        }

        // Загружаем уведомления о входах с новых устройств
        await loadDeviceAlerts();

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
        await loadDeviceAlerts(isDevicesTabActive ? 1000 : 10);
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
        const response = await fetch(`${ADMIN_API_URL}/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`, {
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
                            const stats = user.UserStats || {};
                            const accuracy = stats.totalQuestionsAnswered > 0 
                                ? Math.round((stats.correctAnswers / stats.totalQuestionsAnswered) * 100) 
                                : 0;
                            return `
                                <tr>
                                    <td>${user.id}</td>
                                    <td>${user.username}</td>
                                    <td>${user.email}</td>
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

// Загрузка предметов
async function loadSubjects() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/subjects`, {
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
            subjectsList.innerHTML = subjects.map(subject => `
                <div class="admin-list-item">
                    <div style="flex: 1;">
                        <h4>${subject.name}</h4>
                        ${subject.description ? `<p style="color: var(--text-muted); margin: 0.5rem 0;">${subject.description}</p>` : ''}
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                            Тестов: ${subject.Tests?.length || 0}
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="editSubject(${subject.id})">Редактировать</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteSubject(${subject.id})">Удалить</button>
                    </div>
                </div>
            `).join('');
        } else {
            subjectsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Нет предметов</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки предметов:', error);
        showNotification('Ошибка загрузки предметов', 'error');
    }
}

// Загрузка тестов
async function loadTests() {
    try {
        const subjectId = document.getElementById('testsSubjectFilter')?.value || '';
        const url = `${ADMIN_API_URL}/tests${subjectId ? `?subjectId=${subjectId}` : ''}`;
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
            testsList.innerHTML = tests.map(test => `
                <div class="admin-list-item">
                    <div style="flex: 1;">
                        <h4>${test.name} ${test.isFree ? '<span style="background: #10b981; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem;">БЕСПЛАТНЫЙ</span>' : ''}</h4>
                        ${test.description ? `<p style="color: var(--text-muted); margin: 0.5rem 0;">${test.description}</p>` : ''}
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                            Предмет: ${test.Subject?.name || 'Неизвестно'} | Вопросов: ${test.Questions?.length || 0}
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="editTest(${test.id})">Редактировать</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteTest(${test.id})">Удалить</button>
                    </div>
                </div>
            `).join('');
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
                return `
                    <div class="admin-list-item">
                        <div style="flex: 1;">
                            <h4>${question.text}</h4>
                            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                                Тест: ${question.Test?.name || 'Неизвестно'} | Ответов: ${question.Answers?.length || 0}
                                ${correctAnswer ? ` | Правильный: ${correctAnswer.text}` : ''}
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
            showNotification('Предмет удален', 'success');
            loadSubjects();
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
            showNotification('Тест удален', 'success');
            loadTests();
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
        const response = await fetch(`${ADMIN_API_URL}/subjects`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });
        const subjects = await response.json();
        const subject = subjects.find(s => s.id === subjectId);

        if (subject) {
            document.getElementById('subjectId').value = subject.id;
            document.getElementById('subjectName').value = subject.name;
            document.getElementById('subjectDescription').value = subject.description || '';
            document.getElementById('subjectModalTitle').textContent = 'Редактировать предмет';
            document.getElementById('subjectModal').style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка загрузки предмета:', error);
        showNotification('Ошибка загрузки предмета', 'error');
    }
}

// Редактирование теста
async function editTest(testId) {
    try {
        const subjectsResponse = await fetch(`${ADMIN_API_URL}/subjects`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });
        const subjects = subjectsResponse.ok ? await subjectsResponse.json() : [];
        const subjectSelect = document.getElementById('testSubjectId');
        if (subjectSelect) {
            subjectSelect.innerHTML = '<option value="">Выберите предмет</option>' +
                subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }

        const response = await fetch(`${ADMIN_API_URL}/tests`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });
        const tests = await response.json();
        const test = tests.find(t => t.id === testId);

        if (test) {
            document.getElementById('testId').value = test.id;
            document.getElementById('testName').value = test.name;
            document.getElementById('testDescription').value = test.description || '';
            document.getElementById('testSubjectId').value = test.subjectId;
            document.getElementById('testIsFree').checked = test.isFree || false;
            document.getElementById('testModalTitle').textContent = 'Редактировать тест';
            document.getElementById('testModal').style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка загрузки теста:', error);
        showNotification('Ошибка загрузки теста', 'error');
    }
}

// Редактирование вопроса
async function editQuestion(questionId) {
    try {
        const response = await fetch(`${ADMIN_API_URL}/questions?testId=`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });
        const questions = await response.json();
        const question = questions.find(q => q.id === questionId);

        if (question) {
            document.getElementById('questionId').value = question.id;
            document.getElementById('questionText').value = question.text;
            document.getElementById('questionTestId').value = question.testId;
            
            // Заполняем ответы
            const answersList = document.getElementById('answersList');
            answersList.innerHTML = question.Answers.map((answer, index) => `
                <div class="answer-item-admin" style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius);">
                    <div class="form-group">
                        <input type="text" class="answer-text" value="${answer.text}" placeholder="Текст ответа" required>
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

    try {
        const url = id ? `${ADMIN_API_URL}/subjects/${id}` : `${ADMIN_API_URL}/subjects`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({ name, description })
        });

        if (response.ok) {
            showNotification(id ? 'Предмет обновлен' : 'Предмет создан', 'success');
            document.getElementById('subjectModal').style.display = 'none';
            document.getElementById('subjectForm').reset();
            loadSubjects();
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
    const isFree = document.getElementById('testIsFree').checked;

    try {
        const url = id ? `${ADMIN_API_URL}/tests/${id}` : `${ADMIN_API_URL}/tests`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({ name, description, subjectId, isFree })
        });

        if (response.ok) {
            showNotification(id ? 'Тест обновлен' : 'Тест создан', 'success');
            document.getElementById('testModal').style.display = 'none';
            document.getElementById('testForm').reset();
            loadTests();
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
    const testId = parseInt(document.getElementById('questionTestId').value);
    
    const answerItems = document.querySelectorAll('.answer-item-admin');
    const answers = Array.from(answerItems).map(item => ({
        text: item.querySelector('.answer-text').value,
        isCorrect: item.querySelector('.answer-correct').checked
    }));

    if (answers.length < 2) {
        showNotification('Должно быть минимум 2 ответа', 'error');
        return;
    }

    if (!answers.some(a => a.isCorrect)) {
        showNotification('Должен быть хотя бы один правильный ответ', 'error');
        return;
    }

    try {
        if (id) {
            // Обновление вопроса
            const response = await fetch(`${ADMIN_API_URL}/questions/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentAdminToken}`
                },
                body: JSON.stringify({ text })
            });

            if (response.ok) {
                showNotification('Вопрос обновлен', 'success');
                document.getElementById('questionModal').style.display = 'none';
                document.getElementById('questionForm').reset();
                loadQuestions();
            } else {
                const result = await response.json();
                showNotification(result.error || 'Ошибка сохранения', 'error');
            }
        } else {
            // Создание вопроса
            const response = await fetch(`${ADMIN_API_URL}/questions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentAdminToken}`
                },
                body: JSON.stringify({ text, testId, answers })
            });

            if (response.ok) {
                showNotification('Вопрос создан', 'success');
                document.getElementById('questionModal').style.display = 'none';
                document.getElementById('questionForm').reset();
                loadQuestions();
            } else {
                const result = await response.json();
                showNotification(result.error || 'Ошибка сохранения', 'error');
            }
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
        addSubjectBtn.addEventListener('click', () => {
            document.getElementById('subjectId').value = '';
            document.getElementById('subjectName').value = '';
            document.getElementById('subjectDescription').value = '';
            document.getElementById('subjectModalTitle').textContent = 'Добавить предмет';
            document.getElementById('subjectModal').style.display = 'block';
        });
    }

    const addTestBtn = document.getElementById('addTestBtn');
    if (addTestBtn) {
        addTestBtn.addEventListener('click', async () => {
            // Загружаем предметы для выбора
            try {
                const response = await fetch(`${ADMIN_API_URL}/subjects`, {
                    headers: {
                        'Authorization': `Bearer ${currentAdminToken}`
                    }
                });
                const subjects = await response.json();
                const select = document.getElementById('testSubjectId');
                select.innerHTML = '<option value="">Выберите предмет</option>' + 
                    subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            } catch (error) {
                console.error('Ошибка загрузки предметов:', error);
            }

            document.getElementById('testId').value = '';
            document.getElementById('testName').value = '';
            document.getElementById('testDescription').value = '';
            document.getElementById('testModalTitle').textContent = 'Добавить тест';
            document.getElementById('testModal').style.display = 'block';
        });
    }

    // Загрузка PDF
    const uploadPdfBtn = document.getElementById('uploadPdfBtn');
    if (uploadPdfBtn) {
        uploadPdfBtn.addEventListener('click', async () => {
            try {
                const response = await fetch(`${ADMIN_API_URL}/tests`, {
                    headers: {
                        'Authorization': `Bearer ${currentAdminToken}`
                    }
                });
                const tests = await response.json();
                const select = document.getElementById('pdfTestId');
                select.innerHTML = '<option value="">Выберите тест</option>' +
                    tests.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                document.getElementById('pdfUploadModal').style.display = 'block';
            } catch (error) {
                console.error('Ошибка загрузки тестов:', error);
                showNotification('Ошибка загрузки тестов', 'error');
            }
        });
    }

    const pdfUploadForm = document.getElementById('pdfUploadForm');
    if (pdfUploadForm) {
        pdfUploadForm.addEventListener('submit', handlePdfUpload);
    }

    const addQuestionBtn = document.getElementById('addQuestionBtn');
    if (addQuestionBtn) {
        addQuestionBtn.addEventListener('click', async () => {
            // Загружаем тесты для выбора
            try {
                const response = await fetch(`${ADMIN_API_URL}/tests`, {
                    headers: {
                        'Authorization': `Bearer ${currentAdminToken}`
                    }
                });
                const tests = await response.json();
                const select = document.getElementById('questionTestId');
                select.innerHTML = '<option value="">Выберите тест</option>' + 
                    tests.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            } catch (error) {
                console.error('Ошибка загрузки тестов:', error);
            }

            document.getElementById('questionId').value = '';
            document.getElementById('questionText').value = '';
            document.getElementById('answersList').innerHTML = '';
            addAnswer(); // Добавляем первый ответ
            addAnswer(); // Добавляем второй ответ
            document.getElementById('questionModalTitle').textContent = 'Добавить вопрос';
            document.getElementById('questionModal').style.display = 'block';
        });
    }

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
            e.target.closest('.modal').style.display = 'none';
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

    const adminChatForm = document.getElementById('adminChatForm');
    if (adminChatForm) {
        adminChatForm.addEventListener('submit', handleAdminChatSubmit);
    }
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
                const modal = document.getElementById('pdfUploadModal');
                if (modal) modal.style.display = 'none';
                const form = document.getElementById('pdfUploadForm');
                if (form) form.reset();
                if (progressDiv) progressDiv.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';
                
                // Обновляем список вопросов
                loadQuestions();
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
            // Загружаем фильтры для тестов и вопросов
            loadSubjectsForFilters();
            loadTestsForFilters();
            break;
        case 'devices':
            loadDeviceAlerts(1000);
            break;
        case 'subjects':
            loadSubjects();
            break;
        case 'tests':
            loadTests();
            loadSubjectsForFilters();
            break;
        case 'questions':
            loadTestsForFilters();
            renderQuestionsSelectPrompt();
            break;
        case 'news':
            loadNewsAdmin();
            break;
        case 'messages':
            loadMessages();
            break;
        case 'chats':
            loadAdminChats();
            startAdminChatsPolling();
            break;
        case 'documents':
            loadDocumentsSettings();
            break;
        case 'promo':
            loadPromoCodes();
            break;
    }
}

// Загрузка предметов для фильтров
async function loadSubjectsForFilters() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/subjects`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });
        const subjects = await response.json();
        
        const testsFilter = document.getElementById('testsSubjectFilter');
        if (testsFilter) {
            testsFilter.innerHTML = '<option value="">Все предметы</option>' + 
                subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
    } catch (error) {
        console.error('Ошибка загрузки предметов для фильтра:', error);
    }
}

// Загрузка тестов для фильтров
async function loadTestsForFilters() {
    try {
        const response = await fetch(`${ADMIN_API_URL}/tests`, {
            headers: {
                'Authorization': `Bearer ${currentAdminToken}`
            }
        });
        const tests = await response.json();
        
        const questionsFilter = document.getElementById('questionsTestFilter');
        if (questionsFilter) {
            questionsFilter.innerHTML = '<option value="">Выберите тест</option>' + 
                tests.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            questionsFilter.value = '';
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

async function openAdminChat(userId) {
    currentChatUserId = userId;
    try {
        const response = await fetch(`${ADMIN_API_URL}/chats/${userId}/messages`, {
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
        });
        if (!response.ok) {
            throw new Error('Ошибка загрузки диалога');
        }

        const data = await response.json();
        const headerEl = document.getElementById('adminChatHeader');
        const messagesEl = document.getElementById('adminChatMessages');
        if (!messagesEl) return;

        if (headerEl) {
            headerEl.textContent = `Чат: ${data.user.username} (${data.user.email})`;
        }

        messagesEl.innerHTML = (data.messages || []).map(msg => `
            <div class="admin-chat-bubble ${msg.isAdmin ? 'admin' : 'user'}">
                ${msg.text}
                <div style="margin-top: 0.3rem; font-size: 0.72rem; opacity: 0.75;">
                    ${new Date(msg.createdAt).toLocaleString('ru-RU')}
                </div>
            </div>
        `).join('');
        messagesEl.scrollTop = messagesEl.scrollHeight;

        await fetch(`${ADMIN_API_URL}/chats/${userId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${currentAdminToken}` }
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
    }, 3000);
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
        await openAdminChat(currentChatUserId);
    }, 3000);
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
window.editQuestion = editQuestion;
window.editNews = editNews;
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

// Загрузка заявок на регистрацию

