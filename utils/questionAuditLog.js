const { EditorAuditLog, Test } = require('../models');

const SNIPPET_LEN = 200;

function snippet(text, max = SNIPPET_LEN) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function snapshotFromQuestion(question, answers = []) {
  if (!question) return null;
  return {
    text: question.text,
    testId: question.testId,
    answers: (answers || []).map(a => ({
      id: a.id,
      text: a.text,
      isCorrect: Boolean(a.isCorrect)
    }))
  };
}

function buildAnswerSummary(answers) {
  const list = answers || [];
  const correct = list.filter(a => a.isCorrect).length;
  return `${list.length} отв., ${correct} верн.`;
}

function buildUpdateDetails(before, after, newTestId) {
  const parts = [];
  if (!before || !after) return parts;

  if (before.text !== after.text) {
    parts.push('изменён текст вопроса');
  }
  if (Number(before.testId) !== Number(after.testId ?? newTestId)) {
    parts.push(`перенос в другой тест (был ${before.testId}, стал ${after.testId ?? newTestId})`);
  }

  const beforeIds = new Set((before.answers || []).map(a => a.id).filter(Boolean));
  const afterIds = new Set((after.answers || []).map(a => a.id).filter(Boolean));
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const a of after.answers || []) {
    if (!a.id) {
      added += 1;
      continue;
    }
    const prev = (before.answers || []).find(b => b.id === a.id);
    if (!prev) {
      added += 1;
    } else if (prev.text !== a.text || Boolean(prev.isCorrect) !== Boolean(a.isCorrect)) {
      changed += 1;
    }
  }
  for (const a of before.answers || []) {
    if (a.id && !afterIds.has(a.id)) removed += 1;
  }

  if (added) parts.push(`добавлено ответов: ${added}`);
  if (removed) parts.push(`удалено ответов: ${removed}`);
  if (changed) parts.push(`изменено ответов: ${changed}`);
  if (!parts.length) parts.push('обновление без видимых изменений');

  return parts;
}

async function resolveTestName(testId, testFromInclude) {
  if (testFromInclude?.name) return testFromInclude.name;
  if (!testId) return null;
  const test = await Test.findByPk(testId, { attributes: ['name'] });
  return test?.name || null;
}

async function logQuestionAudit({
  actorType,
  actorId,
  actorUsername,
  action,
  question,
  test,
  beforeSnapshot,
  afterSnapshot,
  extraDetails
}) {
  try {
    const testId = question?.testId ?? test?.id ?? beforeSnapshot?.testId ?? null;
    const testName = await resolveTestName(testId, test);

    let details = extraDetails || '';
    let questionTextBefore = null;
    let questionTextAfter = null;

    if (action === 'create') {
      questionTextAfter = snippet(afterSnapshot?.text ?? question?.text);
      details = details || `Создан вопрос. ${buildAnswerSummary(afterSnapshot?.answers)}`;
    } else if (action === 'delete') {
      questionTextBefore = snippet(beforeSnapshot?.text ?? question?.text);
      details = details || `Удалён вопрос. ${buildAnswerSummary(beforeSnapshot?.answers)}`;
    } else if (action === 'update') {
      questionTextBefore = snippet(beforeSnapshot?.text);
      questionTextAfter = snippet(afterSnapshot?.text);
      const changeParts = buildUpdateDetails(beforeSnapshot, afterSnapshot, question?.testId);
      details = details || changeParts.join('; ');
      details += `. Было: ${buildAnswerSummary(beforeSnapshot?.answers)} → стало: ${buildAnswerSummary(afterSnapshot?.answers)}`;
    }

    await EditorAuditLog.create({
      actorType,
      actorId,
      actorUsername: String(actorUsername || 'unknown').slice(0, 100),
      action,
      questionId: question?.id ?? beforeSnapshot?.questionId ?? null,
      testId,
      testName: testName ? String(testName).slice(0, 255) : null,
      questionTextBefore,
      questionTextAfter,
      details: details ? String(details).slice(0, 4000) : null
    });
  } catch (err) {
    console.error('Не удалось записать журнал правок:', err);
  }
}

async function logErrorReportAudit({ actorType, actorId, actorUsername, reportId, status, questionId, testId, testName }) {
  try {
    await EditorAuditLog.create({
      actorType,
      actorId,
      actorUsername: String(actorUsername || 'unknown').slice(0, 100),
      action: 'error_report',
      questionId: questionId || null,
      testId: testId || null,
      testName: testName ? String(testName).slice(0, 255) : null,
      details: `Отчёт #${reportId}: статус → ${status}`
    });
  } catch (err) {
    console.error('Не удалось записать журнал отчёта:', err);
  }
}

module.exports = {
  snippet,
  snapshotFromQuestion,
  logQuestionAudit,
  logErrorReportAudit
};
