/**
 * Полная синхронизация расписания КГМА с kgma.kg в локальную БД.
 *
 * Использование:
 *   node scripts/syncKgmaSchedule.js
 *   node scripts/syncKgmaSchedule.js --week-start 2026-09-08
 *   node scripts/syncKgmaSchedule.js --delay 500
 *   node scripts/syncKgmaSchedule.js --current-week
 *
 * npm:
 *   npm run sync-kgma-schedule
 */
require('dotenv').config();
const sequelize = require('../config/database');
const { ensureUniversities } = require('../utils/ensureUniversities');
const { getWeekStart } = require('../utils/kgmaSchedule');
const {
  syncAllKgmaSchedules,
  getSyncWeekStart
} = require('../utils/kgmaScheduleSync');

function parseArgs(argv) {
  const options = {
    weekStart: null,
    delayMs: parseInt(process.env.KGMA_SYNC_DELAY_MS || '350', 10),
    useCurrentWeek: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--current-week') {
      options.useCurrentWeek = true;
      continue;
    }
    if (arg === '--week-start' && argv[i + 1]) {
      options.weekStart = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--week-start=')) {
      options.weekStart = arg.slice('--week-start='.length);
      continue;
    }
    if (arg === '--delay' && argv[i + 1]) {
      options.delayMs = parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }
    if (arg.startsWith('--delay=')) {
      options.delayMs = parseInt(arg.slice('--delay='.length), 10);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Полная синхронизация расписания КГМА (все факультеты, курсы, группы).

Опции:
  --week-start YYYY-MM-DD   Неделя с указанного понедельника (по умолчанию — как в автосинке)
  --current-week            Текущая учебная неделя (понедельник этой недели)
  --delay MS                Пауза между запросами к kgma.kg (по умолчанию 350)
  -h, --help                Справка

Примеры:
  node scripts/syncKgmaSchedule.js
  node scripts/syncKgmaSchedule.js --week-start 2026-09-08 --delay 500
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const weekStart = args.weekStart
    ? getWeekStart(args.weekStart)
    : (args.useCurrentWeek ? getWeekStart() : getSyncWeekStart());

  console.log('=== Синхронизация расписания КГМА ===');
  console.log(`Неделя с: ${weekStart.toISOString().slice(0, 10)}`);
  console.log(`Пауза между группами: ${args.delayMs} мс`);
  console.log('');

  await sequelize.authenticate();
  console.log('✓ Подключение к БД установлено');

  await ensureUniversities();
  try {
    const { ensureFaculties } = require('../utils/ensureFaculties');
    await ensureFaculties();
  } catch (error) {
    console.warn('ensureFaculties:', error.message);
  }

  const startedAt = Date.now();
  let lastProgressAt = 0;

  const result = await syncAllKgmaSchedules({
    weekStart,
    delayMs: Number.isFinite(args.delayMs) ? args.delayMs : 350,
    onProgress: (progress) => {
      const now = Date.now();
      if (now - lastProgressAt < 2000 && progress.groupsProcessed !== progress.totalGroups) {
        return;
      }
      lastProgressAt = now;
      const pct = progress.totalGroups
        ? Math.round((progress.groupsProcessed / progress.totalGroups) * 100)
        : 0;
      console.log(
        `[${pct}%] групп ${progress.groupsProcessed}/${progress.totalGroups}, `
        + `добавлено ${progress.imported}, обновлено ${progress.updated}, ошибок ${progress.errors}`
      );
    }
  });

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);

  console.log('');
  console.log('=== Готово ===');
  console.log(`Неделя:           ${result.weekStart}`);
  console.log(`Групп обработано: ${result.groupsProcessed}/${result.totalGroups}`);
  console.log(`Добавлено:        ${result.imported}`);
  console.log(`Обновлено:        ${result.updated}`);
  console.log(`Ошибок:           ${result.errors}`);
  console.log(`Время:            ${elapsedMin} мин`);
  console.log(`Источник:         ${result.sourceUrl}`);

  await sequelize.close();
  process.exit(result.errors > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('Ошибка синхронизации:', error);
  try {
    await sequelize.close();
  } catch {
    // ignore
  }
  process.exit(1);
});
