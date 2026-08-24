const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/** Связь предмет ↔ курс (1–6); у предмета может быть несколько курсов */
const SubjectCourse = sequelize.define('SubjectCourse', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Subjects',
      key: 'id'
    }
  },
  course: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Номер курса (обычно 1–6)'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'SubjectCourses',
  indexes: [
    {
      unique: true,
      fields: ['subjectId', 'course'],
      name: 'subject_courses_subject_course_unique'
    },
    { fields: ['course'], name: 'subject_courses_course_idx' },
    { fields: ['subjectId'], name: 'subject_courses_subject_id_idx' }
  ]
});

module.exports = SubjectCourse;
