const express = require('express');
const multer = require('multer');
const { Question, Answer } = require('../models');
const {
  QUESTION_IMAGES_DIR,
  isAllowedImageMime,
  safeImageExt,
  questionImageFilename,
  explanationImageFilename,
  answerImageFilename,
  deleteQuestionImageFile
} = require('../utils/questionImages');

function makeImageUploadHandler(getField, setField, makeFilename) {
  return async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Файл не выбран' });
      }

      const question = await Question.findByPk(req.params.id);
      if (!question) {
        deleteQuestionImageFile('/uploads/questions/' + req.file.filename);
        return res.status(404).json({ error: 'Вопрос не найден' });
      }

      const oldUrl = question[getField];
      const relativePath = '/uploads/questions/' + req.file.filename;
      question[getField] = relativePath;
      await question.save();

      if (oldUrl && oldUrl !== relativePath) {
        deleteQuestionImageFile(oldUrl);
      }

      res.json({ imageUrl: relativePath, message: 'Изображение загружено' });
    } catch (error) {
      console.error('Ошибка загрузки изображения:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
}

function makeImageDeleteHandler(getField) {
  return async (req, res) => {
    try {
      const question = await Question.findByPk(req.params.id);
      if (!question) {
        return res.status(404).json({ error: 'Вопрос не найден' });
      }

      if (question[getField]) {
        deleteQuestionImageFile(question[getField]);
        question[getField] = null;
        await question.save();
      }

      res.json({ message: 'Изображение удалено' });
    } catch (error) {
      console.error('Ошибка удаления изображения:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
}

function imageFileFilter(req, file, cb) {
  const extOk = /\.(jpe?g|png|gif|webp)$/i.test(file.originalname || '');
  if (isAllowedImageMime(file.mimetype) || extOk) {
    cb(null, true);
  } else {
    cb(new Error('Разрешены только изображения JPG, PNG, GIF, WEBP'));
  }
}

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
    fileFilter: imageFileFilter
  });

  router.post('/questions/:id/image', authMiddleware, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
      }
      next();
    });
  }, makeImageUploadHandler('imageUrl', 'imageUrl', questionImageFilename));

  router.delete('/questions/:id/image', authMiddleware, makeImageDeleteHandler('imageUrl'));

  const explanationStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, QUESTION_IMAGES_DIR),
    filename: (req, file, cb) => {
      const ext = safeImageExt(file.originalname, file.mimetype);
      cb(null, explanationImageFilename(req.params.id, ext));
    }
  });
  const explanationUpload = multer({
    storage: explanationStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFileFilter
  });

  router.post('/questions/:id/explanation-image', authMiddleware, (req, res, next) => {
    explanationUpload.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
      }
      next();
    });
  }, makeImageUploadHandler('explanationImageUrl', 'explanationImageUrl', explanationImageFilename));

  router.delete('/questions/:id/explanation-image', authMiddleware, makeImageDeleteHandler('explanationImageUrl'));

  const answerStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, QUESTION_IMAGES_DIR),
    filename: (req, file, cb) => {
      const ext = safeImageExt(file.originalname, file.mimetype);
      cb(null, answerImageFilename(req.params.id, ext));
    }
  });
  const answerUpload = multer({
    storage: answerStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFileFilter
  });

  router.post('/answers/:id/image', authMiddleware, (req, res, next) => {
    answerUpload.single('image')(req, res, (err) => {
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

      const answer = await Answer.findByPk(req.params.id);
      if (!answer) {
        deleteQuestionImageFile('/uploads/questions/' + req.file.filename);
        return res.status(404).json({ error: 'Ответ не найден' });
      }

      const oldUrl = answer.imageUrl;
      const relativePath = '/uploads/questions/' + req.file.filename;
      answer.imageUrl = relativePath;
      await answer.save();

      if (oldUrl && oldUrl !== relativePath) {
        deleteQuestionImageFile(oldUrl);
      }

      res.json({ imageUrl: relativePath, message: 'Изображение ответа загружено' });
    } catch (error) {
      console.error('Ошибка загрузки изображения ответа:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  router.delete('/answers/:id/image', authMiddleware, async (req, res) => {
    try {
      const answer = await Answer.findByPk(req.params.id);
      if (!answer) {
        return res.status(404).json({ error: 'Ответ не найден' });
      }

      if (answer.imageUrl) {
        deleteQuestionImageFile(answer.imageUrl);
        answer.imageUrl = null;
        await answer.save();
      }

      res.json({ message: 'Изображение ответа удалено' });
    } catch (error) {
      console.error('Ошибка удаления изображения ответа:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  return router;
}

module.exports = createQuestionImageRouter;
