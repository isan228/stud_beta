const sequelize = require('../config/database');

/**
 * Готовит SubscriptionPlans до sequelize.sync.
 *
 * Проблема: default planScope='legacy'|'pending' заливает все строки одним
 * значением → UNIQUE (planScope, months) падает (несколько вузов с months=1).
 *
 * Решение: до sync проставить planScope = uni:{universityId} / usmle,
 * убрать дубли, создать уникальный индекс здесь (не через model.indexes).
 */
async function prepareSubscriptionPlansSchema() {
  const table = 'SubscriptionPlans';

  let tableDesc;
  try {
    tableDesc = await sequelize.getQueryInterface().describeTable(table);
  } catch {
    // Таблицы ещё нет — sync создаст; индекс повесим после ensure
    return;
  }

  if (!tableDesc.programType) {
    await sequelize.query(`
      ALTER TABLE "${table}"
      ADD COLUMN IF NOT EXISTS "programType" VARCHAR(20) DEFAULT 'university'
    `);
    console.log('✅ SubscriptionPlans.programType добавлен');
  }

  if (!tableDesc.planScope) {
    // Без DEFAULT — иначе все строки получат одно значение и UNIQUE сломается
    await sequelize.query(`
      ALTER TABLE "${table}"
      ADD COLUMN IF NOT EXISTS "planScope" VARCHAR(40)
    `);
    console.log('✅ SubscriptionPlans.planScope добавлен');
  }

  // USMLE-тарифы без вуза: universityId должен быть nullable
  await sequelize.query(`
    ALTER TABLE "${table}"
    ALTER COLUMN "universityId" DROP NOT NULL
  `).catch((err) => {
    console.warn('⚠️  universityId DROP NOT NULL:', err.message);
  });
  console.log('✅ SubscriptionPlans.universityId допускает NULL (USMLE)');

  // Снимаем индекс, если он есть / частично создан — пересоберём после бэкфилла
  await sequelize.query(`DROP INDEX IF EXISTS "subscription_plans_scope_months_unique"`);
  await sequelize.query(`DROP INDEX IF EXISTS "subscription_plans_university_months_unique"`);

  // university → uni:{id}
  await sequelize.query(`
    UPDATE "${table}"
    SET
      "planScope" = 'uni:' || "universityId"::text,
      "programType" = COALESCE(NULLIF(TRIM("programType"), ''), 'university')
    WHERE "universityId" IS NOT NULL
  `);

  // Без вуза / USMLE
  await sequelize.query(`
    UPDATE "${table}"
    SET
      "planScope" = 'usmle',
      "programType" = 'usmle'
    WHERE "universityId" IS NULL
      AND (
        COALESCE("programType", '') = 'usmle'
        OR "planScope" IS NULL
        OR "planScope" IN ('', 'legacy', 'pending', 'university')
      )
  `);

  // Хвосты (не должно остаться, но на всякий случай уникальный orphan)
  await sequelize.query(`
    UPDATE "${table}"
    SET "planScope" = 'orphan:' || id::text
    WHERE "planScope" IS NULL
       OR TRIM("planScope") = ''
       OR "planScope" IN ('legacy', 'pending')
  `);

  await sequelize.query(`
    ALTER TABLE "${table}"
    ALTER COLUMN "planScope" SET NOT NULL
  `).catch(() => {});

  // Дубли (planScope, months) — оставляем минимальный id
  const [, delMeta] = await sequelize.query(`
    DELETE FROM "${table}" a
    USING "${table}" b
    WHERE a.id > b.id
      AND a."planScope" IS NOT DISTINCT FROM b."planScope"
      AND a.months = b.months
  `);
  if (delMeta && delMeta.rowCount > 0) {
    console.log(`✅ Удалено дублей тарифов: ${delMeta.rowCount}`);
  }

  try {
    await sequelize.query(`
      CREATE UNIQUE INDEX "subscription_plans_scope_months_unique"
      ON "${table}" ("planScope", "months")
    `);
    console.log('✅ Индекс subscription_plans_scope_months_unique готов');
  } catch (err) {
    if (err.message && /already exists/i.test(err.message)) {
      console.log('ℹ️  Индекс subscription_plans_scope_months_unique уже есть');
    } else {
      console.warn('⚠️  Не удалось создать unique index тарифов:', err.message);
      throw err;
    }
  }

  console.log('✅ SubscriptionPlans.planScope подготовлен');
}

module.exports = { prepareSubscriptionPlansSchema };
