(function () {
    const API = '/api/tests/flashcards';
    const PROGRESS_KEY = 'uniFlashcardProgress';

    let allCards = [];
    let studyCards = [];
    let studyIndex = 0;
    let showBack = false;
    let progressMap = loadProgress();

    function token() {
        return localStorage.getItem('token') || '';
    }

    function authHeaders() {
        const t = token();
        return t ? { Authorization: `Bearer ${t}` } : {};
    }

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function loadProgress() {
        try {
            const raw = localStorage.getItem(PROGRESS_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    function saveProgress() {
        try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressMap));
        } catch { /* ignore */ }
    }

    function topicName(card) {
        return card.Subject?.name || 'Общие';
    }

    function isBlankText(text) {
        return !String(text || '').replace(/\s+/g, ' ').trim();
    }

    function sideHtml(card, side) {
        const isBack = side === 'back';
        const imageUrl = String(isBack ? (card.backImageUrl || '') : (card.frontImageUrl || '')).trim();
        const text = isBack ? (card.backHtml || esc(card.backText || '')) : (card.frontHtml || esc(card.frontText || ''));
        const hasText = !isBlankText(isBack ? card.backText : card.frontText);
        const img = imageUrl
            ? `<figure class="flashcard-image-wrap"><img class="flashcard-image" src="${esc(imageUrl)}" alt="${isBack ? 'Back' : 'Front'}" loading="lazy"></figure>`
            : '';
        const textBlock = hasText
            ? `<div class="flashcard-text ${imageUrl ? 'has-image' : ''}">${text}</div>`
            : '';
        return img || textBlock ? `${img}${textBlock}` : '<p class="flashcard-empty">Пустая карточка</p>';
    }

    function groupBySubject(cards) {
        const map = new Map();
        for (const c of cards) {
            const key = topicName(c);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(c);
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
    }

    function renderBrowse(query = '') {
        const box = document.getElementById('fcBrowseList');
        if (!box) return;
        const q = String(query || '').trim().toLowerCase();
        let cards = allCards;
        if (q) {
            cards = allCards.filter((c) =>
                String(c.frontText || '').toLowerCase().includes(q)
                || String(c.backText || '').toLowerCase().includes(q)
                || topicName(c).toLowerCase().includes(q)
            );
        }
        if (!cards.length) {
            box.innerHTML = '<div class="tests-hub-empty">Карточки не найдены</div>';
            return;
        }
        const groups = groupBySubject(cards);
        box.innerHTML = groups.map(([name, list]) => `
            <section class="fc-browse-topic" style="margin-bottom:1.25rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; margin-bottom:0.65rem;">
                    <h3 style="margin:0; font-size:1.05rem;">${esc(name)} <span style="color:var(--text-muted); font-weight:500;">(${list.length})</span></h3>
                    <button type="button" class="btn btn-secondary btn-sm fc-start-deck" data-topic="${esc(name)}">Учить</button>
                </div>
                <div class="tests-subject-grid">
                    ${list.slice(0, 8).map((c) => `
                        <div class="tests-subject-card fc-open-card" data-card-id="${c.id}" data-topic="${esc(topicName(c))}" role="button" tabindex="0">
                            <div class="tests-subject-card-body">
                                <h3 class="tests-subject-card-title" style="font-size:0.95rem;">${esc((c.frontText || '').slice(0, 120))}${(c.frontText || '').length > 120 ? '…' : ''}</h3>
                                <p class="tests-subject-card-meta">${c.isFree ? '🆓 Бесплатная' : 'По подписке'}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
        `).join('');
    }

    function renderSession() {
        const card = studyCards[studyIndex];
        const body = document.getElementById('flashcardBody');
        const category = document.getElementById('flashcardCategory');
        const footerFront = document.getElementById('fcSessionFooterFront');
        const footerBack = document.getElementById('fcSessionFooterBack');
        const toggleFront = document.getElementById('flashcardToggleFront');
        const toggleBack = document.getElementById('flashcardToggleBack');
        const shell = document.querySelector('#fcSessionPanel .fc-session-card');

        if (!body) return;
        if (!card) {
            body.innerHTML = '<p class="flashcard-empty">Нет карточек</p>';
            return;
        }

        if (category) {
            category.innerHTML = `<span class="flashcards-category-name">${esc(topicName(card))}</span>`;
        }

        const imageUrl = String(showBack ? (card.backImageUrl || '') : (card.frontImageUrl || '')).trim();
        body.innerHTML = sideHtml(card, showBack ? 'back' : 'front');
        body.scrollTop = 0;
        if (shell) shell.classList.toggle('has-media', Boolean(imageUrl));

        if (showBack) {
            footerFront?.classList.add('hidden');
            footerBack?.classList.remove('hidden');
        } else {
            footerFront?.classList.remove('hidden');
            footerBack?.classList.add('hidden');
        }
        toggleFront?.classList.toggle('active', !showBack);
        toggleBack?.classList.toggle('active', showBack);
    }

    function openSession({ topic = '', startCardId = null } = {}) {
        studyCards = topic
            ? allCards.filter((c) => topicName(c) === topic)
            : allCards.slice();
        studyIndex = 0;
        if (startCardId != null) {
            const idx = studyCards.findIndex((c) => Number(c.id) === Number(startCardId));
            if (idx >= 0) studyIndex = idx;
        }
        showBack = false;
        document.getElementById('fcBrowseList')?.classList.add('hidden');
        document.getElementById('fcSessionPanel')?.classList.remove('hidden');
        renderSession();
    }

    function closeSession() {
        document.getElementById('fcSessionPanel')?.classList.add('hidden');
        document.getElementById('fcBrowseList')?.classList.remove('hidden');
        renderBrowse(document.getElementById('fcSearchInput')?.value || '');
    }

    function rate(status) {
        const card = studyCards[studyIndex];
        if (card) {
            progressMap[String(card.id)] = { status, lastUsed: Date.now() };
            saveProgress();
        }
        if (studyIndex < studyCards.length - 1) {
            studyIndex += 1;
            showBack = false;
            renderSession();
            return;
        }
        closeSession();
        if (typeof showNotification === 'function') {
            showNotification('Колода пройдена', 'success');
        }
    }

    async function loadCards() {
        const gate = document.getElementById('fcGate');
        const app = document.getElementById('fcApp');
        if (!token()) {
            if (gate) {
                gate.style.display = 'block';
                gate.innerHTML = 'Войдите, чтобы смотреть карточки. <a href="/login">Войти</a>';
            }
            app?.classList.add('hidden');
            return;
        }
        if (gate) gate.style.display = 'none';
        app?.classList.remove('hidden');

        try {
            const res = await fetch(API, { headers: authHeaders() });
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            if (!res.ok) throw new Error('fail');
            allCards = await res.json();
            if (!allCards.length) {
                document.getElementById('fcBrowseList').innerHTML =
                    '<div class="tests-hub-empty">Пока нет карточек для вашего университета. Бесплатные и платные добавляет администратор.</div>';
                return;
            }
            renderBrowse();
        } catch (e) {
            document.getElementById('fcBrowseList').innerHTML =
                '<div class="tests-hub-empty">Ошибка загрузки карточек</div>';
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof window.initTheme === 'function') window.initTheme();
        if (typeof window.loadUser === 'function') await window.loadUser();
        if (typeof window.setupEventListeners === 'function') window.setupEventListeners();

        document.getElementById('fcSearchInput')?.addEventListener('input', (e) => {
            renderBrowse(e.target.value || '');
        });

        document.getElementById('fcBrowseList')?.addEventListener('click', (e) => {
            const start = e.target.closest('.fc-start-deck');
            if (start) {
                openSession({ topic: start.getAttribute('data-topic') || '' });
                return;
            }
            const cardEl = e.target.closest('.fc-open-card');
            if (cardEl) {
                openSession({
                    topic: cardEl.getAttribute('data-topic') || '',
                    startCardId: cardEl.getAttribute('data-card-id')
                });
            }
        });

        document.getElementById('fcCloseSession')?.addEventListener('click', closeSession);
        document.getElementById('flashcardActionBtn')?.addEventListener('click', () => {
            showBack = true;
            renderSession();
        });
        document.getElementById('flashcardToggleFront')?.addEventListener('click', () => {
            showBack = false;
            renderSession();
        });
        document.getElementById('flashcardToggleBack')?.addEventListener('click', () => {
            showBack = true;
            renderSession();
        });
        document.getElementById('flashcardRateAgain')?.addEventListener('click', () => rate('learning'));
        document.getElementById('flashcardRateGood')?.addEventListener('click', () => rate('review'));
        document.getElementById('flashcardRateEasy')?.addEventListener('click', () => rate('review'));

        await loadCards();
    });
})();
