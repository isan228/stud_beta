/**
 * Ручной запуск напоминаний о парах на завтра.
 *
 * npm run send-schedule-reminders
 * node scripts/sendScheduleReminders.js --force
 */
require('dotenv').config();
const sequelize = require('../config/database');
const { runScheduleReminders } = require('../utils/scheduleReminders');

async function main() {
  const force = process.argv.includes('--force');

  await sequelize.authenticate();
  console.log('✓ Подключение к БД установлено');

  const result = await runScheduleReminders({ force });
  if (!result) {
    console.log('Напоминания не отправлены (отключено или уже выполняется).');
  } else {
    console.log('Результат:', result);
  }

  await sequelize.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('Ошибка:', error);
  try {
    await sequelize.close();
  } catch {
    // ignore
  }
  process.exit(1);
});
