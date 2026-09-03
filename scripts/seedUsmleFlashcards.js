/**
 * Загрузка демо USMLE flashcards.
 *
 *   node scripts/seedUsmleFlashcards.js
 *   node scripts/seedUsmleFlashcards.js --step=step1
 *   node scripts/seedUsmleFlashcards.js --testId=12
 */
require('dotenv').config();
const { sequelize } = require('../models');
const { seedDemoFlashcards } = require('../utils/seedDemoFlashcards');

function readArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  await sequelize.authenticate();
  console.log('БД подключена');

  const result = await seedDemoFlashcards({
    testId: readArg('testId'),
    stepGroup: readArg('step') || 'step1'
  });

  console.log('Демо flashcards загружены:');
  console.log(`  создано: ${result.createdCount}`);
  console.log(`  обновлено: ${result.updatedCount}`);
  console.log(`  всего: ${result.total}`);
  console.log(`  testId: ${result.testId ?? 'null'}`);
  console.log(`  step: ${result.stepGroup}`);
  console.log(`  темы: ${result.topics.join(', ')}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка seed flashcards:', err.message || err);
  process.exit(1);
});
