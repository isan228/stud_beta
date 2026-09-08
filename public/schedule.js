const SCHEDULE_API = '/api/schedule';
const DAY_NAMES = {
    1: 'Понедельник',
    2: 'Вторник',
    3: 'Среда',
    4: 'Четверг',
    5: 'Пятница',
    6: 'Суббота',
    7: 'Воскресенье'
};

let currentWeekStart = '';
let prefilling = false;

function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function isLoggedIn() {
    return !!(localStorage.getItem('token') && window.currentUser);
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || 'Ошибка загрузки');
    }
    return data;
}

function updateSaveUi() {
    const hint = document.getElementById('scheduleSaveHint');
    const btn = document.getElementById('scheduleSaveBtn');
    if (!hint || !btn) return;
    if (isLoggedIn()) {
        hint.textContent = 'Сохраним группу в профиле и будем слать напоминание о завтрашних парах около 17:00.';
        btn.disabled = false;
    } else {
        hint.innerHTML = 'Нужно <a href="/login?redirect=/schedule">войти</a>, чтобы сохранить группу и получать напоминания.';
        btn.disabled = true;
    }
}

function setSaveStatus(text, isError = false) {
    const el = document.getElementById('scheduleSaveStatus');
    if (!el) return;
    if (!text) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
}

async function initSchedulePage() {
    const meta = await fetchJson(`${SCHEDULE_API}/kgma/meta`);
    const sourceEl = document.getElementById('scheduleSourceLink');
    if (sourceEl && meta.sourceUrl) {
        sourceEl.href = meta.sourceUrl;
    }

    const facultySelect = document.getElementById('scheduleFaculty');
    facultySelect.innerHTML = '<option value="">Факультет</option>'
        + (meta.faculty || []).map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

    const wk = await fetchJson(`${SCHEDULE_API}/kgma/current-week-start`);
    currentWeekStart = wk.weekStart;
    document.getElementById('scheduleWeekStart').value = currentWeekStart;

    facultySelect.addEventListener('change', onFacultyChange);
    document.getElementById('scheduleCourse').addEventListener('change', onCourseChange);
    document.getElementById('scheduleGroup').addEventListener('change', () => {
        if (!prefilling) loadScheduleWeek();
    });
    document.getElementById('scheduleShowBtn').addEventListener('click', loadScheduleWeek);
    document.getElementById('schedulePrevWeek').addEventListener('click', () => shiftWeek(-7));
    document.getElementById('scheduleCurWeek').addEventListener('click', async () => {
        const cur = await fetchJson(`${SCHEDULE_API}/kgma/current-week-start`);
        currentWeekStart = cur.weekStart;
        document.getElementById('scheduleWeekStart').value = currentWeekStart;
        loadScheduleWeek();
    });
    document.getElementById('scheduleNextWeek').addEventListener('click', () => shiftWeek(7));
    document.getElementById('scheduleWeekStart').addEventListener('change', (e) => {
        currentWeekStart = e.target.value;
        loadScheduleWeek();
    });
    document.getElementById('scheduleSaveBtn').addEventListener('click', saveMySchedulePrefs);

    updateSaveUi();
    await prefillFromPrefs();
}

async function prefillFromPrefs() {
    if (!localStorage.getItem('token')) return;
    try {
        const prefs = await fetchJson(`${SCHEDULE_API}/my-prefs`, { headers: authHeaders() });
        const remind = document.getElementById('scheduleRemindersEnabled');
        if (remind) remind.checked = prefs.remindersEnabled !== false;

        if (!prefs.isKgma || !prefs.kgmaFacultyId || !prefs.course || !prefs.kgmaGroupId) return;

        prefilling = true;
        const facultySelect = document.getElementById('scheduleFaculty');
        facultySelect.value = String(prefs.kgmaFacultyId);
        await onFacultyChange();
        document.getElementById('scheduleCourse').value = String(prefs.course);
        await onCourseChange();
        document.getElementById('scheduleGroup').value = String(prefs.kgmaGroupId);
        prefilling = false;
        await loadScheduleWeek();
        setSaveStatus(`Сохранена группа: ${prefs.groupName || prefs.kgmaGroupId}`);
    } catch (_) {
        prefilling = false;
    }
}

async function onFacultyChange() {
    const facultyId = document.getElementById('scheduleFaculty').value;
    const courseSelect = document.getElementById('scheduleCourse');
    const groupSelect = document.getElementById('scheduleGroup');
    courseSelect.innerHTML = '<option value="">Курс</option>';
    groupSelect.innerHTML = '<option value="">Группа</option>';
    if (!facultyId) return;

    const data = await fetchJson(`${SCHEDULE_API}/kgma/meta?facultyId=${encodeURIComponent(facultyId)}`);
    courseSelect.innerHTML = '<option value="">Курс</option>'
        + (data.courses || []).map((c) => `<option value="${c}">${c} курс</option>`).join('');
}

async function onCourseChange() {
    const facultyId = document.getElementById('scheduleFaculty').value;
    const course = document.getElementById('scheduleCourse').value;
    const groupSelect = document.getElementById('scheduleGroup');
    groupSelect.innerHTML = '<option value="">Группа</option>';
    if (!facultyId || !course) return;

    const data = await fetchJson(
        `${SCHEDULE_API}/kgma/meta?facultyId=${encodeURIComponent(facultyId)}&course=${encodeURIComponent(course)}`
    );
    groupSelect.innerHTML = '<option value="">Группа</option>'
        + (data.groups || []).map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
}

function shiftWeek(days) {
    const d = new Date(`${currentWeekStart}T12:00:00`);
    d.setDate(d.getDate() + days);
    currentWeekStart = d.toISOString().slice(0, 10);
    document.getElementById('scheduleWeekStart').value = currentWeekStart;
    loadScheduleWeek();
}

async function saveMySchedulePrefs() {
    if (!isLoggedIn()) {
        window.location.href = '/login?redirect=' + encodeURIComponent('/schedule');
        return;
    }

    const kgmaFacultyId = document.getElementById('scheduleFaculty').value;
    const course = document.getElementById('scheduleCourse').value;
    const groupSelect = document.getElementById('scheduleGroup');
    const kgmaGroupId = groupSelect.value;
    const groupName = groupSelect.options[groupSelect.selectedIndex]?.text || '';
    const remindersEnabled = document.getElementById('scheduleRemindersEnabled').checked;

    if (!kgmaFacultyId || !course || !kgmaGroupId) {
        setSaveStatus('Сначала выберите факультет, курс и группу', true);
        return;
    }

    const btn = document.getElementById('scheduleSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Сохранение…';
    setSaveStatus('');

    try {
        const data = await fetchJson(`${SCHEDULE_API}/my-prefs`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({
                kgmaFacultyId,
                course: Number(course),
                kgmaGroupId,
                groupName,
                remindersEnabled
            })
        });
        if (window.currentUser) {
            window.currentUser.kgmaGroupId = kgmaGroupId;
            window.currentUser.groupName = groupName;
            window.currentUser.course = Number(course);
            window.currentUser.scheduleRemindersEnabled = remindersEnabled;
        }
        setSaveStatus(data.message || 'Сохранено');
        if (typeof window.showNotification === 'function') {
            window.showNotification(data.message || 'Сохранено', 'success');
        }
    } catch (error) {
        setSaveStatus(error.message || 'Не удалось сохранить', true);
        if (typeof window.showNotification === 'function') {
            window.showNotification(error.message || 'Не удалось сохранить', 'error');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Сохранить мою группу';
        updateSaveUi();
    }
}

async function loadScheduleWeek() {
    const kgmaGroupId = document.getElementById('scheduleGroup').value;
    const box = document.getElementById('scheduleContent');
    if (!kgmaGroupId) {
        box.innerHTML = '<p class="schedule-empty">Выберите факультет, курс и группу</p>';
        return;
    }

    box.innerHTML = '<p class="schedule-empty">Загрузка…</p>';
    try {
        const params = new URLSearchParams({ kgmaGroupId, weekStart: currentWeekStart });
        const week = await fetchJson(`${SCHEDULE_API}/kgma/week?${params}`);
        document.getElementById('scheduleWeekLabel').textContent =
            `Неделя ${week.weekStart} — ${week.weekEnd}`;

        if (week.empty) {
            box.innerHTML = `<p class="schedule-empty">${escapeHtml(week.message || 'На эту неделю занятий нет')}</p>`;
            return;
        }

        const today = todayISO();
        box.innerHTML = (week.days || []).map((day) => {
            const lessons = (day.lessons || []).map((les) => {
                const type = les.lessonTypeLabel
                    ? `<span class="schedule-lesson-type">${escapeHtml(les.lessonTypeLabel)}</span>`
                    : '';
                const room = les.room ? `ауд. ${escapeHtml(les.room)}` : '';
                return `
                <li class="schedule-lesson">
                    <div class="schedule-lesson-time">${escapeHtml(les.timeLabel || `${les.timeStart}-${les.timeEnd}`)}</div>
                    <div>
                        <div class="schedule-lesson-subject">${escapeHtml(les.subjectName)}</div>
                        <div class="schedule-lesson-meta">${type}${room}</div>
                    </div>
                </li>`;
            }).join('');

            const isToday = day.date === today;
            const title = `${DAY_NAMES[day.dayOfWeek] || day.date} · ${day.date}`;
            return `
                <section class="schedule-day-block${isToday ? ' is-today' : ''}">
                    <h2 class="schedule-day-title">
                        <span>${escapeHtml(title)}</span>
                        ${isToday ? '<span class="schedule-day-badge">Сегодня</span>' : ''}
                    </h2>
                    <ul class="schedule-lesson-list">${lessons || '<li class="schedule-lesson"><div class="schedule-lesson-meta">Нет занятий</div></li>'}</ul>
                </section>
            `;
        }).join('');
    } catch (error) {
        box.innerHTML = `<p class="schedule-empty">${escapeHtml(error.message)}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof initTheme === 'function') initTheme();
    if (typeof loadUser === 'function') await loadUser();
    if (typeof setupEventListeners === 'function') setupEventListeners();
    updateSaveUi();
    try {
        await initSchedulePage();
    } catch (error) {
        document.getElementById('scheduleContent').innerHTML =
            `<p class="schedule-empty">${escapeHtml(error.message || 'Не удалось загрузить расписание')}</p>`;
    }
});
