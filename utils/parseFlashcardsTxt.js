const { resolveFlashcardTopic } = require('./usmleFlashcardTopics');

const SECTION_LINE_RE = /^(?:={3,}\s*(.+?)\s*={3,}|##\s+(.+?)|\[Topic:\s*(.+?)\]|@topic\s+(.+?))\s*$/gim;

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

function injectTopicMarkers(text) {
  return String(text || '').replace(SECTION_LINE_RE, (match, a, b, c, d) => {
    const topic = resolveFlashcardTopic(a || b || c || d);
    return `\n__TOPIC__:${topic}\n`;
  });
}

function getLastTopicFromBlock(block, fallbackTopic) {
  const matches = [...String(block || '').matchAll(/__TOPIC__:(.+?)(?:\n|$)/g)];
  if (!matches.length) return fallbackTopic || null;
  return matches[matches.length - 1][1].trim() || fallbackTopic || null;
}

/**
 * Формат TXT flashcards (без картинок):
 *
 * === Renal, Urinary Systems & Electrolytes ===
 * "ID":"1"
 * "Front":"... ______ ..."
 * "Back":"... полный ответ ..."
 *
 * Или тема у каждой карточки:
 * "ID":"2"
 * "Front":"..."
 * "Back":"..."
 * "Topic":"Cardiovascular System"
 */
function parseFlashcardsFromText(text, options = {}) {
  const { requireTopic = false } = options;
  const cards = [];
  let rollingTopic = options.defaultTopic ? resolveFlashcardTopic(options.defaultTopic) : null;

  const prepared = injectTopicMarkers(text);
  const blocks = prepared.split(/"ID"\s*:\s*"/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    try {
      const idMatch = block.match(/^(\d+)"/);
      if (!idMatch) continue;

      rollingTopic = getLastTopicFromBlock(block, rollingTopic);

      const frontText = extractQuotedField(block, ['Front', 'F', 'Question', 'Q']);
      const backText = extractQuotedField(block, ['Back', 'B', 'Answer', 'A']);
      if (!frontText || !backText) {
        console.warn(`Flashcard ID ${idMatch[1]}: нет Front/Back`);
        continue;
      }

      const inlineTopic = extractQuotedField(block, ['Topic', 'System', 'Subject', 'Category']);
      const topicName = resolveFlashcardTopic(inlineTopic || rollingTopic || '');
      if (requireTopic && !topicName) {
        console.warn(`Flashcard ID ${idMatch[1]}: не указана тема (секция или поле Topic/System/Subject)`);
        continue;
      }

      cards.push({
        externalId: idMatch[1],
        frontText: frontText.trim(),
        backText: backText.trim(),
        topicName: topicName || null
      });
    } catch (error) {
      console.error(`Ошибка парсинга flashcard блока ${i}:`, error);
    }
  }

  console.log(`Распарсено flashcards: ${cards.length}`);
  return dedupeCardsByExternalId(cards);
}

function dedupeCardsByExternalId(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = String(card.externalId || '').trim();
    if (!key) {
      map.set(`__empty_${map.size}`, card);
      continue;
    }
    if (map.has(key)) {
      console.warn(`Flashcard ID ${key}: дубликат в TXT, оставлен последний вариант`);
    }
    map.set(key, card);
  }
  return Array.from(map.values());
}

module.exports = {
  parseFlashcardsFromText,
  injectTopicMarkers,
  resolveFlashcardTopic,
  dedupeCardsByExternalId
};
