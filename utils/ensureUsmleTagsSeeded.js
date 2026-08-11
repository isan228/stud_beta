const { QuestionTag } = require('../models');

const USMLE_SUBJECTS = [
  'Anatomy',
  'Behavioral Science',
  'Histology',
  'Physiology',
  'Pharmacology',
  'Embryology',
  'Genetics',
  'Biostatistics',
  'Immunology',
  'Microbiology',
  'Pathology',
  'Pathophysiology',
  'Biochemistry'
];

const USMLE_SYSTEMS = [
  'Allergy & Immunology',
  'Biochemistry (General Principles)',
  'Biostatistics & Epidemiology',
  'Cardiovascular System',
  'Dermatology',
  'Ear, Nose & Throat (ENT)',
  'Endocrine, Diabetes & Metabolism',
  'Female Reproductive System & Breast',
  'Gastrointestinal & Nutrition',
  'Genetics (General Principles)',
  'Hematology & Oncology',
  'Infectious Diseases',
  'Male Reproductive System',
  'Microbiology (General Principles)',
  'Miscellaneous (Multisystem)',
  'Nervous System',
  'Ophthalmology',
  'Pathology (General Principles)',
  'Pharmacology (General Principles)',
  'Poisoning & Environmental Exposure',
  'Pregnancy, Childbirth & Puerperium',
  'Psychiatric/Behavioral & Substance Use Disorder',
  'Pulmonary & Critical Care',
  'Renal, Urinary Systems & Electrolytes',
  'Rheumatology/Orthopedics & Sports',
  'Social Sciences (Ethics/Legal/Professional)'
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function ensureUsmleTagsSeeded() {
  const allTagNames = [...USMLE_SUBJECTS, ...USMLE_SYSTEMS];
  let created = 0;

  for (const name of allTagNames) {
    const slug = slugify(name);
    const [, wasCreated] = await QuestionTag.findOrCreate({
      where: { slug },
      defaults: { name, slug, isActive: true }
    });
    if (wasCreated) created++;
  }

  if (created > 0) {
    console.log(`✅ Теги USMLE: создано ${created} новых тегов`);
  }
}

module.exports = { ensureUsmleTagsSeeded, USMLE_SUBJECTS, USMLE_SYSTEMS };
