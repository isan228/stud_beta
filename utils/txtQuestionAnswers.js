const MAX_TXT_ANSWERS = 30;

function extractQuotedField(block, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i');
  const match = block.match(re);
  return match ? match[1] : null;
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
  extractQuotedField,
  extractTxtAnswers,
  mapAnswersWithCorrect,
  isValidCorrectIndex
};
