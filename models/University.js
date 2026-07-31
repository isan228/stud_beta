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
    allowNull: false,
    unique: true
  },
  shortName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
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
});

module.exports = University;
