(function () {
    const U = window.UsmleApp;
    if (!U) return;

    let cards = [];
    let index = 0;
    let showBack = false;

    function esc(str) {
        return U.escHtml(str);
    }

    function currentCard() {
        return cards[index] || null;
    }

    function primaryTag(card) {
        const tags = card?.Tags || [];
        return tags[0]?.name || 'Flashcards';
    }

    function tagInitial(name) {
        const ch = String(name || 'F').trim().charAt(0).toUpperCase();
        return ch || 'F';
    }

    function renderCardImage(url, alt) {
        const trimmed = String(url || '').trim();
        if (!trimmed) return '';
        return `<img class="flashcard-image" src="${esc(trimmed)}" alt="${esc(alt || 'Flashcard image')}" loading="lazy">`;
    }

    function renderCard() {
        const card = currentCard();
        const body = document.getElementById('flashcardBody');
        const counter = document.getElementById('flashcardCounter');
        const category = document.getElementById('flashcardCategory');
        const toggleFront = document.getElementById('flashcardToggleFront');
        const toggleBack = document.getElementById('flashcardToggleBack');
        const actionBtn = document.getElementById('flashcardActionBtn');
        const keyword = document.getElementById('flashcardKeyword');
        const prevBtn = document.getElementById('flashcardPrevBtn');
        const nextBtn = document.getElementById('flashcardNextBtn');

        if (!body) return;

        if (!card) {
            body.innerHTML = '<p class="flashcard-empty">Нет карточек для выбранных фильтров</p>';
            if (counter) counter.textContent = '0 of 0';
            return;
        }

        const tagName = primaryTag(card);
        if (category) {
            category.innerHTML = `<span class="flashcard-tag-badge">${esc(tagInitial(tagName))}</span><span>${esc(tagName)}</span>`;
        }
        if (counter) counter.textContent = `${index + 1} of ${cards.length}`;
        if (keyword) {
            keyword.textContent = card.keyword || '';
            keyword.style.display = card.keyword ? 'inline-block' : 'none';
        }

        if (showBack) {
            const img = renderCardImage(card.backImageUrl, 'Back image');
            body.innerHTML = `${img}<div class="flashcard-text flashcard-text-back">${card.backHtml || esc(card.backText)}</div>`;
            if (actionBtn) actionBtn.textContent = 'Show Question';
        } else {
            const img = renderCardImage(card.frontImageUrl, 'Front image');
            body.innerHTML = `${img}<div class="flashcard-text">${esc(card.frontText)}</div>`;
            if (actionBtn) actionBtn.textContent = 'Show Answer';
        }

        if (toggleFront) toggleFront.classList.toggle('active', !showBack);
        if (toggleBack) toggleBack.classList.toggle('active', showBack);
        if (prevBtn) prevBtn.disabled = index <= 0;
        if (nextBtn) nextBtn.disabled = index >= cards.length - 1;
    }

    async function loadTags() {
        const select = document.getElementById('flashcardTagFilter');
        if (!select) return;
        try {
            const res = await fetch('/api/tests/usmle/tags');
            const tags = res.ok ? await res.json() : [];
            const bank = U.getSelectedBank();
            select.innerHTML = '<option value="">Все системы / теги</option>'
                + tags.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
        } catch (e) {
            console.error(e);
        }
    }

    async function loadCards() {
        const bank = U.getSelectedBank();
        const tagId = document.getElementById('flashcardTagFilter')?.value || '';
        const params = new URLSearchParams();
        if (bank?.id) params.set('testId', bank.id);
        if (bank?.step) params.set('stepGroup', bank.step);
        if (tagId) params.set('tagId', tagId);

        const body = document.getElementById('flashcardBody');
        if (body) body.innerHTML = '<p class="flashcard-empty">Загрузка…</p>';

        try {
            const res = await fetch(`/api/tests/usmle/flashcards?${params.toString()}`);
            if (!res.ok) throw new Error('load fail');
            cards = await res.json();
            index = 0;
            showBack = false;
            renderCard();
        } catch (e) {
            if (body) body.innerHTML = '<p class="flashcard-empty">Не удалось загрузить карточки</p>';
        }
    }

    function mountPage() {
        const bank = U.getSelectedBank();
        U.renderShell({ activeNav: 'flashcards', pageTitle: 'Flashcards', bank });

        const main = document.querySelector('.usmle-main-content');
        if (!main) return;

        main.innerHTML = `
            <div class="flashcards-page">
                <div class="flashcards-toolbar">
                    <select id="flashcardTagFilter" class="form-group input">
                        <option value="">Все системы / теги</option>
                    </select>
                    <button type="button" class="btn btn-secondary btn-sm" id="flashcardReloadBtn">Обновить</button>
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
                        <p class="flashcard-empty">Загрузка…</p>
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
        `;

        document.getElementById('flashcardTagFilter')?.addEventListener('change', loadCards);
        document.getElementById('flashcardReloadBtn')?.addEventListener('click', loadCards);
        document.getElementById('flashcardToggleFront')?.addEventListener('click', () => {
            showBack = false;
            renderCard();
        });
        document.getElementById('flashcardToggleBack')?.addEventListener('click', () => {
            showBack = true;
            renderCard();
        });
        document.getElementById('flashcardActionBtn')?.addEventListener('click', () => {
            showBack = !showBack;
            renderCard();
        });
        document.getElementById('flashcardPrevBtn')?.addEventListener('click', () => {
            if (index > 0) {
                index -= 1;
                showBack = false;
                renderCard();
            }
        });
        document.getElementById('flashcardNextBtn')?.addEventListener('click', () => {
            if (index < cards.length - 1) {
                index += 1;
                showBack = false;
                renderCard();
            }
        });

        loadTags().then(loadCards);
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
