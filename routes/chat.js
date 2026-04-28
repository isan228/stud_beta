const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { ChatMessage } = require('../models');

router.get('/messages', auth, async (req, res) => {
  try {
    const messages = await ChatMessage.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'ASC']]
    });

    res.json({ messages });
  } catch (error) {
    console.error('Ошибка получения сообщений чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/messages', auth, [
  body('text')
    .trim()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Сообщение должно быть от 1 до 4000 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const message = await ChatMessage.create({
      userId: req.user.id,
      isAdmin: false,
      text: req.body.text.trim(),
      isRead: false
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Ошибка отправки сообщения в чат:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/unread-count', auth, async (req, res) => {
  try {
    const unreadCount = await ChatMessage.count({
      where: {
        userId: req.user.id,
        isAdmin: true,
        isRead: false
      }
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error('Ошибка получения количества непрочитанных сообщений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/read', auth, async (req, res) => {
  try {
    const [updated] = await ChatMessage.update(
      { isRead: true },
      {
        where: {
          userId: req.user.id,
          isAdmin: true,
          isRead: false
        }
      }
    );

    res.json({ updated });
  } catch (error) {
    console.error('Ошибка пометки сообщений как прочитанных:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
