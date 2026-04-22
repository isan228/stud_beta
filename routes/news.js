const express = require('express');
const { Op } = require('sequelize');
const { News } = require('../models');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const news = await News.findAll({
      where: {
        isPublished: true,
        [Op.or]: [
          { publishedAt: null },
          { publishedAt: { [Op.lte]: new Date() } }
        ]
      },
      order: [['publishedAt', 'DESC'], ['createdAt', 'DESC']]
    });

    res.json(news);
  } catch (error) {
    console.error('Ошибка загрузки новостей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
