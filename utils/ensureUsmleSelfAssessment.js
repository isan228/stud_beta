const { Subject, Test } = require('../models');

const SA_SUBJECT_NAME = 'Self-Assessments';
const SA_TEST_NAMES = [
  'Self-Assessment 1 - Step 1',
  'Self-Assessment 2 - Step 1',
  'Self-Assessment 3 - Step 1'
];

/**
 * Гарантирует Self-Assessment 1–3 (Step 1) на /usmle.
 * В каждый банк нужно 160 вопросов (4×40).
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

  const allUsmle = await Test.findAll({
    where: { programType: 'usmle' },
    attributes: ['id', 'name', 'subjectId', 'hasExplanations', 'testKind']
  }).catch(async () => Test.findAll({
    where: { programType: 'usmle' },
    attributes: ['id', 'name', 'subjectId', 'hasExplanations']
  }));

  const created = [];
  for (let i = 0; i < SA_TEST_NAMES.length; i++) {
    const name = SA_TEST_NAMES[i];
    const num = i + 1;
    let test = allUsmle.find((t) => String(t.name || '').trim() === name)
      || allUsmle.find((t) => new RegExp(`self[-\\s]?assessment\\s*${num}\\b`, 'i').test(t.name || ''));

    if (!test) {
      const payload = {
        name,
        description: '4 блока × 40 вопросов, таймер 60 минут на блок',
        subjectId: subject.id,
        universityId: null,
        programType: 'usmle',
        isFree: false,
        hasExplanations: true
      };
      try {
        test = await Test.create({ ...payload, testKind: 'self_assessment' });
      } catch (_) {
        test = await Test.create(payload);
      }
      console.log(`✅ USMLE банк создан: ${name} (id=${test.id})`);
      created.push(test);
      continue;
    }

    let changed = false;
    try {
      if (test.testKind !== 'self_assessment') {
        test.testKind = 'self_assessment';
        changed = true;
      }
    } catch (_) {}
    if (test.name !== name) {
      test.name = name;
      changed = true;
    }
    if (!test.hasExplanations) {
      test.hasExplanations = true;
      changed = true;
    }
    if (changed) {
      await test.save();
      console.log(`✅ USMLE Self-Assessment обновлён: ${name} (id=${test.id})`);
    }
    created.push(test);
  }

  return created;
}

module.exports = {
  ensureUsmleSelfAssessment,
  SA_TEST_NAMES,
  SA_TEST_NAME: SA_TEST_NAMES[0],
  SA_SUBJECT_NAME
};
