const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const University = sequelize.define('University', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  shortName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Краткое название / тег, например КГМА'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
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
  // unique через indexes — иначе sync({ alter: true }) генерирует
  // невалидный SQL: ALTER COLUMN ... TYPE VARCHAR(...) UNIQUE
  indexes: [
    { unique: true, fields: ['name'], name: 'universities_name_unique' },
    { unique: true, fields: ['shortName'], name: 'universities_short_name_unique' }
  ]
});

module.exports = University;
