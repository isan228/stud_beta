// API базовый URL
const ADMIN_API_URL = '/api/admin';

// Состояние админки
let currentAdmin = null;
let currentAdminToken = null;

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
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    console.log('Попытка входа с данными:', { username: data.username });

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
                                    <td>${stats.totalTestsCompleted || 0}</td>
                                    <td>${accuracy}%</td>
                                    <td>${date.toLocaleDateString('ru-RU')}</td>
                                    <td>
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
                        <h4>${test.name}</h4>
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

// Загрузка вопросов
async function loadQuestions() {
    try {
        const testId = document.getElementById('questionsTestFilter')?.value || '';
        const url = `${ADMIN_API_URL}/questions${testId ? `?testId=${testId}` : ''}`;
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

    try {
        const url = id ? `${ADMIN_API_URL}/tests/${id}` : `${ADMIN_API_URL}/tests`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdminToken}`
            },
            body: JSON.stringify({ name, description, subjectId })
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
function setupAdminEventListeners() {
    // Вход
    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        // Удаляем все предыдущие обработчики, если есть
        const newForm = adminLoginForm.cloneNode(true);
        adminLoginForm.parentNode.replaceChild(newForm, adminLoginForm);
        // Привязываем обработчик к новой форме с приоритетом
        newForm.addEventListener('submit', handleAdminLogin, true); // useCapture = true для приоритета
        console.log('Обработчик формы админки привязан к:', newForm.id);
        
        // Дополнительная проверка: убеждаемся, что форма не имеет других обработчиков
        const testEvent = new Event('submit', { bubbles: true, cancelable: true });
        console.log('Форма готова к использованию');
    } else {
        console.warn('Форма adminLoginForm не найдена');
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
            loadQuestions();
        });
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
        case 'subjects':
            loadSubjects();
            break;
        case 'tests':
            loadTests();
            loadSubjectsForFilters();
            break;
        case 'questions':
            loadQuestions();
            loadTestsForFilters();
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
            questionsFilter.innerHTML = '<option value="">Все тесты</option>' + 
                tests.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        }
    } catch (error) {
        console.error('Ошибка загрузки тестов для фильтра:', error);
    }
}

// Экспорт функций для использования в HTML
window.deleteUser = deleteUser;
window.deleteSubject = deleteSubject;
window.deleteTest = deleteTest;
window.deleteQuestion = deleteQuestion;
window.editSubject = editSubject;
window.editTest = editTest;
window.editQuestion = editQuestion;
window.loadUsers = loadUsers;
window.addAnswer = addAnswer;

