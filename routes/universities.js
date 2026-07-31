const express = require('express');
const router = express.Router();
const { University } = require('../models');

/** Публичный список активных университетов (для регистрации) */
router.get('/', async (req, res) => {
  try {
    const universities = await University.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'shortName', 'description'],
      order: [['shortName', 'ASC']]
    });
    res.json(universities);
  } catch (error) {
    console.error('Ошибка получения университетов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
