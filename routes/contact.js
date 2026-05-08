const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const { ContactMessage, User, Test, Question, Subject } = require('../models');

// Сохранение сообщения обратной связи
router.post('/contact', [
  body('name').trim().notEmpty().withMessage('Имя обязательно'),
  body('email').isEmail().withMessage('Некорректный email'),
  body('subject').isIn(['question', 'suggestion', 'feedback', 'bug', 'other']).withMessage('Некорректная тема'),
  body('message').trim().notEmpty().withMessage('Сообщение обязательно')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, subject, message } = req.body;

    const contactMessage = await ContactMessage.create({
      name,
      email,
      subject,
      message,
      status: 'new'
    });

    res.status(201).json({
      message: 'Сообщение успешно отправлено',
      id: contactMessage.id
    });
  } catch (error) {
    console.error('Ошибка сохранения сообщения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сообщение об ошибке в вопросе во время теста
router.post('/test-error-report', [
  body('questionId').isInt({ min: 1 }).withMessage('ID вопроса обязателен'),
  body('testId').isInt({ min: 1 }).withMessage('ID теста обязателен'),
  body('reason').trim().isLength({ min: 5, max: 3000 }).withMessage('Опишите проблему (от 5 до 3000 символов)'),
  body('questionText').optional().isString(),
  body('questionNumber').optional().isInt({ min: 1 }),
  body('guestName').optional().isString(),
  body('guestEmail').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { questionId, testId, reason, questionText, questionNumber, guestName, guestEmail } = req.body;

    let user = null;
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = await User.findByPk(decoded.userId);
      } catch (error) {
        user = null;
      }
    }

    const [test, question] = await Promise.all([
      Test.findByPk(testId, {
        include: [{ model: Subject, as: 'Subject', attributes: ['name'] }]
      }),
      Question.findByPk(questionId)
    ]);

    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    if (!question || Number(question.testId) !== Number(testId)) {
      return res.status(404).json({ error: 'Вопрос не найден в указанном тесте' });
    }

    const senderName = user?.username || String(guestName || 'Гость').trim() || 'Гость';
    const senderEmail = user?.email || String(guestEmail || 'guest@stud.kg').trim() || 'guest@stud.kg';
    const safeQuestionText = String(questionText || question.text || '').trim();

    const messageLines = [
      'Отчет об ошибке в вопросе теста',
      '',
      `Пользователь: ${senderName}${user ? ` (ID: ${user.id})` : ''}`,
      `Email: ${senderEmail}`,
      `Тест: ${test.name} (ID: ${test.id})`,
      `Предмет: ${test.Subject?.name || 'Не указан'}`,
      `Вопрос ID: ${question.id}`,
      `Номер вопроса в сессии: ${questionNumber || 'не указан'}`,
      '',
      'Текст вопроса:',
      safeQuestionText || '(текст не передан)',
      '',
      'Описание проблемы:',
      String(reason).trim()
    ];

    const contactMessage = await ContactMessage.create({
      name: senderName.slice(0, 100),
      email: senderEmail.slice(0, 100),
      subject: 'bug',
      message: messageLines.join('\n'),
      status: 'new'
    });

    res.status(201).json({
      message: 'Спасибо, отчет об ошибке отправлен администратору',
      id: contactMessage.id
    });
  } catch (error) {
    console.error('Ошибка сохранения отчета об ошибке вопроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;


