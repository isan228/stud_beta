const { ScheduleEntry, Setting } = require('../models');
const {
  fetchKgmaMeta,
  listKgmaCourses,
  listKgmaGroups,
  fetchKgmaWeekSchedule,
  flattenKgmaWeekToEntries,
  getWeekStart,
  formatDateISO,
  getDefaultAcademicYear,
  getDefaultSemester,
  KGMA_SCHEDULE_URL
} = require('./kgmaSchedule');
const { getKgmaUniversity, resolveFacultyForKgma } = require('../routes/schedule');

const SETTING_LAST_SYNC = 'kgma_schedule_last_sync';
const SETTING_LAST_SYNC_RESULT = 'kgma_schedule_last_sync_result';
const DEFAULT_DELAY_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** На воскресенье — следующий понедельник (новая учебная неделя) */
function getSyncWeekStart(from = new Date()) {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  if (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
    return d;
  }
  return getWeekStart(d);
}

async function upsertScheduleRows(rows) {
  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = row.externalKey
      ? await ScheduleEntry.findOne({ where: { externalKey: row.externalKey } })
      : null;
    if (existing) {
      await existing.update(row);
      updated += 1;
    } else {
      await ScheduleEntry.create(row);
      imported += 1;
    }
  }

  return { imported, updated };
}

async function importKgmaGroupsWeek({
  universityId,
  faculty,
  kgmaFacultyId,
  course,
  groups,
  weekStart,
  academicYear,
  semester
}) {
  let imported = 0;
  let updated = 0;
  const groupResults = [];

  for (const group of groups) {
    const week = await fetchKgmaWeekSchedule(group.id, weekStart);
    const rows = flattenKgmaWeekToEntries({
      week,
      universityId,
      facultyId: faculty.id,
      course,
      groupName: group.name,
      kgmaFacultyId,
      kgmaGroupId: group.id,
      academicYear,
      semester
    });

    const stats = await upsertScheduleRows(rows);
    imported += stats.imported;
    updated += stats.updated;

    groupResults.push({
      groupId: group.id,
      groupName: group.name,
      lessons: rows.length,
      empty: week.empty
    });
  }

  return { imported, updated, groups: groupResults };
}

async function syncAllKgmaSchedules(options = {}) {
  const {
    weekStart: rawWeekStart,
    delayMs = DEFAULT_DELAY_MS,
    onProgress
  } = options;

  const university = await getKgmaUniversity();
  if (!university) {
    throw new Error('Университет КГМА не найден в системе');
  }

  const meta = await fetchKgmaMeta();
  const weekStart = rawWeekStart ? getWeekStart(rawWeekStart) : getSyncWeekStart();
  const academicYear = getDefaultAcademicYear(weekStart);
  const semester = getDefaultSemester(weekStart);

  const tasks = [];
  for (const kgmaFaculty of meta.faculty) {
    const courses = listKgmaCourses(meta, kgmaFaculty.id);
    const faculty = await resolveFacultyForKgma(university.id, kgmaFaculty);
    for (const course of courses) {
      const groups = listKgmaGroups(meta, kgmaFaculty.id, course);
      for (const group of groups) {
        tasks.push({ kgmaFaculty, faculty, course, group });
      }
    }
  }

  let imported = 0;
  let updated = 0;
  let errors = 0;
  let groupsProcessed = 0;

  for (const task of tasks) {
    try {
      const week = await fetchKgmaWeekSchedule(task.group.id, weekStart);
      const rows = flattenKgmaWeekToEntries({
        week,
        universityId: university.id,
        facultyId: task.faculty.id,
        course: task.course,
        groupName: task.group.name,
        kgmaFacultyId: task.kgmaFaculty.id,
        kgmaGroupId: task.group.id,
        academicYear,
        semester
      });
      const stats = await upsertScheduleRows(rows);
      imported += stats.imported;
      updated += stats.updated;
    } catch (error) {
      errors += 1;
      console.error(`[KGMA sync] группа ${task.group.id} (${task.group.name}):`, error.message);
    }

    groupsProcessed += 1;
    if (typeof onProgress === 'function') {
      onProgress({
        groupsProcessed,
        totalGroups: tasks.length,
        imported,
        updated,
        errors
      });
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const result = {
    sourceUrl: KGMA_SCHEDULE_URL,
    weekStart: formatDateISO(weekStart),
    academicYear,
    semester,
    imported,
    updated,
    errors,
    groupsProcessed,
    totalGroups: tasks.length,
    finishedAt: new Date().toISOString()
  };

  await saveLastSyncResult(result);
  return result;
}

async function getLastSyncDate() {
  const row = await Setting.findOne({ where: { key: SETTING_LAST_SYNC } });
  return row?.value || null;
}

async function getLastSyncResult() {
  const row = await Setting.findOne({ where: { key: SETTING_LAST_SYNC_RESULT } });
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function saveLastSyncResult(result) {
  const today = formatDateISO(new Date());
  const lastRow = await Setting.findOne({ where: { key: SETTING_LAST_SYNC } });
  if (lastRow) {
    lastRow.value = today;
    await lastRow.save();
  } else {
    await Setting.create({ key: SETTING_LAST_SYNC, value: today });
  }

  const resultRow = await Setting.findOne({ where: { key: SETTING_LAST_SYNC_RESULT } });
  const payload = JSON.stringify(result);
  if (resultRow) {
    resultRow.value = payload;
    await resultRow.save();
  } else {
    await Setting.create({ key: SETTING_LAST_SYNC_RESULT, value: payload });
  }
}

let syncInProgress = false;

async function runKgmaWeeklySync(options = {}) {
  const { force = false } = options;

  if (!force && process.env.KGMA_SYNC_ENABLED === 'false') {
    console.log('[KGMA sync] отключено (KGMA_SYNC_ENABLED=false)');
    return null;
  }
  if (syncInProgress) {
    console.log('[KGMA sync] уже выполняется, пропуск');
    return null;
  }

  const today = formatDateISO(new Date());
  const last = await getLastSyncDate();
  if (!force && last === today) {
    console.log('[KGMA sync] уже выполнялся сегодня');
    return null;
  }

  syncInProgress = true;
  console.log('[KGMA sync] старт полной синхронизации с kgma.kg…');

  try {
    const result = await syncAllKgmaSchedules({
      onProgress: (p) => {
        if (p.groupsProcessed % 25 === 0 || p.groupsProcessed === p.totalGroups) {
          console.log(`[KGMA sync] ${p.groupsProcessed}/${p.totalGroups} групп, +${p.imported} / ~${p.updated}`);
        }
      }
    });
    console.log(
      `[KGMA sync] готово: неделя ${result.weekStart}, групп ${result.groupsProcessed}, `
      + `добавлено ${result.imported}, обновлено ${result.updated}, ошибок ${result.errors}`
    );
    return result;
  } catch (error) {
    console.error('[KGMA sync] ошибка:', error);
    throw error;
  } finally {
    syncInProgress = false;
  }
}

function msUntilNextSundayAt(hour = 3, minute = 0) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  let daysUntilSunday = (7 - now.getDay()) % 7;
  if (daysUntilSunday === 0 && now >= target) {
    daysUntilSunday = 7;
  }
  target.setDate(target.getDate() + daysUntilSunday);
  return Math.max(1000, target.getTime() - now.getTime());
}

function startKgmaWeeklyScheduler() {
  if (process.env.KGMA_SYNC_ENABLED === 'false') {
    console.log('[KGMA sync] планировщик отключён (KGMA_SYNC_ENABLED=false)');
    return;
  }

  const hour = parseInt(process.env.KGMA_SYNC_HOUR || '3', 10);
  const minute = parseInt(process.env.KGMA_SYNC_MINUTE || '0', 10);

  const scheduleNext = () => {
    const ms = msUntilNextSundayAt(hour, minute);
    const next = new Date(Date.now() + ms);
    console.log(`[KGMA sync] следующий запуск: ${next.toLocaleString('ru-RU')}`);

    setTimeout(async () => {
      try {
        await runKgmaWeeklySync();
      } catch (error) {
        console.error('[KGMA sync] сбой планового запуска:', error.message);
      }
      scheduleNext();
    }, ms);
  };

  scheduleNext();

  // Если сервер подняли в воскресенье после времени синхронизации — догоняем
  setTimeout(async () => {
    const now = new Date();
    if (now.getDay() !== 0) return;
    if (now.getHours() < hour || (now.getHours() === hour && now.getMinutes() < minute)) return;
    const last = await getLastSyncDate();
    const today = formatDateISO(now);
    if (last === today) return;
    try {
      await runKgmaWeeklySync();
    } catch (error) {
      console.error('[KGMA sync] сбой догоняющего запуска:', error.message);
    }
  }, 15000);
}

module.exports = {
  getSyncWeekStart,
  upsertScheduleRows,
  importKgmaGroupsWeek,
  syncAllKgmaSchedules,
  runKgmaWeeklySync,
  startKgmaWeeklyScheduler,
  getLastSyncDate,
  getLastSyncResult
};
