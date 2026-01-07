const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { ContactMessage } = require('../models');

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

module.exports = router;

