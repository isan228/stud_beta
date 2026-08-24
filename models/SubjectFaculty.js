const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/** Связь предмет ↔ факультет (у предмета может быть несколько факультетов) */
const SubjectFaculty = sequelize.define('SubjectFaculty', {
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
  facultyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Faculties',
      key: 'id'
    }
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
  tableName: 'SubjectFaculties',
  indexes: [
    {
      unique: true,
      fields: ['subjectId', 'facultyId'],
      name: 'subject_faculties_subject_faculty_unique'
    },
    { fields: ['facultyId'], name: 'subject_faculties_faculty_id_idx' },
    { fields: ['subjectId'], name: 'subject_faculties_subject_id_idx' }
  ]
});

module.exports = SubjectFaculty;
