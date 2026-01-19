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
    // Получаем все тесты, включая бесплатные
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

// Получить только бесплатные тесты по предмету (для неавторизованных)
router.get('/subjects/:subjectId/tests/free', async (req, res) => {
  try {
    const tests = await Test.findAll({
      where: { 
        subjectId: req.params.subjectId,
        isFree: true
      },
      include: [{
        model: Question,
        as: 'Questions',
        attributes: ['id'], // Только ID для подсчета
        required: false
      }],
      order: [['createdAt', 'DESC']]
    });
    res.json(tests);
  } catch (error) {
    console.error('Ошибка получения бесплатных тестов:', error);
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
      }]
    });

    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
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

    // Проверяем доступ: если тест не бесплатный, требуется авторизация
    if (!test.isFree) {
      // Проверяем авторизацию для платных тестов
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация для этого теста' });
      }
      
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { User } = require('../models');
        const user = await User.findByPk(decoded.userId);
        
        if (!user) {
          return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        // Проверяем подписку для платных тестов
        if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date()) {
          // Подписка активна
        } else {
          return res.status(403).json({ error: 'Требуется активная подписка для этого теста' });
        }
      } catch (error) {
        return res.status(401).json({ error: 'Недействительный токен' });
      }
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
    
    // Если тест не бесплатный, проверяем авторизацию
    if (!isFreeTest) {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация для этого теста' });
      }
      
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { User } = require('../models');
        const user = await User.findByPk(decoded.userId);
        
        if (!user) {
          return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        userId = user.id;
        
        // Проверяем подписку для платных тестов
        if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date()) {
          // Подписка активна
        } else {
          return res.status(403).json({ error: 'Требуется активная подписка для этого теста' });
        }
      } catch (error) {
        return res.status(401).json({ error: 'Недействительный токен' });
      }
    }
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

