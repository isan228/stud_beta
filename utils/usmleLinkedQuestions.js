const { extractTxtAnswers, mapAnswersWithCorrect, isValidCorrectIndex } = require('./txtQuestionAnswers');

const VIGNETTE_MARKER = '<<<USMLE_VIGNETTE>>>';
const QUESTION_MARKER = '<<<USMLE_QUESTION>>>';

function parseTagNames(raw) {
  if (raw == null) return [];
  return [...new Set(String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean))];
}

function formatLinkedQuestionText(vignette, questionText) {
  const v = String(vignette || '').trim();
  const q = String(questionText || '').trim();
  if (!v) return q;
  return `${VIGNETTE_MARKER}\n${v}\n${QUESTION_MARKER}\n${q}`;
}

function parseLinkedQuestionText(text) {
  const raw = String(text || '');
  const vignetteIdx = raw.indexOf(VIGNETTE_MARKER);
  const questionIdx = raw.indexOf(QUESTION_MARKER);

  if (vignetteIdx === -1 || questionIdx === -1 || questionIdx < vignetteIdx) {
    return {
      isLinked: false,
      vignette: null,
      questionText: raw.trim(),
      rawText: raw
    };
  }

  const vignette = raw
    .slice(vignetteIdx + VIGNETTE_MARKER.length, questionIdx)
    .trim();
  const questionText = raw
    .slice(questionIdx + QUESTION_MARKER.length)
    .trim();

  return {
    isLinked: Boolean(vignette && questionText),
    vignette: vignette || null,
    questionText: questionText || raw.trim(),
    rawText: raw
  };
}

function extractField(block, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i');
  const match = block.match(re);
  return match ? match[1] : null;
}

/**
 * USMLE: связанные вопросы (один клинический случай — несколько Q).
 *
 * Формат TXT:
 * "GroupID":"1";
 * "V":"Общий клинический случай...";
 * "ID":"101";
 * "Q":"Первый вопрос?";
 * "A1"..."Correct":"2"; "E":"..."; "Subject":"..."; "System":"...";
 *
 * "GroupID":"1";
 * "ID":"102";
 * "Q":"Второй вопрос по тому же случаю?";
 * ...
 *
 * Поле V задаётся один раз на группу (в первом блоке). Дальше только GroupID + ID + Q.
 */
function parseLinkedQuestionsFromText(text, options = {}) {
  const {
    requireExplanation = true,
    requireTags = true,
    parseTags = true
  } = options;

  const questions = [];
  const groupVignettes = new Map();

  // Сначала собираем случаи (V) по GroupID — они часто идут до "ID"
  for (const chunk of text.split(/(?="GroupID"\s*:\s*")/i)) {
    const groupId = extractField(chunk, 'GroupID') || extractField(chunk, 'Group');
    const vignetteInChunk = extractField(chunk, 'V')
      || extractField(chunk, 'Vignette')
      || extractField(chunk, 'Case');
    if (groupId && vignetteInChunk) {
      groupVignettes.set(String(groupId), vignetteInChunk);
    }
  }

  const blocks = text.split(/"ID"\s*:\s*"/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    try {
      const idMatch = block.match(/^(\d+)"/);
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

      const sharedVignette = groupId ? groupVignettes.get(String(groupId)) : null;
      const finalText = sharedVignette
        ? formatLinkedQuestionText(sharedVignette, questionText)
        : questionText;

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

      if (groupId && !sharedVignette) {
        console.warn(`Связанный вопрос ID ${idMatch[1]}: GroupID ${groupId} без поля V`);
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
    } catch (error) {
      console.error(`Ошибка парсинга связанного блока ${i}:`, error);
    }
  }

  console.log(`Распарсено связанных USMLE вопросов: ${questions.length}`);
  return questions;
}

module.exports = {
  VIGNETTE_MARKER,
  QUESTION_MARKER,
  formatLinkedQuestionText,
  parseLinkedQuestionText,
  parseLinkedQuestionsFromText
};
