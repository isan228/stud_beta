const { extractTxtAnswers, mapAnswersWithCorrect, isValidCorrectIndex, extractQuotedField, normalizeTxt } = require('./txtQuestionAnswers');
const { normalizeTagName } = require('./usmleTagNormalize');

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
 */
function parseLinkedQuestionsFromText(text, options = {}) {
  const {
    requireExplanation = true,
    requireTags = true,
    parseTags = true
  } = options;

  const questions = [];
  const prepared = normalizeTxt(text);
  const blocks = prepared.split(/"ID"\s*:\s*"/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    try {
      const idMatch = block.match(/^([^"]+)"/);
      if (!idMatch) continue;

      let groupId = extractField(block, 'GroupID') || extractField(block, 'Group');
      if (!groupId && i === 1) {
        groupId = extractField(blocks[0], 'GroupID') || extractField(blocks[0], 'Group');
      }
      if (!groupId && i > 1) {
        groupId = extractField(blocks[i - 1], 'GroupID') || extractField(blocks[i - 1], 'Group');
      }
      const questionText = extractField(block, 'Q');
      if (!questionText) continue;

      if (!groupId) {
        console.warn(`Связанный вопрос ID ${idMatch[1]}: нет GroupID`);
        continue;
      }

      const finalText = formatLinkedQuestionText(questionText, groupId);
      const answers = extractTxtAnswers(block);

      if (answers.length < 2) {
        console.warn(`Связанный вопрос ID ${idMatch[1]}: недостаточно ответов`);
        continue;
      }

      const correctRaw = extractField(block, 'Correct');
      if (!correctRaw) {
        console.warn(`Связанный вопрос ID ${idMatch[1]}: нет Correct`);
        continue;
      }

      if (!isValidCorrectIndex(answers, correctRaw)) {
        console.warn(`Связанный вопрос ID ${idMatch[1]}: неверный Correct`);
        continue;
      }

      const explanation = extractField(block, 'E');
      if (requireExplanation && !explanation) {
        console.warn(`Связанный вопрос ID ${idMatch[1]}: нет E`);
        continue;
      }

      const tagsMatch = extractField(block, 'Tags') || extractField(block, 'T') || extractField(block, 'Tag');
      const subjectMatch = extractField(block, 'Subject');
      const systemMatch = extractField(block, 'System');
      const rawTagStr = [tagsMatch, subjectMatch, systemMatch].filter(Boolean).join(',');
      const tagNames = parseTagNames(rawTagStr);

      if (requireTags && !tagNames.length) {
        console.warn(`Связанный вопрос ID ${idMatch[1]}: нет Tags/Subject/System`);
        continue;
      }

      questions.push({
        sourceId: idMatch[1],
        linkedGroupId: String(groupId),
        text: finalText,
        explanation: explanation || null,
        tagNames: parseTags || requireTags ? tagNames : [],
        answers: mapAnswersWithCorrect(answers, correctRaw)
      });
    } catch (error) {
      console.error(`Ошибка парсинга связанного блока ${i}:`, error);
    }
  }

  console.log(`Распарсено связанных USMLE вопросов: ${questions.length}`);
  return questions;
}

module.exports = {
  GROUP_MARKER,
  VIGNETTE_MARKER,
  QUESTION_MARKER,
  formatLinkedQuestionText,
  parseLinkedQuestionText,
  parseLinkedQuestionsFromText,
  getLinkedClusterKey,
  clusterQuestionsInTxtOrder,
  pickQuestionsKeepingLinkedOrder
};
