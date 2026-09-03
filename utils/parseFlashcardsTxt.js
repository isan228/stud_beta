const { resolveFlashcardTopic } = require('./usmleFlashcardTopics');

const SECTION_LINE_RE = /^(?:={3,}\s*(.+?)\s*={3,}|##\s+(.+?)|\[Topic:\s*(.+?)\]|@topic\s+(.+?))\s*$/gim;

function normalizeTxt(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function unescapeTxtValue(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Достаёт значение "Name":"..." — допускает пробелы, ; после значения,
 * регистр имени поля не важен.
 */
function extractQuotedField(block, names) {
  for (const name of names) {
    const re = new RegExp(
      `"${name}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
      'i'
    );
    const match = String(block || '').match(re);
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
 * "ID":"2";
 * "Front":"...";
 * "Back":"...";
 * "Topic":"Cardiovascular System";
 */
function parseFlashcardsFromText(text, options = {}) {
  const { requireTopic = false } = options;
  const cards = [];
  const stats = {
    idBlocks: 0,
    missingFrontBack: 0,
    missingTopic: 0,
    accepted: 0
  };
  let rollingTopic = options.defaultTopic ? resolveFlashcardTopic(options.defaultTopic) : null;

  const prepared = injectTopicMarkers(normalizeTxt(text));
  const blocks = prepared.split(/"ID"\s*:\s*"/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    stats.idBlocks++;

    try {
      const idMatch = block.match(/^([^"]+)"/);
      if (!idMatch) continue;

      const externalId = String(idMatch[1] || '').trim();
      if (!externalId) continue;

      rollingTopic = getLastTopicFromBlock(block, rollingTopic);

      const frontText = extractQuotedField(block, ['Front', 'F', 'Question', 'Q']);
      const backText = extractQuotedField(block, ['Back', 'B', 'Answer', 'A']);
      if (!frontText || !backText) {
        stats.missingFrontBack++;
        console.warn(`Flashcard ID ${externalId}: нет Front/Back (или Q/A)`);
        continue;
      }

      const inlineTopic = extractQuotedField(block, [
        'Topic',
        'System',
        'Subject',
        'Category',
        'Tags',
        'Tag',
        'T'
      ]);
      // Tags может быть "Pathology, Cardiology" — берём первый
      const topicRaw = inlineTopic
        ? String(inlineTopic).split(/[,;|]/)[0].trim()
        : (rollingTopic || '');
      const topicName = resolveFlashcardTopic(topicRaw);

      if (requireTopic && !topicName) {
        stats.missingTopic++;
        console.warn(`Flashcard ID ${externalId}: не указана тема (секция или Topic/System/Subject)`);
        continue;
      }

      cards.push({
        externalId,
        frontText: frontText.trim(),
        backText: backText.trim(),
        topicName: topicName || null
      });
      stats.accepted++;
    } catch (error) {
      console.error(`Ошибка парсинга flashcard блока ${i}:`, error);
    }
  }

  const result = dedupeCardsByExternalId(cards);
  console.log(
    `Распарсено flashcards: ${result.length}` +
    ` (блоков ID: ${stats.idBlocks}, без Front/Back: ${stats.missingFrontBack}, без темы: ${stats.missingTopic})`
  );
  result._parseStats = stats;
  return result;
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
  dedupeCardsByExternalId,
  normalizeTxt
};
