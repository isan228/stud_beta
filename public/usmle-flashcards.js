(function () {
    const U = window.UsmleApp;
    if (!U) return;

    const BROWSE_PREVIEW_LIMIT = 6;
    const PROGRESS_KEY = 'usmleFlashcardProgress';
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
    let progressMap = loadProgress();

    function authHeaders() {
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    function esc(str) {
        return U.escHtml(str);
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

    function primaryTag(card) {
        const tags = card?.Tags || [];
        return tags[0] || null;
    }

    function topicNameOf(card) {
        return primaryTag(card)?.name || 'Other';
    }

    function topicIdOf(card) {
        const tag = primaryTag(card);
        return tag?.id != null ? String(tag.id) : 'other';
    }

    function tagInitial(name) {
        const ch = String(name || 'F').trim().charAt(0).toUpperCase();
        return ch || 'F';
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
                    id: primaryTag(card)?.id || null,
                    name: topicNameOf(card),
                    cards: []
                });
            }
            map.get(key).cards.push(card);
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'en'));
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

    function filteredCards() {
        const q = searchQuery.trim().toLowerCase();
        return allCards.filter((c) => cardMatchesSearch(c, q));
    }

    function setMode(nextMode) {
        mode = nextMode;
        document.getElementById('fcTabBrowse')?.classList.toggle('active', mode === 'browse');
        document.getElementById('fcTabStudy')?.classList.toggle('active', mode === 'study' || mode === 'session');
        document.getElementById('fcBrowsePanel')?.classList.toggle('hidden', mode !== 'browse');
        document.getElementById('fcStudyPanel')?.classList.toggle('hidden', mode !== 'study');
        document.getElementById('fcSessionPanel')?.classList.toggle('hidden', mode !== 'session');
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

        const q = searchQuery.trim().toLowerCase();
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

    function renderSessionCard() {
        const card = studyCards[studyIndex] || null;
        const body = document.getElementById('flashcardBody');
        const counter = document.getElementById('flashcardCounter');
        const category = document.getElementById('flashcardCategory');
        const toggleFront = document.getElementById('flashcardToggleFront');
        const toggleBack = document.getElementById('flashcardToggleBack');
        const actionBtn = document.getElementById('flashcardActionBtn');
        const keyword = document.getElementById('flashcardKeyword');
        const prevBtn = document.getElementById('flashcardPrevBtn');
        const nextBtn = document.getElementById('flashcardNextBtn');
        const topicLabel = document.getElementById('fcSessionTopicLabel');
        const rateBox = document.getElementById('flashcardRateBox');

        if (!body) return;

        if (!card) {
            body.innerHTML = '<p class="flashcard-empty">Нет карточек для изучения</p>';
            if (counter) counter.textContent = '0 of 0';
            if (topicLabel) topicLabel.textContent = '';
            if (rateBox) rateBox.classList.add('hidden');
            return;
        }

        const tagName = topicNameOf(card);
        if (category) {
            category.innerHTML = `
                <span class="flashcard-tag-badge" style="background:${colorForTopic(topicIdOf(card))}">${esc(tagInitial(tagName))}</span>
                <span>${esc(tagName)}</span>
            `;
        }
        if (topicLabel) topicLabel.textContent = tagName;
        if (counter) counter.textContent = `${studyIndex + 1} of ${studyCards.length}`;
        if (keyword) {
            keyword.textContent = card.keyword || '';
            keyword.style.display = card.keyword ? 'inline-block' : 'none';
        }

        if (showBack) {
            const img = String(card.backImageUrl || '').trim()
                ? `<img class="flashcard-image" src="${esc(card.backImageUrl)}" alt="Back" loading="lazy">`
                : '';
            body.innerHTML = `${img}<div class="flashcard-text flashcard-text-back">${card.backHtml || esc(card.backText)}</div>`;
            if (actionBtn) actionBtn.textContent = 'Show Question';
            if (rateBox) rateBox.classList.remove('hidden');
        } else {
            const img = String(card.frontImageUrl || '').trim()
                ? `<img class="flashcard-image" src="${esc(card.frontImageUrl)}" alt="Front" loading="lazy">`
                : '';
            body.innerHTML = `${img}<div class="flashcard-text">${esc(card.frontText)}</div>`;
            if (actionBtn) actionBtn.textContent = 'Show Answer';
            if (rateBox) rateBox.classList.add('hidden');
        }

        if (toggleFront) toggleFront.classList.toggle('active', !showBack);
        if (toggleBack) toggleBack.classList.toggle('active', showBack);
        if (prevBtn) prevBtn.disabled = studyIndex <= 0;
        if (nextBtn) nextBtn.disabled = studyIndex >= studyCards.length - 1;
    }

    function openStudyTable() {
        setMode('study');
        renderStudyTable();
    }

    function openSession({ topicKey = '', startCardId = null } = {}) {
        activeTopicKey = topicKey || '';
        const base = allCards.slice();
        studyCards = activeTopicKey
            ? base.filter((c) => topicIdOf(c) === activeTopicKey)
            : base;

        // Prefer New → Learning → Review
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
        renderSessionCard();
    }

    function advanceAfterRate() {
        if (studyIndex < studyCards.length - 1) {
            studyIndex += 1;
            showBack = false;
            renderSessionCard();
            return;
        }
        // back to table when deck finished
        openStudyTable();
        if (typeof window.showNotification === 'function') {
            window.showNotification('Колода пройдена', 'success');
        }
    }

    async function loadCards() {
        const bank = U.getSelectedBank();
        const params = new URLSearchParams();
        if (bank?.id) params.set('testId', bank.id);
        const step = bank?.step || (U.getStoredStep && U.getStoredStep()) || 'step1';
        if (step) params.set('stepGroup', step);

        const browse = document.getElementById('fcBrowseList');
        const studyBody = document.getElementById('fcStudyTableBody');
        if (browse) browse.innerHTML = '<p class="flashcard-empty">Загрузка…</p>';
        if (studyBody) {
            studyBody.innerHTML = '<tr><td colspan="6" class="flashcard-empty">Загрузка…</td></tr>';
        }

        try {
            const res = await fetch(`/api/tests/usmle/flashcards?${params.toString()}`, {
                headers: authHeaders()
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Ошибка загрузки (${res.status})`);
            }
            allCards = await res.json();
            if (!Array.isArray(allCards)) allCards = [];

            if (!allCards.length) {
                const emptyMsg = 'Flashcards пока нет. Загрузите TXT во вкладке USMLE → Flashcards в админке.';
                if (browse) browse.innerHTML = `<p class="flashcard-empty">${emptyMsg}</p>`;
                if (studyBody) {
                    studyBody.innerHTML = `<tr><td colspan="6" class="flashcard-empty">${emptyMsg}</td></tr>`;
                }
                return;
            }

            renderBrowse();
            renderStudyTable();
            if (mode === 'session') {
                openSession({ topicKey: activeTopicKey });
            }
        } catch (e) {
            const msg = esc(e.message || 'Не удалось загрузить карточки');
            if (browse) browse.innerHTML = `<p class="flashcard-empty">${msg}</p>`;
            if (studyBody) {
                studyBody.innerHTML = `<tr><td colspan="6" class="flashcard-empty">${msg}</td></tr>`;
            }
        }
    }

    function mountPage() {
        const bank = U.getSelectedBank();
        U.renderShell({ activeNav: 'flashcards', pageTitle: 'Flashcards', bank });

        const main = document.querySelector('.usmle-main-content');
        if (!main) return;

        main.innerHTML = `
            <div class="flashcards-page flashcards-ready-decks">
                <div class="fc-tabs">
                    <button type="button" class="fc-tab active" id="fcTabBrowse">Browse</button>
                    <button type="button" class="fc-tab" id="fcTabStudy">Study</button>
                </div>

                <div id="fcBrowsePanel">
                    <div class="fc-search-bar">
                        <input type="search" id="fcSearchInput" class="fc-search-input" placeholder="Search flashcards…" autocomplete="off">
                    </div>
                    <div id="fcBrowseList" class="fc-browse-list">
                        <p class="flashcard-empty">Загрузка…</p>
                    </div>
                </div>

                <div id="fcStudyPanel" class="hidden">
                    <div class="fc-search-bar fc-study-search-row">
                        <input type="search" id="fcStudySearchInput" class="fc-search-input" placeholder="Search deck names" autocomplete="off">
                    </div>
                    <div class="fc-study-table-wrap">
                        <table class="fc-study-table">
                            <thead>
                                <tr>
                                    <th>Deck</th>
                                    <th>New</th>
                                    <th>Learning</th>
                                    <th>To Review</th>
                                    <th>Last Used</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="fcStudyTableBody">
                                <tr><td colspan="6" class="flashcard-empty">Загрузка…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div id="fcSessionPanel" class="hidden">
                    <div class="fc-study-toolbar">
                        <button type="button" class="btn btn-secondary btn-sm" id="fcBackToStudyTable">← Ready Decks</button>
                        <div id="fcSessionTopicLabel" class="fc-study-topic-label"></div>
                    </div>
                    <div class="flashcards-card-shell">
                        <div class="flashcards-card-head">
                            <div id="flashcardCategory" class="flashcards-category"></div>
                            <div class="flashcards-side-toggle">
                                <button type="button" id="flashcardToggleFront" class="active">Front</button>
                                <button type="button" id="flashcardToggleBack">Back</button>
                            </div>
                        </div>
                        <div id="flashcardBody" class="flashcards-card-body">
                            <p class="flashcard-empty">Выберите колоду</p>
                        </div>
                        <div id="flashcardKeyword" class="flashcards-keyword"></div>
                    </div>
                    <div id="flashcardRateBox" class="fc-rate-box hidden">
                        <button type="button" class="fc-rate-btn fc-rate-again" id="flashcardRateAgain" title="Again">− Again</button>
                        <button type="button" class="fc-rate-btn fc-rate-good" id="flashcardRateGood" title="Good">+ Good</button>
                    </div>
                    <div class="flashcards-footer">
                        <div id="flashcardCounter" class="flashcards-counter">0 of 0</div>
                        <div class="flashcards-nav">
                            <button type="button" class="btn btn-secondary" id="flashcardPrevBtn">&lt; Previous</button>
                            <button type="button" class="btn btn-primary" id="flashcardActionBtn">Show Answer</button>
                            <button type="button" class="btn btn-secondary" id="flashcardNextBtn">Next &gt;</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('fcTabBrowse')?.addEventListener('click', () => {
            searchQuery = document.getElementById('fcSearchInput')?.value || '';
            setMode('browse');
            renderBrowse();
        });
        document.getElementById('fcTabStudy')?.addEventListener('click', () => {
            searchQuery = document.getElementById('fcStudySearchInput')?.value || '';
            openStudyTable();
        });
        document.getElementById('fcBackToStudyTable')?.addEventListener('click', () => {
            openStudyTable();
        });

        document.getElementById('fcSearchInput')?.addEventListener('input', (e) => {
            searchQuery = e.target.value || '';
            renderBrowse();
        });
        document.getElementById('fcStudySearchInput')?.addEventListener('input', (e) => {
            searchQuery = e.target.value || '';
            renderStudyTable();
        });

        document.getElementById('fcBrowseList')?.addEventListener('click', (e) => {
            const seeAll = e.target.closest('.fc-see-all');
            if (seeAll) {
                openSession({ topicKey: seeAll.getAttribute('data-topic-key') || '' });
                return;
            }
            const deckCard = e.target.closest('.fc-deck-card');
            if (deckCard) {
                openSession({
                    topicKey: deckCard.getAttribute('data-topic-key') || '',
                    startCardId: deckCard.getAttribute('data-card-id')
                });
            }
        });

        document.getElementById('fcStudyTableBody')?.addEventListener('click', (e) => {
            const play = e.target.closest('.fc-deck-play');
            const row = e.target.closest('.fc-deck-row-item');
            const topicKey = play?.getAttribute('data-topic-key') || row?.getAttribute('data-topic-key');
            if (topicKey) openSession({ topicKey });
        });

        document.getElementById('flashcardToggleFront')?.addEventListener('click', () => {
            showBack = false;
            renderSessionCard();
        });
        document.getElementById('flashcardToggleBack')?.addEventListener('click', () => {
            showBack = true;
            renderSessionCard();
        });
        document.getElementById('flashcardActionBtn')?.addEventListener('click', () => {
            showBack = !showBack;
            renderSessionCard();
        });
        document.getElementById('flashcardPrevBtn')?.addEventListener('click', () => {
            if (studyIndex > 0) {
                studyIndex -= 1;
                showBack = false;
                renderSessionCard();
            }
        });
        document.getElementById('flashcardNextBtn')?.addEventListener('click', () => {
            if (studyIndex < studyCards.length - 1) {
                studyIndex += 1;
                showBack = false;
                renderSessionCard();
            }
        });
        document.getElementById('flashcardRateAgain')?.addEventListener('click', () => {
            const card = studyCards[studyIndex];
            if (!card) return;
            markCard(card.id, 'learning');
            advanceAfterRate();
        });
        document.getElementById('flashcardRateGood')?.addEventListener('click', () => {
            const card = studyCards[studyIndex];
            if (!card) return;
            markCard(card.id, 'review');
            advanceAfterRate();
        });

        setMode('browse');
        loadCards();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof initTheme === 'function') initTheme();
        if (typeof loadUser === 'function') await loadUser();
        if (typeof setupEventListeners === 'function') setupEventListeners();
        if (U.requireUsmleAccess && !U.requireUsmleAccess()) return;
        if (!U.getSelectedBank()) {
            window.location.href = '/usmle';
            return;
        }
        mountPage();
    });
})();
