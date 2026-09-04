const { University, Test, User, Subject, SubscriptionPlan } = require('../models');
const { Op } = require('sequelize');
const {
  ensurePlansForUniversity,
  ensurePlansForUsmle,
  uniPlanScope
} = require('./subscriptionPlans');

const KGMA = {
  name: 'Кыргызская государственная медицинская академия',
  shortName: 'КГМА',
  description: 'КГМА им. И.К. Ахунбаева'
};

/**
 * Создаёт КГМА при необходимости и проставляет universityId
 * университетскому контенту без вуза (USMLE не трогаем).
 */
async function ensureUniversities() {
  let kgma = await University.findOne({
    where: { shortName: KGMA.shortName }
  });

  if (!kgma) {
    kgma = await University.create(KGMA);
    console.log(`✅ Университет создан: ${kgma.shortName} (id=${kgma.id})`);
  }

  // Только university-программа; USMLE остаётся без universityId
  const [testsUpdated] = await Test.update(
    { universityId: kgma.id, programType: 'university' },
    {
      where: {
        universityId: null,
        programType: { [Op.or]: ['university', null] }
      }
    }
  );
  if (testsUpdated > 0) {
    console.log(`✅ Тестам без университета назначен ${kgma.shortName}: ${testsUpdated}`);
  }

  const [usersUpdated] = await User.update(
    { universityId: kgma.id },
    { where: { universityId: null } }
  );
  if (usersUpdated > 0) {
    console.log(`✅ Пользователям без университета назначен ${kgma.shortName}: ${usersUpdated}`);
  }

  const [subjectsUpdated] = await Subject.update(
    { universityId: kgma.id, programType: 'university' },
    {
      where: {
        universityId: null,
        programType: { [Op.or]: ['university', null] }
      }
    }
  );
  if (subjectsUpdated > 0) {
    console.log(`✅ Предметам без университета назначен ${kgma.shortName}: ${subjectsUpdated}`);
  }

  // Backfill programType
  await Subject.update(
    { programType: 'university' },
    { where: { programType: null } }
  ).catch(() => {});
  await Test.update(
    { programType: 'university' },
    { where: { programType: null } }
  ).catch(() => {});

  // Backfill planScope для старых тарифов вузов
  const uniPlans = await SubscriptionPlan.findAll({
    where: {
      universityId: { [Op.ne]: null },
      [Op.or]: [
        { planScope: null },
        { planScope: '' },
        { planScope: 'legacy' },
        { planScope: 'pending' },
        { planScope: 'university' }
      ]
    }
  }).catch(() => []);
  for (const plan of uniPlans || []) {
    const scope = uniPlanScope(plan.universityId);
    plan.planScope = scope;
    plan.programType = 'university';
    await plan.save();
  }

  const allUniversities = await University.findAll({ attributes: ['id', 'shortName'] });
  for (const uni of allUniversities) {
    await ensurePlansForUniversity(uni.id);
  }
  try {
    const { ensureLechfakForUniversity } = require('./ensureFaculties');
    for (const uni of allUniversities) {
      await ensureLechfakForUniversity(uni.id);
    }
  } catch (e) {
    console.warn('⚠️  ensureLechfakForUniversity:', e.message);
  }
  try {
    await ensurePlansForUsmle();
  } catch (e) {
    console.warn('⚠️  ensurePlansForUsmle:', e.message);
  }

  // Синхронизация universityId тестов с предметом (только university)
  const subjectsWithUni = await Subject.findAll({
    attributes: ['id', 'universityId', 'programType'],
    where: {
      universityId: { [Op.ne]: null },
      programType: 'university'
    }
  });
  let testsSynced = 0;
  for (const subject of subjectsWithUni) {
    const [updated] = await Test.update(
      { universityId: subject.universityId, programType: 'university' },
      {
        where: {
          subjectId: subject.id,
          [Op.or]: [
            { universityId: null },
            { universityId: { [Op.ne]: subject.universityId } },
            { programType: { [Op.or]: [null, { [Op.ne]: 'university' }] } }
          ]
        }
      }
    );
    testsSynced += updated;
  }
  if (testsSynced > 0) {
    console.log(`✅ universityId тестов синхронизирован с предметами: ${testsSynced}`);
  }

  // USMLE: тесты наследуют programType предмета
  const usmleSubjects = await Subject.findAll({
    attributes: ['id'],
    where: { programType: 'usmle' }
  });
  for (const subject of usmleSubjects) {
    await Test.update(
      { programType: 'usmle', universityId: null },
      { where: { subjectId: subject.id } }
    );
  }

  try {
    const { seedDemoUniFlashcards } = require('./seedDemoUniFlashcards');
    const seed = await seedDemoUniFlashcards({ universityId: kgma.id });
    if (!seed.skipped && (seed.createdCount > 0 || seed.topicsCreated > 0)) {
      console.log(
        `✅ Демо-карточки КГМА: разделов +${seed.topicsCreated}, карточек +${seed.createdCount} (обновлено ${seed.updatedCount})`
      );
    }
  } catch (e) {
    console.warn('⚠️  seedDemoUniFlashcards:', e.message);
  }

  return kgma;
}

module.exports = { ensureUniversities, KGMA };
