const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  universityId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Университет, для которого задан тариф'
  },
  months: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Длительность: 1, 3 или 12'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  oldPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Зачёркнутая «старая» цена для отображения скидки'
  },
  title: {
    type: DataTypes.STRING(100),
    allowNull: true
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
      fields: ['universityId', 'months'],
      name: 'subscription_plans_university_months_unique'
    }
  ]
});

module.exports = SubscriptionPlan;
