const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const adminAuth = require('../middleware/adminAuth');
const { User, Subject, Test, Question, Answer, TestResult, UserStats, Admin, sequelize } = require('../models');
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');

// Вход администратора
router.post('/login', [
  body('username').notEmpty().withMessage('Имя пользователя обязательно'),
  body('password').notEmpty().withMessage('Пароль обязателен')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;
    
    console.log('Попытка входа администратора:', { username, passwordLength: password?.length });
    
    // Ищем администратора (без учета регистра для username)
    const admin = await Admin.findOne({ 
      where: Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('username')), 
        username.toLowerCase()
      )
    });

    if (!admin) {
      console.log('Администратор не найден:', username);
      // Проверяем, есть ли вообще администраторы
      const adminCount = await Admin.count();
      console.log('Всего администраторов в БД:', adminCount);
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    console.log('Администратор найден:', { id: admin.id, username: admin.username });
    
    const isMatch = await admin.comparePassword(password);
    console.log('Проверка пароля:', isMatch);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const token = jwt.sign({ adminId: admin.id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Вход выполнен успешно',
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Ошибка входа администратора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить текущего администратора
router.get('/me', adminAuth, async (req, res) => {
  try {
    res.json({
      admin: {
        id: req.admin.id,
        username: req.admin.username,
        email: req.admin.email,
        role: req.admin.role
      }
    });
  } catch (error) {
    console.error('Ошибка получения администратора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Статистика для админки
router.get('/dashboard/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.count();
    const totalSubjects = await Subject.count();
    const totalTests = await Test.count();
    const totalQuestions = await Question.count();
    const totalResults = await TestResult.count();
    
    const recentUsers = await User.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
      attributes: ['id', 'username', 'email', 'createdAt']
    });

    const recentResults = await TestResult.findAll({
      include: [{
        model: Test,
        as: 'Test',
        include: [{
          model: Subject,
          as: 'Subject'
        }]
      }, {
        model: User,
        as: 'User',
        attributes: ['id', 'username']
      }],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    res.json({
      stats: {
        totalUsers,
        totalSubjects,
        totalTests,
        totalQuestions,
        totalResults
      },
      recentUsers,
      recentResults
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление пользователями
router.get('/users', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const where = {};
    if (search) {
      where[Op.or] = [
        { username: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [{
        model: UserStats,
        as: 'UserStats'
      }],
      attributes: { exclude: ['password'] }
    });

    res.json({
      users,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить пользователя
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    await user.destroy();
    res.json({ message: 'Пользователь удален' });
  } catch (error) {
    console.error('Ошибка удаления пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление предметами
router.get('/subjects', adminAuth, async (req, res) => {
  try {
    const subjects = await Subject.findAll({
      include: [{
        model: Test,
        as: 'Tests',
        attributes: ['id']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json(subjects);
  } catch (error) {
    console.error('Ошибка получения предметов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать предмет
router.post('/subjects', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название предмета обязательно'),
  body('description').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;
    const subject = await Subject.create({ name, description });
    res.status(201).json(subject);
  } catch (error) {
    console.error('Ошибка создания предмета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить предмет
router.put('/subjects/:id', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название предмета обязательно')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const subject = await Subject.findByPk(req.params.id);
    if (!subject) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }

    const { name, description } = req.body;
    subject.name = name;
    if (description !== undefined) subject.description = description;
    await subject.save();

    res.json(subject);
  } catch (error) {
    console.error('Ошибка обновления предмета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить предмет
router.delete('/subjects/:id', adminAuth, async (req, res) => {
  try {
    const subject = await Subject.findByPk(req.params.id);
    if (!subject) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }

    await subject.destroy();
    res.json({ message: 'Предмет удален' });
  } catch (error) {
    console.error('Ошибка удаления предмета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление тестами
router.get('/tests', adminAuth, async (req, res) => {
  try {
    const subjectId = req.query.subjectId;
    const where = {};
    if (subjectId) {
      where.subjectId = subjectId;
    }

    const tests = await Test.findAll({
      where,
      include: [{
        model: Subject,
        as: 'Subject'
      }, {
        model: Question,
        as: 'Questions',
        attributes: ['id']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json(tests);
  } catch (error) {
    console.error('Ошибка получения тестов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать тест
router.post('/tests', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название теста обязательно'),
  body('subjectId').isInt().withMessage('ID предмета обязателен')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, subjectId } = req.body;
    const test = await Test.create({ name, description, subjectId });
    res.status(201).json(test);
  } catch (error) {
    console.error('Ошибка создания теста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить тест
router.put('/tests/:id', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название теста обязательно')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const test = await Test.findByPk(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    const { name, description } = req.body;
    test.name = name;
    if (description !== undefined) test.description = description;
    await test.save();

    res.json(test);
  } catch (error) {
    console.error('Ошибка обновления теста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить тест
router.delete('/tests/:id', adminAuth, async (req, res) => {
  try {
    const test = await Test.findByPk(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    await test.destroy();
    res.json({ message: 'Тест удален' });
  } catch (error) {
    console.error('Ошибка удаления теста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление вопросами
router.get('/questions', adminAuth, async (req, res) => {
  try {
    const testId = req.query.testId;
    const where = {};
    if (testId) {
      where.testId = testId;
    }

    const questions = await Question.findAll({
      where,
      include: [{
        model: Test,
        as: 'Test',
        include: [{
          model: Subject,
          as: 'Subject'
        }]
      }, {
        model: Answer,
        as: 'Answers'
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json(questions);
  } catch (error) {
    console.error('Ошибка получения вопросов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать вопрос
router.post('/questions', adminAuth, [
  body('text').trim().notEmpty().withMessage('Текст вопроса обязателен'),
  body('testId').isInt().withMessage('ID теста обязателен'),
  body('answers').isArray({ min: 2 }).withMessage('Должно быть минимум 2 ответа'),
  body('answers.*.text').trim().notEmpty().withMessage('Текст ответа обязателен'),
  body('answers.*.isCorrect').isBoolean().withMessage('isCorrect должен быть boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { text, testId, answers } = req.body;

    // Проверяем, что есть хотя бы один правильный ответ
    const hasCorrectAnswer = answers.some(a => a.isCorrect);
    if (!hasCorrectAnswer) {
      return res.status(400).json({ error: 'Должен быть хотя бы один правильный ответ' });
    }

    const question = await Question.create({ text, testId });
    
    // Создаем ответы
    await Promise.all(answers.map(answer => 
      Answer.create({
        text: answer.text,
        isCorrect: answer.isCorrect,
        questionId: question.id
      })
    ));

    const questionWithAnswers = await Question.findByPk(question.id, {
      include: [{
        model: Answer,
        as: 'Answers'
      }]
    });

    res.status(201).json(questionWithAnswers);
  } catch (error) {
    console.error('Ошибка создания вопроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить вопрос
router.put('/questions/:id', adminAuth, [
  body('text').trim().notEmpty().withMessage('Текст вопроса обязателен')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const question = await Question.findByPk(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден' });
    }

    const { text } = req.body;
    question.text = text;
    await question.save();

    res.json(question);
  } catch (error) {
    console.error('Ошибка обновления вопроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить вопрос
router.delete('/questions/:id', adminAuth, async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден' });
    }

    await question.destroy();
    res.json({ message: 'Вопрос удален' });
  } catch (error) {
    console.error('Ошибка удаления вопроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление ответами
router.put('/answers/:id', adminAuth, [
  body('text').trim().notEmpty().withMessage('Текст ответа обязателен'),
  body('isCorrect').isBoolean().withMessage('isCorrect должен быть boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const answer = await Answer.findByPk(req.params.id);
    if (!answer) {
      return res.status(404).json({ error: 'Ответ не найден' });
    }

    const { text, isCorrect } = req.body;
    answer.text = text;
    answer.isCorrect = isCorrect;
    await answer.save();

    res.json(answer);
  } catch (error) {
    console.error('Ошибка обновления ответа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить ответ
router.delete('/answers/:id', adminAuth, async (req, res) => {
  try {
    const answer = await Answer.findByPk(req.params.id);
    if (!answer) {
      return res.status(404).json({ error: 'Ответ не найден' });
    }

    await answer.destroy();
    res.json({ message: 'Ответ удален' });
  } catch (error) {
    console.error('Ошибка удаления ответа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

