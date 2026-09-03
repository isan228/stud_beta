(function () {
    const U = window.UsmleApp;
    if (!U) return;

    const BROWSE_PREVIEW_LIMIT = 6;
    const TOPIC_COLORS = [
        '#2563eb', '#ea580c', '#16a34a', '#dc2626', '#7c3aed',
        '#0891b2', '#db2777', '#ca8a04', '#4f46e5', '#0d9488'
    ];

    let allCards = [];
    let mode = 'browse'; // browse | study
    let studyCards = [];
    let studyIndex = 0;
    let showBack = false;
    let activeTopicKey = '';
    let searchQuery = '';

    function esc(str) {
        return U.escHtml(str);
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

    function filteredCards() {
        const q = searchQuery.trim().toLowerCase();
        return allCards.filter((c) => cardMatchesSearch(c, q));
    }

    function setMode(nextMode) {
        mode = nextMode;
        document.getElementById('fcTabBrowse')?.classList.toggle('active', mode === 'browse');
        document.getElementById('fcTabStudy')?.classList.toggle('active', mode === 'study');
        document.getElementById('fcBrowsePanel')?.classList.toggle('hidden', mode !== 'browse');
        document.getElementById('fcStudyPanel')?.classList.toggle('hidden', mode !== 'study');
    }

    function renderBrowse() {
        const root = document.getElementById('fcBrowseList');
        if (!root) return;

        const groups = groupCards(filteredCards());
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

    function renderStudyCard() {
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
        const topicLabel = document.getElementById('fcStudyTopicLabel');

        if (!body) return;

        if (!card) {
            body.innerHTML = '<p class="flashcard-empty">Нет карточек для изучения</p>';
            if (counter) counter.textContent = '0 of 0';
            if (topicLabel) topicLabel.textContent = '';
            return;
        }

        const tagName = topicNameOf(card);
        if (category) {
            category.innerHTML = `
                <span class="flashcard-tag-badge" style="background:${colorForTopic(topicIdOf(card))}">${esc(tagInitial(tagName))}</span>
                <span>${esc(tagName)}</span>
            `;
        }
        if (topicLabel) topicLabel.textContent = activeTopicKey ? tagName : 'All topics';
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
        } else {
            const img = String(card.frontImageUrl || '').trim()
                ? `<img class="flashcard-image" src="${esc(card.frontImageUrl)}" alt="Front" loading="lazy">`
                : '';
            body.innerHTML = `${img}<div class="flashcard-text">${esc(card.frontText)}</div>`;
            if (actionBtn) actionBtn.textContent = 'Show Answer';
        }

        if (toggleFront) toggleFront.classList.toggle('active', !showBack);
        if (toggleBack) toggleBack.classList.toggle('active', showBack);
        if (prevBtn) prevBtn.disabled = studyIndex <= 0;
        if (nextBtn) nextBtn.disabled = studyIndex >= studyCards.length - 1;
    }

    function openStudy({ topicKey = '', startCardId = null } = {}) {
        activeTopicKey = topicKey || '';
        const base = filteredCards();
        studyCards = activeTopicKey
            ? base.filter((c) => topicIdOf(c) === activeTopicKey)
            : base.slice();

        studyIndex = 0;
        if (startCardId != null) {
            const idx = studyCards.findIndex((c) => Number(c.id) === Number(startCardId));
            if (idx >= 0) studyIndex = idx;
        }
        showBack = false;
        setMode('study');
        renderStudyCard();
    }

    async function loadCards() {
        const bank = U.getSelectedBank();
        const params = new URLSearchParams();
        if (bank?.id) params.set('testId', bank.id);
        if (bank?.step) params.set('stepGroup', bank.step);

        const browse = document.getElementById('fcBrowseList');
        if (browse) browse.innerHTML = '<p class="flashcard-empty">Загрузка…</p>';

        try {
            const res = await fetch(`/api/tests/usmle/flashcards?${params.toString()}`);
            if (!res.ok) throw new Error('load fail');
            allCards = await res.json();
            renderBrowse();
            if (mode === 'study') {
                openStudy({ topicKey: activeTopicKey });
            }
        } catch (e) {
            if (browse) browse.innerHTML = '<p class="flashcard-empty">Не удалось загрузить карточки</p>';
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
                    <div class="fc-study-toolbar">
                        <button type="button" class="btn btn-secondary btn-sm" id="fcBackToBrowse">← Browse</button>
                        <div id="fcStudyTopicLabel" class="fc-study-topic-label"></div>
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
                            <p class="flashcard-empty">Выберите тему или карточку</p>
                        </div>
                        <div id="flashcardKeyword" class="flashcards-keyword"></div>
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
            setMode('browse');
            renderBrowse();
        });
        document.getElementById('fcTabStudy')?.addEventListener('click', () => {
            openStudy({ topicKey: activeTopicKey });
        });
        document.getElementById('fcBackToBrowse')?.addEventListener('click', () => {
            setMode('browse');
            renderBrowse();
        });

        document.getElementById('fcSearchInput')?.addEventListener('input', (e) => {
            searchQuery = e.target.value || '';
            renderBrowse();
        });

        document.getElementById('fcBrowseList')?.addEventListener('click', (e) => {
            const seeAll = e.target.closest('.fc-see-all');
            if (seeAll) {
                openStudy({ topicKey: seeAll.getAttribute('data-topic-key') || '' });
                return;
            }
            const deckCard = e.target.closest('.fc-deck-card');
            if (deckCard) {
                openStudy({
                    topicKey: deckCard.getAttribute('data-topic-key') || '',
                    startCardId: deckCard.getAttribute('data-card-id')
                });
            }
        });

        document.getElementById('flashcardToggleFront')?.addEventListener('click', () => {
            showBack = false;
            renderStudyCard();
        });
        document.getElementById('flashcardToggleBack')?.addEventListener('click', () => {
            showBack = true;
            renderStudyCard();
        });
        document.getElementById('flashcardActionBtn')?.addEventListener('click', () => {
            showBack = !showBack;
            renderStudyCard();
        });
        document.getElementById('flashcardPrevBtn')?.addEventListener('click', () => {
            if (studyIndex > 0) {
                studyIndex -= 1;
                showBack = false;
                renderStudyCard();
            }
        });
        document.getElementById('flashcardNextBtn')?.addEventListener('click', () => {
            if (studyIndex < studyCards.length - 1) {
                studyIndex += 1;
                showBack = false;
                renderStudyCard();
            }
        });

        setMode('browse');
        loadCards();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof initTheme === 'function') initTheme();
        if (typeof loadUser === 'function') await loadUser();
        if (typeof setupEventListeners === 'function') setupEventListeners();
        if (!U.getSelectedBank()) {
            window.location.href = '/usmle';
            return;
        }
        mountPage();
    });
})();
