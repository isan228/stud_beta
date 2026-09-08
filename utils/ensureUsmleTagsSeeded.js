const { QuestionTag } = require('../models');
const {
  USMLE_SUBJECTS,
  USMLE_SYSTEMS,
  USMLE_FLASHCARD_EXTRA_TAGS,
  ALL_FIXED_USMLE_TAGS
} = require('./usmleTagCatalog');
const { slugifyTag, mergeMatchingUsmleTags, ensureCanonicalTag } = require('./usmleTagNormalize');

async function ensureUsmleTagsSeeded() {
  let created = 0;

  for (const name of ALL_FIXED_USMLE_TAGS) {
    const slug = slugifyTag(name);
    const [, wasCreated] = await QuestionTag.findOrCreate({
      where: { slug },
      defaults: { name, slug, isActive: true }
    });
    if (wasCreated) created++;
    else await ensureCanonicalTag(name);
  }

  if (created > 0) {
    console.log(`✅ Теги USMLE: создано ${created} новых тегов`);
  }

  try {
    await mergeMatchingUsmleTags();
  } catch (e) {
    console.warn('mergeMatchingUsmleTags:', e.message);
  }
}

module.exports = {
  ensureUsmleTagsSeeded,
  USMLE_SUBJECTS,
  USMLE_SYSTEMS,
  USMLE_FLASHCARD_EXTRA_TAGS
};
