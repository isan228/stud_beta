const sequelize = require('../config/database');

/** Миграции колонок Questions для старых БД. */
async function ensureQuestionsSchema() {
  try {
    await sequelize.query(`
      ALTER TABLE "Questions"
      ADD COLUMN IF NOT EXISTS "isFree" BOOLEAN NOT NULL DEFAULT false
    `);
  } catch (e) {
    /* ignore if table/column already ok */
  }
}

module.exports = { ensureQuestionsSchema };
