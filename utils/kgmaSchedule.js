const fetch = global.fetch || require('node-fetch');

const KGMA_BASE = 'https://www.kgma.kg';
const KGMA_LANG = 'ru';

const LESSON_TYPE_MAP = {
  'лекция': 'lecture',
  'практика': 'practice',
  'лабораторная': 'lab',
  'лаб.': 'lab',
  'семинар': 'seminar'
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Понедельник недели для даты (как на kgma.kg) */
function getWeekStart(dateInput = new Date()) {
  const date = new Date(dateInput);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}

function getWeekEnd(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return end;
}

function parseTimeRange(tm) {
  if (!tm || typeof tm !== 'string') return { timeStart: null, timeEnd: null };
  const parts = tm.split('-').map((s) => s.trim());
  if (parts.length !== 2) return { timeStart: null, timeEnd: null };
  return { timeStart: parts[0], timeEnd: parts[1] };
}

function mapLessonType(typeLabel) {
  const key = String(typeLabel || '').trim().toLowerCase();
  return LESSON_TYPE_MAP[key] || 'other';
}

function dayOfWeekFromDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const jsDay = d.getDay();
  if (jsDay === 0) return 7;
  return jsDay;
}

async function kgmaFetchJson(path) {
  const url = `${KGMA_BASE}/${KGMA_LANG}${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'stud.kg-schedule-sync/1.0'
    }
  });
  if (!res.ok) {
    throw new Error(`КГМА: HTTP ${res.status}`);
  }
  return res.json();
}

/** @returns {{ faculty: Array, course: Object, groups: Object }} */
async function fetchKgmaMeta() {
  const data = await kgmaFetchJson('/json/schedule/groups/get');
  const faculty = (data.faculty || []).map((f) => ({
    id: String(f.i),
    name: f.n,
    shortName: f.s || f.n
  })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  return {
    faculty,
    course: data.course || {},
    groups: data.groups || {}
  };
}

function listKgmaCourses(meta, facultyId) {
  const fid = String(facultyId);
  const raw = meta.course[fid] || {};
  return Object.keys(raw)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

function listKgmaGroups(meta, facultyId, course) {
  const fid = String(facultyId);
  const courseKey = String(course);
  const bucket = meta.groups[fid]?.[courseKey] || {};
  return Object.values(bucket)
    .map((g) => ({ id: String(g.i), name: String(g.n) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
}

async function fetchKgmaWeekSchedule(kgmaGroupId, weekStartInput) {
  const weekStart = getWeekStart(weekStartInput);
  const weekStartStr = formatDateISO(weekStart);
  const data = await kgmaFetchJson(`/json/schedule/${kgmaGroupId}/${weekStartStr}/get`);

  if (data?.message && !data?.error) {
    return {
      weekStart: weekStartStr,
      weekEnd: formatDateISO(getWeekEnd(weekStart)),
      empty: true,
      message: data.message,
      days: []
    };
  }
  if (data?.error) {
    throw new Error(data.error.msg || data.error.message || 'Ошибка КГМА');
  }

  const days = [];
  const dayKeys = Object.keys(data || {}).sort((a, b) => Number(a) - Number(b));
  for (const dayKey of dayKeys) {
    const day = data[dayKey];
    if (!day || !day.d) continue;
    const lessons = [];
    const lessonMap = day.l || {};
    const lessonKeys = Object.keys(lessonMap).sort((a, b) => Number(a) - Number(b));
    for (const lessonKey of lessonKeys) {
      const les = lessonMap[lessonKey];
      if (!les) continue;
      const { timeStart, timeEnd } = parseTimeRange(les.tm);
      lessons.push({
        lessonNumber: parseInt(lessonKey, 10) || null,
        timeStart,
        timeEnd,
        timeLabel: les.tm || '',
        subjectName: les.d || '',
        lessonType: mapLessonType(les.t),
        lessonTypeLabel: les.t || '',
        room: les.r || les.sr || '',
        teacher: les.m || '',
        subgroup: les.sd || '',
        isElective: les.e === true,
        streamGroupIds: Array.isArray(les.g) ? les.g.map(String) : [],
        externalKey: `kgma:${kgmaGroupId}:${day.d}:${lessonKey}:${les.tm || ''}`
      });
    }
    days.push({
      dayIndex: parseInt(dayKey, 10),
      date: day.d,
      dayOfWeek: dayOfWeekFromDate(day.d),
      lessons
    });
  }

  return {
    weekStart: weekStartStr,
    weekEnd: formatDateISO(getWeekEnd(weekStart)),
    empty: days.length === 0,
    message: days.length === 0 ? 'На эту неделю занятия не поставлены' : '',
    days
  };
}

function flattenKgmaWeekToEntries({
  week,
  universityId,
  facultyId,
  course,
  groupName,
  kgmaFacultyId,
  kgmaGroupId,
  academicYear,
  semester
}) {
  const rows = [];
  for (const day of week.days || []) {
    for (const les of day.lessons || []) {
      rows.push({
        universityId,
        facultyId,
        course,
        groupName,
        dayOfWeek: day.dayOfWeek > 6 ? 6 : day.dayOfWeek,
        lessonNumber: les.lessonNumber,
        timeStart: les.timeStart,
        timeEnd: les.timeEnd,
        subjectName: les.subjectName,
        teacher: les.teacher || null,
        room: les.room || null,
        lessonType: les.lessonType,
        weekParity: 'all',
        semester,
        academicYear,
        notes: [les.subgroup, les.isElective ? 'Электив' : ''].filter(Boolean).join(' · ') || null,
        isActive: true,
        source: 'kgma',
        kgmaFacultyId: String(kgmaFacultyId),
        kgmaGroupId: String(kgmaGroupId),
        lessonDate: day.date,
        externalKey: les.externalKey
      });
    }
  }
  return rows;
}

function getDefaultAcademicYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 9) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

function getDefaultSemester(date = new Date()) {
  const month = date.getMonth() + 1;
  return month >= 2 && month <= 8 ? 'spring' : 'autumn';
}

module.exports = {
  KGMA_BASE,
  KGMA_SCHEDULE_URL: `${KGMA_BASE}/${KGMA_LANG}/student/schedule`,
  fetchKgmaMeta,
  listKgmaCourses,
  listKgmaGroups,
  fetchKgmaWeekSchedule,
  flattenKgmaWeekToEntries,
  getWeekStart,
  formatDateISO,
  getDefaultAcademicYear,
  getDefaultSemester
};
