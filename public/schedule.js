const SCHEDULE_API = '/api/schedule';
const DAY_NAMES = { 1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница', 6: 'Суббота', 7: 'Воскресенье' };

let currentWeekStart = '';

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка загрузки');
    }
    return res.json();
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
    document.getElementById('scheduleGroup').addEventListener('change', loadScheduleWeek);
    document.getElementById('scheduleShowBtn').addEventListener('click', loadScheduleWeek);
    document.getElementById('schedulePrevWeek').addEventListener('click', () => shiftWeek(-7));
    document.getElementById('scheduleCurWeek').addEventListener('click', async () => {
        const wk = await fetchJson(`${SCHEDULE_API}/kgma/current-week-start`);
        currentWeekStart = wk.weekStart;
        document.getElementById('scheduleWeekStart').value = currentWeekStart;
        loadScheduleWeek();
    });
    document.getElementById('scheduleNextWeek').addEventListener('click', () => shiftWeek(7));
    document.getElementById('scheduleWeekStart').addEventListener('change', (e) => {
        currentWeekStart = e.target.value;
        loadScheduleWeek();
    });
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

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

        box.innerHTML = (week.days || []).map((day) => {
            const lessons = (day.lessons || []).map((les) => `
                <li class="schedule-lesson">
                    <div class="schedule-lesson-time">${escapeHtml(les.timeLabel || `${les.timeStart}-${les.timeEnd}`)}</div>
                    <div>
                        <div class="schedule-lesson-subject">${escapeHtml(les.subjectName)}</div>
                        <div class="schedule-lesson-meta">${escapeHtml(les.lessonTypeLabel || '')}${les.room ? ` · ${escapeHtml(les.room)}` : ''}</div>
                    </div>
                </li>
            `).join('');

            const title = `${DAY_NAMES[day.dayOfWeek] || day.date} · ${day.date}`;
            return `
                <section class="schedule-day-block">
                    <h2 class="schedule-day-title">${escapeHtml(title)}</h2>
                    <ul class="schedule-lesson-list">${lessons}</ul>
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
    try {
        await initSchedulePage();
    } catch (error) {
        document.getElementById('scheduleContent').innerHTML =
            `<p class="schedule-empty">${escapeHtml(error.message || 'Не удалось загрузить расписание')}</p>`;
    }
});
