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
    comment: 'Университет, к которому относится предмет'
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
  // Не ставить unique на колонку name — иначе alter ломает SQL;
  // уникальность названия в рамках университета
  indexes: [
    {
      unique: true,
      fields: ['universityId', 'name'],
      name: 'subjects_university_name_unique'
    },
    { fields: ['universityId'], name: 'subjects_university_id_idx' }
  ]
});

module.exports = Subject;
