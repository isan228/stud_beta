const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Faculty = sequelize.define('Faculty', {
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
    },
    comment: 'Университет факультета'
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  shortName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Краткое название, например Лечфак'
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
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
      fields: ['universityId', 'shortName'],
      name: 'faculties_university_short_name_unique'
    },
    { fields: ['universityId'], name: 'faculties_university_id_idx' }
  ]
});

module.exports = Faculty;
