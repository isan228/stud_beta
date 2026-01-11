const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Test, Question, Answer, Subject, Favorite } = require('../models');

// Получить все предметы
router.get('/subjects', async (req, res) => {
  try {
    const subjects = await Subject.findAll({
      order: [['name', 'ASC']]
    });
    res.json(subjects);
  } catch (error) {
    console.error('Ошибка получения предметов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить тесты по предмету
router.get('/subjects/:subjectId/tests', async (req, res) => {
  try {
    const tests = await Test.findAll({
      where: { subjectId: req.params.subjectId },
      include: [{
        model: Question,
        as: 'Questions',
        include: [{
          model: Answer,
          as: 'Answers'
        }]
      }],
      order: [['createdAt', 'DESC']]
    });
    res.json(tests);
  } catch (error) {
    console.error('Ошибка получения тестов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить конкретный тест
router.get('/tests/:testId', async (req, res) => {
  try {
    const test = await Test.findByPk(req.params.testId, {
      include: [{
        model: Question,
        as: 'Questions',
        include: [{
          model: Answer,
          as: 'Answers'
        }]
      }]
    });

    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    res.json(test);
  } catch (error) {
    console.error('Ошибка получения теста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить вопросы для теста (с настройками)
router.post('/tests/:testId/questions', auth, async (req, res) => {
  try {
    const { questionCount, randomizeAnswers } = req.body;
    const test = await Test.findByPk(req.params.testId, {
      include: [{
        model: Question,
        as: 'Questions',
        include: [{
          model: Answer,
          as: 'Answers'
        }]
      }]
    });

    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    // Преобразуем в JSON сразу, чтобы избежать циклических ссылок
    let questions = test.Questions.map(q => q.toJSON());

    // Ограничение количества вопросов
    if (questionCount && questionCount < questions.length) {
      questions = questions.sort(() => Math.random() - 0.5).slice(0, questionCount);
    }

    // Случайный порядок ответов
    if (randomizeAnswers) {
      questions = questions.map(q => {
        const answers = [...(q.Answers || [])].sort(() => Math.random() - 0.5);
        return { 
          id: q.id,
          text: q.text,
          testId: q.testId,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          Answers: answers.map(a => ({
            id: a.id,
            text: a.text
          }))
        };
      });
    } else {
      // Удаляем информацию о правильности ответов
      questions = questions.map(q => ({
        id: q.id,
        text: q.text,
        testId: q.testId,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        Answers: (q.Answers || []).map(a => ({
          id: a.id,
          text: a.text
        }))
      }));
    }

    res.json(questions);
  } catch (error) {
    console.error('Ошибка получения вопросов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка ответов
router.post('/tests/:testId/check', auth, async (req, res) => {
  try {
    const { answers, questionIds } = req.body; // { questionId: answerId }, [questionIds]
    const test = await Test.findByPk(req.params.testId, {
      include: [{
        model: Question,
        as: 'Questions',
        include: [{
          model: Answer,
          as: 'Answers'
        }]
      }]
    });

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
      const correctAnswer = question.Answers.find(a => a.isCorrect);
      
      if (userAnswerId && correctAnswer && parseInt(userAnswerId) === correctAnswer.id) {
        correctCount++;
        results[question.id] = { correct: true, answerId: correctAnswer.id };
      } else {
        results[question.id] = { 
          correct: false, 
          userAnswerId: userAnswerId ? parseInt(userAnswerId) : null,
          correctAnswerId: correctAnswer ? correctAnswer.id : null
        };
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

