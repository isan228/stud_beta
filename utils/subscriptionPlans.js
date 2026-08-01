const SubscriptionPlan = require('../models/SubscriptionPlan');

/** Дефолтные тарифы (сом), если для университета ещё нет записей */
const DEFAULT_PLANS = [
  { months: 1, price: 500, oldPrice: null, title: '1 месяц' },
  { months: 3, price: 950, oldPrice: 1500, title: '3 месяца' },
  { months: 12, price: 1950, oldPrice: 6000, title: '1 год' }
];

const ALLOWED_MONTHS = new Set([1, 3, 12]);

function planTitle(months) {
  if (months === 12) return '1 год';
  if (months === 1) return '1 месяц';
  if (months === 3) return '3 месяца';
  return `${months} мес.`;
}

function serializePlan(row) {
  const months = Number(row.months);
  const price = parseFloat(row.price);
  const oldPrice = row.oldPrice != null ? parseFloat(row.oldPrice) : null;
  return {
    id: row.id || null,
    months,
    price,
    oldPrice: Number.isFinite(oldPrice) ? oldPrice : null,
    title: row.title || planTitle(months),
    isActive: row.isActive !== false
  };
}

/**
 * Создаёт дефолтные тарифы для университета, если их ещё нет.
 */
async function ensurePlansForUniversity(universityId) {
  if (!universityId) return [];

  const existing = await SubscriptionPlan.findAll({
    where: { universityId },
    order: [['months', 'ASC']]
  });
  const have = new Set(existing.map((p) => Number(p.months)));

  for (const def of DEFAULT_PLANS) {
    if (have.has(def.months)) continue;
    await SubscriptionPlan.create({
      universityId,
      months: def.months,
      price: def.price,
      oldPrice: def.oldPrice,
      title: def.title,
      isActive: true
    });
  }

  return SubscriptionPlan.findAll({
    where: { universityId },
    order: [['months', 'ASC']]
  });
}

/**
 * Активные тарифы университета (с автосозданием дефолтов).
 */
async function getPlansForUniversity(universityId, { includeInactive = false } = {}) {
  let plans = await ensurePlansForUniversity(universityId);
  if (!includeInactive) {
    plans = plans.filter((p) => p.isActive !== false);
  }
  return plans.map(serializePlan);
}

/**
 * Цена тарифа по длительности для университета.
 * @returns {number|null}
 */
async function getPlanPrice(universityId, months) {
  const m = parseInt(months, 10);
  if (!ALLOWED_MONTHS.has(m) || !universityId) return null;

  const plans = await getPlansForUniversity(universityId, { includeInactive: true });
  const plan = plans.find((p) => p.months === m && p.isActive);
  if (!plan) return null;
  return plan.price;
}

module.exports = {
  DEFAULT_PLANS,
  ALLOWED_MONTHS,
  planTitle,
  serializePlan,
  ensurePlansForUniversity,
  getPlansForUniversity,
  getPlanPrice
};
