const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ScheduleEntry = sequelize.define('ScheduleEntry', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  universityId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Universities',
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
  course: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Курс 1–6'
  },
  groupName: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Номер или название группы'
  },
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '1=Пн … 6=Сб'
  },
  lessonNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Номер пары'
  },
  timeStart: {
    type: DataTypes.STRING(5),
    allowNull: true,
    comment: 'Время начала HH:MM'
  },
  timeEnd: {
    type: DataTypes.STRING(5),
    allowNull: true,
    comment: 'Время окончания HH:MM'
  },
  subjectName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  teacher: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  room: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  lessonType: {
    type: DataTypes.ENUM('lecture', 'practice', 'lab', 'seminar', 'other'),
    allowNull: false,
    defaultValue: 'lecture'
  },
  weekParity: {
    type: DataTypes.ENUM('all', 'odd', 'even'),
    allowNull: false,
    defaultValue: 'all'
  },
  semester: {
    type: DataTypes.ENUM('autumn', 'spring'),
    allowNull: false,
    defaultValue: 'autumn'
  },
  academicYear: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: ''
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  source: {
    type: DataTypes.ENUM('manual', 'kgma'),
    allowNull: false,
    defaultValue: 'manual'
  },
  kgmaFacultyId: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  kgmaGroupId: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  lessonDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Конкретная дата (импорт с kgma.kg)'
  },
  externalKey: {
    type: DataTypes.STRING(150),
    allowNull: true,
    unique: true
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
  indexes: [
    { fields: ['universityId'], name: 'schedule_entries_university_id_idx' },
    { fields: ['facultyId'], name: 'schedule_entries_faculty_id_idx' },
    { fields: ['course'], name: 'schedule_entries_course_idx' },
    { fields: ['dayOfWeek'], name: 'schedule_entries_day_idx' },
    { fields: ['academicYear', 'semester'], name: 'schedule_entries_year_semester_idx' },
    { fields: ['kgmaGroupId', 'lessonDate'], name: 'schedule_entries_kgma_group_date_idx' },
    { fields: ['externalKey'], name: 'schedule_entries_external_key_idx' }
  ]
});

module.exports = ScheduleEntry;
