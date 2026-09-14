const { Subject, Test } = require('../models');

const NBME_SUBJECT_NAME = 'NBME';
/** Формы Step 1 как на хабе Question Banks (можно дополнять в админке). */
const NBME_STEP1_NAMES = [
  'NBME 20 (Step 1)',
  'NBME 21 (Step 1)',
  'NBME 22 (Step 1)',
  'NBME 23 (Step 1)',
  'NBME 24 (Step 1)',
  'NBME 25 (Step 1)',
  'NBME 26 (Step 1)',
  'NBME 27 (Step 1)',
  'NBME 28 (Step 1)',
  'NBME 29 (Step 1)',
  'NBME 30 (Step 1)',
  'NBME 31 (Step 1)'
];

/**
 * Гарантирует NBME-формы (Step 1) на /usmle.
 * Логика как у Self-Assessment: 4 блока × пул → 40 случайных, 60 мин.
 */
async function ensureUsmleNbme() {
  let subject = await Subject.findOne({
    where: {
      programType: 'usmle',
      universityId: null,
      name: NBME_SUBJECT_NAME
    }
  });

  if (!subject) {
    subject = await Subject.create({
      name: NBME_SUBJECT_NAME,
      programType: 'usmle',
      universityId: null,
      stepGroup: 'step1'
    });
    console.log(`✅ USMLE subject создан: ${NBME_SUBJECT_NAME}`);
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
  for (const name of NBME_STEP1_NAMES) {
    const numMatch = String(name).match(/NBME\s*(\d+)/i);
    const num = numMatch ? numMatch[1] : null;
    let test = allUsmle.find((t) => String(t.name || '').trim() === name)
      || (num
        ? allUsmle.find((t) => new RegExp(`\\bnbme\\s*${num}\\b`, 'i').test(t.name || ''))
        : null);

    if (!test) {
      const payload = {
        name,
        description: 'NBME form: 4 блока × 40 вопросов, таймер 60 минут на блок',
        subjectId: subject.id,
        universityId: null,
        programType: 'usmle',
        isFree: false,
        hasExplanations: true
      };
      try {
        test = await Test.create({ ...payload, testKind: 'nbme' });
      } catch (_) {
        test = await Test.create(payload);
      }
      console.log(`✅ USMLE NBME банк создан: ${name} (id=${test.id})`);
      created.push(test);
      continue;
    }

    let changed = false;
    try {
      if (test.testKind !== 'nbme') {
        test.testKind = 'nbme';
        changed = true;
      }
    } catch (_) {}
    if (test.name !== name) {
      test.name = name;
      changed = true;
    }
    if (Number(test.subjectId) !== Number(subject.id)) {
      test.subjectId = subject.id;
      changed = true;
    }
    if (!test.hasExplanations) {
      test.hasExplanations = true;
      changed = true;
    }
    if (changed) {
      await test.save();
      console.log(`✅ USMLE NBME обновлён: ${name} (id=${test.id})`);
    }
    created.push(test);
  }

  return created;
}

module.exports = {
  ensureUsmleNbme,
  NBME_STEP1_NAMES,
  NBME_SUBJECT_NAME
};
