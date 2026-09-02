const { Op } = require('sequelize');
const {
  User,
  ScheduleEntry,
  BroadcastMessage,
  UserBroadcastNotification,
  Setting,
  University
} = require('../models');
const { formatDateISO } = require('./kgmaSchedule');
const { KGMA } = require('./ensureUniversities');

const SETTING_PREFIX = 'schedule_reminder:';

const LESSON_TYPE_RU = {
  lecture: 'лекция',
  practice: 'практика',
  lab: 'лаб.',
  seminar: 'семинар',
  other: ''
};

function getTomorrowDate(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function dayOfWeekForSchedule(date) {
  const jsDay = date.getDay();
  if (jsDay === 0) return null;
  return jsDay;
}

async function wasReminderSent(userId, lessonDateStr) {
  const key = `${SETTING_PREFIX}${userId}:${lessonDateStr}`;
  const row = await Setting.findOne({ where: { key } });
  return !!row;
}

async function markReminderSent(userId, lessonDateStr) {
  const key = `${SETTING_PREFIX}${userId}:${lessonDateStr}`;
  const [row] = await Setting.findOrCreate({
    where: { key },
    defaults: { value: new Date().toISOString() }
  });
  if (!row.isNewRecord && !row.value) {
    row.value = new Date().toISOString();
    await row.save();
  }
}

function formatLessonLine(entry) {
  const time = entry.timeStart && entry.timeEnd
    ? `${entry.timeStart}–${entry.timeEnd}`
    : (entry.lessonNumber ? `пара ${entry.lessonNumber}` : '—');
  const type = LESSON_TYPE_RU[entry.lessonType];
  const typePart = type ? ` (${type})` : '';
  const room = entry.room ? `, ауд. ${entry.room}` : '';
  return `• ${time} — ${entry.subjectName}${typePart}${room}`;
}

function buildReminderMessage(lessons, tomorrowStr) {
  const lines = lessons.map(formatLessonLine).join('\n');
  return `Завтра (${tomorrowStr}) у вас:\n${lines}\n\nУспейте подготовиться!`;
}

async function findTomorrowLessonsForUser(user) {
  const tomorrow = getTomorrowDate();
  const tomorrowStr = formatDateISO(tomorrow);
  const dow = dayOfWeekForSchedule(tomorrow);

  if (!user.kgmaGroupId && !user.groupName) {
    return { tomorrowStr, lessons: [] };
  }

  const groupMatch = user.kgmaGroupId
    ? { kgmaGroupId: user.kgmaGroupId }
    : {
      groupName: user.groupName,
      facultyId: user.facultyId,
      course: user.course,
      universityId: user.universityId
    };

  const dateMatch = [{ lessonDate: tomorrowStr }];
  if (dow) {
    dateMatch.push({ lessonDate: null, dayOfWeek: dow });
  }

  const lessons = await ScheduleEntry.findAll({
    where: {
      ...groupMatch,
      isActive: true,
      [Op.or]: dateMatch
    },
    order: [['timeStart', 'ASC'], ['lessonNumber', 'ASC']]
  });

  return { tomorrowStr, lessons };
}

async function sendScheduleReminderToUser(user, lessons, tomorrowStr, options = {}) {
  const { force = false } = options;
  if (!lessons.length) return false;
  if (!force && await wasReminderSent(user.id, tomorrowStr)) return false;

  const broadcast = await BroadcastMessage.create({
    title: 'Завтра в расписании',
    message: buildReminderMessage(lessons, tomorrowStr),
    adminId: null,
    recipientCount: 1
  });

  await UserBroadcastNotification.create({
    broadcastMessageId: broadcast.id,
    userId: user.id,
    dismissedByUser: false
  });

  await markReminderSent(user.id, tomorrowStr);
  return true;
}

let reminderInProgress = false;

async function runScheduleReminders(options = {}) {
  const { force = false } = options;

  if (!force && process.env.SCHEDULE_REMINDER_ENABLED === 'false') {
    console.log('[Schedule reminders] отключено (SCHEDULE_REMINDER_ENABLED=false)');
    return null;
  }
  if (reminderInProgress) {
    console.log('[Schedule reminders] уже выполняется, пропуск');
    return null;
  }

  reminderInProgress = true;
  const tomorrow = getTomorrowDate();
  const tomorrowStr = formatDateISO(tomorrow);

  try {
    const kgmaUni = await University.findOne({ where: { shortName: KGMA.shortName } });
    if (!kgmaUni) {
      console.log('[Schedule reminders] университет КГМА не найден');
      return { tomorrowStr, sent: 0, skipped: 0, noLessons: 0, totalUsers: 0 };
    }

    const users = await User.findAll({
      where: {
        universityId: kgmaUni.id,
        status: 'approved',
        [Op.or]: [
          { kgmaGroupId: { [Op.ne]: null } },
          { groupName: { [Op.ne]: null } }
        ]
      },
      attributes: ['id', 'username', 'kgmaGroupId', 'groupName', 'facultyId', 'course', 'universityId']
    });

    let sent = 0;
    let skipped = 0;
    let noLessons = 0;

    for (const user of users) {
      const { lessons } = await findTomorrowLessonsForUser(user);
      if (!lessons.length) {
        noLessons += 1;
        continue;
      }
      const ok = await sendScheduleReminderToUser(user, lessons, tomorrowStr, { force });
      if (ok) sent += 1;
      else skipped += 1;
    }

    const result = {
      tomorrowStr,
      sent,
      skipped,
      noLessons,
      totalUsers: users.length,
      finishedAt: new Date().toISOString()
    };

    console.log(
      `[Schedule reminders] готово: завтра ${tomorrowStr}, `
      + `отправлено ${sent}, без пар ${noLessons}, пропущено ${skipped}, пользователей ${users.length}`
    );

    return result;
  } finally {
    reminderInProgress = false;
  }
}

function msUntilNextDailyAt(hour = 20, minute = 0) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }

  return Math.max(1000, target.getTime() - now.getTime());
}

function startScheduleReminderScheduler() {
  if (process.env.SCHEDULE_REMINDER_ENABLED === 'false') {
    console.log('[Schedule reminders] планировщик отключён (SCHEDULE_REMINDER_ENABLED=false)');
    return;
  }

  const hour = parseInt(process.env.SCHEDULE_REMINDER_HOUR || '20', 10);
  const minute = parseInt(process.env.SCHEDULE_REMINDER_MINUTE || '0', 10);

  const scheduleNext = () => {
    const ms = msUntilNextDailyAt(hour, minute);
    const next = new Date(Date.now() + ms);
    console.log(`[Schedule reminders] следующий запуск: ${next.toLocaleString('ru-RU')}`);

    setTimeout(async () => {
      try {
        await runScheduleReminders();
      } catch (error) {
        console.error('[Schedule reminders] сбой планового запуска:', error.message);
      }
      scheduleNext();
    }, ms);
  };

  scheduleNext();

  setTimeout(async () => {
    const now = new Date();
    if (now.getHours() < hour || (now.getHours() === hour && now.getMinutes() < minute)) {
      return;
    }
    try {
      await runScheduleReminders();
    } catch (error) {
      console.error('[Schedule reminders] сбой догоняющего запуска:', error.message);
    }
  }, 20000);
}

module.exports = {
  getTomorrowDate,
  findTomorrowLessonsForUser,
  sendScheduleReminderToUser,
  runScheduleReminders,
  startScheduleReminderScheduler
};
