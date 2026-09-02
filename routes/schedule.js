const express = require('express');
const router = express.Router();
const { University, Faculty } = require('../models');
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
