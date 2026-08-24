const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Favorite, Question, Answer, Test, Subject, CatalogFavorite } = require('../models');
const { Op } = require('sequelize');

// Добавить вопрос в избранное
router.post('/questions/:questionId/favorite', auth, async (req, res) => {
  try {
    const [favorite, created] = await Favorite.findOrCreate({
      where: {
        userId: req.user.id,
        questionId: req.params.questionId
      }
    });

    if (created) {
      res.json({ message: 'Вопрос добавлен в избранное' });
    } else {
      res.status(400).json({ error: 'Вопрос уже в избранном' });
    }
  } catch (error) {
    console.error('Ошибка добавления в избранное:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить вопрос из избранного
router.delete('/questions/:questionId/favorite', auth, async (req, res) => {
  try {
    const deleted = await Favorite.destroy({
      where: {
        userId: req.user.id,
        questionId: req.params.questionId
      }
    });

    if (deleted) {
      res.json({ message: 'Вопрос удален из избранного' });
    } else {
      res.status(404).json({ error: 'Вопрос не найден в избранном' });
    }
  } catch (error) {
    console.error('Ошибка удаления из избранного:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить все избранные вопросы
router.get('/favorites', auth, async (req, res) => {
  try {
    const favorites = await Favorite.findAll({
      where: { userId: req.user.id },
      include: [{
        model: Question,
        as: 'Question',
        required: false,
        include: [{
          model: Answer,
          as: 'Answers',
          required: false
        }, {
          model: Test,
          as: 'Test',
          required: false,
          attributes: ['id', 'name', 'subjectId']
        }]
      }],
      order: [['createdAt', 'DESC']]
    });

    const questions = favorites
      .map(f => f.Question)
      .filter(q => q !== null && q !== undefined);

    res.json(questions);
  } catch (error) {
    console.error('Ошибка получения избранного:', error);
    res.status(500).json({
      error: 'Ошибка сервера',
      message: error.message
    });
  }
});

// Проверить, в избранном ли вопрос
router.get('/questions/:questionId/favorite', auth, async (req, res) => {
  try {
    const favorite = await Favorite.findOne({
      where: {
        userId: req.user.id,
        questionId: req.params.questionId
      }
    });

    res.json({ isFavorite: !!favorite });
  } catch (error) {
    console.error('Ошибка проверки избранного:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

function normalizeCatalogType(raw) {
  const t = String(raw || '').toLowerCase();
  return t === 'subject' || t === 'test' ? t : null;
}

// Каталог: избранные предметы и тесты
router.get('/catalog-favorites', auth, async (req, res) => {
  try {
    const rows = await CatalogFavorite.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    const subjectIds = rows.filter((r) => r.itemType === 'subject').map((r) => r.itemId);
    const testIds = rows.filter((r) => r.itemType === 'test').map((r) => r.itemId);

    const [subjects, tests] = await Promise.all([
      subjectIds.length
        ? Subject.findAll({
          where: { id: { [Op.in]: subjectIds } },
          attributes: ['id', 'name', 'description', 'universityId', 'programType']
        })
        : [],
      testIds.length
        ? Test.findAll({
          where: { id: { [Op.in]: testIds } },
          attributes: ['id', 'name', 'description', 'subjectId', 'isFree', 'programType'],
          include: [{
            model: Subject,
            as: 'Subject',
            attributes: ['id', 'name'],
            required: false
          }]
        })
        : []
    ]);

    let testCountMap = new Map();
    let questionCountMap = new Map();
    if (subjectIds.length) {
      const { sequelize } = require('../models');
      const { QueryTypes } = require('sequelize');
      const testRows = await Test.findAll({
        attributes: ['subjectId', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
        where: { subjectId: { [Op.in]: subjectIds } },
        group: ['subjectId'],
        raw: true
      });
      testCountMap = new Map(testRows.map((r) => [Number(r.subjectId), Number(r.count)]));
      const qRows = await sequelize.query(
        `SELECT t."subjectId" AS "subjectId", COUNT(q.id)::int AS count
         FROM "Questions" q
         INNER JOIN "Tests" t ON t.id = q."testId"
         WHERE t."subjectId" IN (:ids)
         GROUP BY t."subjectId"`,
        { replacements: { ids: subjectIds }, type: QueryTypes.SELECT }
      );
      questionCountMap = new Map(qRows.map((r) => [Number(r.subjectId), Number(r.count)]));
    }

    const subjectMap = new Map(subjects.map((s) => {
      const json = s.toJSON();
      json.testCount = testCountMap.get(s.id) || 0;
      json.questionCount = questionCountMap.get(s.id) || 0;
      json.isFavorite = true;
      return [s.id, json];
    }));
    const testMap = new Map(tests.map((t) => [t.id, t]));

    res.json({
      subjects: subjectIds.map((id) => subjectMap.get(id)).filter(Boolean),
      tests: testIds.map((id) => testMap.get(id)).filter(Boolean),
      subjectIds,
      testIds
    });
  } catch (error) {
    console.error('Ошибка catalog-favorites:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/catalog-favorites/:itemType/:itemId', auth, async (req, res) => {
  try {
    const itemType = normalizeCatalogType(req.params.itemType);
    const itemId = parseInt(req.params.itemId, 10);
    if (!itemType || !Number.isFinite(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Некорректные параметры' });
    }

    if (itemType === 'subject') {
      const subject = await Subject.findByPk(itemId);
      if (!subject) return res.status(404).json({ error: 'Предмет не найден' });
    } else {
      const test = await Test.findByPk(itemId);
      if (!test) return res.status(404).json({ error: 'Тест не найден' });
    }

    const [fav, created] = await CatalogFavorite.findOrCreate({
      where: { userId: req.user.id, itemType, itemId },
      defaults: { userId: req.user.id, itemType, itemId }
    });

    res.json({ isFavorite: true, created: !!created, id: fav.id });
  } catch (error) {
    console.error('Ошибка добавления в catalog-favorites:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/catalog-favorites/:itemType/:itemId', auth, async (req, res) => {
  try {
    const itemType = normalizeCatalogType(req.params.itemType);
    const itemId = parseInt(req.params.itemId, 10);
    if (!itemType || !Number.isFinite(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Некорректные параметры' });
    }

    await CatalogFavorite.destroy({
      where: { userId: req.user.id, itemType, itemId }
    });
    res.json({ isFavorite: false });
  } catch (error) {
    console.error('Ошибка удаления из catalog-favorites:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
