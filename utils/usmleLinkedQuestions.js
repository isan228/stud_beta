const {
  extractTxtAnswers,
  mapAnswersWithCorrect,
  isValidCorrectIndex,
  extractQuotedField,
  extractLastQuotedField,
  normalizeTxt
} = require('./txtQuestionAnswers');
const { normalizeTagName, hasRequiredSubjectAndSystem } = require('./usmleTagNormalize');

const GROUP_MARKER = '<<<USMLE_GROUP>>>';
const VIGNETTE_MARKER = '<<<USMLE_VIGNETTE>>>';
const QUESTION_MARKER = '<<<USMLE_QUESTION>>>';

function parseTagNames(raw) {
  if (raw == null) return [];
  return [...new Set(String(raw)
    .split(/[,;|]/)
    .map((s) => normalizeTagName(s.trim()))
    .filter(Boolean))];
}

/** Связанный вопрос: только GroupID + текст Q (без поля V). */
function formatLinkedQuestionText(questionText, groupId) {
  const q = String(questionText || '').trim();
  if (!groupId) return q;
  return `${GROUP_MARKER}${String(groupId)}\n${QUESTION_MARKER}\n${q}`;
}

function parseLinkedQuestionText(text) {
  const raw = String(text || '');
  const vignetteIdx = raw.indexOf(VIGNETTE_MARKER);
  const questionIdx = raw.indexOf(QUESTION_MARKER);

  let groupId = null;
  const groupIdx = raw.indexOf(GROUP_MARKER);
  if (groupIdx !== -1) {
    const after = raw.slice(groupIdx + GROUP_MARKER.length);
    const end = after.search(/[\r\n<]/);
    groupId = (end === -1 ? after : after.slice(0, end)).trim() || null;
  }

  // Новый формат: Group + Question без виньетки
  if (groupId && questionIdx !== -1 && (vignetteIdx === -1 || vignetteIdx > questionIdx)) {
    const questionText = raw.slice(questionIdx + QUESTION_MARKER.length).trim();
    return {
      isLinked: Boolean(questionText),
      groupId,
      vignette: null,
      questionText: questionText || raw.trim(),
      rawText: raw
    };
  }

  // Старый формат с виньеткой — читаем Q, виньетку не показываем
  if (vignetteIdx !== -1 && questionIdx !== -1 && questionIdx > vignetteIdx) {
    const questionText = raw.slice(questionIdx + QUESTION_MARKER.length).trim();
    return {
      isLinked: Boolean(questionText || groupId),
      groupId,
      vignette: null,
      questionText: questionText || raw.trim(),
      rawText: raw
    };
  }

  if (groupId) {
    return {
      isLinked: true,
      groupId,
      vignette: null,
      questionText: raw.replace(GROUP_MARKER + groupId, '').trim() || raw.trim(),
      rawText: raw
    };
  }

  return {
    isLinked: false,
    groupId: null,
    vignette: null,
    questionText: raw.trim(),
    rawText: raw
  };
}

function getLinkedClusterKey(question) {
  const parsed = parseLinkedQuestionText(question && question.text);
  if (parsed.groupId) return `g:${parsed.groupId}`;
  return `q:${question && question.id}`;
}

function compareQuestionTxtOrder(a, b) {
  const ta = new Date(a.createdAt || 0).getTime();
  const tb = new Date(b.createdAt || 0).getTime();
  if (ta !== tb) return ta - tb;
  return (a.id || 0) - (b.id || 0);
}

function clusterQuestionsInTxtOrder(questions) {
  const sorted = [...(questions || [])].sort(compareQuestionTxtOrder);
  const clusters = [];
  const indexByKey = new Map();
  for (const q of sorted) {
    const key = getLinkedClusterKey(q);
    if (key.startsWith('q:') || !indexByKey.has(key)) {
      indexByKey.set(key, clusters.length);
      clusters.push({ key, items: [q] });
    } else {
      clusters[indexByKey.get(key)].items.push(q);
    }
  }
  return clusters;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function flattenQuestionClusters(clusters) {
  return clusters.flatMap((c) => c.items);
}

function pickQuestionsKeepingLinkedOrder(questions, limit, { shuffleGroups = true } = {}) {
  const clusters = clusterQuestionsInTxtOrder(questions);
  if (shuffleGroups) shuffleInPlace(clusters);
  if (!Number.isFinite(limit) || limit <= 0 || limit >= flattenQuestionClusters(clusters).length) {
    return flattenQuestionClusters(clusters);
  }
  const picked = [];
  let count = 0;
  for (const cluster of clusters) {
    if (count >= limit) break;
    picked.push(cluster);
    count += cluster.items.length;
  }
  return flattenQuestionClusters(picked);
}

function extractField(block, field) {
  return extractQuotedField(block, field);
}

/**
 * GroupID стоит перед "ID" → в хвосте предыдущего split-блока (последнее вхождение).
 * Также допускаем GroupID сразу после ID, но до Q.
 */
function resolveGroupIdForBlock(blocks, blockIndex) {
  const preamble = blocks[blockIndex - 1] || '';
  const fromPreamble =
    extractLastQuotedField(preamble, 'GroupID') || extractLastQuotedField(preamble, 'Group');
  if (fromPreamble) return String(fromPreamble).trim() || null;

  const block = blocks[blockIndex] || '';
  const qIdx = block.search(/"Q"\s*:/i);
  const beforeQ = qIdx === -1 ? block : block.slice(0, qIdx);
  const inline =
    extractQuotedField(beforeQ, 'GroupID') || extractQuotedField(beforeQ, 'Group');
  return inline ? String(inline).trim() || null : null;
}

/**
 * USMLE: связанные вопросы (несколько Q с одним GroupID).
 *
 * "GroupID":"1";
 * "ID":"101";
 * "Q":"Первый вопрос?";
 * ...
 *
 * "GroupID":"1";
 * "ID":"102";
 * "Q":"Второй вопрос?";
 *
 * Поле V больше не используется (игнорируется, если есть в файле).
 *
 * options.allowSingles — вопросы без GroupID тоже принимаются (одиночные).
 */
function parseLinkedQuestionsFromText(text, options = {}) {
  const {
    requireExplanation = true,
    requireTags = true,
    parseTags = true,
    allowSingles = false
  } = options;

  const questions = [];
  const stats = {
    idBlocks: 0,
    linked: 0,
    singles: 0,
    skippedNoGroup: 0,
    missingQ: 0,
    missingAnswers: 0,
    missingCorrect: 0,
    missingExplanation: 0,
    missingTags: 0,
    accepted: 0
  };
  const prepared = normalizeTxt(text);
  const blocks = prepared.split(/"ID"\s*:\s*"/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    stats.idBlocks++;

    try {
      const idMatch = block.match(/^([^"]+)"/);
      if (!idMatch) continue;

      const groupId = resolveGroupIdForBlock(blocks, i);
      const questionText = extractField(block, 'Q');
      if (!questionText) {
        stats.missingQ++;
        continue;
      }

      if (!groupId && !allowSingles) {
        stats.skippedNoGroup++;
        console.warn(`Связанный вопрос ID ${idMatch[1]}: нет GroupID`);
        continue;
      }

      const finalText = groupId
        ? formatLinkedQuestionText(questionText, groupId)
        : String(questionText).trim();
      const answers = extractTxtAnswers(block);

      if (answers.length < 2) {
        stats.missingAnswers++;
        console.warn(`Связанный вопрос ID ${idMatch[1]}: недостаточно ответов`);
        continue;
      }

      const correctRaw = extractField(block, 'Correct');
      if (!correctRaw) {
        stats.missingCorrect++;
        console.warn(`Связанный вопрос ID ${idMatch[1]}: нет Correct`);
        continue;
      }

      if (!isValidCorrectIndex(answers, correctRaw)) {
        stats.missingCorrect++;
        console.warn(`Связанный вопрос ID ${idMatch[1]}: неверный Correct`);
        continue;
      }

      const explanation = extractField(block, 'E');
      if (requireExplanation && !explanation) {
        stats.missingExplanation++;
        console.warn(`Связанный вопрос ID ${idMatch[1]}: нет E`);
        continue;
      }

      const tagsMatch = extractField(block, 'Tags') || extractField(block, 'T') || extractField(block, 'Tag');
      const subjectMatch = extractField(block, 'Subject');
      const systemMatch = extractField(block, 'System');
      const rawTagStr = [tagsMatch, subjectMatch, systemMatch].filter(Boolean).join(',');
      const tagNames = parseTagNames(rawTagStr);

      if (requireTags && !hasRequiredSubjectAndSystem(tagNames)) {
        stats.missingTags++;
        console.warn(`Связанный вопрос ID ${idMatch[1]}: нужны и Subject, и System`);
        continue;
      }

      questions.push({
        sourceId: idMatch[1],
        linkedGroupId: groupId ? String(groupId) : null,
        text: finalText,
        explanation: explanation || null,
        tagNames: parseTags || requireTags ? tagNames : [],
        answers: mapAnswersWithCorrect(answers, correctRaw)
      });
      stats.accepted++;
      if (groupId) stats.linked++;
      else stats.singles++;
    } catch (error) {
      console.error(`Ошибка парсинга связанного блока ${i}:`, error);
    }
  }

  console.log(
    `Распарсено USMLE вопросов: ${questions.length}` +
    ` (связанных: ${stats.linked}, одиночных: ${stats.singles})`
  );
  questions._parseStats = stats;
  return questions;
}

/** Смешанный TXT: связанные (с GroupID) + одиночные (без GroupID) в одном файле. */
function parseMixedUsmleQuestionsFromText(text, options = {}) {
  return parseLinkedQuestionsFromText(text, {
    requireExplanation: true,
    requireTags: true,
    parseTags: true,
    ...options,
    allowSingles: true
  });
}

module.exports = {
  GROUP_MARKER,
  VIGNETTE_MARKER,
  QUESTION_MARKER,
  formatLinkedQuestionText,
  parseLinkedQuestionText,
  parseLinkedQuestionsFromText,
  parseMixedUsmleQuestionsFromText,
  resolveGroupIdForBlock,
  getLinkedClusterKey,
  clusterQuestionsInTxtOrder,
  pickQuestionsKeepingLinkedOrder
};
