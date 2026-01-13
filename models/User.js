const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50]
    }
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 100]
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
    allowNull: false
  },
  referralCode: {
    type: DataTypes.STRING(20),
    unique: true,
    allowNull: true
  },
  coins: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  referredBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  subscriptionEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Дата окончания подписки'
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
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
      // Генерируем уникальный реферальный код, если его нет
      if (!user.referralCode) {
        let code;
        let exists = true;
        let attempts = 0;
        while (exists && attempts < 10) {
          code = crypto.randomBytes(4).toString('hex').toUpperCase();
          const existing = await User.findOne({ where: { referralCode: code } });
          exists = !!existing;
          attempts++;
        }
        if (!exists) {
          user.referralCode = code;
        } else {
          // Fallback: используем ID + случайные символы
          const timestamp = Date.now().toString(36).toUpperCase();
          user.referralCode = `REF${timestamp.slice(-6)}`;
        }
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
      // Генерируем реферальный код для существующих пользователей, если его нет
      if (!user.referralCode) {
        let code;
        let exists = true;
        let attempts = 0;
        while (exists && attempts < 10) {
          code = crypto.randomBytes(4).toString('hex').toUpperCase();
          const existing = await User.findOne({ where: { referralCode: code } });
          exists = !!existing;
          attempts++;
        }
        if (!exists) {
          user.referralCode = code;
        } else {
          // Fallback: используем ID + случайные символы
          const timestamp = Date.now().toString(36).toUpperCase();
          user.referralCode = `REF${timestamp.slice(-6)}`;
        }
      }
    }
  }
});

User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = User;

