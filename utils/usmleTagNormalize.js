const { Op } = require('sequelize');
const { QuestionTag, QuestionTagMap } = require('../models');
const {
  USMLE_SUBJECTS,
  USMLE_SYSTEMS,
  USMLE_FLASHCARD_EXTRA_TAGS,
  ALL_FIXED_USMLE_TAGS,
  TAG_ALIASES
} = require('./usmleTagCatalog');

const CANONICAL_BY_LOWER = new Map(
  ALL_FIXED_USMLE_TAGS.map((n) => [n.toLowerCase(), n])
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

function isCanonicalUsmleTag(name) {
  return CANONICAL_BY_LOWER.has(String(name || '').trim().toLowerCase());
}

/**
 * Приводит имя к каноническому тегу при точном совпадении или алиасе.
 * Если совпадения нет — возвращает '' (неизвестный тег не создаём).
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

  const keyNoParen = key.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (TAG_ALIASES[keyNoParen]) return TAG_ALIASES[keyNoParen];

  return '';
}

async function ensureCanonicalTag(canonicalName) {
  if (!isCanonicalUsmleTag(canonicalName)) {
    throw new Error(`Не канонический тег USMLE: ${canonicalName}`);
  }
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

/**
 * Только канонические теги: найти/создать. Неизвестные имена пропускаются.
 */
async function resolveCanonicalTagsByNames(tagNames) {
  const raw = Array.isArray(tagNames) ? tagNames : [tagNames];
  const canonicalNames = [...new Set(
    raw
      .flatMap((x) => String(x || '').split(/[,;|]/))
      .map((s) => normalizeTagName(s.trim()))
      .filter(Boolean)
  )];

  const result = [];
  for (const name of canonicalNames) {
    result.push(await ensureCanonicalTag(name));
  }
  return result;
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
 * Сливает алиасы в канонические и деактивирует неизвестные теги.
 */
async function mergeMatchingUsmleTags() {
  let mergedTags = 0;
  let movedLinks = 0;
  let deactivated = 0;

  for (const name of ALL_FIXED_USMLE_TAGS) {
    await ensureCanonicalTag(name);
  }

  const tags = await QuestionTag.findAll({ order: [['id', 'ASC']] });
  for (const tag of tags) {
    const canonicalName = normalizeTagName(tag.name);
    if (!canonicalName) {
      if (tag.isActive) {
        tag.isActive = false;
        await tag.save().catch(() => {});
        deactivated += 1;
      }
      continue;
    }

    const canonical = await ensureCanonicalTag(canonicalName);
    if (Number(canonical.id) === Number(tag.id)) {
      if (tag.name !== canonicalName) {
        tag.name = canonicalName;
        await tag.save().catch(() => {});
      }
      continue;
    }

    const stillExists = await QuestionTag.findByPk(tag.id);
    if (!stillExists) continue;

    const result = await mergeTagInto(stillExists, canonical);
    if (result.deleted) {
      mergedTags += 1;
      movedLinks += result.moved;
    }
  }

  if (mergedTags > 0 || deactivated > 0) {
    console.log(
      `✅ Теги USMLE: слито дублей ${mergedTags}, перенесено связей ${movedLinks}, скрыто неизвестных ${deactivated}`
    );
  }

  return { mergedTags, movedLinks, deactivated };
}

module.exports = {
  normalizeTagName,
  slugifyTag,
  isCanonicalUsmleTag,
  mergeMatchingUsmleTags,
  ensureCanonicalTag,
  resolveCanonicalTagsByNames,
  TAG_ALIASES,
  USMLE_SUBJECTS,
  USMLE_SYSTEMS,
  USMLE_FLASHCARD_EXTRA_TAGS,
  ALL_FIXED_USMLE_TAGS
};
