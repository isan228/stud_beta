const express = require('express');
const multer = require('multer');
const path = require('path');
const { Question } = require('../models');
const {
  QUESTION_IMAGES_DIR,
  isAllowedImageMime,
  safeImageExt,
  questionImageFilename,
  deleteQuestionImageFile
} = require('../utils/questionImages');

function createQuestionImageRouter(authMiddleware) {
  const router = express.Router();

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, QUESTION_IMAGES_DIR),
    filename: (req, file, cb) => {
      const ext = safeImageExt(file.originalname, file.mimetype);
      cb(null, questionImageFilename(req.params.id, ext));
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const extOk = /\.(jpe?g|png|gif|webp)$/i.test(file.originalname || '');
      if (isAllowedImageMime(file.mimetype) || extOk) {
        cb(null, true);
      } else {
        cb(new Error('Разрешены только изображения JPG, PNG, GIF, WEBP'));
      }
    }
  });

  router.post('/questions/:id/image', authMiddleware, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Файл не выбран' });
      }

      const question = await Question.findByPk(req.params.id);
      if (!question) {
        deleteQuestionImageFile('/uploads/questions/' + req.file.filename);
        return res.status(404).json({ error: 'Вопрос не найден' });
      }

      const oldUrl = question.imageUrl;
      const relativePath = '/uploads/questions/' + req.file.filename;
      question.imageUrl = relativePath;
      await question.save();

      if (oldUrl && oldUrl !== relativePath) {
        deleteQuestionImageFile(oldUrl);
      }

      res.json({ imageUrl: relativePath, message: 'Изображение загружено' });
    } catch (error) {
      console.error('Ошибка загрузки изображения вопроса:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  router.delete('/questions/:id/image', authMiddleware, async (req, res) => {
    try {
      const question = await Question.findByPk(req.params.id);
      if (!question) {
        return res.status(404).json({ error: 'Вопрос не найден' });
      }

      if (question.imageUrl) {
        deleteQuestionImageFile(question.imageUrl);
        question.imageUrl = null;
        await question.save();
      }

      res.json({ message: 'Изображение удалено' });
    } catch (error) {
      console.error('Ошибка удаления изображения вопроса:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  return router;
}

module.exports = createQuestionImageRouter;
