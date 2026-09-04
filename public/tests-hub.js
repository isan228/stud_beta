(function () {
  const API = '/api';
  const STAR_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const CHEVRON = '<svg class="tests-subject-card-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

  let allSubjects = [];
  let favSubjectIds = new Set();
  let favTestIds = new Set();
  let currentFavSub = 'subjects';

  function token() {
    return localStorage.getItem('token') || '';
  }

  function authHeaders() {
    const t = token();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function notify(msg, type) {
    if (typeof window.showNotification === 'function') window.showNotification(msg, type);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function testsWord(n) {
    const x = Math.abs(n) % 100;
    const y = x % 10;
    if (x > 10 && x < 20) return 'тестов';
    if (y === 1) return 'тест';
    if (y >= 2 && y <= 4) return 'теста';
    return 'тестов';
  }

  function questionsWord(n) {
    const x = Math.abs(n) % 100;
    const y = x % 10;
    if (x > 10 && x < 20) return 'вопросов';
    if (y === 1) return 'вопрос';
    if (y >= 2 && y <= 4) return 'вопроса';
    return 'вопросов';
  }

  function renderDirection(user) {
    const facEl = document.getElementById('directionFaculty');
    const courseEl = document.getElementById('directionCourse');
    const link = document.getElementById('directionChangeLink');
    if (!user) {
      if (facEl) facEl.textContent = 'Войдите в аккаунт';
      if (courseEl) courseEl.textContent = '—';
      if (link) {
        link.href = '/login';
        link.textContent = 'Войти, чтобы выбрать направление';
      }
      return;
    }
    const facName = user.Faculty?.name || user.Faculty?.shortName || 'Не выбран';
    const course = user.course ? `${user.course} курс` : 'Не выбран';
    if (facEl) facEl.textContent = facName;
    if (courseEl) courseEl.textContent = course;
    if (link) {
      link.href = '/profile#direction';
      link.innerHTML = 'Изменить направление <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    }
  }

  function subjectHref(subject) {
    const name = encodeURIComponent(subject.name || '');
    const desc = encodeURIComponent(subject.description || '');
    return `/subject-tests?id=${subject.id}&name=${name}&desc=${desc}&program=university`;
  }

  function subjectCardHtml(subject, { showStar = true } = {}) {
    const tests = subject.testCount ?? 0;
    const questions = subject.questionCount ?? 0;
    const isFav = !!subject.isFavorite || favSubjectIds.has(Number(subject.id));
    const starClass = isFav ? 'is-on' : '';
    const starBtn = showStar && token()
      ? `<button type="button" class="tests-subject-card-star ${starClass}" data-star-subject="${subject.id}" aria-label="Избранное">${STAR_SVG}</button>`
      : '';
    return `
      <div class="tests-subject-card ${showStar && token() ? 'has-star' : ''}" data-href="${subjectHref(subject)}" role="link" tabindex="0">
        ${starBtn}
        <div class="tests-subject-card-body">
          <h3 class="tests-subject-card-title">${escapeHtml(subject.name)}</h3>
          <p class="tests-subject-card-meta">${tests} ${testsWord(tests)} · ${questions} ${questionsWord(questions)}</p>
        </div>
        ${CHEVRON}
      </div>`;
  }

  function renderSubjects(list) {
    const box = document.getElementById('subjectsList');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="tests-hub-empty">Предметы университета пока не найдены</div>';
      return;
    }
    box.innerHTML = list.map((s) => subjectCardHtml(s)).join('');
  }

  async function loadSubjects() {
    const box = document.getElementById('subjectsList');
    if (box) box.innerHTML = '<div class="tests-hub-loading">Загрузка предметов...</div>';
    try {
      const res = await fetch(`${API}/tests/subjects?program=university`, {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error('Ошибка загрузки');
      allSubjects = await res.json();
      allSubjects.forEach((s) => {
        if (s.isFavorite) favSubjectIds.add(Number(s.id));
      });
      const q = document.getElementById('subjectSearch')?.value || '';
      filterSubjects(q);
    } catch (e) {
      console.error(e);
      if (box) box.innerHTML = '<div class="tests-hub-empty">Ошибка загрузки предметов</div>';
    }
  }

  function filterSubjects(query) {
    const q = String(query || '').trim().toLowerCase();
    const clearBtn = document.getElementById('clearSearch');
    if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
    if (!q) {
      renderSubjects(allSubjects);
      return;
    }
    const filtered = allSubjects.filter((s) => String(s.name || '').toLowerCase().includes(q));
    renderSubjects(filtered);
  }

  async function toggleCatalogFavorite(itemType, itemId, button) {
    if (!token()) {
      window.location.href = '/login';
      return;
    }
    const id = Number(itemId);
    const isOn = button.classList.contains('is-on');
    try {
      const method = isOn ? 'DELETE' : 'POST';
      const res = await fetch(`${API}/catalog-favorites/${itemType}/${id}`, {
        method,
        headers: authHeaders()
      });
      if (!res.ok) throw new Error('Ошибка');
      button.classList.toggle('is-on', !isOn);
      if (itemType === 'subject') {
        if (isOn) favSubjectIds.delete(id);
        else favSubjectIds.add(id);
        const subj = allSubjects.find((s) => Number(s.id) === id);
        if (subj) subj.isFavorite = !isOn;
      } else if (isOn) favTestIds.delete(id);
      else favTestIds.add(id);
      notify(isOn ? 'Удалено из избранного' : 'Добавлено в избранное', 'success');
    } catch (e) {
      notify('Не удалось обновить избранное', 'error');
    }
  }

  async function loadFavoritesPanel() {
    const subBox = document.getElementById('favSubjectsList');
    const testBox = document.getElementById('favTestsList');
    if (!token()) {
      const msg = '<div class="tests-hub-empty">Войдите, чтобы видеть избранное</div>';
      if (subBox) subBox.innerHTML = msg;
      if (testBox) testBox.innerHTML = msg;
      return;
    }
    if (subBox) subBox.innerHTML = '<div class="tests-hub-loading">Загрузка...</div>';
    if (testBox) testBox.innerHTML = '<div class="tests-hub-loading">Загрузка...</div>';
    try {
      const res = await fetch(`${API}/catalog-favorites`, { headers: authHeaders() });
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      favSubjectIds = new Set((data.subjectIds || []).map(Number));
      favTestIds = new Set((data.testIds || []).map(Number));

      const subjects = data.subjects || [];
      if (subBox) {
        subBox.innerHTML = subjects.length
          ? subjects.map((s) => subjectCardHtml({ ...s, testCount: s.testCount || 0, questionCount: s.questionCount || 0, isFavorite: true })).join('')
          : '<div class="tests-hub-empty">Нет избранных предметов. Нажмите ★ на карточке предмета.</div>';
      }

      const tests = data.tests || [];
      if (testBox) {
        if (!tests.length) {
          testBox.innerHTML = '<div class="tests-hub-empty">Нет избранных тестов. Нажмите ★ на карточке теста.</div>';
        } else {
          testBox.innerHTML = tests.map((t) => {
            const subj = t.Subject?.name || '';
            const href = `/test-settings?id=${t.id}&program=university`;
            return `
              <div class="tests-subject-card has-star" data-href="${href}" role="link" tabindex="0">
                <button type="button" class="tests-subject-card-star is-on" data-star-test="${t.id}" aria-label="Избранное">${STAR_SVG}</button>
                <div class="tests-subject-card-body">
                  <h3 class="tests-subject-card-title">${escapeHtml(t.name)}</h3>
                  <p class="tests-subject-card-meta">${escapeHtml(subj || 'Тест')}</p>
                </div>
                ${CHEVRON}
              </div>`;
          }).join('');
        }
      }
      showFavSub(currentFavSub);
    } catch (e) {
      if (subBox) subBox.innerHTML = '<div class="tests-hub-empty">Ошибка загрузки избранного</div>';
      if (testBox) testBox.innerHTML = '<div class="tests-hub-empty">Ошибка загрузки избранного</div>';
    }
  }

  function showFavSub(kind) {
    currentFavSub = kind;
    document.querySelectorAll('.tests-fav-subtab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-fav') === kind);
    });
    const subBox = document.getElementById('favSubjectsList');
    const testBox = document.getElementById('favTestsList');
    if (subBox) subBox.style.display = kind === 'subjects' ? '' : 'none';
    if (testBox) testBox.style.display = kind === 'tests' ? '' : 'none';
  }

  async function loadStatsPanel() {
    const box = document.getElementById('statsResultsList');
    if (!box) return;
    if (!token()) {
      box.innerHTML = '<div class="tests-hub-empty">Войдите, чтобы видеть статистику</div>';
      return;
    }
    box.innerHTML = '<div class="tests-hub-loading">Загрузка статистики...</div>';
    try {
      const res = await fetch(`${API}/stats?limit=100`, { headers: authHeaders() });
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      const rows = data.recentResults || [];
      if (!rows.length) {
        box.innerHTML = '<div class="tests-hub-empty">Пока нет пройденных тестов</div>';
        return;
      }
      box.innerHTML = rows.map((r) => {
        const pct = r.totalQuestions ? Math.round((r.score / r.totalQuestions) * 100) : 0;
        const date = new Date(r.createdAt).toLocaleDateString('ru-RU', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        const testName = r.Test?.name || 'Тест';
        const subjectName = r.Test?.Subject?.name || '';
        return `
          <button type="button" class="tests-stats-card" data-result-id="${r.id}">
            <div class="tests-stats-card-body">
              <h3 class="tests-stats-card-title">${escapeHtml(testName)}</h3>
              <p class="tests-stats-card-meta">
                ${escapeHtml(subjectName)}${subjectName ? ' · ' : ''}${date} · ${r.totalQuestions} ${questionsWord(r.totalQuestions)}
              </p>
            </div>
            <div class="tests-stats-card-score">${pct}%</div>
            ${CHEVRON}
          </button>`;
      }).join('');
    } catch (e) {
      box.innerHTML = '<div class="tests-hub-empty">Ошибка загрузки статистики</div>';
    }
  }

  function switchTab(tab) {
    document.querySelectorAll('.tests-hub-tab').forEach((btn) => {
      const on = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.tests-hub-panel').forEach((panel) => {
      const on = panel.getAttribute('data-panel') === tab;
      panel.classList.toggle('active', on);
      panel.hidden = !on;
    });
    if (tab === 'favorites') loadFavoritesPanel();
    if (tab === 'stats') loadStatsPanel();
  }

  function bindUi() {
    document.querySelectorAll('.tests-hub-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });
    document.querySelectorAll('.tests-fav-subtab').forEach((btn) => {
      btn.addEventListener('click', () => showFavSub(btn.getAttribute('data-fav')));
    });

    const search = document.getElementById('subjectSearch');
    const clearBtn = document.getElementById('clearSearch');
    let t;
    if (search) {
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => filterSubjects(search.value), 200);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (search) search.value = '';
        filterSubjects('');
        search?.focus();
      });
    }

    document.addEventListener('click', (e) => {
      const starSub = e.target.closest('[data-star-subject]');
      if (starSub) {
        e.preventDefault();
        e.stopPropagation();
        toggleCatalogFavorite('subject', starSub.getAttribute('data-star-subject'), starSub);
        return;
      }
      const starTest = e.target.closest('[data-star-test]');
      if (starTest) {
        e.preventDefault();
        e.stopPropagation();
        toggleCatalogFavorite('test', starTest.getAttribute('data-star-test'), starTest);
        return;
      }
      const resultCard = e.target.closest('[data-result-id]');
      if (resultCard) {
        const id = resultCard.getAttribute('data-result-id');
        if (typeof window.showTestAnalysis === 'function') {
          window.showTestAnalysis(Number(id));
        } else {
          window.location.href = `/test-result?resultId=${id}`;
        }
        return;
      }
      const card = e.target.closest('[data-href]');
      if (card && !e.target.closest('button')) {
        window.location.href = card.getAttribute('data-href');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const card = e.target.closest('[data-href]');
      if (card) window.location.href = card.getAttribute('data-href');
    });

    const analysisClose = document.getElementById('testAnalysisModalClose');
    if (analysisClose) {
      analysisClose.addEventListener('click', () => {
        const modal = document.getElementById('testAnalysisModal');
        if (modal) modal.style.display = 'none';
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.initTheme === 'function') window.initTheme();
    if (typeof window.setupEventListeners === 'function') window.setupEventListeners();
    if (typeof window.setProgramType === 'function') window.setProgramType('university');

    const userLoaded = typeof window.loadUser === 'function' ? await window.loadUser() : false;
    const user = window.currentUser || null;
    renderDirection(user);
    bindUi();

    const hash = (location.hash || '').replace('#', '');
    if (hash === 'favorites' || hash === 'stats') switchTab(hash);
    else switchTab('subjects');

    await loadSubjects();
    void userLoaded;
  });
})();
