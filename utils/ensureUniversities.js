const { University, Test, User, Subject } = require('../models');
const { ensurePlansForUniversity } = require('./subscriptionPlans');

const KGMA = {
  name: 'Кыргызская государственная медицинская академия',
  shortName: 'КГМА',
  description: 'КГМА им. И.К. Ахунбаева'
};

/**
 * Создаёт КГМА при необходимости и проставляет universityId
 * тестам, пользователям и предметам без университета.
 */
async function ensureUniversities() {
  let kgma = await University.findOne({
    where: { shortName: KGMA.shortName }
  });

  if (!kgma) {
    kgma = await University.create(KGMA);
    console.log(`✅ Университет создан: ${kgma.shortName} (id=${kgma.id})`);
  }

  const [testsUpdated] = await Test.update(
    { universityId: kgma.id },
    { where: { universityId: null } }
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
    { universityId: kgma.id },
    { where: { universityId: null } }
  );
  if (subjectsUpdated > 0) {
    console.log(`✅ Предметам без университета назначен ${kgma.shortName}: ${subjectsUpdated}`);
  }

  const allUniversities = await University.findAll({ attributes: ['id', 'shortName'] });
  for (const uni of allUniversities) {
    await ensurePlansForUniversity(uni.id);
  }

  return kgma;
}

module.exports = { ensureUniversities, KGMA };
