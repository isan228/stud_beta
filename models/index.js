const sequelize = require('../config/database');
const User = require('./User');
const Subject = require('./Subject');
const Test = require('./Test');
const Question = require('./Question');
const Answer = require('./Answer');
const Favorite = require('./Favorite');
const TestResult = require('./TestResult');
const UserStats = require('./UserStats');
const Admin = require('./Admin');
const ContactMessage = require('./ContactMessage');
const Transaction = require('./Transaction');

// Определение связей
User.hasMany(TestResult, { foreignKey: 'userId', as: 'TestResults' });
TestResult.belongsTo(User, { foreignKey: 'userId', as: 'User' });

Test.hasMany(TestResult, { foreignKey: 'testId' });
TestResult.belongsTo(Test, { foreignKey: 'testId', as: 'Test' });

User.hasOne(UserStats, { foreignKey: 'userId', as: 'UserStats' });
UserStats.belongsTo(User, { foreignKey: 'userId' });

Subject.hasMany(Test, { foreignKey: 'subjectId' });
Test.belongsTo(Subject, { foreignKey: 'subjectId' });

Test.hasMany(Question, { foreignKey: 'testId', onDelete: 'CASCADE', as: 'Questions' });
Question.belongsTo(Test, { foreignKey: 'testId', as: 'Test' });

Question.hasMany(Answer, { foreignKey: 'questionId', onDelete: 'CASCADE', as: 'Answers' });
Answer.belongsTo(Question, { foreignKey: 'questionId', as: 'Question' });

User.belongsToMany(Question, { through: Favorite, foreignKey: 'userId' });
Question.belongsToMany(User, { through: Favorite, foreignKey: 'questionId' });

// Прямые связи для Favorite (для include в запросах)
Favorite.belongsTo(Question, { foreignKey: 'questionId', as: 'Question' });
Favorite.belongsTo(User, { foreignKey: 'userId', as: 'User' });

// Связи для Transaction
User.hasMany(Transaction, { foreignKey: 'userId', as: 'Transactions' });
Transaction.belongsTo(User, { foreignKey: 'userId', as: 'User' });

module.exports = {
  sequelize,
  User,
  Subject,
  Test,
  Question,
  Answer,
  Favorite,
  TestResult,
  UserStats,
  Admin,
  ContactMessage,
  Transaction
};

