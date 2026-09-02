/**
 * Темы flashcards USMLE (Subject + System + спец. категории).
 * Имена нормализуются через resolveFlashcardTopic().
 */
const { USMLE_SUBJECTS, USMLE_SYSTEMS } = require('./usmleTagCatalog');
const { normalizeTagName } = require('./usmleTagNormalize');

const USMLE_FLASHCARD_EXTRA_TOPICS = [
  'Electrocardiogram (ECG) Images'
];

const FLASHCARD_TOPIC_ALIASES = {
  'renal, urinary systems, & electrolytes': 'Renal, Urinary Systems & Electrolytes',
  'renal, urinary systems and electrolytes': 'Renal, Urinary Systems & Electrolytes',
  'renal urinary systems & electrolytes': 'Renal, Urinary Systems & Electrolytes',
  renal: 'Renal, Urinary Systems & Electrolytes',

  'electrocardiogram (ecg) images': 'Electrocardiogram (ECG) Images',
  'ecg images': 'Electrocardiogram (ECG) Images',
  ecg: 'Electrocardiogram (ECG) Images',
  electrocardiogram: 'Electrocardiogram (ECG) Images',

  biochemistry: 'Biochemistry',
  genetics: 'Genetics',
  microbiology: 'Microbiology',
  pathology: 'Pathology',
  pharmacology: 'Pharmacology',
  immunology: 'Immunology',

  'psychiatric/behavioral & substance use disorder': 'Psychiatric/Behavioral & Substance Use Disorder',
  'psychiatric/behavioral and substance use disorder': 'Psychiatric/Behavioral & Substance Use Disorder',
  psychiatry: 'Psychiatric/Behavioral & Substance Use Disorder',
  psychiatric: 'Psychiatric/Behavioral & Substance Use Disorder',

  'cardiovascular system': 'Cardiovascular System',
  cardiology: 'Cardiovascular System',
  cardiovascular: 'Cardiovascular System',

  dermatology: 'Dermatology',

  'ear, nose, & throat (ent)': 'Ear, Nose & Throat (ENT)',
  'ear, nose and throat (ent)': 'Ear, Nose & Throat (ENT)',
  ent: 'Ear, Nose & Throat (ENT)',

  'endocrine, diabetes, & metabolism': 'Endocrine, Diabetes & Metabolism',
  'endocrine, diabetes and metabolism': 'Endocrine, Diabetes & Metabolism',
  endocrine: 'Endocrine, Diabetes & Metabolism',

  'female reproductive system & breast': 'Female Reproductive System & Breast',
  'female reproductive system and breast': 'Female Reproductive System & Breast',

  'gastrointestinal & nutrition': 'Gastrointestinal & Nutrition',
  'gastrointestinal and nutrition': 'Gastrointestinal & Nutrition',
  gi: 'Gastrointestinal & Nutrition',

  'hematology & oncology': 'Hematology & Oncology',
  'hematology and oncology': 'Hematology & Oncology',
  hematology: 'Hematology & Oncology',
  oncology: 'Hematology & Oncology',

  'infectious diseases': 'Infectious Diseases',
  infectious: 'Infectious Diseases',

  'male reproductive system': 'Male Reproductive System',

  'nervous system': 'Nervous System',
  neurology: 'Nervous System',

  'pregnancy, childbirth, & puerperium': 'Pregnancy, Childbirth & Puerperium',
  'pregnancy, childbirth and puerperium': 'Pregnancy, Childbirth & Puerperium',
  pregnancy: 'Pregnancy, Childbirth & Puerperium',

  'pulmonary & critical care': 'Pulmonary & Critical Care',
  pulmonary: 'Pulmonary & Critical Care',

  'rheumatology/orthopedics & sports': 'Rheumatology/Orthopedics & Sports',
  'rheumatology/orthopedics and sports': 'Rheumatology/Orthopedics & Sports',
  rheumatology: 'Rheumatology/Orthopedics & Sports',
  orthopedics: 'Rheumatology/Orthopedics & Sports'
};

const ALL_FLASHCARD_TOPICS = [
  ...USMLE_SUBJECTS,
  ...USMLE_SYSTEMS,
  ...USMLE_FLASHCARD_EXTRA_TOPICS
];

const CANONICAL_BY_LOWER = new Map(
  ALL_FLASHCARD_TOPICS.map((n) => [n.toLowerCase(), n])
);

function normalizeTopicKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*&\s*/g, ' & ')
    .replace(/\s*,\s*/g, ', ');
}

function resolveFlashcardTopic(rawName) {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return '';

  const key = normalizeTopicKey(trimmed);
  if (FLASHCARD_TOPIC_ALIASES[key]) return FLASHCARD_TOPIC_ALIASES[key];

  const keyNoParen = key.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (FLASHCARD_TOPIC_ALIASES[keyNoParen]) return FLASHCARD_TOPIC_ALIASES[keyNoParen];

  const normalized = normalizeTagName(trimmed);
  if (CANONICAL_BY_LOWER.has(normalized.toLowerCase())) {
    return CANONICAL_BY_LOWER.get(normalized.toLowerCase());
  }

  return normalized;
}

module.exports = {
  USMLE_FLASHCARD_EXTRA_TOPICS,
  ALL_FLASHCARD_TOPICS,
  FLASHCARD_TOPIC_ALIASES,
  resolveFlashcardTopic
};
