const { Op } = require('sequelize');
const { QuestionTag, QuestionTagMap } = require('../models');
const { USMLE_SUBJECTS, USMLE_SYSTEMS, TAG_ALIASES } = require('./usmleTagCatalog');

const CANONICAL_BY_LOWER = new Map(
  [...USMLE_SUBJECTS, ...USMLE_SYSTEMS].map((n) => [n.toLowerCase(), n])
);

function normalizeAliasKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*&\s*/g, ' & ')
    .replace(/\s*,\s*/g, ', ');
}

function slugifyTag(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `tag-${Date.now()}`;
}

/**
 * Приводит имя тега к каноническому Subject/System при совпадении или алиасе.
 */
function normalizeTagName(rawName) {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (CANONICAL_BY_LOWER.has(lower)) {
    return CANONICAL_BY_LOWER.get(lower);
  }

  const key = normalizeAliasKey(trimmed);
  if (TAG_ALIASES[key]) return TAG_ALIASES[key];

  // Ключ без скобок ENT и т.п.
  const keyNoParen = key.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (TAG_ALIASES[keyNoParen]) return TAG_ALIASES[keyNoParen];

  return trimmed;
}

async function ensureCanonicalTag(canonicalName) {
  const slug = slugifyTag(canonicalName);
  let tag = await QuestionTag.findOne({
    where: {
      [Op.or]: [
        { slug },
        { name: { [Op.iLike]: canonicalName } }
      ]
    }
  });
  if (!tag) {
    tag = await QuestionTag.create({
      name: canonicalName,
      slug,
      isActive: true
    });
  } else {
    let changed = false;
    if (tag.name !== canonicalName) {
      tag.name = canonicalName;
      changed = true;
    }
    if (tag.slug !== slug) {
      // slug может конфликтовать — пробуем
      try {
        tag.slug = slug;
        changed = true;
      } catch (_) { /* keep */ }
    }
    if (!tag.isActive) {
      tag.isActive = true;
      changed = true;
    }
    if (changed) await tag.save().catch(() => {});
  }
  return tag;
}

async function mergeTagInto(aliasTag, canonicalTag) {
  if (!aliasTag || !canonicalTag || Number(aliasTag.id) === Number(canonicalTag.id)) {
    return { moved: 0, deleted: false };
  }

  const maps = await QuestionTagMap.findAll({
    where: { tagId: aliasTag.id },
    attributes: ['questionId']
  });
  let moved = 0;
  for (const row of maps) {
    const [, created] = await QuestionTagMap.findOrCreate({
      where: { questionId: row.questionId, tagId: canonicalTag.id },
      defaults: { questionId: row.questionId, tagId: canonicalTag.id }
    });
    if (created) moved += 1;
  }
  await QuestionTagMap.destroy({ where: { tagId: aliasTag.id } });
  await aliasTag.destroy();
  return { moved, deleted: true };
}

/**
 * Сливает совпадающие/алиасные теги в канонические.
 */
async function mergeMatchingUsmleTags() {
  let mergedTags = 0;
  let movedLinks = 0;

  // Сначала гарантируем канонические
  for (const name of [...USMLE_SUBJECTS, ...USMLE_SYSTEMS]) {
    await ensureCanonicalTag(name);
  }

  const tags = await QuestionTag.findAll({ order: [['id', 'ASC']] });
  for (const tag of tags) {
    const canonicalName = normalizeTagName(tag.name);
    if (!canonicalName) continue;

    const canonical = await ensureCanonicalTag(canonicalName);
    if (Number(canonical.id) === Number(tag.id)) {
      if (tag.name !== canonicalName) {
        tag.name = canonicalName;
        await tag.save().catch(() => {});
      }
      continue;
    }

    // Перезагрузить — тег мог уже быть удалён в этой же сессии
    const stillExists = await QuestionTag.findByPk(tag.id);
    if (!stillExists) continue;

    const result = await mergeTagInto(stillExists, canonical);
    if (result.deleted) {
      mergedTags += 1;
      movedLinks += result.moved;
    }
  }

  if (mergedTags > 0) {
    console.log(`✅ Теги USMLE: слито дублей ${mergedTags}, перенесено связей ${movedLinks}`);
  }

  return { mergedTags, movedLinks };
}

module.exports = {
  normalizeTagName,
  slugifyTag,
  mergeMatchingUsmleTags,
  ensureCanonicalTag,
  TAG_ALIASES
};
