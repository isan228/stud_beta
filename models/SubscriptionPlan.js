const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Тарифы подписки.
 * planScope: "uni:{id}" для университета, "usmle" для USMLE
 * (нужен, т.к. UNIQUE с NULL universityId в PostgreSQL допускает дубликаты)
 */
const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  programType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'university',
    comment: 'university | usmle'
  },
  planScope: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'legacy',
    comment: 'uni:{id} или usmle'
  },
  universityId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Университет (null для USMLE)'
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
    allowNull: true
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
      fields: ['planScope', 'months'],
      name: 'subscription_plans_scope_months_unique'
    }
  ]
});

module.exports = SubscriptionPlan;
