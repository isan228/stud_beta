const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { UserStats, TestResult, Test, Subject } = require('../models');
const { Op } = require('sequelize');

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

    res.json({ result });
  } catch (error) {
    console.error('Ошибка получения результата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

