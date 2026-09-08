(function () {
    const API_URL = window.API_URL || '/api';
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    let reviewData = null;
    let peerStats = {};
    let currentIndex = 0;

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
            const byId = (question.Answers || []).find((a) => a.id === questionResult.correctAnswerId);
            if (byId) return byId;
        }
        return (question.Answers || []).find((a) => isAnswerCorrectFlag(a.isCorrect)) || null;
    }

    function fmtTime(totalSec) {
        if (totalSec == null || totalSec === '') return '—';
        const n = Number(totalSec) || 0;
        const m = Math.floor(n / 60);
        const s = n % 60;
        if (m <= 0) return `${s} sec`;
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
            isCustomUsmle: !!raw.isCustomUsmle,
            questionTimes: raw.questionTimes || {}
        };
    }

    function getNavLinkFlags(questions) {
        const flags = (questions || []).map(() => ({ linked: false, start: false, mid: false, end: false }));
        const getKey = window.UsmleLinkedQuestion?.getLinkedClusterKey;
        if (!getKey) return flags;
        let i = 0;
        while (i < questions.length) {
            const key = getKey(questions[i] && questions[i].text);
            if (!key) { i += 1; continue; }
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

    function letterForAnswer(question, answerId) {
        const idx = (question.Answers || []).findIndex((a) => a.id === answerId);
        return idx >= 0 ? (LETTERS[idx] || String(idx + 1)) : '—';
    }

    function renderNav() {
        const list = document.getElementById('reviewQuestionNavList');
        if (!list || !reviewData) return;
        const flags = getNavLinkFlags(reviewData.questions);
        list.innerHTML = reviewData.questions.map((q, index) => {
            const f = flags[index] || {};
            const res = reviewData.results[q.id] || {};
            const active = index === currentIndex;
            const classes = [
                'usmle-qnav-item',
                active ? 'is-active' : '',
                res.correct ? 'is-answered is-reviewed' : '',
                res.correct === false ? 'is-answered' : '',
                f.linked ? 'is-linked' : '',
                f.start ? 'is-linked-start' : '',
                f.mid ? 'is-linked-mid' : '',
                f.end ? 'is-linked-end' : ''
            ].filter(Boolean).join(' ');
            return `
                <li class="${classes}">
                    <button type="button" class="usmle-qnav-btn" data-q-index="${index}" aria-current="${active ? 'true' : 'false'}">
                        <span class="usmle-qnav-rail" aria-hidden="true"><span class="usmle-qnav-dot"></span></span>
                        <span class="usmle-qnav-num">${index + 1}</span>
                    </button>
                </li>
            `;
        }).join('');

        list.querySelectorAll('.usmle-qnav-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-q-index'), 10);
                if (Number.isFinite(idx)) goTo(idx);
            });
        });
    }

    function renderCurrent() {
        if (!reviewData) return;
        const questions = reviewData.questions;
        const question = questions[currentIndex];
        if (!question) return;

        const left = document.getElementById('reviewLeft');
        const explBody = document.getElementById('reviewExplanationBody');
        const itemLabel = document.getElementById('reviewItemLabel');
        const qidEl = document.getElementById('reviewQuestionId');
        const prevBtn = document.getElementById('reviewPrevBtn');
        const nextBtn = document.getElementById('reviewNextBtn');

        if (itemLabel) itemLabel.textContent = `Item ${currentIndex + 1} of ${questions.length}`;
        if (qidEl) qidEl.textContent = question.id != null ? `Question Id: ${question.id}` : '';
        if (prevBtn) prevBtn.disabled = currentIndex <= 0;
        if (nextBtn) nextBtn.disabled = currentIndex >= questions.length - 1;

        const questionResult = reviewData.results[question.id] || {};
        const userAnswerId = reviewData.answers[question.id];
        const userAnswer = (question.Answers || []).find((a) => a.id === parseInt(userAnswerId, 10));
        const correctAnswer = findCorrectAnswer(question, questionResult);
        const isCorrect = !!questionResult.correct;
        const omitted = userAnswerId == null || userAnswerId === '';
        const qTime = (reviewData.questionTimes || {})[question.id];
        const qPeer = peerStats[question.id] || peerStats[String(question.id)] || {};
        const correctPct = qPeer.correctPercent;
        const byAnswer = qPeer.byAnswerId || {};

        let statusText = 'Correct';
        let statusClass = 'is-ok';
        if (omitted) {
            statusText = 'Omitted';
            statusClass = 'is-omit';
        } else if (!isCorrect) {
            statusText = 'Incorrect';
            statusClass = 'is-bad';
        }

        const bodyHtml = window.UsmleLinkedQuestion?.renderUsmleQuestionBodyHtml
            ? window.UsmleLinkedQuestion.renderUsmleQuestionBodyHtml(question.text, {
                isFirstInLinkedGroup: window.UsmleLinkedQuestion.isFirstLinkedQuestionInList?.(questions, currentIndex) || false
            })
            : `<div class="question-text">${esc(question.text)}</div>`;

        const answersHtml = (question.Answers || []).map((answer, ai) => {
            const letter = LETTERS[ai] || String(ai + 1);
            const ok = isAnswerCorrectFlag(answer.isCorrect) || (correctAnswer && answer.id === correctAnswer.id);
            const isUser = parseInt(userAnswerId, 10) === answer.id;
            const pct = byAnswer[answer.id] != null ? byAnswer[answer.id] : byAnswer[String(answer.id)];
            const pctLabel = pct != null ? ` (${pct}%)` : '';
            return `
                <div class="uworld-review-choice ${ok ? 'is-correct' : ''} ${isUser && !ok ? 'is-user-wrong' : ''} ${isUser && ok ? 'is-user-correct' : ''}">
                    <span class="uworld-review-choice-mark" aria-hidden="true">${ok ? '✓' : (isUser ? '✗' : '')}</span>
                    <span class="uworld-review-choice-letter">${letter}.</span>
                    <span class="uworld-review-choice-text">${esc(answer.text)}${pctLabel ? `<span class="uworld-review-choice-pct">${esc(pctLabel)}</span>` : ''}</span>
                    ${renderImages(answer.imageUrls || answer.imageUrl, 'Иллюстрация к ответу')}
                </div>
            `;
        }).join('');

        left.innerHTML = `
            <div class="uworld-review-stem">
                ${bodyHtml}
                ${renderImages(question.imageUrls || question.imageUrl, 'Иллюстрация к вопросу')}
            </div>
            <div class="uworld-review-choices">
                ${answersHtml}
            </div>
            <div class="uworld-review-resultbar ${statusClass}">
                <div class="uworld-review-resultbar-row">
                    <span class="uworld-review-status">${statusText}</span>
                    <span class="uworld-review-correct-ans">Correct Answer: <strong>${correctAnswer ? letterForAnswer(question, correctAnswer.id) : '—'}</strong></span>
                </div>
                <div class="uworld-review-resultbar-meta">
                    <span title="Процент пользователей, ответивших правильно">
                        ▦ ${correctPct != null ? `${correctPct}% Answered Correctly` : '— Answered Correctly'}
                    </span>
                    <span title="Ваше время на вопрос">⏱ ${fmtTime(qTime)}</span>
                    ${!omitted ? `<span>Your answer: <strong>${letterForAnswer(question, parseInt(userAnswerId, 10))}</strong>${userAnswer?.text ? ` — ${esc(userAnswer.text)}` : ''}</span>` : ''}
                </div>
            </div>
        `;

        const explanationHtml = (question.explanation || normalizeImageUrls(question.explanationImageUrls || question.explanationImageUrl).length)
            ? (
                typeof window.renderQuestionExplanationHtml === 'function'
                    ? window.renderQuestionExplanationHtml(question.explanation, question.explanationImageUrls || question.explanationImageUrl)
                    : `<div class="question-explanation-box"><div class="question-explanation-label">Explanation</div><div class="question-explanation-text">${esc(question.explanation).replace(/\n/g, '<br>')}</div></div>`
            )
            : '<p class="uworld-review-no-expl">Объяснение для этого вопроса пока не добавлено.</p>';

        if (explBody) {
            explBody.innerHTML = explanationHtml;
            const isUsmle = !!(reviewData.isCustomUsmle || reviewData.programType === 'usmle');
            if (isUsmle && typeof window.applyMedicalLinkify === 'function') {
                window.applyMedicalLinkify(explBody);
            }
        }

        renderNav();
    }

    function goTo(index) {
        if (!reviewData) return;
        const next = Math.max(0, Math.min(reviewData.questions.length - 1, Number(index)));
        currentIndex = next;
        renderCurrent();
    }

    async function loadPeerStats(questions) {
        const ids = (questions || []).map((q) => q.id).filter((id) => Number.isFinite(Number(id)));
        if (!ids.length) return {};
        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const response = await fetch(`${API_URL}/stats/question-peer-stats`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ questionIds: ids })
            });
            if (!response.ok) return {};
            const data = await response.json();
            return data.stats || {};
        } catch (_) {
            return {};
        }
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

        const left = document.getElementById('reviewLeft');
        const params = new URLSearchParams(window.location.search);
        const resultId = params.get('resultId');

        try {
            reviewData = resultId ? await loadFromApi(resultId) : loadFromSession();
        } catch (err) {
            if (left) {
                left.innerHTML = `<div style="padding:2rem;"><p style="color:var(--danger-color);">${esc(err.message || 'Ошибка')}</p><a class="btn btn-primary" href="/tests">К тестам</a></div>`;
            }
            return;
        }

        if (!reviewData || !reviewData.questions || !reviewData.results) {
            if (left) {
                left.innerHTML = `
                    <div style="padding:2rem;text-align:center;">
                        <p style="color:#64748b;margin-bottom:1rem;">Данные разбора недоступны.</p>
                        <a class="btn btn-primary" href="/tests">К тестам</a>
                    </div>
                `;
            }
            return;
        }

        const isUsmle = !!(reviewData.isCustomUsmle || reviewData.programType === 'usmle');
        if (isUsmle && typeof window.setProgramType === 'function') {
            window.setProgramType('usmle');
        }

        const endBtns = [document.getElementById('endReviewBtn'), document.getElementById('endReviewBtnFooter')];
        const testsHref = isUsmle ? '/usmle' : '/tests';
        endBtns.forEach((el) => { if (el) el.href = testsHref; });

        const testNameEl = document.getElementById('reviewTestName');
        if (testNameEl) {
            testNameEl.textContent = reviewData.testName || 'Разбор теста';
        }
        const scoreEl = document.getElementById('reviewScoreSummary');
        if (scoreEl) {
            scoreEl.textContent = `${reviewData.score}/${reviewData.total} · ${reviewData.percentage}%`;
        }

        peerStats = await loadPeerStats(reviewData.questions);

        document.getElementById('reviewPrevBtn')?.addEventListener('click', () => goTo(currentIndex - 1));
        document.getElementById('reviewNextBtn')?.addEventListener('click', () => goTo(currentIndex + 1));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') goTo(currentIndex - 1);
            if (e.key === 'ArrowRight') goTo(currentIndex + 1);
        });

        currentIndex = 0;
        renderCurrent();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
