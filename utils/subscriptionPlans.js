const SubscriptionPlan = require('../models/SubscriptionPlan');

/** Дефолтные тарифы университета (сом) */
const DEFAULT_PLANS = [
  { months: 1, price: 500, oldPrice: null, title: '1 месяц' },
  { months: 3, price: 950, oldPrice: 1500, title: '3 месяца' },
  { months: 12, price: 1950, oldPrice: 6000, title: '1 год' }
];

/** Дефолтные тарифы USMLE (сом) — можно менять в админке */
const DEFAULT_USMLE_PLANS = [
  { months: 1, price: 800, oldPrice: null, title: 'USMLE · 1 месяц' },
  { months: 3, price: 1500, oldPrice: 2400, title: 'USMLE · 3 месяца' },
  { months: 12, price: 3500, oldPrice: 9600, title: 'USMLE · 1 год' }
];

const ALLOWED_MONTHS = new Set([1, 3, 12]);

function planTitle(months, programType = 'university') {
  const base = months === 12 ? '1 год' : months === 1 ? '1 месяц' : months === 3 ? '3 месяца' : `${months} мес.`;
  return programType === 'usmle' ? `USMLE · ${base}` : base;
}

function uniPlanScope(universityId) {
  return `uni:${universityId}`;
}

const USMLE_PLAN_SCOPE = 'usmle';

function serializePlan(row) {
  const months = Number(row.months);
  const price = parseFloat(row.price);
  const oldPrice = row.oldPrice != null ? parseFloat(row.oldPrice) : null;
  return {
    id: row.id || null,
    programType: row.programType || 'university',
    months,
    price,
    oldPrice: Number.isFinite(oldPrice) ? oldPrice : null,
    title: row.title || planTitle(months, row.programType || 'university'),
    isActive: row.isActive !== false
  };
}

async function ensurePlansForUniversity(universityId) {
  if (!universityId) return [];
  const planScope = uniPlanScope(universityId);

  const existing = await SubscriptionPlan.findAll({
    where: { planScope },
    order: [['months', 'ASC']]
  });
  const have = new Set(existing.map((p) => Number(p.months)));

  for (const def of DEFAULT_PLANS) {
    if (have.has(def.months)) continue;
    await SubscriptionPlan.create({
      programType: 'university',
      planScope,
      universityId,
      months: def.months,
      price: def.price,
      oldPrice: def.oldPrice,
      title: def.title,
      isActive: true
    });
  }

  return SubscriptionPlan.findAll({
    where: { planScope },
    order: [['months', 'ASC']]
  });
}

async function ensurePlansForUsmle() {
  const sequelize = require('../config/database');
  const planScope = USMLE_PLAN_SCOPE;

  // Колонка могла остаться NOT NULL со старой схемы; sync не всегда снимает ограничение
  await sequelize.query(`
    ALTER TABLE "SubscriptionPlans"
    ALTER COLUMN "universityId" DROP NOT NULL
  `).catch(() => {});

  const existing = await SubscriptionPlan.findAll({
    where: { planScope },
    order: [['months', 'ASC']]
  });
  const have = new Set(existing.map((p) => Number(p.months)));

  for (const def of DEFAULT_USMLE_PLANS) {
    if (have.has(def.months)) continue;
    try {
      // Явный INSERT без universityId — после DROP NOT NULL
      await sequelize.query(
        `
        INSERT INTO "SubscriptionPlans"
          ("programType", "planScope", "months", "price", "oldPrice", "title", "isActive", "createdAt", "updatedAt")
        SELECT
          'usmle', :planScope, :months, :price, :oldPrice, :title, true, NOW(), NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM "SubscriptionPlans"
          WHERE "planScope" = :planScope AND months = :months
        )
        `,
        {
          replacements: {
            planScope,
            months: def.months,
            price: def.price,
            oldPrice: def.oldPrice,
            title: def.title
          }
        }
      );
    } catch (err) {
      console.warn(`⚠️  INSERT USMLE ${def.months} мес.:`, err.message);
      try {
        await SubscriptionPlan.create({
          programType: 'usmle',
          planScope,
          universityId: null,
          months: def.months,
          price: def.price,
          oldPrice: def.oldPrice,
          title: def.title,
          isActive: true
        });
      } catch (err2) {
        console.warn(`⚠️  Не удалось создать тариф USMLE ${def.months} мес.:`, err2.message);
      }
    }
  }

  return SubscriptionPlan.findAll({
    where: { planScope },
    order: [['months', 'ASC']]
  });
}

async function getPlansForUniversity(universityId, { includeInactive = false } = {}) {
  let plans = await ensurePlansForUniversity(universityId);
  if (!includeInactive) {
    plans = plans.filter((p) => p.isActive !== false);
  }
  return plans.map(serializePlan);
}

async function getPlansForUsmle({ includeInactive = false } = {}) {
  let plans = await ensurePlansForUsmle();
  if (!includeInactive) {
    plans = plans.filter((p) => p.isActive !== false);
  }
  return plans.map(serializePlan);
}

async function getPlanPrice(universityId, months) {
  const m = parseInt(months, 10);
  if (!ALLOWED_MONTHS.has(m) || !universityId) return null;
  const plans = await getPlansForUniversity(universityId, { includeInactive: true });
  const plan = plans.find((p) => p.months === m && p.isActive);
  return plan ? plan.price : null;
}

async function getUsmlePlanPrice(months) {
  const m = parseInt(months, 10);
  if (!ALLOWED_MONTHS.has(m)) return null;
  const plans = await getPlansForUsmle({ includeInactive: true });
  const plan = plans.find((p) => p.months === m && p.isActive);
  return plan ? plan.price : null;
}

function isSubscriptionActive(endDate) {
  return !!(endDate && new Date(endDate) > new Date());
}

module.exports = {
  DEFAULT_PLANS,
  DEFAULT_USMLE_PLANS,
  ALLOWED_MONTHS,
  USMLE_PLAN_SCOPE,
  uniPlanScope,
  planTitle,
  serializePlan,
  ensurePlansForUniversity,
  ensurePlansForUsmle,
  getPlansForUniversity,
  getPlansForUsmle,
  getPlanPrice,
  getUsmlePlanPrice,
  isSubscriptionActive
};
