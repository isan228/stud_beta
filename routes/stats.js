const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { UserStats, TestResult, Test, Subject, User, Question } = require('../models');
const { Op, fn, col } = require('sequelize');
const jwt = require('jsonwebtoken');

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
      limit: 20
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

// Рейтинг: кто больше всего правильно сдаёт тесты (по количеству правильных ответов)
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Пробуем определить текущего пользователя по Bearer-токену (опционально)
    let currentUserId = null;
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        currentUserId = decoded?.userId || null;
      } catch (e) {
        currentUserId = null;
      }
    }

    const rows = await TestResult.findAll({
      where: {
        createdAt: {
          [Op.gte]: monthStart,
          [Op.lt]: nextMonthStart
        }
      },
      attributes: [
        'userId',
        [fn('SUM', col('score')), 'correctAnswers'],
        [fn('SUM', col('totalQuestions')), 'totalQuestionsAnswered'],
        [fn('COUNT', col('*')), 'totalTestsCompleted']
      ],
      include: [{
        model: User,
        attributes: ['id', 'username'],
        required: true
      }],
      group: ['userId', 'User.id', 'User.username'],
      order: [
        [fn('SUM', col('score')), 'DESC'],
        [fn('SUM', col('totalQuestions')), 'DESC'],
        [fn('COUNT', col('*')), 'DESC']
      ]
    });

    const leaderboardAll = rows.map((row, index) => {
      const correctAnswers = Number(row.get('correctAnswers')) || 0;
      const totalQuestionsAnswered = Number(row.get('totalQuestionsAnswered')) || 0;
      const totalTestsCompleted = Number(row.get('totalTestsCompleted')) || 0;
      return {
        rank: index + 1,
        userId: row.User?.id,
        username: row.User?.username || '—',
        correctAnswers,
        totalQuestionsAnswered,
        totalTestsCompleted,
        accuracy: totalQuestionsAnswered > 0
          ? Math.round((correctAnswers / totalQuestionsAnswered) * 100)
          : 0
      };
    });

    const leaderboard = leaderboardAll.slice(0, limit);
    const currentUserEntry = currentUserId
      ? (leaderboardAll.find(item => Number(item.userId) === Number(currentUserId)) || null)
      : null;

    const period = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

    res.json({
      leaderboard,
      currentUserEntry,
      totalParticipants: leaderboardAll.length,
      period
    });
  } catch (error) {
    console.error('Ошибка получения рейтинга:', error);
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

