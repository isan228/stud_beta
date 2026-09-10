const { Faculty, University } = require('../models');
const { KGMA } = require('./ensureUniversities');
const { fetchKgmaMeta, findKgmaFacultyInMeta } = require('./kgmaSchedule');

async function getKgmaUniversity() {
  return University.findOne({ where: { shortName: KGMA.shortName } });
}

/**
 * Найти или создать факультет КГМА в нашей БД по записи с kgma.kg.
 */
async function resolveFacultyForKgma(universityId, kgmaFaculty) {
  if (!kgmaFaculty) {
    return Faculty.findOne({
      where: { universityId, isActive: true },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    });
  }

  let faculty = await Faculty.findOne({
    where: { universityId, shortName: kgmaFaculty.shortName }
  });
  if (!faculty) {
    faculty = await Faculty.findOne({
      where: { universityId, name: kgmaFaculty.name }
    });
  }
  if (!faculty) {
    faculty = await Faculty.create({
      universityId,
      name: kgmaFaculty.name,
      shortName: String(kgmaFaculty.shortName || kgmaFaculty.name).slice(0, 50),
      sortOrder: 0,
      isActive: true
    });
  } else if (!faculty.isActive) {
    faculty.isActive = true;
    await faculty.save();
  }
  return faculty;
}

/** Подтянуть все факультеты с kgma.kg в таблицу faculties */
async function ensureKgmaFacultiesInDb(meta) {
  const university = await getKgmaUniversity();
  if (!university) return null;
  const data = meta || await fetchKgmaMeta();
  for (const kf of data.faculty || []) {
    await resolveFacultyForKgma(university.id, kf);
  }
  return university;
}

/**
 * Если у пользователя ещё «Лечфак», а в БД уже есть «Леч №1» —
 * вернуть id реального факультета для селекта (без смены в БД).
 */
async function preferKgmaFacultyId(universityId, facultyId) {
  if (!facultyId) return facultyId;
  const faculty = await Faculty.findByPk(facultyId);
  if (!faculty || Number(faculty.universityId) !== Number(universityId)) {
    return facultyId;
  }
  const key = String(faculty.shortName || '').toLowerCase();
  const nameKey = String(faculty.name || '').toLowerCase();
  const isLegacyLechfak = key === 'лечфак' || nameKey === 'лечебный факультет';
  if (!isLegacyLechfak) return facultyId;

  const real = await Faculty.findOne({
    where: { universityId, shortName: 'Леч №1', isActive: true }
  }) || await Faculty.findOne({
    where: { universityId, name: 'Лечебное дело №1', isActive: true }
  });
  return real ? real.id : facultyId;
}

module.exports = {
  getKgmaUniversity,
  resolveFacultyForKgma,
  ensureKgmaFacultiesInDb,
  preferKgmaFacultyId,
  findKgmaFacultyInMeta
};
