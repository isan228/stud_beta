const { Subject, Test } = require('../models');

const SA_TEST_NAME = 'Self-Assessment 1 - Step 1';
const SA_SUBJECT_NAME = 'Self-Assessments';

/**
 * Гарантирует банк Self-Assessment 1 - Step 1 на /usmle (Step 1).
 * Вопросы админ загружает отдельно (нужно 160 = 4×40).
 */
async function ensureUsmleSelfAssessment() {
  let subject = await Subject.findOne({
    where: {
      programType: 'usmle',
      universityId: null,
      name: SA_SUBJECT_NAME
    }
  });

  if (!subject) {
    subject = await Subject.findOne({
      where: {
        programType: 'usmle',
        universityId: null,
        stepGroup: 'step1'
      },
      order: [['id', 'ASC']]
    });
  }

  if (!subject) {
    subject = await Subject.create({
      name: SA_SUBJECT_NAME,
      programType: 'usmle',
      universityId: null,
      stepGroup: 'step1'
    });
    console.log(`✅ USMLE subject создан: ${SA_SUBJECT_NAME}`);
  } else if (String(subject.stepGroup || '').toLowerCase() !== 'step1') {
    try {
      subject.stepGroup = 'step1';
      await subject.save();
    } catch (_) {}
  }

  let test = null;
  try {
    test = await Test.findOne({
      where: {
        programType: 'usmle',
        testKind: 'self_assessment',
        name: SA_TEST_NAME
      }
    });
  } catch (_) {
    test = null;
  }

  if (!test) {
    test = await Test.findOne({
      where: {
        programType: 'usmle',
        name: SA_TEST_NAME
      }
    });
  }

  if (!test) {
    const all = await Test.findAll({
      where: { programType: 'usmle' },
      attributes: ['id', 'name', 'subjectId', 'hasExplanations']
    });
    test = all.find((t) => /self[-\s]?assessment\s*1/i.test(t.name || '')) || null;
  }

  if (!test) {
    const payload = {
      name: SA_TEST_NAME,
      description: '4 блока × 40 вопросов, таймер 60 минут на блок',
      subjectId: subject.id,
      universityId: null,
      programType: 'usmle',
      isFree: false,
      hasExplanations: true
    };
    try {
      test = await Test.create({ ...payload, testKind: 'self_assessment' });
    } catch (e) {
      // Колонка testKind ещё не в БД
      test = await Test.create(payload);
    }
    console.log(`✅ USMLE банк создан: ${SA_TEST_NAME} (id=${test.id})`);
    return test;
  }

  let changed = false;
  try {
    if (test.testKind !== 'self_assessment') {
      test.testKind = 'self_assessment';
      changed = true;
    }
  } catch (_) {}
  if (test.name !== SA_TEST_NAME) {
    test.name = SA_TEST_NAME;
    changed = true;
  }
  if (!test.hasExplanations) {
    test.hasExplanations = true;
    changed = true;
  }
  if (changed) {
    await test.save();
    console.log(`✅ USMLE Self-Assessment обновлён: id=${test.id}`);
  }

  return test;
}

module.exports = {
  ensureUsmleSelfAssessment,
  SA_TEST_NAME,
  SA_SUBJECT_NAME
};
