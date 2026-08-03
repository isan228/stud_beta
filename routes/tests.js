const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { Test, Question, Answer, Subject, Favorite, TestResult, User, University, QuestionTag, QuestionTagMap } = require('../models');
const { Op } = require('sequelize');
const { isSubscriptionActive } = require('../utils/subscriptionPlans');

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

    if (programType === 'university') {
      const universityId = await resolveUserUniversityId(req);
      if (universityId) {
        where.universityId = universityId;
      }
    } else {
      where.universityId = null;
    }

    let subjects = await Subject.findAll({
      where,
      order: [['name', 'ASC']],
      include: [universityInclude()]
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

    res.json(subjects);
  } catch (error) {
    console.error('Ошибка получения предметов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
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
        }]
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
        }, tagsInclude()]
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

    // Ограничение количества вопросов (лимит из настроек; раньше с клиента при «Ответы сразу» приходил null — тогда отдавались все вопросы)
    const limit = typeof questionCount === 'number' ? questionCount : parseInt(String(questionCount ?? ''), 10);
    if (Number.isFinite(limit) && limit > 0 && questions.length > limit) {
      questions = questions.sort(() => Math.random() - 0.5).slice(0, limit);
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
          if (a.imageUrl && String(a.imageUrl).trim()) {
            answerData.imageUrl = String(a.imageUrl).trim();
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
        if (q.explanationImageUrl && String(q.explanationImageUrl).trim()) {
          row.explanationImageUrl = String(q.explanationImageUrl).trim();
        }
      }
      if (q.imageUrl && String(q.imageUrl).trim()) {
        row.imageUrl = String(q.imageUrl).trim();
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

