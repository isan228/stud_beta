const sequelize = require('../config/database');

/**
 * Старые БД могли иметь Flashcards.stepGroup NOT NULL (только USMLE).
 * Для university-карточек stepGroup должен быть NULL.
 */
async function ensureFlashcardsSchema() {
  try {
    await sequelize.query(`
      ALTER TABLE "Flashcards"
      ALTER COLUMN "stepGroup" DROP NOT NULL
    `);
  } catch (e) {
    const msg = String(e.message || e);
    if (!/does not exist|не существует/i.test(msg)) {
      console.warn('Flashcards.stepGroup DROP NOT NULL:', msg);
    }
  }

  // programType мог отсутствовать на старых установках
  try {
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'Flashcards' AND column_name = 'programType'
        ) THEN
          CREATE TYPE "enum_Flashcards_programType" AS ENUM ('university', 'usmle');
          ALTER TABLE "Flashcards"
            ADD COLUMN "programType" "enum_Flashcards_programType" NOT NULL DEFAULT 'usmle';
        END IF;
      EXCEPTION
        WHEN duplicate_object THEN
          ALTER TABLE "Flashcards"
            ADD COLUMN IF NOT EXISTS "programType" "enum_Flashcards_programType" NOT NULL DEFAULT 'usmle';
      END $$;
    `);
  } catch (e) {
    /* sync({ alter }) обычно уже создаёт колонку */
  }

  try {
    await sequelize.query(`
      ALTER TABLE "Flashcards"
      ADD COLUMN IF NOT EXISTS "topicId" INTEGER REFERENCES "FlashcardTopics"(id) ON DELETE SET NULL ON UPDATE CASCADE
    `);
  } catch (e) {
    /* ignore if table/column already ok */
  }

  try {
    await sequelize.query(`
      ALTER TABLE "Flashcards"
      ADD COLUMN IF NOT EXISTS "isFree" BOOLEAN NOT NULL DEFAULT false
    `);
  } catch (e) {
    /* ignore */
  }

  try {
    await sequelize.query(`
      ALTER TABLE "Flashcards"
      ADD COLUMN IF NOT EXISTS "universityId" INTEGER REFERENCES "Universities"(id) ON DELETE CASCADE ON UPDATE CASCADE
    `);
  } catch (e) {
    /* ignore */
  }
}

module.exports = { ensureFlashcardsSchema };
