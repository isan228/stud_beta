const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PromoCode = sequelize.define('PromoCode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true
  },
  discountPercent: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 100
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  usageLimit: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  usedCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

module.exports = PromoCode;
