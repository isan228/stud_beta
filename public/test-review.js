(function () {
    const API_URL = window.API_URL || '/api';

    function esc(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeImageUrls(value) {
        if (typeof window.normalizeImageUrls === 'function') {
            return window.normalizeImageUrls(value);
        }
        if (Array.isArray(value)) {
            return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
        }
        if (typeof value !== 'string') return [];
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }

    function renderImages(value, alt) {
        const urls = normalizeImageUrls(value);
        if (!urls.length) return '';
        return urls.map((url, index) => `
            <figure class="question-image-wrap">
                <img src="${String(url).replace(/"/g, '')}" alt="${esc(urls.length > 1 ? `${alt} ${index + 1}` : alt)}" class="question-image" loading="lazy" decoding="async">
            </figure>
        `).join('');
    }

    function isAnswerCorrectFlag(value) {
        if (value === true || value === 1 || value === '1') return true;
        if (value === false || value === 0 || value === '0' || value == null) return false;
        if (typeof value === 'string') {
            const str = value.toLowerCase().trim();
            return str === 'true' || str === 't' || str === '1';
        }
        return Boolean(value);
    }

    function findCorrectAnswer(question, questionResult) {
        if (questionResult?.correctAnswerId) {
            const byId = question.Answers?.find((a) => a.id === questionResult.correctAnswerId);
            if (byId) return byId;
        }
        return (question.Answers || []).find((a) => isAnswerCorrectFlag(a.isCorrect)) || null;
    }

    function fmtTime(totalSec) {
        if (!totalSec && totalSec !== 0) return '';
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function normalizeResultPayload(raw) {
        if (!raw) return null;
        const questions = raw.questions || [];
        const results = raw.results || {};
        const answers = raw.answers || {};
        const total = raw.total != null ? raw.total : (raw.totalQuestions != null ? raw.totalQuestions : questions.length);
        const score = raw.score != null ? raw.score : 0;
        return {
            ...raw,
            questions,
            results,
            answers,
            total,
            score,
            percentage: raw.percentage != null ? raw.percentage : (total ? Math.round((score / total) * 100) : 0),
            testName: raw.testName || raw.Test?.name || '',
            subjectName: raw.subjectName || raw.Test?.Subject?.name || '',
            programType: raw.programType || (raw.isCustomUsmle ? 'usmle' : 'university'),
            isCustomUsmle: !!raw.isCustomUsmle
        };
    }

    function renderReviewHtml(data) {
        const percentage = data.percentage;
        const incorrectCount = data.total - data.score;
        const timeLabel = data.timeSpent != null ? fmtTime(data.timeSpent) : '';
        const isUsmle = !!(data.isCustomUsmle || data.programType === 'usmle');
        const questionTimes = data.questionTimes || {};
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        const itemsHtml = (data.questions || []).map((question, index) => {
            const questionResult = data.results[question.id];
            if (!questionResult) return '';

            const userAnswerId = data.answers[question.id];
            const userAnswer = (question.Answers || []).find((a) => a.id === parseInt(userAnswerId, 10));
            const correctAnswer = findCorrectAnswer(question, questionResult);
            const isCorrect = !!questionResult.correct;
            const qTime = questionTimes[question.id];
            const bodyHtml = window.UsmleLinkedQuestion?.renderUsmleQuestionBodyHtml
                ? window.UsmleLinkedQuestion.renderUsmleQuestionBodyHtml(question.text, {
                    isFirstInLinkedGroup: window.UsmleLinkedQuestion.isFirstLinkedQuestionInList?.(data.questions, index) || false
                })
                : esc(question.text);

            const explanationHtml = (question.explanation || normalizeImageUrls(question.explanationImageUrls || question.explanationImageUrl).length)
                ? (
                    typeof window.renderQuestionExplanationHtml === 'function'
                        ? window.renderQuestionExplanationHtml(question.explanation, question.explanationImageUrls || question.explanationImageUrl)
                        : `<div class="question-explanation-box"><div class="question-explanation-label">Объяснение</div><div class="question-explanation-text">${esc(question.explanation).replace(/\n/g, '<br>')}</div></div>`
                )
                : '';

            return `
                <article class="test-review-item ${isCorrect ? 'is-correct' : 'is-incorrect'}" id="review-q-${index + 1}">
                    <div class="test-review-item-head">
                        <div class="test-review-item-num">${index + 1}</div>
                        <div style="flex:1;min-width:0;">
                            <div class="test-review-question">${bodyHtml}</div>
                            ${renderImages(question.imageUrls || question.imageUrl, 'Иллюстрация к вопросу')}
                            <span class="test-review-badge ${isCorrect ? 'is-correct' : 'is-incorrect'}">
                                ${isCorrect ? '✓ Правильно' : '✗ Неправильно'}
                            </span>
                            ${isUsmle && qTime ? `<span style="margin-left:0.5rem;font-size:0.78rem;color:var(--text-muted);">⏱ ${fmtTime(qTime)}</span>` : ''}
                        </div>
                    </div>

                    <div class="test-review-answers">
                        ${!isCorrect ? `
                            <div class="test-review-label" style="color:var(--danger-color);">Ваш ответ</div>
                            <div class="test-review-answer-row is-user">${esc(userAnswer?.text || 'Не отвечено')}</div>
                        ` : ''}
                        <div class="test-review-label" style="color:var(--success-color);">Правильный ответ</div>
                        <div class="test-review-answer-row is-correct-choice">${esc(correctAnswer?.text || 'Не найден')}</div>
                        ${(question.Answers || []).length ? `
                            <div class="test-review-label" style="margin-top:0.85rem;">Все варианты</div>
                            ${(question.Answers || []).map((answer, ai) => {
                                const ok = isAnswerCorrectFlag(answer.isCorrect) || (correctAnswer && answer.id === correctAnswer.id);
                                const isUser = parseInt(userAnswerId, 10) === answer.id;
                                return `
                                    <div class="test-review-answer-row ${ok ? 'is-correct-choice' : ''} ${isUser && !ok ? 'is-user' : ''}">
                                        ${isUsmle ? `<strong style="margin-right:0.35rem;">${letters[ai] || ai + 1}.</strong>` : ''}
                                        ${ok ? '✓ ' : isUser ? '✗ ' : ''}${esc(answer.text)}
                                        ${renderImages(answer.imageUrls || answer.imageUrl, 'Иллюстрация к ответу')}
                                    </div>
                                `;
                            }).join('')}
                        ` : ''}
                    </div>

                    ${explanationHtml ? `<div class="test-review-explanation-wrap">${explanationHtml}</div>` : ''}
                </article>
            `;
        }).join('');

        return `
            <section class="test-review-summary">
                ${data.testName ? `<h2 style="margin:0 0 1rem;font-size:1.1rem;">${esc(data.testName)}${data.subjectName ? ` · ${esc(data.subjectName)}` : ''}</h2>` : ''}
                <div class="test-review-summary-grid">
                    <div class="test-review-stat">
                        <div class="test-review-stat-value">${data.score}/${data.total}</div>
                        <div class="test-review-stat-label">Правильных</div>
                    </div>
                    <div class="test-review-stat">
                        <div class="test-review-stat-value" style="color:${percentage >= 80 ? 'var(--success-color)' : percentage >= 60 ? 'var(--primary-color)' : 'var(--danger-color)'}">${percentage}%</div>
                        <div class="test-review-stat-label">Точность</div>
                    </div>
                    <div class="test-review-stat">
                        <div class="test-review-stat-value" style="color:var(--danger-color)">${incorrectCount}</div>
                        <div class="test-review-stat-label">Ошибок</div>
                    </div>
                    ${timeLabel ? `
                        <div class="test-review-stat">
                            <div class="test-review-stat-value" style="color:var(--text-secondary)">${timeLabel}</div>
                            <div class="test-review-stat-label">Время</div>
                        </div>
                    ` : ''}
                </div>
            </section>
            <section class="test-review-list">
                <h2 style="margin:0 0 0.25rem;font-size:1.15rem;">Детальный разбор по вопросам</h2>
                ${itemsHtml || '<p style="color:var(--text-secondary);">Нет данных для разбора.</p>'}
            </section>
        `;
    }

    async function loadFromApi(resultId) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) throw new Error('Требуется авторизация');
        const response = await fetch(`${API_URL}/stats/test-result/${resultId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Ошибка загрузки разбора');
        const data = await response.json();
        return normalizeResultPayload(data.result || data);
    }

    function loadFromSession() {
        try {
            const raw = sessionStorage.getItem('testResult');
            if (!raw) return null;
            return normalizeResultPayload(JSON.parse(raw));
        } catch (_) {
            return null;
        }
    }

    async function init() {
        if (typeof window.initTheme === 'function') window.initTheme();
        if (typeof window.loadUser === 'function') {
            try { await window.loadUser(); } catch (_) { /* ignore */ }
        }

        const content = document.getElementById('testReviewContent');
        const title = document.getElementById('testReviewTitle');
        if (!content) return;

        const params = new URLSearchParams(window.location.search);
        const resultId = params.get('resultId');

        let data = null;
        try {
            if (resultId) {
                data = await loadFromApi(resultId);
            } else {
                data = loadFromSession();
            }
        } catch (err) {
            console.error(err);
            content.innerHTML = `<div style="text-align:center;padding:2rem;"><p style="color:var(--danger-color);">${esc(err.message || 'Ошибка загрузки')}</p><a class="btn btn-primary" href="/tests">К тестам</a></div>`;
            return;
        }

        if (!data || !data.questions || !data.results) {
            content.innerHTML = `
                <div style="text-align:center;padding:2.5rem;">
                    <p style="color:var(--text-secondary);margin-bottom:1rem;">Данные разбора недоступны. Пройдите тест ещё раз.</p>
                    <a class="btn btn-primary" href="/tests">К тестам</a>
                </div>
            `;
            return;
        }

        const isUsmle = !!(data.isCustomUsmle || data.programType === 'usmle');
        if (isUsmle && typeof window.setProgramType === 'function') {
            window.setProgramType('usmle');
        }

        if (title) {
            title.textContent = data.testName ? `Разбор: ${data.testName}` : 'Разбор ошибок';
        }

        const backTests = document.getElementById('backToTestsBtn');
        if (backTests) {
            backTests.href = isUsmle ? '/usmle' : '/tests';
        }

        content.innerHTML = renderReviewHtml(data);

        if (isUsmle && typeof window.applyMedicalLinkify === 'function') {
            await window.applyMedicalLinkify(content);
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
