const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const { Sequelize } = require('sequelize');
const { Op } = require('sequelize');
const editorAuth = require('../middleware/editorAuth');
const {
  Editor,
  Subject,
  Test,
  Question,
  Answer,
  ContactMessage
} = require('../models');
const { snapshotFromQuestion, logQuestionAudit, logErrorReportAudit } = require('../utils/questionAuditLog');

const TEST_ERROR_PREFIX = 'Отчет об ошибке в вопросе теста';

function parseQuestionIdFromReport(messageText) {
  const match = String(messageText || '').match(/Вопрос ID:\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function parseTestIdFromReport(messageText) {
  const match = String(messageText || '').match(/Тест:.*\(ID:\s*(\d+)\)/i);
  return match ? Number(match[1]) : null;
}

// Вход редактора
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

    const editor = await Editor.findOne({
      where: Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('username')),
        username.toLowerCase()
      )
    });

    if (!editor || !editor.isActive) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    const isMatch = await editor.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_key_here') {
      return res.status(500).json({ error: 'Ошибка конфигурации сервера' });
    }

    const token = jwt.sign({ editorId: editor.id }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Вход выполнен успешно',
      token,
      editor: {
        id: editor.id,
        username: editor.username,
        displayName: editor.displayName
      }
    });
  } catch (error) {
    console.error('Ошибка входа редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/me', editorAuth, async (req, res) => {
  res.json({
    editor: {
      id: req.editor.id,
      username: req.editor.username,
      displayName: req.editor.displayName
    }
  });
});

// Справочники (только чтение)
router.get('/subjects', editorAuth, async (req, res) => {
  try {
    const subjects = await Subject.findAll({
      attributes: ['id', 'name'],
      order: [['name', 'ASC']]
    });
    res.json(subjects);
  } catch (error) {
    console.error('Ошибка получения предметов для редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/tests', editorAuth, async (req, res) => {
  try {
    const subjectId = req.query.subjectId;
    const where = {};
    if (subjectId) {
      where.subjectId = subjectId;
    }

    const tests = await Test.findAll({
      where,
      attributes: ['id', 'name', 'subjectId', 'description', 'isFree', 'hasExplanations'],
      include: [{
        model: Subject,
        as: 'Subject',
        attributes: ['id', 'name']
      }],
      order: [['name', 'ASC']]
    });

    res.json(tests);
  } catch (error) {
    console.error('Ошибка получения тестов для редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вопросы
router.get('/questions/suggestions', editorAuth, async (req, res) => {
  try {
    const testId = req.query.testId;
    const query = String(req.query.query || '').trim();
    if (!testId) {
      return res.json({ suggestions: [] });
    }

    const where = { testId };
    if (query) {
      where.text = { [Op.iLike]: `%${query}%` };
    }

    const rows = await Question.findAll({
      where,
      attributes: ['text'],
      order: [['createdAt', 'DESC']],
      limit: 12
    });

    const unique = Array.from(new Set(
      rows.map(r => String(r.text || '').trim()).filter(Boolean)
    ));

    res.json({ suggestions: unique });
  } catch (error) {
    console.error('Ошибка подсказок вопросов редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/questions/:id', editorAuth, async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id, {
      include: [{
        model: Test,
        as: 'Test',
        attributes: ['id', 'name', 'subjectId', 'hasExplanations']
      }, {
        model: Answer,
        as: 'Answers'
      }]
    });
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден' });
    }
    res.json(question);
  } catch (error) {
    console.error('Ошибка получения вопроса редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/questions', editorAuth, async (req, res) => {
  try {
    const testId = req.query.testId;
    const search = String(req.query.search || '').trim();
    if (!testId) {
      return res.json([]);
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 300, 1), 500);
    const where = { testId };
    if (search) {
      where.text = { [Op.iLike]: `%${search}%` };
    }

    const questions = await Question.findAll({
      where,
      include: [{
        model: Test,
        as: 'Test',
        attributes: ['id', 'name']
      }, {
        model: Answer,
        as: 'Answers',
        attributes: ['id', 'text', 'isCorrect', 'questionId']
      }],
      order: [['createdAt', 'DESC']],
      limit
    });

    res.json(questions);
  } catch (error) {
    console.error('Ошибка списка вопросов редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/questions', editorAuth, [
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

    const { text, testId, answers, explanation, setTestWithExplanations } = req.body;
    const withExplanations = setTestWithExplanations === true || setTestWithExplanations === 'true';
    const hasCorrectAnswer = answers.some(a => a.isCorrect);
    if (!hasCorrectAnswer) {
      return res.status(400).json({ error: 'Должен быть хотя бы один правильный ответ' });
    }

    const question = await Question.create({
      text,
      testId,
      explanation: withExplanations && explanation != null && String(explanation).trim()
        ? String(explanation).trim()
        : null
    });

    const { syncTestHasExplanations } = require('../utils/syncTestExplanations');
    await syncTestHasExplanations(testId, withExplanations);
    await Promise.all(answers.map(answer =>
      Answer.create({
        text: answer.text,
        isCorrect: Boolean(answer.isCorrect),
        questionId: question.id
      })
    ));

    const questionWithAnswers = await Question.findByPk(question.id, {
      include: [{ model: Answer, as: 'Answers' }, { model: Test, as: 'Test', attributes: ['id', 'name'] }]
    });

    await logQuestionAudit({
      actorType: 'editor',
      actorId: req.editor.id,
      actorUsername: req.editor.username,
      action: 'create',
      question: questionWithAnswers,
      test: questionWithAnswers?.Test,
      afterSnapshot: snapshotFromQuestion(questionWithAnswers, questionWithAnswers?.Answers)
    });

    res.status(201).json(questionWithAnswers);
  } catch (error) {
    console.error('Ошибка создания вопроса редактором:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/questions/:id', editorAuth, [
  body('text').trim().notEmpty().withMessage('Текст вопроса обязателен'),
  body('testId').optional().isInt().withMessage('ID теста должен быть числом'),
  body('answers').isArray({ min: 2 }).withMessage('Должно быть минимум 2 ответа'),
  body('answers.*.text').trim().notEmpty().withMessage('Текст ответа обязателен'),
  body('answers.*.isCorrect').isBoolean().withMessage('isCorrect должен быть boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const question = await Question.findByPk(req.params.id, {
      include: [{ model: Answer, as: 'Answers' }, { model: Test, as: 'Test', attributes: ['id', 'name'] }]
    });
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден' });
    }

    const beforeSnapshot = snapshotFromQuestion(question, question.Answers);
    beforeSnapshot.questionId = question.id;

    const { text, testId, answers, explanation, setTestWithExplanations } = req.body;
    const withExplanations = setTestWithExplanations === true || setTestWithExplanations === 'true';
    const { deleteQuestionImageFile } = require('../utils/questionImages');
    const { syncTestHasExplanations } = require('../utils/syncTestExplanations');
    const hasCorrectAnswer = answers.some(a => a.isCorrect);
    if (!hasCorrectAnswer) {
      return res.status(400).json({ error: 'Должен быть хотя бы один правильный ответ' });
    }

    question.text = text;
    if (!withExplanations) {
      if (question.explanationImageUrl) {
        deleteQuestionImageFile(question.explanationImageUrl);
        question.explanationImageUrl = null;
      }
      question.explanation = null;
    } else {
      question.explanation = explanation != null && String(explanation).trim()
        ? String(explanation).trim()
        : null;
    }
    if (testId !== undefined && testId !== null) {
      question.testId = testId;
    }
    await question.save();
    await syncTestHasExplanations(testId ?? question.testId, withExplanations);

    const existingAnswers = await Answer.findAll({ where: { questionId: question.id } });
    const submittedIds = new Set(
      answers
        .filter(a => a.id !== undefined && a.id !== null && a.id !== '')
        .map(a => Number(a.id))
    );

    for (const existing of existingAnswers) {
      if (!submittedIds.has(existing.id)) {
        await existing.destroy();
      }
    }

    for (const answer of answers) {
      const answerId = answer.id !== undefined && answer.id !== null && answer.id !== ''
        ? Number(answer.id)
        : null;

      if (answerId) {
        const existingAnswer = await Answer.findOne({
          where: { id: answerId, questionId: question.id }
        });
        if (existingAnswer) {
          existingAnswer.text = answer.text;
          existingAnswer.isCorrect = Boolean(answer.isCorrect);
          await existingAnswer.save();
          continue;
        }
      }

      await Answer.create({
        text: answer.text,
        isCorrect: Boolean(answer.isCorrect),
        questionId: question.id
      });
    }

    const questionWithAnswers = await Question.findByPk(question.id, {
      include: [{ model: Answer, as: 'Answers' }, { model: Test, as: 'Test', attributes: ['id', 'name'] }]
    });

    await logQuestionAudit({
      actorType: 'editor',
      actorId: req.editor.id,
      actorUsername: req.editor.username,
      action: 'update',
      question: questionWithAnswers,
      test: questionWithAnswers?.Test,
      beforeSnapshot,
      afterSnapshot: snapshotFromQuestion(questionWithAnswers, questionWithAnswers?.Answers)
    });

    res.json(questionWithAnswers);
  } catch (error) {
    console.error('Ошибка обновления вопроса редактором:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/questions/:id', editorAuth, async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id, {
      include: [{ model: Answer, as: 'Answers' }, { model: Test, as: 'Test', attributes: ['id', 'name'] }]
    });
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден' });
    }

    const beforeSnapshot = snapshotFromQuestion(question, question.Answers);
    beforeSnapshot.questionId = question.id;

    await logQuestionAudit({
      actorType: 'editor',
      actorId: req.editor.id,
      actorUsername: req.editor.username,
      action: 'delete',
      question,
      test: question.Test,
      beforeSnapshot
    });

    const { deleteQuestionImageFile } = require('../utils/questionImages');
    if (question.imageUrl) {
      deleteQuestionImageFile(question.imageUrl);
    }
    if (question.explanationImageUrl) {
      deleteQuestionImageFile(question.explanationImageUrl);
    }

    await question.destroy();
    res.json({ message: 'Вопрос удален' });
  } catch (error) {
    console.error('Ошибка удаления вопроса редактором:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отчёты об ошибках в вопросах
router.get('/error-reports/stats', editorAuth, async (req, res) => {
  try {
    const baseWhere = {
      subject: 'bug',
      message: { [Op.iLike]: `${TEST_ERROR_PREFIX}%` }
    };

    const total = await ContactMessage.count({ where: baseWhere });
    const newCount = await ContactMessage.count({
      where: { ...baseWhere, status: 'new' }
    });

    res.json({ total, newCount });
  } catch (error) {
    console.error('Ошибка статистики отчётов редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/error-reports', editorAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || '';
    const search = req.query.search || '';

    const where = {
      subject: 'bug',
      message: { [Op.iLike]: `${TEST_ERROR_PREFIX}%` }
    };
    if (status) {
      where.status = status;
    }
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { message: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: messages } = await ContactMessage.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const enriched = messages.map(m => {
      const json = m.toJSON();
      json.questionId = parseQuestionIdFromReport(json.message);
      json.testId = parseTestIdFromReport(json.message);
      return json;
    });

    res.json({
      messages: enriched,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка списка отчётов редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/error-reports/:id', editorAuth, async (req, res) => {
  try {
    const message = await ContactMessage.findByPk(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (!String(message.message || '').startsWith(TEST_ERROR_PREFIX)) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    const json = message.toJSON();
    json.questionId = parseQuestionIdFromReport(json.message);
    json.testId = parseTestIdFromReport(json.message);
    res.json(json);
  } catch (error) {
    console.error('Ошибка получения отчёта редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/error-reports/:id/status', editorAuth, [
  body('status').isIn(['new', 'read', 'replied', 'archived']).withMessage('Некорректный статус')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const message = await ContactMessage.findByPk(req.params.id);
    if (!message || !String(message.message || '').startsWith(TEST_ERROR_PREFIX)) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    message.status = req.body.status;
    await message.save();

    const json = message.toJSON();
    json.questionId = parseQuestionIdFromReport(json.message);
    json.testId = parseTestIdFromReport(json.message);

    let testName = null;
    if (json.testId) {
      const test = await Test.findByPk(json.testId, { attributes: ['name'] });
      testName = test?.name || null;
    }

    await logErrorReportAudit({
      actorType: 'editor',
      actorId: req.editor.id,
      actorUsername: req.editor.username,
      reportId: message.id,
      status: req.body.status,
      questionId: json.questionId,
      testId: json.testId,
      testName
    });

    res.json(json);
  } catch (error) {
    console.error('Ошибка обновления статуса отчёта:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
