/** Канонические Subject / System теги USMLE */

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
  'Social Sciences (Ethics/Legal/Professional)',
  'Electrocardiogram (ECG) Images'
];

/**
 * Короткие / альтернативные названия → канонический тег.
 * Короткие Subject (Biochemistry, Genetics…) НЕ сливаем с "(General Principles)".
 */
const TAG_ALIASES = {
  cardiology: 'Cardiovascular System',
  cardiovascular: 'Cardiovascular System',
  'cv system': 'Cardiovascular System',
  cv: 'Cardiovascular System',

  endocrine: 'Endocrine, Diabetes & Metabolism',
  'diabetes & metabolism': 'Endocrine, Diabetes & Metabolism',
  'diabetes and metabolism': 'Endocrine, Diabetes & Metabolism',

  ear: 'Ear, Nose & Throat (ENT)',
  'nose & throat (ent)': 'Ear, Nose & Throat (ENT)',
  'nose and throat (ent)': 'Ear, Nose & Throat (ENT)',
  'ear nose & throat': 'Ear, Nose & Throat (ENT)',
  'ear, nose & throat': 'Ear, Nose & Throat (ENT)',
  ent: 'Ear, Nose & Throat (ENT)',

  pregnancy: 'Pregnancy, Childbirth & Puerperium',
  'childbirth & puerperium': 'Pregnancy, Childbirth & Puerperium',
  'childbirth and puerperium': 'Pregnancy, Childbirth & Puerperium',

  renal: 'Renal, Urinary Systems & Electrolytes',
  'urinary systems & electrolytes': 'Renal, Urinary Systems & Electrolytes',
  'urinary systems and electrolytes': 'Renal, Urinary Systems & Electrolytes',

  epidemiology: 'Biostatistics & Epidemiology',
  'biostatistics and epidemiology': 'Biostatistics & Epidemiology',

  allergy: 'Allergy & Immunology',
  'allergy and immunology': 'Allergy & Immunology',

  gastrointestinal: 'Gastrointestinal & Nutrition',
  gi: 'Gastrointestinal & Nutrition',

  hematology: 'Hematology & Oncology',
  oncology: 'Hematology & Oncology',
  'hematology and oncology': 'Hematology & Oncology',

  pulmonary: 'Pulmonary & Critical Care',
  'critical care': 'Pulmonary & Critical Care',

  psychiatry: 'Psychiatric/Behavioral & Substance Use Disorder',
  psychiatric: 'Psychiatric/Behavioral & Substance Use Disorder',

  rheumatology: 'Rheumatology/Orthopedics & Sports',
  orthopedics: 'Rheumatology/Orthopedics & Sports',

  'social sciences': 'Social Sciences (Ethics/Legal/Professional)',
  ethics: 'Social Sciences (Ethics/Legal/Professional)',

  miscellaneous: 'Miscellaneous (Multisystem)',
  multisystem: 'Miscellaneous (Multisystem)',

  neurology: 'Nervous System',

  'female reproductive': 'Female Reproductive System & Breast',
  'male reproductive': 'Male Reproductive System',

  poisoning: 'Poisoning & Environmental Exposure',
  infectious: 'Infectious Diseases',

  'electrocardiogram (ecg) images': 'Electrocardiogram (ECG) Images',
  'ecg images': 'Electrocardiogram (ECG) Images',
  ecg: 'Electrocardiogram (ECG) Images',
  electrocardiogram: 'Electrocardiogram (ECG) Images',

  'biochemistry general principles': 'Biochemistry (General Principles)',
  'genetics general principles': 'Genetics (General Principles)',
  'microbiology general principles': 'Microbiology (General Principles)',
  'pathology general principles': 'Pathology (General Principles)',
  'pharmacology general principles': 'Pharmacology (General Principles)'
};

module.exports = {
  USMLE_SUBJECTS,
  USMLE_SYSTEMS,
  TAG_ALIASES
};
