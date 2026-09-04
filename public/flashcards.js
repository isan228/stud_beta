(function () {
    const API = '/api/tests/flashcards';
    const PROGRESS_KEY = 'uniFlashcardProgress';
    const BROWSE_PREVIEW_LIMIT = 6;
    const TOPIC_COLORS = [
        '#2563eb', '#ea580c', '#16a34a', '#dc2626', '#7c3aed',
        '#0891b2', '#db2777', '#ca8a04', '#4f46e5', '#0d9488'
    ];

    let allCards = [];
    let mode = 'browse'; // browse | study | session
    let studyCards = [];
    let studyIndex = 0;
    let showBack = false;
    let activeTopicKey = '';
    let searchQuery = '';
    let studySearchQuery = '';
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
        } catch {
            /* ignore quota */
        }
    }

    function cardProgress(cardId) {
        const row = progressMap[String(cardId)];
        if (!row || !row.status) return { status: 'new', lastUsed: null };
        return row;
    }

    function markCard(cardId, status) {
        progressMap[String(cardId)] = {
            status,
            lastUsed: new Date().toISOString()
        };
        saveProgress();
    }

    function topicNameOf(card) {
        return card.Subject?.name || 'Общие';
    }

    function topicIdOf(card) {
        return card.Subject?.id != null ? String(card.Subject.id) : 'general';
    }

    function tagInitial(name) {
        const ch = String(name || 'К').trim().charAt(0).toUpperCase();
        return ch || 'К';
    }

    function colorForTopic(key) {
        let hash = 0;
        const s = String(key || '');
        for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
        return TOPIC_COLORS[Math.abs(hash) % TOPIC_COLORS.length];
    }

    function previewText(text, maxLen = 120) {
        const clean = String(text || '').replace(/\s+/g, ' ').trim();
        if (clean.length <= maxLen) return clean;
        return `${clean.slice(0, maxLen - 1)}…`;
    }

    function cardMatchesSearch(card, q) {
        if (!q) return true;
        const hay = [
            card.frontText,
            card.backText,
            card.keyword,
            topicNameOf(card)
        ].join(' ').toLowerCase();
        return hay.includes(q);
    }

    function deckMatchesSearch(deck, q) {
        if (!q) return true;
        return String(deck.name || '').toLowerCase().includes(q);
    }

    function groupCards(cards) {
        const map = new Map();
        for (const card of cards) {
            const key = topicIdOf(card);
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    id: card.Subject?.id || null,
                    name: topicNameOf(card),
                    cards: []
                });
            }
            map.get(key).cards.push(card);
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }

    function deckStats(deck) {
        let neu = 0;
        let learning = 0;
        let review = 0;
        let lastUsed = null;
        for (const card of deck.cards) {
            const p = cardProgress(card.id);
            if (p.status === 'learning') learning += 1;
            else if (p.status === 'review') review += 1;
            else neu += 1;
            if (p.lastUsed) {
                const t = new Date(p.lastUsed);
                if (!lastUsed || t > lastUsed) lastUsed = t;
            }
        }
        return { neu, learning, review, lastUsed };
    }

    function formatLastUsed(date) {
        if (!date) return '—';
        try {
            return date.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return '—';
        }
    }

    function setMode(nextMode) {
        mode = nextMode;
        document.getElementById('fcTabBrowse')?.classList.toggle('active', mode === 'browse');
        document.getElementById('fcTabStudy')?.classList.toggle('active', mode === 'study' || mode === 'session');
        document.getElementById('fcBrowsePanel')?.classList.toggle('hidden', mode !== 'browse');
        document.getElementById('fcStudyPanel')?.classList.toggle('hidden', mode !== 'study');
        document.getElementById('fcSessionPanel')?.classList.toggle('hidden', mode !== 'session');
    }

    function isBlankText(text) {
        return !String(text || '').replace(/\s+/g, ' ').trim();
    }

    function sideHtml(card, side) {
        const isBack = side === 'back';
        const imageUrl = String(isBack ? (card.backImageUrl || '') : (card.frontImageUrl || '')).trim();
        const text = isBack
            ? (card.backHtml || esc(card.backText || ''))
            : (card.frontHtml || esc(card.frontText || ''));
        const hasText = !isBlankText(isBack ? card.backText : card.frontText);
        const img = imageUrl
            ? `<figure class="flashcard-image-wrap"><img class="flashcard-image" src="${esc(imageUrl)}" alt="${isBack ? 'Back' : 'Front'}" loading="lazy"></figure>`
            : '';
        const textBlock = hasText
            ? `<div class="flashcard-text flashcard-text-${isBack ? 'back' : 'front'}${imageUrl ? ' has-image' : ''}">${text}</div>`
            : '';
        return img || textBlock ? `${img}${textBlock}` : '<p class="flashcard-empty">Пустая карточка</p>';
    }

    function renderBrowse() {
        const root = document.getElementById('fcBrowseList');
        if (!root) return;

        const q = searchQuery.trim().toLowerCase();
        const groups = groupCards(allCards).filter((g) => {
            if (!q) return true;
            if (String(g.name).toLowerCase().includes(q)) return true;
            return g.cards.some((c) => cardMatchesSearch(c, q));
        });

        if (!groups.length) {
            root.innerHTML = '<p class="flashcard-empty">Нет карточек для выбранных фильтров</p>';
            return;
        }

        root.innerHTML = groups.map((group) => {
            const color = colorForTopic(group.key);
            const preview = group.cards.slice(0, BROWSE_PREVIEW_LIMIT);
            const cardsHtml = preview.map((card) => {
                const hasImage = Boolean(String(card.frontImageUrl || '').trim());
                const body = hasImage
                    ? `<img class="fc-deck-card-img" src="${esc(card.frontImageUrl)}" alt="" loading="lazy">`
                    : `<div class="fc-deck-card-text">${esc(previewText(card.frontText))}</div>`;
                return `
                    <button type="button" class="fc-deck-card" data-card-id="${card.id}" data-topic-key="${esc(group.key)}">
                        ${body}
                    </button>
                `;
            }).join('');

            return `
                <section class="fc-topic-section" data-topic-key="${esc(group.key)}">
                    <div class="fc-topic-head">
                        <div class="fc-topic-title">
                            <span class="fc-topic-badge" style="background:${color}">${esc(tagInitial(group.name))}</span>
                            <span>${esc(group.name)}</span>
                        </div>
                        <button type="button" class="fc-see-all" data-topic-key="${esc(group.key)}">See All</button>
                    </div>
                    <div class="fc-deck-row">${cardsHtml}</div>
                </section>
            `;
        }).join('');
    }

    function renderStudyTable() {
        const root = document.getElementById('fcStudyTableBody');
        if (!root) return;

        const q = studySearchQuery.trim().toLowerCase();
        const decks = groupCards(allCards).filter((d) => deckMatchesSearch(d, q));

        if (!decks.length) {
            root.innerHTML = `
                <tr>
                    <td colspan="6" class="flashcard-empty">Нет колод для изучения</td>
                </tr>`;
            return;
        }

        root.innerHTML = decks.map((deck) => {
            const stats = deckStats(deck);
            const color = colorForTopic(deck.key);
            return `
                <tr class="fc-deck-row-item" data-topic-key="${esc(deck.key)}">
                    <td class="fc-col-deck">
                        <div class="fc-deck-name">
                            <span class="fc-topic-badge" style="background:${color}">${esc(tagInitial(deck.name))}</span>
                            <span>${esc(deck.name)}</span>
                        </div>
                    </td>
                    <td class="fc-col-stat fc-stat-new">${stats.neu}</td>
                    <td class="fc-col-stat fc-stat-learning">${stats.learning}</td>
                    <td class="fc-col-stat fc-stat-review">${stats.review}</td>
                    <td class="fc-col-last">${esc(formatLastUsed(stats.lastUsed))}</td>
                    <td class="fc-col-actions">
                        <button type="button" class="fc-deck-action fc-deck-play" data-topic-key="${esc(deck.key)}" title="Study" aria-label="Study">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M9 6l10 6-10 6V6z" fill="currentColor"/>
                            </svg>
                        </button>
                    </td>
                </tr>`;
        }).join('');
    }

    function deckProgressStats(cards) {
        let neu = 0;
        let learning = 0;
        let review = 0;
        for (const card of cards) {
            const p = cardProgress(card.id);
            if (p.status === 'learning') learning += 1;
            else if (p.status === 'review') review += 1;
            else neu += 1;
        }
        return { neu, learning, review };
    }

    function renderSessionStats() {
        const statsEl = document.getElementById('fcSessionStats');
        if (!statsEl) return;
        const stats = deckProgressStats(studyCards);
        statsEl.innerHTML = `
            <span class="fc-stat-new">${stats.neu}</span>
            <span class="fc-stat-sep">·</span>
            <span class="fc-stat-learning">${stats.learning}</span>
            <span class="fc-stat-sep">·</span>
            <span class="fc-stat-review">${stats.review}</span>
        `;
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
        const rateBox = document.getElementById('flashcardRateBox');

        if (!body) return;
        if (!card) {
            body.innerHTML = '<p class="flashcard-empty">Нет карточек</p>';
            return;
        }

        const tagName = topicNameOf(card);
        if (category) {
            category.innerHTML = `
                <span class="flashcard-tag-badge" style="background:${colorForTopic(topicIdOf(card))}">${esc(tagInitial(tagName))}</span>
                <span class="flashcards-category-name">${esc(tagName)}</span>
            `;
        }

        const imageUrl = String(showBack ? (card.backImageUrl || '') : (card.frontImageUrl || '')).trim();
        body.innerHTML = sideHtml(card, showBack ? 'back' : 'front');
        body.scrollTop = 0;
        if (shell) shell.classList.toggle('has-media', Boolean(imageUrl));

        if (showBack) {
            footerFront?.classList.add('hidden');
            footerBack?.classList.remove('hidden');
            rateBox?.classList.remove('hidden');
        } else {
            footerFront?.classList.remove('hidden');
            footerBack?.classList.add('hidden');
            rateBox?.classList.add('hidden');
        }
        toggleFront?.classList.toggle('active', !showBack);
        toggleBack?.classList.toggle('active', showBack);
        renderSessionStats();
    }

    function openStudyTable() {
        setMode('study');
        renderStudyTable();
    }

    function openSession({ topicKey = '', startCardId = null } = {}) {
        activeTopicKey = topicKey || '';
        studyCards = activeTopicKey
            ? allCards.filter((c) => topicIdOf(c) === activeTopicKey)
            : allCards.slice();

        const rank = { new: 0, learning: 1, review: 2 };
        studyCards = studyCards.slice().sort((a, b) => {
            const ra = rank[cardProgress(a.id).status] ?? 0;
            const rb = rank[cardProgress(b.id).status] ?? 0;
            return ra - rb || (a.sortOrder || 0) - (b.sortOrder || 0) || a.id - b.id;
        });

        studyIndex = 0;
        if (startCardId != null) {
            const idx = studyCards.findIndex((c) => Number(c.id) === Number(startCardId));
            if (idx >= 0) studyIndex = idx;
        }
        showBack = false;
        setMode('session');
        renderSession();
    }

    function closeSession() {
        openStudyTable();
    }

    function rate(status) {
        const card = studyCards[studyIndex];
        if (card) markCard(card.id, status);
        if (studyIndex < studyCards.length - 1) {
            studyIndex += 1;
            showBack = false;
            renderSession();
            return;
        }
        openStudyTable();
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

        const browse = document.getElementById('fcBrowseList');
        const studyBody = document.getElementById('fcStudyTableBody');
        if (browse) browse.innerHTML = '<p class="flashcard-empty">Загрузка…</p>';
        if (studyBody) {
            studyBody.innerHTML = '<tr><td colspan="6" class="flashcard-empty">Загрузка…</td></tr>';
        }

        try {
            const res = await fetch(API, { headers: authHeaders() });
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            if (!res.ok) throw new Error('fail');
            allCards = await res.json();
            if (!Array.isArray(allCards)) allCards = [];

            if (!allCards.length) {
                const emptyMsg = 'Пока нет карточек для вашего университета. Их добавляет администратор.';
                if (browse) browse.innerHTML = `<p class="flashcard-empty">${emptyMsg}</p>`;
                if (studyBody) {
                    studyBody.innerHTML = `<tr><td colspan="6" class="flashcard-empty">${emptyMsg}</td></tr>`;
                }
                return;
            }

            renderBrowse();
            renderStudyTable();
        } catch (e) {
            const msg = 'Ошибка загрузки карточек';
            if (browse) browse.innerHTML = `<p class="flashcard-empty">${msg}</p>`;
            if (studyBody) {
                studyBody.innerHTML = `<tr><td colspan="6" class="flashcard-empty">${msg}</td></tr>`;
            }
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof window.initTheme === 'function') window.initTheme();
        if (typeof window.loadUser === 'function') await window.loadUser();
        if (typeof window.setupEventListeners === 'function') window.setupEventListeners();

        document.getElementById('fcTabBrowse')?.addEventListener('click', () => {
            setMode('browse');
            renderBrowse();
        });
        document.getElementById('fcTabStudy')?.addEventListener('click', () => {
            openStudyTable();
        });

        document.getElementById('fcSearchInput')?.addEventListener('input', (e) => {
            searchQuery = e.target.value || '';
            renderBrowse();
        });
        document.getElementById('fcStudySearchInput')?.addEventListener('input', (e) => {
            studySearchQuery = e.target.value || '';
            renderStudyTable();
        });

        document.getElementById('fcBrowseList')?.addEventListener('click', (e) => {
            const seeAll = e.target.closest('.fc-see-all');
            if (seeAll) {
                openSession({ topicKey: seeAll.getAttribute('data-topic-key') || '' });
                return;
            }
            const cardEl = e.target.closest('.fc-deck-card');
            if (cardEl) {
                openSession({
                    topicKey: cardEl.getAttribute('data-topic-key') || '',
                    startCardId: cardEl.getAttribute('data-card-id')
                });
            }
        });

        document.getElementById('fcStudyTableBody')?.addEventListener('click', (e) => {
            const play = e.target.closest('.fc-deck-play');
            if (play) {
                openSession({ topicKey: play.getAttribute('data-topic-key') || '' });
                return;
            }
            const row = e.target.closest('.fc-deck-row-item');
            if (row) {
                openSession({ topicKey: row.getAttribute('data-topic-key') || '' });
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
