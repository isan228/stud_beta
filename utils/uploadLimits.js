/** Максимальный размер загружаемого изображения (1 ГБ). */
const IMAGE_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;

/** Flashcard images are shown full-bleed in study UI — cap uploads to keep study snappy. */
const FLASHCARD_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

module.exports = {
  IMAGE_UPLOAD_MAX_BYTES,
  FLASHCARD_IMAGE_MAX_BYTES
};
