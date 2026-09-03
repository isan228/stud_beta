const MAX_TXT_ANSWERS = 30;

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
    .replace(/\\\\/g, '\\');
}

/**
 * "Field":"value" — допускает пробелы, ; после значения, экранированные кавычки.
 */
function extractQuotedField(block, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i');
  const match = String(block || '').match(re);
  return match ? unescapeTxtValue(match[1]) : null;
}

/**
 * Собирает варианты A1, A2, … без жёсткого лимита в 5.
 * Correct — номер поля (1 = A1, 6 = A6).
 */
function extractTxtAnswers(block) {
  const answers = [];
  for (let j = 1; j <= MAX_TXT_ANSWERS; j++) {
    const text = extractQuotedField(block, `A${j}`);
    if (text != null && String(text).trim() !== '') {
      answers.push({ text: String(text), index: j });
    }
  }
  return answers;
}

function mapAnswersWithCorrect(answers, correctRaw) {
  const correctNum = parseInt(correctRaw, 10);
  return answers.map((a) => ({
    text: a.text,
    isCorrect: a.index === correctNum
  }));
}

function isValidCorrectIndex(answers, correctRaw) {
  const correctNum = parseInt(correctRaw, 10);
  return Number.isInteger(correctNum) && answers.some((a) => a.index === correctNum);
}

module.exports = {
  MAX_TXT_ANSWERS,
  normalizeTxt,
  extractQuotedField,
  extractTxtAnswers,
  mapAnswersWithCorrect,
  isValidCorrectIndex
};
