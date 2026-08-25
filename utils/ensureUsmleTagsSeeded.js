const { QuestionTag } = require('../models');
const { USMLE_SUBJECTS, USMLE_SYSTEMS } = require('./usmleTagCatalog');
const { slugifyTag, mergeMatchingUsmleTags } = require('./usmleTagNormalize');

async function ensureUsmleTagsSeeded() {
  const allTagNames = [...USMLE_SUBJECTS, ...USMLE_SYSTEMS];
  let created = 0;

  for (const name of allTagNames) {
    const slug = slugifyTag(name);
    const [, wasCreated] = await QuestionTag.findOrCreate({
      where: { slug },
      defaults: { name, slug, isActive: true }
    });
    if (wasCreated) created++;
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

module.exports = { ensureUsmleTagsSeeded, USMLE_SUBJECTS, USMLE_SYSTEMS };
