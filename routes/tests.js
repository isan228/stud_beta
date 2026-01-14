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
      // Ищем правильный ответ с нормализацией isCorrect
      let correctAnswer = null;
      
      // Логируем все ответы для отладки
      console.log(`🔍 Checking question ${question.id}:`, {
        userAnswerId: userAnswerId,
        userAnswerIdType: typeof userAnswerId,
        answers: question.Answers.map(a => ({
          id: a.id,
          idType: typeof a.id,
          isCorrect: a.isCorrect,
          isCorrectType: typeof a.isCorrect,
          text: a.text?.substring(0, 50)
        }))
      });
      
      for (const answer of question.Answers) {
        // Нормализуем isCorrect: проверяем разные форматы
        // PostgreSQL может возвращать boolean как true/false, 't'/'f', 1/0, или как строку
        let isCorrect = false;
        
        // Проверяем различные форматы boolean
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
        } else if (typeof answer.isCorrect === 'boolean') {
          isCorrect = answer.isCorrect;
        }
        
        if (isCorrect) {
          correctAnswer = answer;
          console.log(`✅ Found correct answer for question ${question.id}:`, {
            answerId: answer.id,
            answerIdType: typeof answer.id,
            isCorrect: answer.isCorrect,
            isCorrectType: typeof answer.isCorrect,
            normalizedIsCorrect: isCorrect
          });
          break;
        }
      }
      
      // Если правильный ответ не найден, логируем предупреждение
      if (!correctAnswer) {
        console.warn(`⚠️ No correct answer found for question ${question.id}! All answers:`, 
          question.Answers.map(a => ({ 
            id: a.id, 
            isCorrect: a.isCorrect, 
            isCorrectType: typeof a.isCorrect,
            text: a.text?.substring(0, 50) 
          }))
        );
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

