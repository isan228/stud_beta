const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Favorite, Question, Answer, Test } = require('../models');

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
        required: false, // LEFT JOIN - включаем даже если вопрос удален
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

    // Фильтруем и преобразуем результаты
    const questions = favorites
      .map(f => f.Question)
      .filter(q => q !== null && q !== undefined); // Фильтруем null/undefined
    
    res.json(questions);
  } catch (error) {
    console.error('Ошибка получения избранного:', error);
    console.error('Детали ошибки:', error.message, error.stack);
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

module.exports = router;

