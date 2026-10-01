const sequelize = require('../config/database');

/** Таблица и колонки Face ID — на случай, если sequelize.sync({ alter: true }) не отработал. */
async function ensureFaceProfilesSchema() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "FaceProfiles" (
      "id" SERIAL PRIMARY KEY,
      "userId" INTEGER,
      "enrollToken" VARCHAR(64),
      "descriptors" TEXT NOT NULL,
      "lastVerifiedAt" TIMESTAMP WITH TIME ZONE,
      "trustedDevices" TEXT,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query(`ALTER TABLE "FaceProfiles" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP WITH TIME ZONE`);
  await sequelize.query(`ALTER TABLE "FaceProfiles" ADD COLUMN IF NOT EXISTS "trustedDevices" TEXT`);
  await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS "face_profiles_user_id_unique" ON "FaceProfiles" ("userId")`);
  await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS "face_profiles_enroll_token_unique" ON "FaceProfiles" ("enrollToken")`);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "TelegramLinks" (
      "id" SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL,
      "chatId" VARCHAR(32) NOT NULL,
      "tgUsername" VARCHAR(64),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS "telegram_links_user_id_unique" ON "TelegramLinks" ("userId")`);
  await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS "telegram_links_chat_id_unique" ON "TelegramLinks" ("chatId")`);
}

module.exports = { ensureFaceProfilesSchema };
