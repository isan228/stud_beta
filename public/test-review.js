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
            selfAssessment: !!raw.selfAssessment,
            selfAssessmentBlockIndex: raw.selfAssessmentBlockIndex || null,
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

    function splitReviewTags(tags) {
        const SUBJECTS = new Set([
            'anatomy', 'behavioral science', 'histology', 'physiology', 'pharmacology',
            'embryology', 'genetics', 'biostatistics', 'immunology', 'microbiology',
            'pathology', 'pathophysiology', 'biochemistry'
        ]);
        const subjects = [];
        const systems = [];
        for (const t of tags || []) {
            const name = String(t?.name || t || '').trim();
            if (!name) continue;
            if (SUBJECTS.has(name.toLowerCase())) subjects.push(name);
            else systems.push(name);
        }
        return {
            subjects: [...new Set(subjects)],
            systems: [...new Set(systems)]
        };
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

        const isUsmleReview = !!(reviewData.isCustomUsmle || reviewData.programType === 'usmle') && !reviewData.selfAssessment;
        const { subjects, systems } = splitReviewTags(question.Tags || question.tags || []);
        const metaHtml = isUsmleReview ? `
            <div class="usmle-question-meta" style="margin:0 0 1rem;">
                <div class="usmle-meta-row">
                    <span class="usmle-meta-chip usmle-meta-subject"><span class="usmle-meta-label">Subject</span> <span class="usmle-meta-value">${esc(subjects.join(', ') || '—')}</span></span>
                    <span class="usmle-meta-chip usmle-meta-system"><span class="usmle-meta-label">System</span> <span class="usmle-meta-value">${esc(systems.join(', ') || '—')}</span></span>
                </div>
            </div>
        ` : '';

        const answersHtml = (question.Answers || []).map((answer, ai) => {
            const letter = LETTERS[ai] || String(ai + 1);
            const ok = isAnswerCorrectFlag(answer.isCorrect) || (correctAnswer && answer.id === correctAnswer.id);
            const isUser = parseInt(userAnswerId, 10) === answer.id;
            const pct = byAnswer[answer.id] != null ? byAnswer[answer.id] : byAnswer[String(answer.id)];
            const pctLabel = pct != null ? ` (${pct}%)` : '';
            return `
                <div class="uworld-review-choice ${ok ? 'is-correct' : ''} ${isUser && !ok ? 'is-user-wrong' : ''} ${isUser && ok ? 'is-user-correct' : ''}" data-answer-id="${answer.id}">
                    <span class="uworld-review-choice-mark" aria-hidden="true">${ok ? '✓' : (isUser ? '✗' : '')}</span>
                    <span class="uworld-review-choice-letter">${letter}.</span>
                    <span class="uworld-review-choice-text answer-option-text">${esc(answer.text)}${pctLabel ? `<span class="uworld-review-choice-pct">${esc(pctLabel)}</span>` : ''}</span>
                    ${renderImages(answer.imageUrls || answer.imageUrl, 'Иллюстрация к ответу')}
                </div>
            `;
        }).join('');

        left.innerHTML = `
            ${metaHtml}
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

        window.UsmleAnnotations?.restoreMarksToRoot?.(question.id, left);
        const notesBtn = document.getElementById('reviewTbNotes');
        if (notesBtn) {
            const has = window.UsmleAnnotations?.hasNotes?.(question.id);
            notesBtn.classList.toggle('has-note', !!has);
        }
        const explanationHtml = (question.explanation || normalizeImageUrls(question.explanationImageUrls || question.explanationImageUrl).length)
            ? (
                typeof window.renderQuestionExplanationHtml === 'function'
                    ? window.renderQuestionExplanationHtml(question.explanation, question.explanationImageUrls || question.explanationImageUrl)
                    : `<div class="question-explanation-box"><div class="question-explanation-label">Explanation</div><div class="question-explanation-text">${esc(question.explanation).replace(/\n/g, '<br>')}</div></div>`
            )
            : '<p class="uworld-review-no-expl">Объяснение для этого вопроса пока не добавлено.</p>';

        if (explBody) {
            explBody.innerHTML = explanationHtml;
            if (isUsmleReview && typeof window.applyMedicalLinkify === 'function') {
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
                left.innerHTML = `<div style="padding:2rem;"><p style="color:var(--danger-color);">${esc(err.message || 'Ошибка')}</p><a class="btn btn-primary" href="/usmle-test-builder">Назад к тестам</a></div>`;
            }
            return;
        }

        if (!reviewData || !reviewData.questions || !reviewData.results) {
            if (left) {
                left.innerHTML = `
                    <div style="padding:2rem;text-align:center;">
                        <p style="color:#64748b;margin-bottom:1rem;">Данные разбора недоступны.</p>
                        <a class="btn btn-primary" href="/usmle-test-builder">Назад к тестам</a>
                    </div>
                `;
            }
            return;
        }

        const isUsmle = !!(reviewData.isCustomUsmle || reviewData.programType === 'usmle');
        if (isUsmle && typeof window.setProgramType === 'function') {
            window.setProgramType('usmle');
        }

        // USMLE → конструктор тестов; университет → каталог тестов
        const testsHref = isUsmle ? '/usmle-test-builder' : '/tests';
        const endBtns = [
            document.getElementById('endReviewBtn'),
            document.getElementById('reviewSfEnd')
        ];
        endBtns.forEach((el) => { if (el) el.href = testsHref; });

        const testIdEl = document.getElementById('reviewSfTestId');
        if (testIdEl) {
            const params = new URLSearchParams(window.location.search);
            testIdEl.textContent = String(
                reviewData.testId
                || reviewData.Test?.id
                || params.get('resultId')
                || reviewData.id
                || '—'
            );
        }

        const elapsedEl = document.getElementById('reviewSfElapsed');
        let baseElapsed = Number(reviewData.timeSpent) || 0;
        if (!baseElapsed && reviewData.questionTimes) {
            baseElapsed = Object.values(reviewData.questionTimes).reduce((a, b) => a + (Number(b) || 0), 0);
        }
        if (elapsedEl) {
            const s = Math.max(0, Math.floor(baseElapsed));
            const hh = String(Math.floor(s / 3600)).padStart(2, '0');
            const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
            const ss = String(s % 60).padStart(2, '0');
            elapsedEl.textContent = `${hh}:${mm}:${ss}`;
        }

        peerStats = await loadPeerStats(reviewData.questions);

        document.getElementById('reviewPrevBtn')?.addEventListener('click', () => goTo(currentIndex - 1));
        document.getElementById('reviewNextBtn')?.addEventListener('click', () => goTo(currentIndex + 1));

        document.getElementById('reviewTbMenu')?.addEventListener('click', () => {
            const nav = document.getElementById('reviewQuestionNav');
            const shell = document.querySelector('.uworld-review-shell');
            const btn = document.getElementById('reviewTbMenu');
            if (!nav) return;
            const mobile = window.matchMedia('(max-width: 900px)').matches;
            if (mobile) {
                shell?.classList.remove('qnav-collapsed');
                const open = nav.classList.toggle('is-drawer-open');
                if (btn) {
                    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
                    btn.title = open ? 'Скрыть список вопросов' : 'Открыть список вопросов';
                    btn.classList.toggle('is-active', open);
                }
                return;
            }
            nav.classList.remove('is-drawer-open');
            const collapsed = shell?.classList.toggle('qnav-collapsed');
            const open = !collapsed;
            if (btn) {
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
                btn.title = open ? 'Скрыть список вопросов' : 'Открыть список вопросов';
                btn.classList.toggle('is-active', open);
            }
        });
        document.getElementById('reviewTbFullscreen')?.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.().catch(() => {});
            } else {
                document.exitFullscreen?.().catch(() => {});
            }
        });

        const fillLab = () => {
            const mount = document.getElementById('usmleLabTables');
            if (!mount) return;
            window.UsmleLabValues?.mountLabPanel?.(mount);
            const closeBtn = mount.querySelector('[data-lab-close]');
            if (closeBtn && !closeBtn.dataset.bound) {
                closeBtn.dataset.bound = '1';
                closeBtn.addEventListener('click', () => {
                    const dock = document.getElementById('usmleLabModal');
                    if (dock) dock.hidden = true;
                    document.body.classList.remove('usmle-lab-open');
                });
            }
        };

        let calcExpr = '0';
        const setCalc = (v) => {
            calcExpr = String(v);
            const d = document.getElementById('usmleCalcDisplay');
            if (d) d.value = calcExpr;
        };
        const ensureCalc = () => {
            const pad = document.getElementById('usmleCalcPad');
            if (!pad || pad.dataset.ready === '1') return;
            pad.dataset.ready = '1';
            const keys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '='];
            pad.innerHTML = keys.map((k) => `<button type="button" class="uworld-calc-key" data-key="${k}">${k}</button>`).join('');
            pad.addEventListener('click', (e) => {
                const key = e.target.closest('[data-key]')?.getAttribute('data-key');
                if (!key) return;
                if (key === 'C') return setCalc('0');
                if (key === '⌫') return setCalc(calcExpr.length > 1 ? calcExpr.slice(0, -1) : '0');
                if (key === '=') {
                    try {
                        const expr = calcExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/%/g, '/100');
                        if (!/^[\d.+\-*/() ]+$/.test(expr)) throw new Error('bad');
                        const result = Function(`"use strict"; return (${expr})`)();
                        setCalc(Number.isFinite(result) ? String(Number(result.toPrecision(12))) : 'Error');
                    } catch (_) { setCalc('Error'); }
                    return;
                }
                if (calcExpr === '0' || calcExpr === 'Error') {
                    setCalc(/[\d.]/.test(key) ? key : `0${key}`);
                    return;
                }
                setCalc(calcExpr + key);
            });
        };

        document.getElementById('reviewTbLab')?.addEventListener('click', () => {
            const dock = document.getElementById('usmleLabModal');
            if (!dock) return;
            if (!dock.hidden) {
                dock.hidden = true;
                document.body.classList.remove('usmle-lab-open');
                return;
            }
            fillLab();
            dock.hidden = false;
            document.body.classList.add('usmle-lab-open');
        });

        const saveReviewNote = () => {
            const ta = document.getElementById('usmleNotesTextarea');
            const qid = ta?.dataset.questionId;
            if (qid == null || !ta) return;
            window.UsmleAnnotations?.setNotes?.(qid, ta.value || '');
            const q = reviewData?.questions?.[currentIndex];
            if (q && String(q.id) === String(qid)) {
                document.getElementById('reviewTbNotes')?.classList.toggle(
                    'has-note',
                    !!window.UsmleAnnotations?.hasNotes?.(q.id)
                );
            }
        };

        document.getElementById('reviewTbNotes')?.addEventListener('click', () => {
            const q = reviewData?.questions?.[currentIndex];
            const ta = document.getElementById('usmleNotesTextarea');
            const modal = document.getElementById('usmleNotesModal');
            if (ta && q) {
                ta.dataset.questionId = String(q.id);
                ta.value = window.UsmleAnnotations?.getNotes?.(q.id) || '';
            }
            if (modal) modal.style.display = 'flex';
        });
        document.getElementById('reviewSfNotebook')?.addEventListener('click', () => {
            document.getElementById('reviewTbNotes')?.click();
        });
        document.getElementById('reviewSfLibrary')?.addEventListener('click', () => {
            const lib = document.querySelector('#reviewExplanationBody .usmle-medical-library, .usmle-medical-library');
            if (lib) {
                lib.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                lib.classList.add('usmle-medical-library-flash');
                setTimeout(() => lib.classList.remove('usmle-medical-library-flash'), 1200);
            } else if (typeof window.showNotification === 'function') {
                window.showNotification('Medical Library появится в объяснении, если есть термины', 'info');
            }
        });
        document.getElementById('reviewSfFlashcards')?.addEventListener('click', () => {
            if (typeof window.showNotification === 'function') {
                window.showNotification('Flashcards скоро будут доступны', 'info');
            }
        });
        document.getElementById('reviewSfFeedback')?.addEventListener('click', () => {
            const q = reviewData?.questions?.[currentIndex];
            const modal = document.getElementById('questionErrorModal');
            if (!q || !modal) {
                if (typeof window.showNotification === 'function') {
                    window.showNotification('Не удалось открыть Feedback', 'error');
                }
                return;
            }
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val == null ? '' : String(val);
            };
            setVal('errorQuestionId', q.id);
            setVal('errorTestId', reviewData.testId || reviewData.Test?.id || '');
            setVal('errorQuestionNumber', currentIndex + 1);
            setVal('errorQuestionText', q.text || '');
            setVal('errorQuestionPreview', q.text || '');
            setVal('errorReason', '');
            modal.style.display = 'block';
            document.getElementById('errorReason')?.focus();
        });
        const closeFeedback = () => {
            const modal = document.getElementById('questionErrorModal');
            if (modal) modal.style.display = 'none';
        };
        document.getElementById('questionErrorModalClose')?.addEventListener('click', closeFeedback);
        document.getElementById('cancelQuestionErrorBtn')?.addEventListener('click', closeFeedback);
        document.getElementById('questionErrorForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const q = reviewData?.questions?.[currentIndex];
            const reason = String(document.getElementById('errorReason')?.value || '').trim();
            if (!q) return;
            if (reason.length < 5) {
                window.showNotification?.('Опишите проблему подробнее (минимум 5 символов)', 'error');
                return;
            }
            try {
                const token = localStorage.getItem('token') || sessionStorage.getItem('token');
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers.Authorization = `Bearer ${token}`;
                const response = await fetch(`${API_URL}/test-error-report`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        questionId: q.id,
                        testId: reviewData.testId || reviewData.Test?.id || null,
                        questionNumber: currentIndex + 1,
                        questionText: q.text || '',
                        reason
                    })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) {
                    window.showNotification?.(result.error || 'Ошибка отправки', 'error');
                    return;
                }
                window.showNotification?.('Отчет отправлен. Спасибо!', 'success');
                closeFeedback();
            } catch (_) {
                window.showNotification?.('Ошибка соединения', 'error');
            }
        });
        document.getElementById('usmleNotesModalClose')?.addEventListener('click', () => {
            saveReviewNote();
            const modal = document.getElementById('usmleNotesModal');
            if (modal) modal.style.display = 'none';
        });
        document.getElementById('usmleNotesSaveBtn')?.addEventListener('click', () => {
            saveReviewNote();
            const modal = document.getElementById('usmleNotesModal');
            if (modal) modal.style.display = 'none';
        });
        const notesTa = document.getElementById('usmleNotesTextarea');
        if (notesTa && !notesTa.dataset.autoSaveBound) {
            notesTa.dataset.autoSaveBound = '1';
            let t = null;
            notesTa.addEventListener('input', () => {
                clearTimeout(t);
                t = setTimeout(saveReviewNote, 300);
            });
            notesTa.addEventListener('blur', saveReviewNote);
        }

        document.getElementById('reviewTbCalc')?.addEventListener('click', () => {
            ensureCalc();
            setCalc('0');
            const m = document.getElementById('usmleCalcModal');
            if (m) m.style.display = 'flex';
        });
        document.getElementById('usmleCalcModalClose')?.addEventListener('click', () => {
            const m = document.getElementById('usmleCalcModal');
            if (m) m.style.display = 'none';
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') goTo(currentIndex - 1);
            if (e.key === 'ArrowRight') goTo(currentIndex + 1);
        });

        currentIndex = 0;
        renderCurrent();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
