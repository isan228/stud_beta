const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subject = sequelize.define('Subject', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  universityId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Universities',
      key: 'id'
    },
    comment: 'Университет (для programType=university)'
  },
  programType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'university',
    comment: 'university | usmle'
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
    {
      unique: true,
      fields: ['programType', 'universityId', 'name'],
      name: 'subjects_program_university_name_unique'
    },
    { fields: ['universityId'], name: 'subjects_university_id_idx' },
    { fields: ['programType'], name: 'subjects_program_type_idx' }
  ]
});

module.exports = Subject;
