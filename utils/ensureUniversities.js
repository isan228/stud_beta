const { University, Test, User } = require('../models');

const KGMA = {
  name: 'Кыргызская государственная медицинская академия',
  shortName: 'КГМА',
  description: 'КГМА им. И.К. Ахунбаева'
};

/**
 * Создаёт КГМА при необходимости и проставляет universityId
 * всем тестам и пользователям без университета.
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

  return kgma;
}

module.exports = { ensureUniversities, KGMA };
