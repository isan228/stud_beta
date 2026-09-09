const SA_BLOCK_COUNT = 4;
const SA_QUESTIONS_PER_BLOCK = 40;
const SA_TIMER_MINUTES = 60;
const SA_TIMER_SECONDS = SA_TIMER_MINUTES * 60;
const SA_META_KEY = '__meta';

function isSelfAssessmentName(name) {
  return /self[-\s]?assessment/i.test(String(name || ''));
}

function isSelfAssessmentTest(test) {
  if (!test) return false;
  const kind = String(test.testKind || '').toLowerCase();
  if (kind === 'self_assessment' || kind === 'self-assessment') return true;
  return isSelfAssessmentName(test.name);
}

function extractBlockMeta(answers) {
  if (!answers || typeof answers !== 'object') return null;
  const meta = answers[SA_META_KEY];
  if (!meta || typeof meta !== 'object') return null;
  const blockIndex = parseInt(meta.blockIndex, 10);
  if (!Number.isFinite(blockIndex) || blockIndex < 1 || blockIndex > SA_BLOCK_COUNT) return null;
  return {
    blockIndex,
    kind: meta.kind || 'self_assessment'
  };
}

function withBlockMeta(answers, blockIndex) {
  const base = answers && typeof answers === 'object' ? { ...answers } : {};
  base[SA_META_KEY] = {
    kind: 'self_assessment',
    blockIndex: parseInt(blockIndex, 10)
  };
  return base;
}

function blockSliceBounds(blockIndex) {
  const idx = parseInt(blockIndex, 10);
  const start = (idx - 1) * SA_QUESTIONS_PER_BLOCK;
  return { start, end: start + SA_QUESTIONS_PER_BLOCK, blockIndex: idx };
}

module.exports = {
  SA_BLOCK_COUNT,
  SA_QUESTIONS_PER_BLOCK,
  SA_TIMER_MINUTES,
  SA_TIMER_SECONDS,
  SA_META_KEY,
  isSelfAssessmentName,
  isSelfAssessmentTest,
  extractBlockMeta,
  withBlockMeta,
  blockSliceBounds
};
