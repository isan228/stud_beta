const REDACT_API = '/api/redact';

let currentEditorToken = null;
let currentEditor = null;
let currentErrorsPage = 1;
let currentErrorReportId = null;
let currentErrorReportQuestionId = null;
let currentErrorReportTestId = null;

const testsCache = { data: null, at: 0 };
const CACHE_MS = 60000;

function editorAuthHeaders() {
    return { Authorization: `Bearer ${currentEditorToken}` };
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) {
        console.log(`[${type}] ${message}`);
        return;
    }
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    setTimeout(() => { notification.style.display = 'none'; }, 3000);
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function redirectToLogin() {
    localStorage.removeItem('editorToken');
    window.location.href = '/redact/login';
}

function checkEditorAuth() {
    const token = localStorage.getItem('editorToken');
    if (!token) {
        redirectToLogin();
        return;
    }
    currentEditorToken = token;
    fetchEditor();
}

async function fetchEditor() {
    try {
        const response = await fetch(`${REDACT_API}/me`, { headers: editorAuthHeaders() });
        if (!response.ok) {
            redirectToLogin();
            return;
        }
        const data = await response.json();
        currentEditor = data.editor;
        const label = document.getElementById('editorUserLabel');
        if (label) {
            label.textContent = currentEditor.displayName || currentEditor.username;
        }
        setupRedactUI();
        loadErrorStats();
        loadTestsForFilters();
    } catch (error) {
        console.error(error);
        redirectToLogin();
    }
}

async function fetchTestsCached(force = false) {
    const now = Date.now();
    if (!force && testsCache.data && now - testsCache.at < CACHE_MS) {
        return testsCache.data;
    }
    const response = await fetch(`${REDACT_API}/tests`, { headers: editorAuthHeaders() });
    if (!response.ok) throw new Error('Ошибка загрузки тестов');
    const data = await response.json();
    testsCache.data = data;
    testsCache.at = now;
    return data;
}

async function loadErrorStats() {
    try {
        const response = await fetch(`${REDACT_API}/error-reports/stats`, { headers: editorAuthHeaders() });
        if (!response.ok) return;
        const data = await response.json();
        const newEl = document.getElementById('statNewErrors');
        const totalEl = document.getElementById('statTotalErrors');
        const badge = document.getElementById('errorsTabBadge');
        if (newEl) newEl.textContent = data.newCount ?? 0;
        if (totalEl) totalEl.textContent = data.total ?? 0;
        if (badge) {
            if (data.newCount > 0) {
                badge.style.display = 'inline';
                badge.textContent = data.newCount;
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Ошибка статистики отчётов:', error);
    }
}

async function loadSubjectsForFilters() {
    try {
        const response = await fetch(`${REDACT_API}/subjects`, { headers: editorAuthHeaders() });
        if (!response.ok) return;
        const subjects = await response.json();
        const filter = document.getElementById('testsSubjectFilter');
        if (filter) {
            const current = filter.value;
            filter.innerHTML = '<option value="">Все предметы</option>' +
                subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
            filter.value = current;
        }
    } catch (error) {
        console.error(error);
    }
}

async function loadTestsForFilters() {
    try {
        const tests = await fetchTestsCached();
        const questionsFilter = document.getElementById('questionsTestFilter');
        const questionTestSelect = document.getElementById('questionTestId');
        const options = '<option value="">Выберите тест</option>' +
            tests.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');

        if (questionsFilter) {
            const current = questionsFilter.value;
            questionsFilter.innerHTML = options;
            questionsFilter.value = current || '';
        }
        if (questionTestSelect) {
            const current = questionTestSelect.value;
            questionTestSelect.innerHTML = options.replace('Выберите тест', '—');
            if (current) questionTestSelect.value = current;
        }
    } catch (error) {
        console.error(error);
    }
}

async function loadTestsList() {
    const subjectId = document.getElementById('testsSubjectFilter')?.value || '';
    const list = document.getElementById('testsList');
    if (!list) return;

    try {
        const url = subjectId
            ? `${REDACT_API}/tests?subjectId=${encodeURIComponent(subjectId)}`
            : `${REDACT_API}/tests`;
        const response = await fetch(url, { headers: editorAuthHeaders() });
        if (!response.ok) throw new Error();
        const tests = await response.json();

        if (!tests.length) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Тестов нет</p>';
            return;
        }

        list.innerHTML = tests.map(t => `
            <div class="admin-list-item">
                <div>
                    <strong>${escapeHtml(t.name)}</strong>
                    <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0.25rem 0 0;">
                        ${escapeHtml(t.Subject?.name || 'Без предмета')} • ID: ${t.id}
                        ${t.isFree ? ' • бесплатный' : ''}
                    </p>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="openTestQuestions(${t.id})">Вопросы</button>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Ошибка загрузки</p>';
    }
}

window.openTestQuestions = function(testId) {
    switchRedactTab('questions');
    const filter = document.getElementById('questionsTestFilter');
    if (filter) {
        filter.value = String(testId);
        loadQuestions();
    }
};

async function loadQuestionSuggestions() {
    const testId = document.getElementById('questionsTestFilter')?.value || '';
    const query = document.getElementById('questionsSearch')?.value || '';
    const datalist = document.getElementById('questionsSearchSuggestions');
    if (!datalist || !testId) {
        if (datalist) datalist.innerHTML = '';
        return;
    }
    try {
        const url = `${REDACT_API}/questions/suggestions?testId=${encodeURIComponent(testId)}&query=${encodeURIComponent(query)}`;
        const response = await fetch(url, { headers: editorAuthHeaders() });
        if (!response.ok) return;
        const data = await response.json();
        datalist.innerHTML = (data.suggestions || []).map(s => `<option value="${escapeHtml(s)}"></option>`).join('');
    } catch (error) {
        console.error(error);
    }
}

async function loadQuestions() {
    const testId = document.getElementById('questionsTestFilter')?.value || '';
    const search = document.getElementById('questionsSearch')?.value || '';
    const list = document.getElementById('questionsList');

    if (!testId) {
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Выберите тест</p>';
        return;
    }

    try {
        const url = `${REDACT_API}/questions?testId=${encodeURIComponent(testId)}&search=${encodeURIComponent(search)}`;
        const response = await fetch(url, { headers: editorAuthHeaders() });
        if (!response.ok) throw new Error();
        const questions = await response.json();

        if (!questions.length) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Нет вопросов</p>';
            return;
        }

        list.innerHTML = questions.map((q) => {
            const hasExplanation = !!(q.explanation && String(q.explanation).trim());
            return `
            <div class="admin-list-item">
                <div style="flex: 1;">
                    <p style="margin: 0 0 0.5rem;">${escapeHtml((q.text || '').slice(0, 200))}${(q.text || '').length > 200 ? '…' : ''}</p>
                    <span style="color: var(--text-muted); font-size: 0.8rem;">ID: ${q.id} • ответов: ${(q.Answers || []).length}${hasExplanation ? ' • <span style="color: var(--primary-color); font-weight: 600;">есть объяснение</span>' : ''}</span>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="editQuestion(${q.id})">Изменить</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteQuestion(${q.id})">Удалить</button>
                </div>
            </div>
        `;
        }).join('');
    } catch (error) {
        console.error(error);
        showNotification('Ошибка загрузки вопросов', 'error');
    }
}

function addAnswerField(text = '', isCorrect = false, answerId = '') {
    const answersList = document.getElementById('answersList');
    const div = document.createElement('div');
    div.className = 'answer-item-admin';
    div.style.cssText = 'margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius);';
    div.innerHTML = `
        <div class="form-group">
            <input type="hidden" class="answer-id" value="${answerId}">
            <input type="text" class="answer-text" value="${escapeHtml(text)}" placeholder="Текст ответа" required>
        </div>
        <div class="form-group checkbox-group">
            <label>
                <input type="checkbox" class="answer-correct" ${isCorrect ? 'checked' : ''}>
                <span>Правильный ответ</span>
            </label>
        </div>
        <button type="button" class="btn btn-danger btn-sm answer-remove-btn">Удалить</button>
    `;
    div.querySelector('.answer-remove-btn').addEventListener('click', () => div.remove());
    answersList.appendChild(div);
}

window.editQuestion = async function(questionId) {
    try {
        const response = await fetch(`${REDACT_API}/questions/${questionId}`, { headers: editorAuthHeaders() });
        if (!response.ok) throw new Error();
        const question = await response.json();

        await loadTestsForFilters();
        document.getElementById('questionId').value = question.id;
        document.getElementById('questionText').value = question.text;
        const explanationEl = document.getElementById('questionExplanation');
        if (explanationEl) explanationEl.value = question.explanation || '';
        document.getElementById('questionTestId').value = String(question.testId ?? question.Test?.id);

        const answersList = document.getElementById('answersList');
        answersList.innerHTML = '';
        (question.Answers || []).forEach(a => addAnswerField(a.text, a.isCorrect, a.id));

        document.getElementById('questionModalTitle').textContent = 'Редактировать вопрос';
        document.getElementById('questionModal').style.display = 'block';
    } catch (error) {
        showNotification('Ошибка загрузки вопроса', 'error');
    }
};

window.deleteQuestion = async function(questionId) {
    if (!confirm('Удалить этот вопрос?')) return;
    try {
        const response = await fetch(`${REDACT_API}/questions/${questionId}`, {
            method: 'DELETE',
            headers: editorAuthHeaders()
        });
        if (response.ok) {
            showNotification('Вопрос удалён', 'success');
            loadQuestions();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        showNotification('Ошибка удаления', 'error');
    }
};

async function saveQuestion(e) {
    e.preventDefault();
    const id = document.getElementById('questionId').value;
    const text = document.getElementById('questionText').value;
    const explanation = document.getElementById('questionExplanation')?.value?.trim() || '';
    const testId = parseInt(document.getElementById('questionTestId').value, 10);

    const answers = Array.from(document.querySelectorAll('.answer-item-admin')).map(item => {
        const answer = {
            text: item.querySelector('.answer-text').value,
            isCorrect: item.querySelector('.answer-correct').checked
        };
        const answerId = item.querySelector('.answer-id')?.value;
        if (answerId) answer.id = parseInt(answerId, 10);
        return answer;
    });

    if (answers.length < 2) {
        showNotification('Минимум 2 ответа', 'error');
        return;
    }
    if (!answers.some(a => a.isCorrect)) {
        showNotification('Нужен хотя бы один правильный ответ', 'error');
        return;
    }

    try {
        const url = id ? `${REDACT_API}/questions/${id}` : `${REDACT_API}/questions`;
        const response = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: { ...editorAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, testId, answers, explanation: explanation || null })
        });
        if (response.ok) {
            showNotification(id ? 'Вопрос обновлён' : 'Вопрос создан', 'success');
            document.getElementById('questionModal').style.display = 'none';
            document.getElementById('questionForm').reset();
            document.getElementById('answersList').innerHTML = '';
            const filter = document.getElementById('questionsTestFilter');
            if (filter && !filter.value) filter.value = String(testId);
            loadQuestions();
        } else {
            const data = await response.json();
            showNotification(data.errors?.[0]?.msg || data.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        showNotification('Ошибка сохранения', 'error');
    }
}

async function loadErrorReports(page = 1) {
    const status = document.getElementById('errorsStatusFilter')?.value || '';
    const search = document.getElementById('errorsSearch')?.value || '';
    const list = document.getElementById('errorsList');

    try {
        const url = `${REDACT_API}/error-reports?page=${page}&limit=20&status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`;
        const response = await fetch(url, { headers: editorAuthHeaders() });
        if (!response.ok) throw new Error();
        const data = await response.json();
        currentErrorsPage = page;

        const statusLabels = { new: 'Новое', read: 'Прочитано', replied: 'Обработано', archived: 'Архив' };

        if (!data.messages?.length) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Отчётов нет</p>';
        } else {
            list.innerHTML = data.messages.map(msg => {
                const date = new Date(msg.createdAt);
                const isNew = msg.status === 'new';
                const preview = String(msg.message || '').split('\n').slice(0, 3).join(' ');
                return `
                    <div class="admin-list-item ${isNew ? 'new-message' : ''}" onclick="viewErrorReport(${msg.id})" style="cursor: pointer; ${isNew ? 'border-left: 4px solid #dc2626;' : ''}">
                        <div style="flex: 1;">
                            <strong>${escapeHtml(msg.name)}</strong>
                            ${isNew ? '<span style="background: #dc2626; color: #fff; padding: 0.1rem 0.4rem; border-radius: 0.25rem; font-size: 0.7rem; margin-left: 0.35rem;">НОВОЕ</span>' : ''}
                            <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0.25rem 0;">${escapeHtml(msg.email)}</p>
                            <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.25rem 0 0;">${escapeHtml(preview)}</p>
                            ${msg.questionId ? `<p style="font-size: 0.8rem; color: var(--primary-color);">Вопрос ID: ${msg.questionId}</p>` : ''}
                        </div>
                        <div style="text-align: right; min-width: 100px;">
                            <span style="font-size: 0.8rem; color: var(--text-muted);">${date.toLocaleDateString('ru-RU')}</span>
                            <span style="display: block; font-size: 0.75rem; margin-top: 0.25rem;">${statusLabels[msg.status] || msg.status}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        const pagination = document.getElementById('errorsPagination');
        if (pagination && data.pagination) {
            const { totalPages, page: currentPage } = data.pagination;
            pagination.innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1)
                .map(i => `<button type="button" class="admin-pagination-btn ${i === currentPage ? 'active' : ''}" onclick="loadErrorReports(${i})">${i}</button>`)
                .join('');
        }

        loadErrorStats();
    } catch (error) {
        console.error(error);
        showNotification('Ошибка загрузки отчётов', 'error');
    }
}

window.viewErrorReport = async function(id) {
    try {
        const response = await fetch(`${REDACT_API}/error-reports/${id}`, { headers: editorAuthHeaders() });
        if (!response.ok) throw new Error();
        const msg = await response.json();

        currentErrorReportId = msg.id;
        currentErrorReportQuestionId = msg.questionId;
        currentErrorReportTestId = msg.testId;

        document.getElementById('errorReportBody').textContent = msg.message;
        document.getElementById('errorReportStatus').value = msg.status;

        const openBtn = document.getElementById('openQuestionFromReportBtn');
        if (openBtn) {
            openBtn.style.display = msg.questionId ? 'inline-block' : 'none';
        }

        if (msg.status === 'new') {
            await fetch(`${REDACT_API}/error-reports/${id}/status`, {
                method: 'PUT',
                headers: { ...editorAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'read' })
            });
            loadErrorStats();
        }

        document.getElementById('errorReportModal').style.display = 'block';
        loadErrorReports(currentErrorsPage);
    } catch (error) {
        showNotification('Ошибка загрузки отчёта', 'error');
    }
};

async function saveErrorReportStatus() {
    if (!currentErrorReportId) return;
    try {
        const status = document.getElementById('errorReportStatus').value;
        const response = await fetch(`${REDACT_API}/error-reports/${currentErrorReportId}/status`, {
            method: 'PUT',
            headers: { ...editorAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (response.ok) {
            showNotification('Статус сохранён', 'success');
            document.getElementById('errorReportModal').style.display = 'none';
            loadErrorReports(currentErrorsPage);
            loadErrorStats();
        }
    } catch (error) {
        showNotification('Ошибка сохранения статуса', 'error');
    }
}

function switchRedactTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`${tabName}Tab`)?.classList.add('active');

    if (tabName === 'questions') {
        loadTestsForFilters();
    } else if (tabName === 'tests') {
        loadSubjectsForFilters();
        loadTestsList();
    } else if (tabName === 'errors') {
        loadErrorReports();
    }
}

function setupRedactUI() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => switchRedactTab(tab.getAttribute('data-tab')));
    });

    document.getElementById('editorLogoutBtn')?.addEventListener('click', () => {
        localStorage.removeItem('editorToken');
        window.location.href = '/redact/login';
    });

    document.getElementById('questionsTestFilter')?.addEventListener('change', loadQuestions);
    let searchTimeout;
    document.getElementById('questionsSearch')?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadQuestionSuggestions();
            loadQuestions();
        }, 300);
    });

    document.getElementById('testsSubjectFilter')?.addEventListener('change', loadTestsList);
    document.getElementById('errorsStatusFilter')?.addEventListener('change', () => loadErrorReports(1));
    let errorsSearchTimeout;
    document.getElementById('errorsSearch')?.addEventListener('input', () => {
        clearTimeout(errorsSearchTimeout);
        errorsSearchTimeout = setTimeout(() => loadErrorReports(1), 400);
    });

    document.getElementById('addQuestionBtn')?.addEventListener('click', async () => {
        await loadTestsForFilters();
        document.getElementById('questionId').value = '';
        document.getElementById('questionForm').reset();
        document.getElementById('answersList').innerHTML = '';
        addAnswerField();
        addAnswerField();
        const preset = document.getElementById('questionsTestFilter')?.value;
        if (preset) document.getElementById('questionTestId').value = preset;
        document.getElementById('questionModalTitle').textContent = 'Добавить вопрос';
        document.getElementById('questionModal').style.display = 'block';
    });

    document.getElementById('addAnswerBtn')?.addEventListener('click', () => addAnswerField());
    document.getElementById('questionForm')?.addEventListener('submit', saveQuestion);
    document.getElementById('saveErrorStatusBtn')?.addEventListener('click', saveErrorReportStatus);

    document.getElementById('openQuestionFromReportBtn')?.addEventListener('click', () => {
        if (!currentErrorReportQuestionId) return;
        document.getElementById('errorReportModal').style.display = 'none';
        switchRedactTab('questions');
        if (currentErrorReportTestId) {
            document.getElementById('questionsTestFilter').value = String(currentErrorReportTestId);
        }
        loadQuestions().then(() => editQuestion(currentErrorReportQuestionId));
    });

    document.querySelectorAll('.modal-close, .modal-cancel').forEach(el => {
        el.addEventListener('click', () => {
            el.closest('.modal').style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

window.loadErrorReports = loadErrorReports;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkEditorAuth);
} else {
    checkEditorAuth();
}
