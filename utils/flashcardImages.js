const path = require('path');
const fs = require('fs');

const FLASHCARD_IMAGES_DIR = path.join(__dirname, '../public/uploads/flashcards');
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

if (!fs.existsSync(FLASHCARD_IMAGES_DIR)) {
  fs.mkdirSync(FLASHCARD_IMAGES_DIR, { recursive: true });
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

function flashcardImageFilename(flashcardId, side, ext) {
  const safeSide = side === 'back' ? 'back' : 'front';
  return `flashcard-${flashcardId}-${safeSide}-${Date.now()}${ext}`;
}

function deleteFlashcardImageFile(imageUrl) {
  const url = String(imageUrl || '').trim();
  if (!url.startsWith('/uploads/flashcards/')) return;
  const filePath = path.join(__dirname, '../public', url.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.warn('Не удалось удалить файл flashcard:', filePath, err.message);
  }
}

function saveFlashcardImageBuffer(flashcardId, side, file) {
  const ext = safeImageExt(file.originalname, file.mimetype);
  const filename = flashcardImageFilename(flashcardId, side, ext);
  const dest = path.join(FLASHCARD_IMAGES_DIR, filename);
  fs.writeFileSync(dest, file.buffer);
  return `/uploads/flashcards/${filename}`;
}

function imageBasenameKey(name) {
  return path.basename(String(name || '').trim()).toLowerCase();
}

module.exports = {
  FLASHCARD_IMAGES_DIR,
  isAllowedImageMime,
  safeImageExt,
  flashcardImageFilename,
  deleteFlashcardImageFile,
  saveFlashcardImageBuffer,
  imageBasenameKey
};
