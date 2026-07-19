const path = require('path');
const fs = require('fs');

const QUESTION_IMAGES_DIR = path.join(__dirname, '../public/uploads/questions');
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

if (!fs.existsSync(QUESTION_IMAGES_DIR)) {
  fs.mkdirSync(QUESTION_IMAGES_DIR, { recursive: true });
}

function isAllowedImageMime(mimetype) {
  return /^image\/(jpeg|png|gif|webp)$/i.test(mimetype || '');
}

function safeImageExt(originalname, mimetype) {
  const ext = path.extname(originalname || '').toLowerCase();
  if (ALLOWED_EXT.has(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/gif') return '.gif';
  if (mimetype === 'image/webp') return '.webp';
  return '.jpg';
}

function questionImageFilename(questionId, ext) {
  return `question-${questionId}-${Date.now()}${ext}`;
}

function explanationImageFilename(questionId, ext) {
  return `explanation-${questionId}-${Date.now()}${ext}`;
}

function answerImageFilename(answerId, ext) {
  return `answer-${answerId}-${Date.now()}${ext}`;
}

function deleteQuestionImageFile(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return;
  if (!imageUrl.startsWith('/uploads/questions/')) return;
  const filePath = path.join(__dirname, '../public', imageUrl.replace(/^\//, ''));
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn('Не удалось удалить файл изображения вопроса:', filePath, err.message);
    }
  }
}

module.exports = {
  QUESTION_IMAGES_DIR,
  ALLOWED_EXT,
  isAllowedImageMime,
  safeImageExt,
  questionImageFilename,
  explanationImageFilename,
  answerImageFilename,
  deleteQuestionImageFile
};
