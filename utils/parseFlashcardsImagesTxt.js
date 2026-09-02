const { parseFlashcardsFromText } = require('./parseFlashcardsTxt');

function unescapeTxtValue(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractQuotedField(block, names) {
  for (const name of names) {
    const re = new RegExp(`"${name}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'is');
    const match = block.match(re);
    if (match) return unescapeTxtValue(match[1]);
  }
  return null;
}

/**
 * TXT flashcards с картинками — имена файлов (не URL):
 * "FrontImage":"ecg-01.jpg"
 * "BackImage":"ecg-01-answer.jpg"
 * "Image":"ecg-01.jpg"  — одна картинка на обе стороны
 */
function parseFlashcardsImagesFromText(text, options = {}) {
  const cards = parseFlashcardsFromText(text, options);
  const prepared = String(text || '');
  const blocks = prepared.split(/"ID"\s*:\s*"/);
  const imageByExternalId = new Map();

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const idMatch = block.match(/^(\d+)"/);
    if (!idMatch) continue;

    const image = extractQuotedField(block, ['Image', 'Img']);
    const frontImageFile = extractQuotedField(block, ['FrontImage', 'ImageFront']) || image || null;
    const backImageFile = extractQuotedField(block, ['BackImage', 'ImageBack']) || image || null;

    imageByExternalId.set(idMatch[1], {
      frontImageFile: frontImageFile ? frontImageFile.trim() : null,
      backImageFile: backImageFile ? backImageFile.trim() : null
    });
  }

  return cards.map((card) => {
    const images = imageByExternalId.get(String(card.externalId)) || {};
    return {
      ...card,
      frontImageFile: images.frontImageFile || null,
      backImageFile: images.backImageFile || null
    };
  });
}

module.exports = {
  parseFlashcardsImagesFromText
};
