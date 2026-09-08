const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const Editor = sequelize.define('Editor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  displayName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  /**
   * Права редактора:
   * {
   *   usmle: { enabled, allSubjects, subjectIds[], flashcards, medicalImages },
   *   universities: [{ universityId, allSubjects, subjectIds[], flashcards }]
   * }
   */
  permissions: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: { usmle: { enabled: false, allSubjects: true, subjectIds: [], flashcards: false, medicalImages: false }, universities: [] }
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
    beforeCreate: async (editor) => {
      if (editor.password) {
        editor.password = await bcrypt.hash(editor.password, 10);
      }
    },
    beforeUpdate: async (editor) => {
      if (editor.changed('password')) {
        editor.password = await bcrypt.hash(editor.password, 10);
      }
    }
  }
});

Editor.prototype.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = Editor;
