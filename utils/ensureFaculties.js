const { University, Faculty, Subject, SubjectFaculty, SubjectCourse } = require('../models');

const LECHFAK = {
  name: 'Лечебный факультет',
  shortName: 'Лечфак',
  sortOrder: 0
};

const ALLOWED_COURSES = [1, 2, 3, 4, 5, 6];

function normalizeCourseList(raw) {
  const list = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
  const courses = [...new Set(list
    .map((c) => parseInt(c, 10))
    .filter((n) => Number.isFinite(n) && ALLOWED_COURSES.includes(n)))];
  return courses;
}

function normalizeFacultyIds(raw) {
  const list = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
  return [...new Set(list
    .map((id) => parseInt(id, 10))
    .filter((n) => Number.isFinite(n) && n > 0))];
}

async function ensureLechfakForUniversity(universityId) {
  const [faculty] = await Faculty.findOrCreate({
    where: { universityId, shortName: LECHFAK.shortName },
    defaults: {
      universityId,
      name: LECHFAK.name,
      shortName: LECHFAK.shortName,
      sortOrder: LECHFAK.sortOrder,
      isActive: true
    }
  });
  return faculty;
}

async function setSubjectFaculties(subjectId, facultyIds) {
  const ids = normalizeFacultyIds(facultyIds);
  await SubjectFaculty.destroy({ where: { subjectId } });
  for (const facultyId of ids) {
    await SubjectFaculty.findOrCreate({
      where: { subjectId, facultyId },
      defaults: { subjectId, facultyId }
    });
  }
  return ids;
}

async function setSubjectCourses(subjectId, courses) {
  const list = normalizeCourseList(courses);
  await SubjectCourse.destroy({ where: { subjectId } });
  for (const course of list) {
    await SubjectCourse.findOrCreate({
      where: { subjectId, course },
      defaults: { subjectId, course }
    });
  }
  return list;
}

/**
 * Для каждого вуза — Лечфак; все university-предметы без связей → Лечфак + курс 1.
 */
async function ensureFaculties() {
  const universities = await University.findAll({ attributes: ['id', 'shortName'] });
  const lechfakByUni = new Map();

  for (const uni of universities) {
    const faculty = await ensureLechfakForUniversity(uni.id);
    lechfakByUni.set(uni.id, faculty);
  }

  const uniSubjects = await Subject.findAll({
    where: { programType: 'university' },
    attributes: ['id', 'universityId']
  });

  let linkedFaculties = 0;
  let linkedCourses = 0;

  for (const subject of uniSubjects) {
    if (!subject.universityId) continue;

    const existingFaculties = await SubjectFaculty.count({ where: { subjectId: subject.id } });
    if (existingFaculties === 0) {
      const lechfak = lechfakByUni.get(subject.universityId)
        || await ensureLechfakForUniversity(subject.universityId);
      await SubjectFaculty.findOrCreate({
        where: { subjectId: subject.id, facultyId: lechfak.id },
        defaults: { subjectId: subject.id, facultyId: lechfak.id }
      });
      linkedFaculties += 1;
    }

    const existingCourses = await SubjectCourse.count({ where: { subjectId: subject.id } });
    if (existingCourses === 0) {
      await SubjectCourse.findOrCreate({
        where: { subjectId: subject.id, course: 1 },
        defaults: { subjectId: subject.id, course: 1 }
      });
      linkedCourses += 1;
    }
  }

  if (linkedFaculties > 0 || linkedCourses > 0) {
    console.log(`✅ Факультеты/курсы предметов: лечфак=${linkedFaculties}, курс1=${linkedCourses}`);
  }

  return { universities: universities.length, linkedFaculties, linkedCourses };
}

module.exports = {
  LECHFAK,
  ALLOWED_COURSES,
  normalizeCourseList,
  normalizeFacultyIds,
  ensureLechfakForUniversity,
  ensureFaculties,
  setSubjectFaculties,
  setSubjectCourses
};
