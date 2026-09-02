const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const auth = require('../middleware/auth');
const { University, Faculty, User, ScheduleEntry } = require('../models');
const { KGMA } = require('../utils/ensureUniversities');
const {
  KGMA_SCHEDULE_URL,
  fetchKgmaMeta,
  listKgmaCourses,
  listKgmaGroups,
  fetchKgmaWeekSchedule,
  getWeekStart,
  formatDateISO
} = require('../utils/kgmaSchedule');

let metaCache = { at: 0, data: null };
const META_TTL_MS = 5 * 60 * 1000;

const LESSON_TYPE_RU = {
  lecture: 'лекция',
  practice: 'практика',
  lab: 'лаб.',
  seminar: 'семинар',
  other: ''
};

function getWeekEndDate(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return end;
}

function dayOfWeekFromDateStr(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const jsDay = d.getDay();
  if (jsDay === 0) return 7;
  return jsDay;
}

function buildGroupWhere(user) {
  if (user.kgmaGroupId) {
    return { kgmaGroupId: user.kgmaGroupId };
  }
  return {
    groupName: user.groupName,
    facultyId: user.facultyId,
    course: user.course,
    universityId: user.universityId
  };
}

function entriesToWeekDays(entries, weekStart, weekEndStr) {
  const daysMap = new Map();

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = formatDateISO(d);
    if (dateStr > weekEndStr) break;
    daysMap.set(dateStr, {
      date: dateStr,
      dayOfWeek: dayOfWeekFromDateStr(dateStr),
      lessons: []
    });
  }

  for (const entry of entries) {
    const dateStr = entry.lessonDate;
    if (!dateStr || !daysMap.has(dateStr)) continue;
    const timeLabel = entry.timeStart && entry.timeEnd
      ? `${entry.timeStart}-${entry.timeEnd}`
      : (entry.lessonNumber ? `пара ${entry.lessonNumber}` : '');
    daysMap.get(dateStr).lessons.push({
      lessonNumber: entry.lessonNumber,
      timeStart: entry.timeStart,
      timeEnd: entry.timeEnd,
      timeLabel,
      subjectName: entry.subjectName,
      lessonTypeLabel: LESSON_TYPE_RU[entry.lessonType] || '',
      room: entry.room || '',
      teacher: entry.teacher || ''
    });
  }

  for (const day of daysMap.values()) {
    day.lessons.sort((a, b) => {
      const ta = a.timeStart || '';
      const tb = b.timeStart || '';
      if (ta !== tb) return ta.localeCompare(tb);
      return (a.lessonNumber || 0) - (b.lessonNumber || 0);
    });
  }

  return [...daysMap.values()].filter((day) => day.lessons.length > 0);
}

async function getKgmaMetaCached() {
  const now = Date.now();
  if (metaCache.data && now - metaCache.at < META_TTL_MS) {
    return metaCache.data;
  }
  const data = await fetchKgmaMeta();
  metaCache = { at: now, data };
  return data;
}

router.get('/kgma/source', (req, res) => {
  res.json({ url: KGMA_SCHEDULE_URL });
});

router.get('/kgma/meta', async (req, res) => {
  try {
    const meta = await getKgmaMetaCached();
    const facultyId = req.query.facultyId;
    const course = parseInt(req.query.course, 10);

    const payload = {
      sourceUrl: KGMA_SCHEDULE_URL,
      faculty: meta.faculty,
      courses: facultyId ? listKgmaCourses(meta, facultyId) : [],
      groups: (facultyId && Number.isFinite(course))
        ? listKgmaGroups(meta, facultyId, course)
        : []
    };
    res.json(payload);
  } catch (error) {
    console.error('Ошибка meta КГМА:', error);
    res.status(502).json({ error: 'Не удалось загрузить данные с kgma.kg' });
  }
});

router.get('/kgma/week', async (req, res) => {
  try {
    const kgmaGroupId = String(req.query.kgmaGroupId || '').trim();
    if (!kgmaGroupId) {
      return res.status(400).json({ error: 'Укажите kgmaGroupId' });
    }

    const weekStart = req.query.weekStart
      ? getWeekStart(req.query.weekStart)
      : getWeekStart();

    const week = await fetchKgmaWeekSchedule(kgmaGroupId, weekStart);
    res.json({
      sourceUrl: KGMA_SCHEDULE_URL,
      kgmaGroupId,
      ...week
    });
  } catch (error) {
    console.error('Ошибка расписания КГМА:', error);
    res.status(502).json({ error: error.message || 'Не удалось загрузить расписание с kgma.kg' });
  }
});

router.get('/kgma/current-week-start', (req, res) => {
  const start = getWeekStart();
  res.json({ weekStart: formatDateISO(start) });
});

router.get('/kgma/profile-groups', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'universityId', 'facultyId', 'course', 'groupName', 'kgmaGroupId'],
      include: [{
        model: University,
        as: 'University',
        attributes: ['id', 'shortName'],
        required: false
      }, {
        model: Faculty,
        as: 'Faculty',
        attributes: ['id', 'name', 'shortName'],
        required: false
      }]
    });

    if (!user?.University || user.University.shortName !== KGMA.shortName) {
      return res.json({ groups: [], isKgma: false });
    }

    const facultyId = parseInt(req.query.facultyId, 10) || user.facultyId;
    const course = parseInt(req.query.course, 10) || user.course;

    if (!facultyId || !Number.isFinite(course) || course < 1) {
      return res.json({
        groups: [],
        isKgma: true,
        needDirection: true
      });
    }

    const faculty = await Faculty.findOne({
      where: { id: facultyId, universityId: user.universityId, isActive: true }
    });
    if (!faculty) {
      return res.json({
        groups: [],
        isKgma: true,
        error: 'Факультет не найден'
      });
    }

    const meta = await getKgmaMetaCached();
    let kgmaFaculty = meta.faculty.find((f) => f.shortName === faculty.shortName);
    if (!kgmaFaculty) {
      kgmaFaculty = meta.faculty.find((f) => f.name === faculty.name);
    }
    if (!kgmaFaculty) {
      return res.json({
        groups: [],
        isKgma: true,
        error: 'Факультет не найден на kgma.kg'
      });
    }

    const groups = listKgmaGroups(meta, kgmaFaculty.id, course);
    res.json({
      isKgma: true,
      kgmaFacultyId: kgmaFaculty.id,
      groups,
      selectedGroupId: user.kgmaGroupId || null,
      selectedGroupName: user.groupName || null
    });
  } catch (error) {
    console.error('Ошибка групп профиля КГМА:', error);
    res.status(502).json({ error: 'Не удалось загрузить список групп' });
  }
});

router.get('/my/week', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'universityId', 'facultyId', 'course', 'groupName', 'kgmaGroupId'],
      include: [{
        model: University,
        as: 'University',
        attributes: ['id', 'shortName'],
        required: false
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const weekStart = req.query.weekStart
      ? getWeekStart(req.query.weekStart)
      : getWeekStart();
    const weekEnd = getWeekEndDate(weekStart);
    const weekStartStr = formatDateISO(weekStart);
    const weekEndStr = formatDateISO(weekEnd);

    const hasGroup = !!(user.kgmaGroupId || user.groupName);
    if (!hasGroup) {
      return res.json({
        configured: false,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        groupName: null,
        days: []
      });
    }

    const entries = await ScheduleEntry.findAll({
      where: {
        isActive: true,
        lessonDate: { [Op.between]: [weekStartStr, weekEndStr] },
        ...buildGroupWhere(user)
      },
      order: [['lessonDate', 'ASC'], ['timeStart', 'ASC'], ['lessonNumber', 'ASC']]
    });

    if (entries.length) {
      const days = entriesToWeekDays(entries, weekStart, weekEndStr);
      return res.json({
        configured: true,
        source: 'db',
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        groupName: user.groupName,
        kgmaGroupId: user.kgmaGroupId,
        empty: days.length === 0,
        days
      });
    }

    if (user.kgmaGroupId) {
      const week = await fetchKgmaWeekSchedule(user.kgmaGroupId, weekStart);
      return res.json({
        configured: true,
        source: 'kgma',
        groupName: user.groupName,
        kgmaGroupId: user.kgmaGroupId,
        sourceUrl: KGMA_SCHEDULE_URL,
        ...week
      });
    }

    res.json({
      configured: true,
      source: 'db',
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      groupName: user.groupName,
      empty: true,
      message: 'На эту неделю занятий нет',
      days: []
    });
  } catch (error) {
    console.error('Ошибка «моё расписание»:', error);
    res.status(502).json({ error: error.message || 'Не удалось загрузить расписание' });
  }
});

module.exports = router;

module.exports.resolveFacultyForKgma = async function resolveFacultyForKgma(universityId, kgmaFaculty) {
  if (!kgmaFaculty) {
    const fallback = await Faculty.findOne({
      where: { universityId, isActive: true },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    });
    return fallback;
  }

  let faculty = await Faculty.findOne({
    where: { universityId, shortName: kgmaFaculty.shortName }
  });
  if (!faculty) {
    faculty = await Faculty.findOne({
      where: { universityId, name: kgmaFaculty.name }
    });
  }
  if (!faculty) {
    faculty = await Faculty.create({
      universityId,
      name: kgmaFaculty.name,
      shortName: (kgmaFaculty.shortName || kgmaFaculty.name).slice(0, 50),
      sortOrder: 0,
      isActive: true
    });
  }
  return faculty;
};

module.exports.getKgmaUniversity = async function getKgmaUniversity() {
  return University.findOne({ where: { shortName: KGMA.shortName } });
};
