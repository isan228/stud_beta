const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { Test, Question, Answer, Subject, Favorite, TestResult, User, University, Faculty, SubjectCourse, QuestionTag, QuestionTagMap, Flashcard } = require('../models');
const { buildHighlightHtml } = require('../utils/flashcardHighlight');
const { Op } = require('sequelize');
const { isSubscriptionActive } = require('../utils/subscriptionPlans');
const { parseImageUrls, firstImageUrl } = require('../utils/mediaField');
const { pickQuestionsKeepingLinkedOrder } = require('../utils/usmleLinkedQuestions');
const { ALLOWED_COURSES } = require('../utils/ensureFaculties');

function tryGetUserIdFromRequest(req) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.userId || null;
  } catch {
    return null;
  }
}

function resolveProgramType(req) {
  const raw = String(req.query.program || req.body?.program || 'university').toLowerCase();
  return raw === 'usmle' ? 'usmle' : 'university';
}

/** universityId пользователя или null (гость / без вуза — без фильтра по вузу) */
async function resolveUserUniversityId(req) {
  const userId = tryGetUserIdFromRequest(req);
  if (!userId) return null;
  const user = await User.findByPk(userId, { attributes: ['id', 'universityId'] });
  return user?.universityId || null;
}

function universityInclude() {
  return {
    model: University,
    as: 'University',
    attributes: ['id', 'name', 'shortName'],
    required: false
  };
}

function facultyInclude(facultyId) {
  const include = {
    model: Faculty,
    as: 'Faculties',
    attributes: ['id', 'name', 'shortName', 'universityId'],
    through: { attributes: [] },
    required: false
  };
  if (Number.isFinite(facultyId) && facultyId > 0) {
    include.where = { id: facultyId };
    include.required = true;
  }
  return include;
}

function courseInclude(course) {
  const include = {
    model: SubjectCourse,
    as: 'Courses',
    attributes: ['id', 'course'],
    required: false
  };
  if (Number.isFinite(course) && ALLOWED_COURSES.includes(course)) {
    include.where = { course };
    include.required = true;
  }
  return include;
}

function tagsInclude() {
  return {
    model: QuestionTag,
    as: 'Tags',
    attributes: ['id', 'name', 'slug'],
    through: { attributes: [] },
    required: false
  };
}

async function assertUserCanAccessTest(test, req) {
  if (!test) return { ok: true };
  const programType = test.programType || 'university';

  // USMLE не привязан к университету
  if (programType === 'usmle') return { ok: true };

  if (!test.universityId) return { ok: true };
  const userId = tryGetUserIdFromRequest(req);
  if (!userId) return { ok: true };
  const user = await User.findByPk(userId, { attributes: ['id', 'universityId'] });
  if (!user?.universityId) return { ok: true };
  if (Number(user.universityId) !== Number(test.universityId)) {
    return { ok: false, status: 403, error: 'Этот тест относится к другому университету' };
  }
  return { ok: true };
}

async function assertPaidAccess(test, req) {
  if (test.isFree) return { ok: true };

  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return { ok: false, status: 401, error: 'Требуется авторизация для этого теста' };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return { ok: false, status: 401, error: 'Пользователь не найден' };
    }

    const programType = test.programType || 'university';
    if (programType === 'usmle') {
      if (!isSubscriptionActive(user.usmleSubscriptionEndDate)) {
        return { ok: false, status: 403, error: 'Требуется активная подписка USMLE' };
      }
    } else if (!isSubscriptionActive(user.subscriptionEndDate)) {
      return { ok: false, status: 403, error: 'Требуется активная подписка для этого теста' };
    }
    return { ok: true, user };
  } catch {
    return { ok: false, status: 401, error: 'Недействительный токен' };
  }
}


/** Последний известный исход по каждому вопросу (по всем попыткам по порядку времени). */
async function getTestQuestionProgressState(testId, userId) {
  const testIdNum = parseInt(testId, 10);
  const questions = await Question.findAll({
    where: { testId: testIdNum },
    attributes: ['id'],
    order: [['id', 'ASC']]
  });
  const allQuestionIds = questions.map(q => q.id);
  const totalQuestions = allQuestionIds.length;
  const lastOutcome = {};

  if (userId) {
    const rows = await TestResult.findAll({
      where: { userId, testId: testIdNum },
      attributes: ['results', 'createdAt'],
      order: [['createdAt', 'ASC']]
    });
    for (const row of rows) {
      const r = row.results;
      if (!r || typeof r !== 'object') continue;
      for (const [qid, data] of Object.entries(r)) {
        const id = parseInt(qid, 10);
        if (!Number.isFinite(id)) continue;
        if (data && typeof data.correct === 'boolean') {
          lastOutcome[id] = data.correct;
        }
      }
    }
  }

  let favoriteIds = new Set();
  if (userId) {
    const favs = await Favorite.findAll({
      where: { userId },
      attributes: ['questionId'],
      include: [{
        model: Question,
        as: 'Question',
        attributes: ['id', 'testId'],
        where: { testId: testIdNum },
        required: true
      }]
    });
    favoriteIds = new Set(favs.map(f => f.questionId));
  }

  const solvedIds = Object.keys(lastOutcome).map(Number);
  const solved = solvedIds.length;
  const correct = solvedIds.filter(id => lastOutcome[id] === true).length;
  const incorrect = solvedIds.filter(id => lastOutcome[id] === false).length;
  const unsolved = Math.max(0, totalQuestions - solved);

  return {
    totalQuestions,
    allQuestionIds,
    lastOutcome,
    favoriteIds,
    solved,
    unsolved,
    correct,
    incorrect,
    favorites: favoriteIds.size
  };
}

function buildQuestionFilterPool(questionFilters, state) {
  if (!questionFilters || typeof questionFilters !== 'object') {
    return null;
  }
  const { all, unsolved, solved, correct, incorrect, favorites } = questionFilters;
  const hasAny = all || unsolved || solved || correct || incorrect || favorites;
  if (!hasAny) return null;

  const { allQuestionIds, lastOutcome, favoriteIds } = state;
  if (all) {
    return new Set(allQuestionIds);
  }
  const pool = new Set();
  const addIds = (ids) => {
    ids.forEach((id) => pool.add(id));
  };
  if (unsolved) {
    addIds(allQuestionIds.filter((id) => lastOutcome[id] === undefined));
  }
  if (solved) {
    addIds(allQuestionIds.filter((id) => lastOutcome[id] !== undefined));
  }
  if (correct) {
    addIds(allQuestionIds.filter((id) => lastOutcome[id] === true));
  }
  if (incorrect) {
    addIds(allQuestionIds.filter((id) => lastOutcome[id] === false));
  }
  if (favorites) {
    addIds([...favoriteIds]);
  }
  return pool;
}

// Получить последние тесты (для главной страницы)
router.get('/latest', async (req, res) => {
  try {
    const isFreeOnly = req.query.free === 'true';
    const programType = resolveProgramType(req);
    const whereClause = { programType };

    if (isFreeOnly) {
      whereClause.isFree = true;
    }

    if (programType === 'university') {
      const universityId = await resolveUserUniversityId(req);
      if (universityId) {
        whereClause.universityId = universityId;
      }
    } else {
      whereClause.universityId = null;
    }

    const tests = await Test.findAll({
      where: whereClause,
      limit: 6,
      order: [['createdAt', 'DESC']],
      include: [{
        model: Question,
        as: 'Questions',
        attributes: ['id']
      }, universityInclude()]
    });

    res.json(tests);
  } catch (error) {
    console.error('Ошибка получения последних тестов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить все предметы
router.get('/subjects', async (req, res) => {
  try {
    const programType = resolveProgramType(req);
    const isFreeOnly = req.query.free === 'true';
    const where = { programType };
    let facultyId = parseInt(req.query.facultyId, 10);
    let course = parseInt(req.query.course, 10);

    if (programType === 'university') {
      const universityId = await resolveUserUniversityId(req);
      if (universityId) {
        where.universityId = universityId;
      }

      // Если фильтры не переданы — берём направление пользователя
      const userId = tryGetUserIdFromRequest(req);
      if (userId && (!Number.isFinite(facultyId) || !Number.isFinite(course))) {
        const user = await User.findByPk(userId, {
          attributes: ['facultyId', 'course']
        });
        if (user) {
          if (!Number.isFinite(facultyId) || facultyId <= 0) facultyId = Number(user.facultyId) || NaN;
          if (!Number.isFinite(course) || course <= 0) course = Number(user.course) || NaN;
        }
      }
    } else {
      where.universityId = null;
    }

    const include = [universityInclude()];
    if (programType === 'university') {
      include.push(facultyInclude(facultyId));
      include.push(courseInclude(course));
    }

    let subjects = await Subject.findAll({
      where,
      order: [['name', 'ASC']],
      include,
      distinct: true
    });

    if (isFreeOnly) {
      const freeTestWhere = { isFree: true, programType };
      if (programType === 'university' && where.universityId) {
        freeTestWhere.universityId = where.universityId;
      }

      const freeTests = await Test.findAll({
        where: freeTestWhere,
        attributes: ['subjectId'],
        raw: true
      });
      const subjectIds = new Set(freeTests.map((t) => t.subjectId).filter(Boolean));
      subjects = subjects.filter((s) => subjectIds.has(s.id));
    }

    const ids = subjects.map((s) => s.id);
    let testCountMap = new Map();
    let questionCountMap = new Map();
    if (ids.length) {
      const testRows = await Test.findAll({
        attributes: ['subjectId', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
        where: { subjectId: { [Op.in]: ids } },
        group: ['subjectId'],
        raw: true
      });
      testCountMap = new Map(testRows.map((r) => [Number(r.subjectId), Number(r.count)]));

      const { sequelize } = require('../models');
      const qRows = await sequelize.query(
        `SELECT t."subjectId" AS "subjectId", COUNT(q.id)::int AS count
         FROM "Questions" q
         INNER JOIN "Tests" t ON t.id = q."testId"
         WHERE t."subjectId" IN (:ids)
         GROUP BY t."subjectId"`,
        { replacements: { ids }, type: require('sequelize').QueryTypes.SELECT }
      );
      questionCountMap = new Map(qRows.map((r) => [Number(r.subjectId), Number(r.count)]));
    }

    let favoriteSubjectIds = new Set();
    const userId = tryGetUserIdFromRequest(req);
    if (userId && ids.length) {
      try {
        const { CatalogFavorite } = require('../models');
        const favs = await CatalogFavorite.findAll({
          where: { userId, itemType: 'subject', itemId: { [Op.in]: ids } },
          attributes: ['itemId']
        });
        favoriteSubjectIds = new Set(favs.map((f) => Number(f.itemId)));
      } catch (_) { /* table may not exist yet */ }
    }

    res.json(subjects.map((s) => {
      const json = s.toJSON();
      json.courses = Array.isArray(json.Courses)
        ? json.Courses.map((c) => Number(c.course)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
        : [];
      json.testCount = testCountMap.get(s.id) || 0;
      json.questionCount = questionCountMap.get(s.id) || 0;
      json.isFavorite = favoriteSubjectIds.has(s.id);
      return json;
    }));
  } catch (error) {
    console.error('Ошибка получения предметов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** Факультеты вуза пользователя (или ?universityId=) */
router.get('/faculties', async (req, res) => {
  try {
    let universityId = parseInt(req.query.universityId, 10);
    if (!Number.isFinite(universityId) || universityId <= 0) {
      universityId = await resolveUserUniversityId(req);
    }
    if (!universityId) {
      return res.json([]);
    }

    const faculties = await Faculty.findAll({
      where: { universityId, isActive: true },
      attributes: ['id', 'name', 'shortName', 'universityId', 'sortOrder'],
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });
    res.json(faculties);
  } catch (error) {
    console.error('Ошибка получения факультетов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * USMLE dashboard: тесты (UWorld и т.п.), сгруппированные по Step предмета.
 * GET /usmle/dashboard → { step1: [tests...], step2: [...], step3: [...] }
 */
router.get('/usmle/dashboard', async (req, res) => {
  try {
    const userId = tryGetUserIdFromRequest(req);

    let subjects;
    try {
      subjects = await Subject.findAll({
        where: { programType: 'usmle', universityId: null },
        attributes: ['id', 'name', 'stepGroup'],
        order: [['name', 'ASC']]
      });
    } catch (colErr) {
      console.warn('usmle/dashboard: stepGroup unavailable, fallback:', colErr.message);
      subjects = await Subject.findAll({
        where: { programType: 'usmle', universityId: null },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']]
      });
    }

    const resolveStep = (subj) => {
      const sg = String(subj.stepGroup || '').toLowerCase();
      if (sg === 'step1' || sg === 'step2' || sg === 'step3') return sg;
      const n = String(subj.name || '').toLowerCase();
      if (/step\s*1|степ\s*1/.test(n)) return 'step1';
      if (/step\s*2|степ\s*2/.test(n)) return 'step2';
      if (/step\s*3|степ\s*3/.test(n)) return 'step3';
      return 'step1';
    };

    const subjectStep = new Map();
    for (const s of subjects) {
      subjectStep.set(s.id, resolveStep(s));
    }

    const tests = await Test.findAll({
      where: { programType: 'usmle' },
      attributes: ['id', 'name', 'description', 'subjectId', 'isFree'],
      include: [{
        model: Question,
        as: 'Questions',
        attributes: ['id'],
        required: false
      }],
      order: [['name', 'ASC']]
    });

    const lastOutcome = new Map();
    if (userId && tests.length) {
      const rows = await TestResult.findAll({
        where: { userId, testId: { [Op.in]: tests.map((t) => t.id) } },
        attributes: ['results', 'createdAt'],
        order: [['createdAt', 'ASC']]
      });
      for (const row of rows) {
        const r = row.results;
        if (!r || typeof r !== 'object') continue;
        for (const [qid, data] of Object.entries(r)) {
          const id = parseInt(qid, 10);
          if (!Number.isFinite(id)) continue;
          if (data && typeof data.correct === 'boolean') {
            lastOutcome.set(id, data.correct);
          }
        }
      }
    }

    const grouped = { step1: [], step2: [], step3: [] };

    for (const t of tests) {
      const step = subjectStep.get(t.subjectId) || 'step1';
      const qIds = (t.Questions || []).map((q) => q.id);
      let used = 0;
      let correct = 0;
      for (const qId of qIds) {
        if (!lastOutcome.has(qId)) continue;
        used++;
        if (lastOutcome.get(qId) === true) correct++;
      }
      const total = qIds.length;
      const item = {
        id: t.id,
        name: t.name,
        description: t.description || '',
        subjectId: t.subjectId,
        stepGroup: step,
        isFree: !!t.isFree,
        totalQuestions: total,
        usedQuestions: used,
        correctCount: correct,
        percentage: total > 0 ? Math.round((used / total) * 1000) / 10 : 0
      };
      if (grouped[step]) grouped[step].push(item);
      else grouped.step1.push(item);
    }

    res.json(grouped);
  } catch (error) {
    console.error('Ошибка USMLE dashboard:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * Статистика для экрана «Добро пожаловать» USMLE.
 * GET /usmle/welcome-stats?testId=123
 */
router.get('/usmle/welcome-stats', async (req, res) => {
  try {
    const userId = tryGetUserIdFromRequest(req);
    const testId = parseInt(req.query.testId, 10);

    if (!Number.isFinite(testId) || testId <= 0) {
      return res.status(400).json({ error: 'Выберите банк вопросов (testId)' });
    }

    const test = await Test.findByPk(testId, {
      attributes: ['id', 'name', 'programType'],
      include: [{ model: Question, as: 'Questions', attributes: ['id'], required: false }]
    });
    if (!test || test.programType !== 'usmle') {
      return res.status(404).json({ error: 'USMLE банк не найден' });
    }

    const allQuestionIds = new Set((test.Questions || []).map((q) => q.id));
    const lastOutcome = new Map();
    let testsCompleted = 0;

    if (userId) {
      const rows = await TestResult.findAll({
        where: { userId, testId },
        attributes: ['id', 'results', 'score', 'totalQuestions', 'createdAt'],
        order: [['createdAt', 'ASC']]
      });
      testsCompleted = rows.length;
      for (const row of rows) {
        const r = row.results;
        if (!r || typeof r !== 'object') continue;
        for (const [qid, data] of Object.entries(r)) {
          const id = parseInt(qid, 10);
          if (!Number.isFinite(id) || !allQuestionIds.has(id)) continue;
          if (data && typeof data.correct === 'boolean') {
            lastOutcome.set(id, data.correct);
          }
        }
      }
    }

    let used = 0;
    let correct = 0;
    let incorrect = 0;
    for (const qId of allQuestionIds) {
      if (!lastOutcome.has(qId)) continue;
      used++;
      if (lastOutcome.get(qId) === true) correct++;
      else incorrect++;
    }

    const totalQuestions = allQuestionIds.size;
    const unusedQuestions = Math.max(0, totalQuestions - used);
    const correctPct = used > 0 ? Math.round((correct / used) * 1000) / 10 : 0;
    const usedPct = totalQuestions > 0 ? Math.round((used / totalQuestions) * 1000) / 10 : 0;

    res.json({
      testId: test.id,
      testName: test.name,
      totalQuestions,
      usedQuestions: used,
      unusedQuestions,
      correctCount: correct,
      incorrectCount: incorrect,
      omittedCount: 0,
      correctPercent: correctPct,
      usedPercent: usedPct,
      testsCreated: testsCompleted,
      testsCompleted,
      suspendedTests: 0,
      percentileRank: used > 0 ? Math.min(99, Math.max(1, Math.round(correctPct * 0.85))) : 0,
      medianScorePercent: 63,
      requiresAuth: !userId
    });
  } catch (error) {
    console.error('Ошибка USMLE welcome-stats:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * История USMLE-тестов пользователя.
 * GET /usmle/history?testId=123
 */
router.get('/usmle/history', async (req, res) => {
  try {
    const userId = tryGetUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const testId = parseInt(req.query.testId, 10);
    const { USMLE_SUBJECTS } = require('../utils/ensureUsmleTagsSeeded');
    const subjectSet = new Set(USMLE_SUBJECTS.map((s) => s.toLowerCase()));

    const where = { userId };
    const testWhere = { programType: 'usmle' };
    if (Number.isFinite(testId) && testId > 0) {
      where.testId = testId;
      testWhere.id = testId;
    }

    const rows = await TestResult.findAll({
      where,
      include: [{
        model: Test,
        as: 'Test',
        required: true,
        where: testWhere,
        attributes: ['id', 'name', 'programType']
      }],
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    const items = rows.map((row) => {
      const json = row.toJSON();
      const pct = json.totalQuestions > 0
        ? Math.round((json.score / json.totalQuestions) * 100)
        : 0;
      const tagNames = new Set();
      const questions = Array.isArray(json.questions) ? json.questions : [];
      for (const q of questions) {
        for (const t of q.Tags || []) {
          if (t && t.name) tagNames.add(t.name);
        }
      }
      const tags = [...tagNames];
      const subjects = tags.filter((n) => subjectSet.has(String(n).toLowerCase()));
      const systems = tags.filter((n) => !subjectSet.has(String(n).toLowerCase()));

      return {
        id: json.id,
        testId: json.testId,
        testName: json.Test?.name || 'USMLE тест',
        score: json.score,
        totalQuestions: json.totalQuestions,
        percentage: pct,
        timeSpent: json.timeSpent || null,
        createdAt: json.createdAt,
        subjectsLabel: subjects.length === 1 ? subjects[0] : (subjects.length > 1 ? 'Несколько' : '—'),
        systemsLabel: systems.length === 1 ? systems[0] : (systems.length > 1 ? 'Несколько' : '—'),
        mode: 'Стандарт'
      };
    });

    res.json({ items, testId: Number.isFinite(testId) ? testId : null });
  } catch (error) {
    console.error('Ошибка USMLE history:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * Теги USMLE сгруппированные по категориям (для конструктора тестов).
 * Возвращает { subjects: [...], systems: [...] }
 */
router.get('/usmle/tags/grouped', async (req, res) => {
  try {
    const testId = parseInt(req.query.testId, 10);

    const tags = await QuestionTag.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'slug'],
      order: [['name', 'ASC']]
    });

    let allowedQuestionIds = null;
    if (Number.isFinite(testId) && testId > 0) {
      const test = await Test.findByPk(testId, {
        attributes: ['id', 'programType', 'name'],
        include: [{ model: Question, as: 'Questions', attributes: ['id'], required: false }]
      });
      if (!test || test.programType !== 'usmle') {
        return res.status(404).json({ error: 'USMLE тест не найден' });
      }
      allowedQuestionIds = new Set((test.Questions || []).map((q) => q.id));
    } else {
      const usmleQuestions = await Question.findAll({
        attributes: ['id'],
        include: [{
          model: Test,
          as: 'Test',
          attributes: [],
          required: true,
          where: { programType: 'usmle' }
        }],
        raw: true
      });
      allowedQuestionIds = new Set(usmleQuestions.map((q) => q.id));
    }

    const maps = await QuestionTagMap.findAll({
      attributes: ['tagId', 'questionId'],
      raw: true
    });
    /** @type {Map<number, number[]>} */
    const idsByTag = new Map();
    for (const m of maps) {
      if (!allowedQuestionIds.has(m.questionId)) continue;
      const tid = Number(m.tagId);
      const qid = Number(m.questionId);
      if (!idsByTag.has(tid)) idsByTag.set(tid, []);
      idsByTag.get(tid).push(qid);
    }

    const { USMLE_SUBJECTS } = require('../utils/ensureUsmleTagsSeeded');
    const SUBJECTS = new Set(USMLE_SUBJECTS.map(s => s.toLowerCase()));

    const subjects = [];
    const systems = [];

    for (const tag of tags) {
      const questionIds = idsByTag.get(tag.id) || [];
      const item = {
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        questionCount: questionIds.length,
        // Для кросс-фильтрации счётчиков Subjects ↔ Systems в конструкторе
        questionIds
      };
      if (SUBJECTS.has(tag.name.toLowerCase())) {
        subjects.push(item);
      } else {
        systems.push(item);
      }
    }

    let testMeta = null;
    if (Number.isFinite(testId) && testId > 0) {
      try {
        const t = await Test.findByPk(testId, {
          attributes: ['id', 'name', 'subjectId'],
          include: [{ model: Subject, as: 'Subject', attributes: ['id', 'name', 'stepGroup'], required: false }]
        });
        if (t) {
          testMeta = {
            id: t.id,
            name: t.name,
            subjectId: t.subjectId,
            subjectName: t.Subject?.name || '',
            stepGroup: t.Subject?.stepGroup || null
          };
        }
      } catch {
        const t = await Test.findByPk(testId, {
          attributes: ['id', 'name', 'subjectId'],
          include: [{ model: Subject, as: 'Subject', attributes: ['id', 'name'], required: false }]
        });
        if (t) {
          testMeta = {
            id: t.id,
            name: t.name,
            subjectId: t.subjectId,
            subjectName: t.Subject?.name || '',
            stepGroup: null
          };
        }
      }
    }

    res.json({ subjects, systems, test: testMeta });
  } catch (error) {
    console.error('Ошибка получения тегов USMLE grouped:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * Получить вопросы из конкретного USMLE-теста по тегам.
 * POST /usmle/custom-test/questions
 * Body: { testId, subjectTagIds, systemTagIds, questionCount, questionMode, randomizeAnswers, instantFeedbackMode }
 */
router.post('/usmle/custom-test/questions', async (req, res) => {
  try {
    const userId = tryGetUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const user = await User.findByPk(userId, {
      attributes: ['id', 'usmleSubscriptionEndDate']
    });
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const {
      testId: rawTestId,
      subjectTagIds = [],
      systemTagIds = [],
      questionCount = 40,
      questionMode = 'unsolved',
      randomizeAnswers = true,
      instantFeedbackMode = false
    } = req.body || {};

    const testId = parseInt(rawTestId, 10);
    if (!Number.isFinite(testId) || testId <= 0) {
      return res.status(400).json({ error: 'Выберите тест (testId обязателен)' });
    }

    const test = await Test.findByPk(testId, {
      attributes: ['id', 'name', 'programType', 'isFree', 'subjectId']
    });
    if (!test || test.programType !== 'usmle') {
      return res.status(404).json({ error: 'USMLE тест не найден' });
    }

    if (!test.isFree && !isSubscriptionActive(user.usmleSubscriptionEndDate)) {
      return res.status(403).json({ error: 'Требуется активная подписка USMLE' });
    }

    const subjectIds = [...new Set((Array.isArray(subjectTagIds) ? subjectTagIds : []).map(Number).filter((n) => n > 0))];
    const systemIds = [...new Set((Array.isArray(systemTagIds) ? systemTagIds : []).map(Number).filter((n) => n > 0))];

    // Все вопросы этого теста
    const testQuestions = await Question.findAll({
      where: { testId },
      attributes: ['id'],
      raw: true
    });
    let candidateIds = testQuestions.map((q) => q.id);

    if (!candidateIds.length) {
      return res.json([]);
    }

    const getQIdsByTags = async (tagIds) => {
      if (!tagIds.length) return null;
      const maps = await QuestionTagMap.findAll({
        where: {
          tagId: { [Op.in]: tagIds },
          questionId: { [Op.in]: candidateIds }
        },
        attributes: ['questionId'],
        raw: true
      });
      return new Set(maps.map((m) => m.questionId));
    };

    if (subjectIds.length || systemIds.length) {
      const subjectSet = await getQIdsByTags(subjectIds);
      const systemSet = await getQIdsByTags(systemIds);

      let combinedSet;
      if (subjectSet && systemSet) {
        combinedSet = new Set([...subjectSet].filter((id) => systemSet.has(id)));
      } else {
        combinedSet = subjectSet || systemSet || new Set();
      }
      candidateIds = [...combinedSet];
    }

    if (!candidateIds.length) {
      return res.json([]);
    }

    let questionIds = candidateIds;
    if (questionMode && questionMode !== 'all') {
      const lastOutcome = new Map();
      const rows = await TestResult.findAll({
        where: { userId, testId },
        attributes: ['results', 'createdAt'],
        order: [['createdAt', 'ASC']]
      });
      for (const row of rows) {
        const r = row.results;
        if (!r || typeof r !== 'object') continue;
        for (const [qid, data] of Object.entries(r)) {
          const id = parseInt(qid, 10);
          if (!Number.isFinite(id)) continue;
          if (data && typeof data.correct === 'boolean') {
            lastOutcome.set(id, data.correct);
          }
        }
      }

      const pool = [];
      for (const qId of questionIds) {
        const outcome = lastOutcome.get(qId);
        if (questionMode === 'unsolved' && outcome === undefined) pool.push(qId);
        else if (questionMode === 'solved' && outcome !== undefined) pool.push(qId);
        else if (questionMode === 'correct' && outcome === true) pool.push(qId);
        else if (questionMode === 'incorrect' && outcome === false) pool.push(qId);
      }
      questionIds = pool;
    }

    if (!questionIds.length) {
      return res.json([]);
    }

    const candidateRows = await Question.findAll({
      where: { id: { [Op.in]: questionIds } },
      attributes: ['id', 'text', 'createdAt']
    });
    const limit = Math.min(Math.max(parseInt(questionCount, 10) || 40, 1), candidateRows.length);
    const ordered = pickQuestionsKeepingLinkedOrder(candidateRows, limit, { shuffleGroups: true });
    const shuffled = ordered.map((q) => q.id);

    const questions = await Question.findAll({
      where: { id: { [Op.in]: shuffled } },
      include: [{ model: Answer, as: 'Answers' }, tagsInclude()]
    });

    const qMap = new Map(questions.map((q) => [q.id, q]));
    const wantRandom = randomizeAnswers !== false && randomizeAnswers !== 'false';

    const result = shuffled.map((id) => {
      const q = qMap.get(id);
      if (!q) return null;
      const qj = q.toJSON();
      let answers = [...(qj.Answers || [])];
      if (wantRandom) {
        for (let i = answers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [answers[i], answers[j]] = [answers[j], answers[i]];
        }
      }

      return {
        id: qj.id,
        text: qj.text,
        testId: qj.testId,
        testName: test.name,
        imageUrl: firstImageUrl(qj.imageUrl),
        imageUrls: parseImageUrls(qj.imageUrl),
        Tags: (qj.Tags || []).map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
        ...(instantFeedbackMode ? {
          explanation: qj.explanation || null,
          explanationImageUrl: firstImageUrl(qj.explanationImageUrl),
          explanationImageUrls: parseImageUrls(qj.explanationImageUrl)
        } : {}),
        Answers: answers.map((a) => ({
          id: a.id,
          text: a.text,
          ...(firstImageUrl(a.imageUrl) ? {
            imageUrl: firstImageUrl(a.imageUrl),
            imageUrls: parseImageUrls(a.imageUrl)
          } : {}),
          isCorrect: Boolean(a.isCorrect)
        }))
      };
    }).filter(Boolean);

    res.json(result);
  } catch (error) {
    console.error('Ошибка USMLE custom test:', error);
    res.status(500).json({
      error: 'Ошибка сервера',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/** Теги USMLE (для фильтрации) */
router.get('/usmle/tags', async (req, res) => {
  try {
    const tags = await QuestionTag.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'slug'],
      order: [['name', 'ASC']]
    });
    res.json(tags);
  } catch (error) {
    console.error('Ошибка получения тегов USMLE:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** USMLE Flashcards */
router.get('/usmle/flashcards', async (req, res) => {
  try {
    const where = { isActive: true };
    const testId = parseInt(req.query.testId, 10);
    const tagId = parseInt(req.query.tagId, 10);
    const stepGroup = String(req.query.stepGroup || req.query.step || '').trim();

    if (Number.isFinite(testId) && testId > 0) where.testId = testId;
    if (['step1', 'step2', 'step3'].includes(stepGroup)) where.stepGroup = stepGroup;

    const include = [{
      model: QuestionTag,
      as: 'Tags',
      attributes: ['id', 'name', 'slug'],
      through: { attributes: [] },
      required: false
    }];

    if (Number.isFinite(tagId) && tagId > 0) {
      include[0].where = { id: tagId };
      include[0].required = true;
    }

    const rows = await Flashcard.findAll({
      where,
      include,
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    });

    res.json(rows.map((row) => {
      const json = row.toJSON();
      json.backHtml = buildHighlightHtml(json.frontText, json.backText);
      return json;
    }));
  } catch (error) {
    console.error('Ошибка USMLE flashcards:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * Тесты USMLE, в которых есть вопросы с выбранными тегами.
 * ?tagIds=1,2,3 — все выбранные теги (AND) или mode=or
 */
router.get('/usmle/tests-by-tags', async (req, res) => {
  try {
    const tagIds = String(req.query.tagIds || '')
      .split(',')
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (!tagIds.length) {
      return res.json([]);
    }

    const maps = await QuestionTagMap.findAll({
      where: { tagId: { [Op.in]: tagIds } },
      attributes: ['questionId', 'tagId'],
      raw: true
    });

    const mode = String(req.query.mode || 'or').toLowerCase() === 'and' ? 'and' : 'or';
    let questionIds;
    if (mode === 'and') {
      const byQ = new Map();
      for (const m of maps) {
        if (!byQ.has(m.questionId)) byQ.set(m.questionId, new Set());
        byQ.get(m.questionId).add(m.tagId);
      }
      questionIds = [...byQ.entries()]
        .filter(([, set]) => tagIds.every((id) => set.has(id)))
        .map(([qid]) => qid);
    } else {
      questionIds = [...new Set(maps.map((m) => m.questionId))];
    }

    if (!questionIds.length) {
      return res.json([]);
    }

    const questions = await Question.findAll({
      where: { id: { [Op.in]: questionIds } },
      attributes: ['id', 'testId'],
      raw: true
    });
    const testIds = [...new Set(questions.map((q) => q.testId))];

    const tests = await Test.findAll({
      where: {
        id: { [Op.in]: testIds },
        programType: 'usmle'
      },
      include: [{
        model: Question,
        as: 'Questions',
        attributes: ['id'],
        required: false
      }, {
        model: Subject,
        as: 'Subject',
        attributes: ['id', 'name'],
        required: false
      }],
      order: [['name', 'ASC']]
    });

    res.json(tests);
  } catch (error) {
    console.error('Ошибка фильтра тестов USMLE по тегам:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

async function assertUserCanAccessSubject(subjectId, req) {
  const subject = await Subject.findByPk(subjectId, {
    attributes: ['id', 'name', 'universityId', 'programType']
  });
  if (!subject) {
    return { ok: false, status: 404, error: 'Предмет не найден' };
  }

  if ((subject.programType || 'university') === 'usmle') {
    return { ok: true, subject };
  }

  const universityId = await resolveUserUniversityId(req);
  if (!universityId) return { ok: true, subject };

  if (subject.universityId && Number(subject.universityId) !== Number(universityId)) {
    return { ok: false, status: 403, error: 'Этот предмет относится к другому университету' };
  }
  return { ok: true, subject };
}

// Получить тесты по предмету
router.get('/subjects/:subjectId/tests', async (req, res) => {
  try {
    const access = await assertUserCanAccessSubject(req.params.subjectId, req);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const subject = access.subject || await Subject.findByPk(req.params.subjectId);
    const programType = subject?.programType || 'university';
    const where = { subjectId: req.params.subjectId, programType };

    if (programType === 'university') {
      const universityId = await resolveUserUniversityId(req);
      if (universityId) where.universityId = universityId;
    }

    let tests = await Test.findAll({
      where,
      include: [{
        model: Question,
        as: 'Questions',
        attributes: ['id'],
        required: false
      }, universityInclude()],
      order: [['createdAt', 'DESC']]
    });

    // Доп. фильтр USMLE по тегам вопросов: ?tagIds=1,2
    const tagIds = String(req.query.tagIds || '')
      .split(',')
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (programType === 'usmle' && tagIds.length) {
      const maps = await QuestionTagMap.findAll({
        where: { tagId: { [Op.in]: tagIds } },
        attributes: ['questionId'],
        raw: true
      });
      const qIds = [...new Set(maps.map((m) => m.questionId))];
      if (!qIds.length) {
        return res.json([]);
      }
      const taggedQuestions = await Question.findAll({
        where: { id: { [Op.in]: qIds } },
        attributes: ['testId'],
        raw: true
      });
      const allowedTestIds = new Set(taggedQuestions.map((q) => q.testId));
      tests = tests.filter((t) => allowedTestIds.has(t.id));
    }

    res.json(tests);
  } catch (error) {
    console.error('Ошибка получения тестов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить только бесплатные тесты по предмету (для неавторизованных)
router.get('/subjects/:subjectId/tests/free', async (req, res) => {
  try {
    const access = await assertUserCanAccessSubject(req.params.subjectId, req);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const subject = access.subject || await Subject.findByPk(req.params.subjectId);
    const programType = subject?.programType || 'university';
    const where = {
      subjectId: req.params.subjectId,
      isFree: true,
      programType
    };
    if (programType === 'university') {
      const universityId = await resolveUserUniversityId(req);
      if (universityId) where.universityId = universityId;
    }

    const tests = await Test.findAll({
      where,
      include: [{
        model: Question,
        as: 'Questions',
        attributes: ['id'],
        required: false
      }, universityInclude()],
      order: [['createdAt', 'DESC']]
    });
    res.json(tests);
  } catch (error) {
    console.error('Ошибка получения бесплатных тестов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Счётчики режимов вопросов (и всего вопросов в тесте); с JWT — персональные, без — только totalQuestions
router.get('/tests/:testId/progress', async (req, res) => {
  try {
    const testId = parseInt(req.params.testId, 10);
    if (!Number.isFinite(testId)) {
      return res.status(400).json({ error: 'Некорректный тест' });
    }

    const testExists = await Test.findByPk(testId, { attributes: ['id'] });
    if (!testExists) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    let userId = tryGetUserIdFromRequest(req);
    if (userId) {
      const user = await User.findByPk(userId, { attributes: ['id'] });
      if (!user) userId = null;
    }

    const state = await getTestQuestionProgressState(testId, userId);
    res.json({
      totalQuestions: state.totalQuestions,
      solved: state.solved,
      unsolved: state.unsolved,
      correct: state.correct,
      incorrect: state.incorrect,
      favorites: state.favorites
    });
  } catch (error) {
    console.error('Ошибка прогресса по тесту:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить конкретный тест
router.get('/tests/:testId', async (req, res) => {
  console.log(`📥 GET /tests/${req.params.testId} - Запрос полного теста`);
  try {
    const test = await Test.findByPk(req.params.testId, {
      include: [{
        model: Question,
        as: 'Questions',
        include: [{
          model: Answer,
          as: 'Answers'
          // Убираем явное указание attributes - Sequelize должен вернуть все поля
        }],
        separate: true,
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
      }, universityInclude()]
    });

    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    const access = await assertUserCanAccessTest(test, req);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    // Преобразуем в JSON и убеждаемся, что isCorrect присутствует
    const testData = test.toJSON();
    
    // Явно проверяем и нормализуем isCorrect для всех ответов
    // ВАЖНО: Делаем это ПОСЛЕ toJSON(), чтобы получить чистые данные
    if (testData.Questions) {
      testData.Questions.forEach(q => {
        if (q.Answers && Array.isArray(q.Answers)) {
          q.Answers.forEach(a => {
            // Нормализуем isCorrect: PostgreSQL может вернуть boolean, 't'/'f', или null
            // Но в базе данных это boolean, так что просто проверяем наличие
            if (a.isCorrect === undefined || a.isCorrect === null) {
              console.warn(`⚠️ Answer ${a.id} has undefined/null isCorrect, setting to false`);
              a.isCorrect = false;
            } else {
              // Убеждаемся, что это boolean
              a.isCorrect = Boolean(a.isCorrect);
            }
          });
        }
      });
      testData.Questions = pickQuestionsKeepingLinkedOrder(
        testData.Questions,
        testData.Questions.length,
        { shuffleGroups: false }
      );
    }
    
    // Логируем для отладки - проверяем формат isCorrect для всех вопросов
    if (testData.Questions && testData.Questions.length > 0) {
      console.log(`📊 Загружен тест ${testData.id}, всего вопросов: ${testData.Questions.length}`);
      
      testData.Questions.forEach((q, idx) => {
        if (idx < 5 && q.Answers && q.Answers.length > 0) { // Логируем первые 5 вопросов
          const correctAnswers = q.Answers.filter(a => a.isCorrect === true);
          const hasCorrect = correctAnswers.length > 0;
          
          console.log(`🔍 Question ${q.id} (${idx + 1}/${testData.Questions.length}):`, {
            questionId: q.id,
            questionText: q.text?.substring(0, 50),
            hasCorrectAnswer: hasCorrect,
            correctAnswersCount: correctAnswers.length,
            answersCount: q.Answers.length,
            answers: q.Answers.map(a => ({
              id: a.id,
              isCorrect: a.isCorrect,
              isCorrectType: typeof a.isCorrect,
              isCorrectValue: a.isCorrect,
              isCorrectStringified: String(a.isCorrect),
              isCorrectDefined: a.isCorrect !== undefined && a.isCorrect !== null,
              text: a.text?.substring(0, 30)
            }))
          });
          
          if (!hasCorrect) {
            console.error(`❌ ВНИМАНИЕ: Question ${q.id} не имеет правильных ответов после нормализации!`);
          }
        }
      });
    }

    res.json(testData);
  } catch (error) {
    console.error('Ошибка получения теста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить вопросы для теста (с настройками)
// Для бесплатных тестов авторизация не требуется
router.post('/tests/:testId/questions', async (req, res) => {
  try {
    const { questionCount, randomizeAnswers, instantFeedbackMode, questionFilters } = req.body;
    const test = await Test.findByPk(req.params.testId, {
      include: [{
        model: Question,
        as: 'Questions',
        include: [{
          model: Answer,
          as: 'Answers'
        }, tagsInclude()],
        separate: true,
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
      }]
    });

    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    const access = await assertUserCanAccessTest(test, req);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const paid = await assertPaidAccess(test, req);
    if (!paid.ok) {
      return res.status(paid.status).json({ error: paid.error });
    }

    let filterUserId = tryGetUserIdFromRequest(req);
    if (filterUserId) {
      const filterUser = await User.findByPk(filterUserId, { attributes: ['id'] });
      if (!filterUser) filterUserId = null;
    }

    // Преобразуем в JSON сразу, чтобы избежать циклических ссылок
    let questions = test.Questions.map(q => q.toJSON());

    if (questionFilters && typeof questionFilters === 'object') {
      const hasAny = !!(questionFilters.all || questionFilters.unsolved || questionFilters.solved
        || questionFilters.correct || questionFilters.incorrect || questionFilters.favorites);
      if (!hasAny) {
        return res.status(400).json({ error: 'Выберите хотя бы один режим вопросов' });
      }
      const state = await getTestQuestionProgressState(req.params.testId, filterUserId);
      const pool = buildQuestionFilterPool(questionFilters, state);
      if (pool.size === 0) {
        return res.status(400).json({ error: 'Нет вопросов по выбранным режимам' });
      }
      questions = questions.filter((q) => pool.has(q.id));
    }

    // Ограничение количества: перемешиваются блоки, связанные вопросы остаются подряд в порядке TXT
    const limit = typeof questionCount === 'number' ? questionCount : parseInt(String(questionCount ?? ''), 10);
    if (Number.isFinite(limit) && limit > 0 && questions.length > limit) {
      questions = pickQuestionsKeepingLinkedOrder(questions, limit, { shuffleGroups: true });
    } else {
      questions = pickQuestionsKeepingLinkedOrder(questions, questions.length, { shuffleGroups: false });
    }

    const mapQuestionForClient = (q, answersList) => {
      const row = {
        id: q.id,
        text: q.text,
        testId: q.testId,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        Answers: (answersList || []).map((a) => {
          const answerData = { id: a.id, text: a.text };
          const answerImageUrls = parseImageUrls(a.imageUrl);
          if (answerImageUrls.length) {
            answerData.imageUrl = answerImageUrls[0];
            answerData.imageUrls = answerImageUrls;
          }
          if (instantFeedbackMode) {
            answerData.isCorrect = Boolean(a.isCorrect);
          }
          return answerData;
        })
      };
      // В режиме «Ответы сразу» отдаём объяснения для показа после выбора ответа
      if (instantFeedbackMode) {
        if (q.explanation && String(q.explanation).trim()) {
          row.explanation = String(q.explanation).trim();
        }
        const explanationImageUrls = parseImageUrls(q.explanationImageUrl);
        if (explanationImageUrls.length) {
          row.explanationImageUrl = explanationImageUrls[0];
          row.explanationImageUrls = explanationImageUrls;
        }
      }
      const questionImageUrls = parseImageUrls(q.imageUrl);
      if (questionImageUrls.length) {
        row.imageUrl = questionImageUrls[0];
        row.imageUrls = questionImageUrls;
      }
      return row;
    };

    // Случайный порядок ответов
    if (randomizeAnswers) {
      questions = questions.map((q) => {
        const answers = [...(q.Answers || [])].sort(() => Math.random() - 0.5);
        return mapQuestionForClient(q, answers);
      });
    } else {
      questions = questions.map((q) => mapQuestionForClient(q, q.Answers || []));
    }

    res.json(questions);
  } catch (error) {
    console.error('Ошибка получения вопросов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка ответов
// Для бесплатных тестов авторизация не требуется
router.post('/tests/:testId/check', async (req, res) => {
  // КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ - должно появиться в любом случае
  let userId = null;
  let isFreeTest = false;
  
  try {
    // Сначала проверяем, является ли тест бесплатным
    const test = await Test.findByPk(req.params.testId);
    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }
    
    isFreeTest = test.isFree;

    const access = await assertUserCanAccessTest(test, req);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const paid = await assertPaidAccess(test, req);
    if (!paid.ok) {
      return res.status(paid.status).json({ error: paid.error });
    }
    if (paid.user) userId = paid.user.id;
  } catch (error) {
    return res.status(500).json({ error: 'Ошибка проверки доступа' });
  }
  
  const logMsg = `\n=== CHECK TEST START ===\nTest ID: ${req.params.testId}\nIs Free: ${isFreeTest}\nUser ID: ${userId || 'anonymous'}\nQuestions: ${req.body.questionIds?.length || 0}\nAnswers: ${Object.keys(req.body.answers || {}).length}\n=======================\n`;
  
  // Пробуем все способы логирования
  console.error(logMsg); // stderr всегда выводится
  process.stderr.write(logMsg); // Явный вывод в stderr
  process.stdout.write(logMsg); // Явный вывод в stdout
  
  console.log(`📥 POST /tests/${req.params.testId}/check - Проверка ответов`, {
    userId: userId || 'anonymous',
    isFreeTest,
    questionsCount: req.body.questionIds?.length || 0,
    answersCount: Object.keys(req.body.answers || {}).length
  });
  
  try {
    const { answers, questionIds } = req.body; // { questionId: answerId }, [questionIds]
    const test = await Test.findByPk(req.params.testId, {
      include: [{
        model: Question,
        as: 'Questions',
        include: [{
          model: Answer,
          as: 'Answers'
          // Убираем явное указание attributes - Sequelize должен вернуть все поля
        }]
      }]
    });
    
    // Нормализуем isCorrect для всех ответов перед проверкой
    if (test && test.Questions) {
      test.Questions.forEach(q => {
        if (q.Answers) {
          q.Answers.forEach(a => {
            // Нормализуем isCorrect: PostgreSQL может вернуть boolean, 't'/'f', или null
            const rawValue = a.get ? a.get('isCorrect') : a.isCorrect;
            if (rawValue === undefined || rawValue === null) {
              a.isCorrect = false;
            } else if (typeof rawValue === 'string') {
              a.isCorrect = rawValue.toLowerCase().trim() === 't' || rawValue.toLowerCase().trim() === 'true' || rawValue === '1';
            } else if (typeof rawValue === 'number') {
              a.isCorrect = rawValue === 1;
            } else {
              a.isCorrect = Boolean(rawValue);
            }
          });
        }
      });
    }

    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    // Если указаны конкретные вопросы, проверяем только их
    const questionsToCheck = questionIds 
      ? test.Questions.filter(q => questionIds.includes(q.id))
      : test.Questions;

    let correctCount = 0;
    const results = {};

    questionsToCheck.forEach(question => {
      const userAnswerId = answers[question.id];
      // Ищем правильный ответ с нормализацией isCorrect
      let correctAnswer = null;
      
      // Логируем все ответы для отладки - проверяем ДО нормализации
      console.log(`🔍 Checking question ${question.id} (ДО нормализации):`, {
        userAnswerId: userAnswerId,
        userAnswerIdType: typeof userAnswerId,
        answersCount: question.Answers.length,
        answers: question.Answers.map(a => {
          const rawValue = a.getDataValue ? a.getDataValue('isCorrect') : a.isCorrect;
          return {
            id: a.id,
            idType: typeof a.id,
            isCorrect: a.isCorrect,
            rawIsCorrect: rawValue,
            isCorrectType: typeof a.isCorrect,
            rawIsCorrectType: typeof rawValue,
            text: a.text?.substring(0, 50)
          };
        })
      });
      
      for (const answer of question.Answers) {
        // Получаем isCorrect разными способами (на случай проблем с Sequelize)
        let rawIsCorrect = answer.isCorrect;
        if (rawIsCorrect === undefined && answer.getDataValue) {
          rawIsCorrect = answer.getDataValue('isCorrect');
        }
        if (rawIsCorrect === undefined && answer.get) {
          rawIsCorrect = answer.get('isCorrect');
        }
        
        // Нормализуем isCorrect: проверяем разные форматы
        // PostgreSQL может возвращать boolean как true/false, 't'/'f', 1/0, или как строку
        let isCorrect = false;
        
        // Проверяем различные форматы boolean
        if (rawIsCorrect === true) {
          isCorrect = true;
        } else if (rawIsCorrect === false || rawIsCorrect === null || rawIsCorrect === undefined) {
          isCorrect = false;
        } else if (rawIsCorrect === 1 || rawIsCorrect === '1') {
          isCorrect = true;
        } else if (rawIsCorrect === 0 || rawIsCorrect === '0') {
          isCorrect = false;
        } else if (typeof rawIsCorrect === 'string') {
          const str = rawIsCorrect.toLowerCase().trim();
          isCorrect = str === 'true' || str === 't' || str === '1';
        } else if (typeof rawIsCorrect === 'boolean') {
          isCorrect = rawIsCorrect;
        }
        
        if (isCorrect) {
          correctAnswer = answer;
          console.log(`✅ Found correct answer for question ${question.id}:`, {
            answerId: answer.id,
            answerIdType: typeof answer.id,
            rawIsCorrect: rawIsCorrect,
            isCorrectType: typeof rawIsCorrect,
            normalizedIsCorrect: isCorrect
          });
          break;
        }
      }
      
      // Если правильный ответ не найден, логируем предупреждение
      if (!correctAnswer) {
        console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: No correct answer found for question ${question.id}!`, {
          questionId: question.id,
          questionText: question.text?.substring(0, 100),
          answersCount: question.Answers.length,
          allAnswers: question.Answers.map(a => {
            const rawValue = a.getDataValue ? a.getDataValue('isCorrect') : a.isCorrect;
            return { 
              id: a.id, 
              isCorrect: a.isCorrect,
              rawIsCorrect: rawValue,
              isCorrectType: typeof a.isCorrect,
              rawIsCorrectType: typeof rawValue,
              text: a.text?.substring(0, 50) 
            };
          })
        });
      }
      
      // Нормализуем ID для сравнения (обеспечиваем, что оба числа)
      const normalizedUserAnswerId = userAnswerId ? parseInt(String(userAnswerId)) : null;
      const normalizedCorrectAnswerId = correctAnswer ? parseInt(String(correctAnswer.id)) : null;
      
      console.log(`📊 Comparison for question ${question.id}:`, {
        normalizedUserAnswerId,
        normalizedCorrectAnswerId,
        match: normalizedUserAnswerId === normalizedCorrectAnswerId
      });
      
      if (normalizedUserAnswerId && normalizedCorrectAnswerId && normalizedUserAnswerId === normalizedCorrectAnswerId) {
        correctCount++;
        results[question.id] = { correct: true, answerId: normalizedCorrectAnswerId, correctAnswerId: normalizedCorrectAnswerId };
        console.log(`✅ Question ${question.id}: CORRECT`);
      } else {
        results[question.id] = { 
          correct: false, 
          userAnswerId: normalizedUserAnswerId,
          correctAnswerId: normalizedCorrectAnswerId
        };
        console.log(`❌ Question ${question.id}: INCORRECT`, {
          userAnswerId: normalizedUserAnswerId,
          correctAnswerId: normalizedCorrectAnswerId
        });
      }
    });

    res.json({
      score: correctCount,
      total: questionsToCheck.length,
      percentage: Math.round((correctCount / questionsToCheck.length) * 100),
      results
    });
  } catch (error) {
    console.error('Ошибка проверки ответов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

