const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/** Избранные предметы и тесты (не вопросы) */
const CatalogFavorite = sequelize.define('CatalogFavorite', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  itemType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'subject | test'
  },
  itemId: {
    type: DataTypes.INTEGER,
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
  tableName: 'CatalogFavorites',
  indexes: [
    {
      unique: true,
      fields: ['userId', 'itemType', 'itemId'],
      name: 'catalog_favorites_user_type_item_unique'
    },
    { fields: ['userId', 'itemType'], name: 'catalog_favorites_user_type_idx' }
  ]
});

module.exports = CatalogFavorite;
