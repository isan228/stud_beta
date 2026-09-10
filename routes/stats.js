const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { UserStats, TestResult, Test, Subject, User, Question, University, Faculty } = require('../models');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');

function parseOptionalUserId(req) {
  const authHeader = req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.userId || null;
  } catch (_) {
    return null;
  }
}

function buildLeaderboardFromRows(rows) {
  const byUser = new Map();
  rows.forEach((row) => {
    const userId = row.User?.id || row.userId;
    if (!userId) return;
    const prev = byUser.get(userId) || {
      userId,
      username: row.User?.username || '—',
      correctAnswers: 0,
      totalQuestionsAnswered: 0,
      totalTestsCompleted: 0
    };
    prev.correctAnswers += Number(row.score) || 0;
    prev.totalQuestionsAnswered += Number(row.totalQuestions) || 0;
    prev.totalTestsCompleted += 1;
    byUser.set(userId, prev);
  });

  return Array.from(byUser.values())
    .sort((a, b) => {
      if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
      if (b.totalQuestionsAnswered !== a.totalQuestionsAnswered) {
        return b.totalQuestionsAnswered - a.totalQuestionsAnswered;
      }
      if (b.totalTestsCompleted !== a.totalTestsCompleted) {
        return b.totalTestsCompleted - a.totalTestsCompleted;
      }
      return String(a.username).localeCompare(String(b.username), 'ru');
    })
    .map((item, index) => ({
      rank: index + 1,
      userId: item.userId,
      username: item.username,
      correctAnswers: item.correctAnswers,
      totalQuestionsAnswered: item.totalQuestionsAnswered,
      totalTestsCompleted: item.totalTestsCompleted,
      accuracy: item.totalQuestionsAnswered > 0
        ? Math.round((item.correctAnswers / item.totalQuestionsAnswered) * 100)
        : 0
    }));
}

// Публичная статистика платформы для главной страницы
router.get('/platform', async (req, res) => {
  try {
    const [questionsCount, subjectsCount, testsCount] = await Promise.all([
      Question.count(),
      Subject.count(),
      Test.count()
    ]);

    res.json({
      questionsCount,
      subjectsCount,
      testsCount
    });
  } catch (error) {
    console.error('Ошибка получения публичной статистики платформы:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить статистику пользователя
router.get('/stats', auth, async (req, res) => {
  try {
    let stats = await UserStats.findOne({ where: { userId: req.user.id } });

    if (!stats) {
      stats = await UserStats.create({ userId: req.user.id });
    }

    // Обновление стрика
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastActivity = stats.lastActivityDate ? new Date(stats.lastActivityDate) : null;

    if (lastActivity) {
      lastActivity.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today - lastActivity) / (1000 * 60 * 60 * 24));

      if (daysDiff === 1) {
        // Продолжение стрика
        stats.currentStreak += 1;
        if (stats.currentStreak > stats.longestStreak) {
          stats.longestStreak = stats.currentStreak;
        }
      } else if (daysDiff > 1) {
        // Стрик прерван
        stats.currentStreak = 1;
      }
    } else {
      stats.currentStreak = 1;
    }

    stats.lastActivityDate = today;
    await stats.save();

    // Получение последних результатов с информацией о тестах
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
    const recentResults = await TestResult.findAll({
      where: { userId: req.user.id },
      include: [{
        model: require('../models').Test,
        as: 'Test',
        required: false,
        include: [{
          model: require('../models').Subject,
          as: 'Subject',
          required: false
        }]
      }],
      order: [['createdAt', 'DESC']],
      limit
    });
    
    console.log(`Загружено результатов для пользователя ${req.user.id}: ${recentResults.length}`);

    res.json({
      stats: {
        totalTestsCompleted: stats.totalTestsCompleted,
        totalQuestionsAnswered: stats.totalQuestionsAnswered,
        correctAnswers: stats.correctAnswers,
        accuracy: stats.totalQuestionsAnswered > 0 
          ? Math.round((stats.correctAnswers / stats.totalQuestionsAnswered) * 100) 
          : 0,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak
      },
      recentResults
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сохранить результат теста
router.post('/stats/test-result', auth, async (req, res) => {
  try {
    const { testId, score, totalQuestions, timeSpent, answers, questions, results } = req.body;

    // Сохранение результата
    const result = await TestResult.create({
      userId: req.user.id,
      testId,
      score,
      totalQuestions,
      timeSpent,
      answers,
      questions: questions || null,
      results: results || null
    });

    // Обновление статистики
    let stats = await UserStats.findOne({ where: { userId: req.user.id } });
    if (!stats) {
      stats = await UserStats.create({ userId: req.user.id });
    }

    stats.totalTestsCompleted += 1;
    stats.totalQuestionsAnswered += totalQuestions;
    stats.correctAnswers += score;
    stats.lastActivityDate = new Date();
    await stats.save();

    res.json({ message: 'Результат сохранен', result });
  } catch (error) {
    console.error('Ошибка сохранения результата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Рейтинг: USMLE | университет | моё направление (факультет+курс, без групп)
// GET /api/leaderboard?scope=usmle|university|direction&universityId=&limit=20
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const period = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

    const currentUserId = parseOptionalUserId(req);
    let currentUserUniversityId = null;
    let myDirection = null;

    if (currentUserId) {
      const me = await User.findByPk(currentUserId, {
        attributes: ['id', 'universityId', 'facultyId', 'course'],
        include: [{
          model: Faculty,
          as: 'Faculty',
          attributes: ['id', 'name', 'shortName'],
          required: false
        }]
      });
      currentUserUniversityId = me?.universityId || null;
      if (
        me?.universityId
        && me?.facultyId
        && me?.course
        && Number(me.course) >= 1
      ) {
        myDirection = {
          universityId: Number(me.universityId),
          facultyId: Number(me.facultyId),
          course: Number(me.course),
          facultyName: me.Faculty?.name || null,
          facultyShortName: me.Faculty?.shortName || null
        };
      }
    }

    const universities = await University.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'shortName'],
      order: [['shortName', 'ASC'], ['name', 'ASC']]
    });

    let scope = String(req.query.scope || '').toLowerCase();
    let universityId = parseInt(req.query.universityId, 10);

    if (scope !== 'usmle' && scope !== 'university' && scope !== 'direction') {
      // По умолчанию: вуз пользователя, иначе USMLE
      if (currentUserUniversityId) {
        scope = 'university';
        universityId = Number(currentUserUniversityId);
      } else {
        scope = 'usmle';
      }
    }

    const emptyPayload = (extra = {}) => ({
      scope,
      universityId: null,
      university: null,
      direction: null,
      myDirection,
      leaderboard: [],
      currentUserEntry: null,
      totalParticipants: 0,
      period,
      universities: universities.map((u) => ({
        id: u.id,
        name: u.name,
        shortName: u.shortName
      })),
      currentUserUniversityId,
      ...extra
    });

    if (scope === 'direction') {
      if (!myDirection) {
        return res.json(emptyPayload({
          scope: 'direction',
          message: 'Сначала выберите направление в профиле (факультет и курс).'
        }));
      }
      universityId = myDirection.universityId;
    }

    if (scope === 'university' || scope === 'direction') {
      if (!Number.isFinite(universityId) || universityId <= 0) {
        universityId = currentUserUniversityId
          || (universities[0] ? Number(universities[0].id) : null);
      }
      if (!Number.isFinite(universityId) || universityId <= 0) {
        return res.json(emptyPayload({
          scope: scope === 'direction' ? 'direction' : 'university'
        }));
      }
    }

    const testWhere = scope === 'usmle'
      ? { programType: 'usmle' }
      : { programType: 'university', universityId: Number(universityId) };

    const userInclude = {
      model: User,
      as: 'User',
      attributes: ['id', 'username', 'facultyId', 'course', 'universityId'],
      required: true
    };
    if (scope === 'direction' && myDirection) {
      userInclude.where = {
        universityId: myDirection.universityId,
        facultyId: myDirection.facultyId,
        course: myDirection.course
      };
    }

    const rows = await TestResult.findAll({
      where: {
        createdAt: {
          [Op.gte]: monthStart,
          [Op.lt]: nextMonthStart
        }
      },
      attributes: ['id', 'userId', 'score', 'totalQuestions', 'createdAt', 'testId'],
      include: [userInclude, {
        model: Test,
        as: 'Test',
        attributes: ['id', 'programType', 'universityId', 'name'],
        required: true,
        where: testWhere
      }],
      order: [['createdAt', 'DESC']]
    });

    const leaderboardAll = buildLeaderboardFromRows(rows);
    const leaderboard = leaderboardAll.slice(0, limit);
    const currentUserEntry = currentUserId
      ? (leaderboardAll.find((item) => Number(item.userId) === Number(currentUserId)) || null)
      : null;

    let university = null;
    if (scope === 'university' || scope === 'direction') {
      university = universities.find((u) => Number(u.id) === Number(universityId)) || null;
      if (!university) {
        university = await University.findByPk(universityId, {
          attributes: ['id', 'name', 'shortName']
        });
      }
    }

    let direction = null;
    if (scope === 'direction' && myDirection) {
      direction = { ...myDirection };
    }

    res.json({
      scope,
      universityId: (scope === 'university' || scope === 'direction') ? Number(universityId) : null,
      university: university
        ? { id: university.id, name: university.name, shortName: university.shortName }
        : null,
      direction,
      myDirection,
      leaderboard,
      currentUserEntry,
      totalParticipants: leaderboardAll.length,
      period,
      universities: universities.map((u) => ({
        id: u.id,
        name: u.name,
        shortName: u.shortName
      })),
      currentUserUniversityId
    });
  } catch (error) {
    console.error('Ошибка получения рейтинга:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Статистика ответов пользователей по вопросам (для разбора)
router.post('/stats/question-peer-stats', auth, async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.questionIds) ? req.body.questionIds : [];
    const questionIds = [...new Set(rawIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!questionIds.length) {
      return res.json({ stats: {} });
    }
    if (questionIds.length > 200) {
      return res.status(400).json({ error: 'Слишком много вопросов' });
    }

    const sourceRows = await TestResult.findAll({
      attributes: ['answers', 'results'],
      where: {
        [Op.or]: [
          { answers: { [Op.ne]: null } },
          { results: { [Op.ne]: null } }
        ]
      },
      order: [['id', 'DESC']],
      limit: 4000
    });

    const stats = {};
    for (const qid of questionIds) {
      stats[qid] = {
        attempts: 0,
        correctCount: 0,
        correctPercent: null,
        byAnswerId: {}
      };
    }

    for (const row of sourceRows) {
      const answers = row.answers && typeof row.answers === 'object' ? row.answers : {};
      const results = row.results && typeof row.results === 'object' ? row.results : {};
      for (const qid of questionIds) {
        const key = String(qid);
        const hasAnswer = Object.prototype.hasOwnProperty.call(answers, key) || Object.prototype.hasOwnProperty.call(answers, qid);
        const hasResult = Object.prototype.hasOwnProperty.call(results, key) || Object.prototype.hasOwnProperty.call(results, qid);
        if (!hasAnswer && !hasResult) continue;

        const qStats = stats[qid];
        qStats.attempts += 1;

        const resultEntry = results[key] ?? results[qid];
        if (resultEntry && resultEntry.correct === true) {
          qStats.correctCount += 1;
        }

        const answerIdRaw = answers[key] ?? answers[qid];
        const answerId = parseInt(answerIdRaw, 10);
        if (Number.isFinite(answerId)) {
          if (!qStats.byAnswerId[answerId]) qStats.byAnswerId[answerId] = 0;
          qStats.byAnswerId[answerId] += 1;
        }
      }
    }

    for (const qid of questionIds) {
      const qStats = stats[qid];
      qStats.correctPercent = qStats.attempts > 0
        ? Math.round((qStats.correctCount / qStats.attempts) * 100)
        : null;
      const byAnswerPercent = {};
      for (const [answerId, count] of Object.entries(qStats.byAnswerId)) {
        byAnswerPercent[answerId] = qStats.attempts > 0
          ? Math.round((count / qStats.attempts) * 100)
          : 0;
      }
      qStats.byAnswerId = byAnswerPercent;
    }

    res.json({ stats });
  } catch (error) {
    console.error('Ошибка peer-stats:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить детальный результат теста для разбора
router.get('/stats/test-result/:id', auth, async (req, res) => {
  try {
    const result = await TestResult.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: [{
        model: require('../models').Test,
        as: 'Test',
        include: [{
          model: require('../models').Subject,
          as: 'Subject'
        }]
      }]
    });

    if (!result) {
      return res.status(404).json({ error: 'Результат не найден' });
    }

    // Нормализуем данные questions - убеждаемся, что isCorrect правильно обработан
    if (result.questions && Array.isArray(result.questions)) {
      result.questions = result.questions.map(question => {
        if (question.Answers && Array.isArray(question.Answers)) {
          question.Answers = question.Answers.map(answer => {
            // Нормализуем isCorrect: приводим к boolean (обрабатываем все форматы)
            let isCorrect = false;
            if (answer.isCorrect === true) {
              isCorrect = true;
            } else if (answer.isCorrect === false || answer.isCorrect === null || answer.isCorrect === undefined) {
              isCorrect = false;
            } else if (answer.isCorrect === 1 || answer.isCorrect === '1') {
              isCorrect = true;
            } else if (answer.isCorrect === 0 || answer.isCorrect === '0') {
              isCorrect = false;
            } else if (typeof answer.isCorrect === 'string') {
              const str = answer.isCorrect.toLowerCase().trim();
              isCorrect = str === 'true' || str === 't' || str === '1';
            } else {
              isCorrect = Boolean(answer.isCorrect);
            }
            answer.isCorrect = isCorrect;
            return answer;
          });
        }
        return question;
      });
    }

    res.json({ result });
  } catch (error) {
    console.error('Ошибка получения результата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

