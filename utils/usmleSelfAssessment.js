const SA_BLOCK_COUNT = 4;
const SA_QUESTIONS_PER_BLOCK = 40;
const NBME_QUESTIONS_PER_BLOCK = 50;
const SA_TIMER_MINUTES = 60;
const SA_TIMER_SECONDS = SA_TIMER_MINUTES * 60;
const SA_META_KEY = '__meta';

function isSelfAssessmentName(name) {
  return /self[-\s]?assessment/i.test(String(name || ''));
}

function isNbmeName(name) {
  return /\bnbme\b/i.test(String(name || ''));
}

function isSelfAssessmentTest(test) {
  if (!test) return false;
  const kind = String(test.testKind || '').toLowerCase();
  if (kind === 'self_assessment' || kind === 'self-assessment') return true;
  if (kind === 'nbme') return false;
  return isSelfAssessmentName(test.name);
}

function isNbmeTest(test) {
  if (!test) return false;
  const kind = String(test.testKind || '').toLowerCase();
  if (kind === 'nbme') return true;
  if (kind === 'self_assessment' || kind === 'self-assessment') return false;
  return isNbmeName(test.name);
}

function isBlockExamTest(test) {
  return isSelfAssessmentTest(test) || isNbmeTest(test);
}

function getBlockExamKind(test) {
  if (isNbmeTest(test)) return 'nbme';
  if (isSelfAssessmentTest(test)) return 'self_assessment';
  return 'standard';
}

/** Сколько вопросов выдаётся на попытку блока (SA=40, NBME=50). */
function getQuestionsPerBlock(testOrKind) {
  if (typeof testOrKind === 'string') {
    return String(testOrKind).toLowerCase() === 'nbme'
      ? NBME_QUESTIONS_PER_BLOCK
      : SA_QUESTIONS_PER_BLOCK;
  }
  return isNbmeTest(testOrKind) ? NBME_QUESTIONS_PER_BLOCK : SA_QUESTIONS_PER_BLOCK;
}

function extractBlockMeta(answers) {
  if (!answers || typeof answers !== 'object') return null;
  const meta = answers[SA_META_KEY];
  if (!meta || typeof meta !== 'object') return null;
  const blockIndex = parseInt(meta.blockIndex, 10);
  if (!Number.isFinite(blockIndex) || blockIndex < 1 || blockIndex > SA_BLOCK_COUNT) return null;
  const kind = String(meta.kind || 'self_assessment').toLowerCase();
  return {
    blockIndex,
    kind: kind === 'nbme' ? 'nbme' : 'self_assessment'
  };
}

function withBlockMeta(answers, blockIndex, kind = 'self_assessment') {
  const base = answers && typeof answers === 'object' ? { ...answers } : {};
  const normalized = String(kind || '').toLowerCase() === 'nbme' ? 'nbme' : 'self_assessment';
  base[SA_META_KEY] = {
    kind: normalized,
    blockIndex: parseInt(blockIndex, 10)
  };
  return base;
}

function blockSliceBounds(blockIndex, questionsPerBlock = SA_QUESTIONS_PER_BLOCK) {
  const idx = parseInt(blockIndex, 10);
  const size = Number(questionsPerBlock) > 0 ? Number(questionsPerBlock) : SA_QUESTIONS_PER_BLOCK;
  const start = (idx - 1) * size;
  return { start, end: start + size, blockIndex: idx };
}

async function countQuestionsInSaBlock(QuestionModel, testId, blockIndex, questionsPerBlock = SA_QUESTIONS_PER_BLOCK) {
  const idx = parseInt(blockIndex, 10);
  try {
    const tagged = await QuestionModel.count({
      where: { testId, saBlockIndex: idx }
    });
    if (tagged > 0) return tagged;
  } catch (_) {}

  const all = await QuestionModel.findAll({
    where: { testId },
    attributes: ['id'],
    order: [['createdAt', 'ASC'], ['id', 'ASC']]
  });
  const { start, end } = blockSliceBounds(idx, questionsPerBlock);
  return all.slice(start, end).length;
}

async function loadSaBlockQuestionRows(
  QuestionModel,
  testId,
  blockIndex,
  attributes = ['id', 'text', 'createdAt', 'saBlockIndex'],
  questionsPerBlock = SA_QUESTIONS_PER_BLOCK
) {
  const idx = parseInt(blockIndex, 10);
  const findOpts = {
    where: { testId, saBlockIndex: idx },
    order: [['createdAt', 'ASC'], ['id', 'ASC']]
  };
  if (attributes) findOpts.attributes = attributes;

  let tagged = [];
  try {
    tagged = await QuestionModel.findAll(findOpts);
  } catch (_) {
    tagged = [];
  }
  if (tagged.length) return tagged;

  const allOpts = {
    where: { testId },
    order: [['createdAt', 'ASC'], ['id', 'ASC']]
  };
  if (attributes) allOpts.attributes = attributes;
  const all = await QuestionModel.findAll(allOpts);
  const { start, end } = blockSliceBounds(idx, questionsPerBlock);
  return all.slice(start, end);
}

module.exports = {
  SA_BLOCK_COUNT,
  SA_QUESTIONS_PER_BLOCK,
  NBME_QUESTIONS_PER_BLOCK,
  SA_TIMER_MINUTES,
  SA_TIMER_SECONDS,
  SA_META_KEY,
  isSelfAssessmentName,
  isNbmeName,
  isSelfAssessmentTest,
  isNbmeTest,
  isBlockExamTest,
  getBlockExamKind,
  getQuestionsPerBlock,
  extractBlockMeta,
  withBlockMeta,
  blockSliceBounds,
  countQuestionsInSaBlock,
  loadSaBlockQuestionRows
};
