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
const Editor = require('./Editor');
const EditorAuditLog = require('./EditorAuditLog');
const ContactMessage = require('./ContactMessage');
const Transaction = require('./Transaction');
const Setting = require('./Setting');
const UserDeviceAlert = require('./UserDeviceAlert');
const News = require('./News');
const ChatMessage = require('./ChatMessage');
const PromoCode = require('./PromoCode');
const BroadcastMessage = require('./BroadcastMessage');
const UserBroadcastNotification = require('./UserBroadcastNotification');
const University = require('./University');
const Faculty = require('./Faculty');
const SubjectFaculty = require('./SubjectFaculty');
const SubjectCourse = require('./SubjectCourse');
const CatalogFavorite = require('./CatalogFavorite');
const SubscriptionPlan = require('./SubscriptionPlan');
const QuestionTag = require('./QuestionTag');
const QuestionTagMap = require('./QuestionTagMap');
const MedicalImage = require('./MedicalImage');
const ScheduleEntry = require('./ScheduleEntry');

// Определение связей
User.hasMany(TestResult, { foreignKey: 'userId', as: 'TestResults' });
TestResult.belongsTo(User, { foreignKey: 'userId', as: 'User' });

Test.hasMany(TestResult, { foreignKey: 'testId' });
TestResult.belongsTo(Test, { foreignKey: 'testId', as: 'Test' });

User.hasOne(UserStats, { foreignKey: 'userId', as: 'UserStat' });
UserStats.belongsTo(User, { foreignKey: 'userId' });

University.hasMany(User, { foreignKey: 'universityId', as: 'Users' });
User.belongsTo(University, { foreignKey: 'universityId', as: 'University' });

Faculty.hasMany(User, { foreignKey: 'facultyId', as: 'Users' });
User.belongsTo(Faculty, { foreignKey: 'facultyId', as: 'Faculty' });

University.hasMany(Test, { foreignKey: 'universityId', as: 'Tests' });
Test.belongsTo(University, { foreignKey: 'universityId', as: 'University' });

University.hasMany(Subject, { foreignKey: 'universityId', as: 'Subjects' });
Subject.belongsTo(University, { foreignKey: 'universityId', as: 'University' });

University.hasMany(Faculty, { foreignKey: 'universityId', as: 'Faculties', onDelete: 'CASCADE' });
Faculty.belongsTo(University, { foreignKey: 'universityId', as: 'University' });

Subject.belongsToMany(Faculty, {
  through: SubjectFaculty,
  foreignKey: 'subjectId',
  otherKey: 'facultyId',
  as: 'Faculties'
});
Faculty.belongsToMany(Subject, {
  through: SubjectFaculty,
  foreignKey: 'facultyId',
  otherKey: 'subjectId',
  as: 'Subjects'
});
Subject.hasMany(SubjectFaculty, { foreignKey: 'subjectId', as: 'FacultyMaps', onDelete: 'CASCADE' });
SubjectFaculty.belongsTo(Subject, { foreignKey: 'subjectId', as: 'Subject' });
Faculty.hasMany(SubjectFaculty, { foreignKey: 'facultyId', as: 'SubjectMaps', onDelete: 'CASCADE' });
SubjectFaculty.belongsTo(Faculty, { foreignKey: 'facultyId', as: 'Faculty' });

Subject.hasMany(SubjectCourse, { foreignKey: 'subjectId', as: 'Courses', onDelete: 'CASCADE' });
SubjectCourse.belongsTo(Subject, { foreignKey: 'subjectId', as: 'Subject' });

User.hasMany(CatalogFavorite, { foreignKey: 'userId', as: 'CatalogFavorites', onDelete: 'CASCADE' });
CatalogFavorite.belongsTo(User, { foreignKey: 'userId', as: 'User' });

University.hasMany(SubscriptionPlan, { foreignKey: 'universityId', as: 'SubscriptionPlans', onDelete: 'CASCADE' });
SubscriptionPlan.belongsTo(University, { foreignKey: 'universityId', as: 'University' });

Question.belongsToMany(QuestionTag, {
  through: QuestionTagMap,
  foreignKey: 'questionId',
  otherKey: 'tagId',
  as: 'Tags'
});
QuestionTag.belongsToMany(Question, {
  through: QuestionTagMap,
  foreignKey: 'tagId',
  otherKey: 'questionId',
  as: 'Questions'
});
Question.hasMany(QuestionTagMap, { foreignKey: 'questionId', as: 'TagMaps', onDelete: 'CASCADE' });
QuestionTagMap.belongsTo(Question, { foreignKey: 'questionId', as: 'Question' });
QuestionTag.hasMany(QuestionTagMap, { foreignKey: 'tagId', as: 'TagMaps', onDelete: 'CASCADE' });
QuestionTagMap.belongsTo(QuestionTag, { foreignKey: 'tagId', as: 'Tag' });

Subject.hasMany(Test, { foreignKey: 'subjectId', as: 'Tests' });
Test.belongsTo(Subject, { foreignKey: 'subjectId', as: 'Subject' });

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

// Связи для уведомлений о входе с нового устройства
User.hasMany(UserDeviceAlert, { foreignKey: 'userId', as: 'DeviceAlerts' });
UserDeviceAlert.belongsTo(User, { foreignKey: 'userId', as: 'User' });

// Связи для чатов с админом
User.hasMany(ChatMessage, { foreignKey: 'userId', as: 'ChatMessages' });
ChatMessage.belongsTo(User, { foreignKey: 'userId', as: 'User' });

// Массовые уведомления в колокольчик
BroadcastMessage.hasMany(UserBroadcastNotification, { foreignKey: 'broadcastMessageId', as: 'Deliveries' });
UserBroadcastNotification.belongsTo(BroadcastMessage, { foreignKey: 'broadcastMessageId', as: 'BroadcastMessage' });
User.hasMany(UserBroadcastNotification, { foreignKey: 'userId', as: 'BroadcastNotifications' });
UserBroadcastNotification.belongsTo(User, { foreignKey: 'userId', as: 'User' });

University.hasMany(ScheduleEntry, { foreignKey: 'universityId', as: 'ScheduleEntries', onDelete: 'CASCADE' });
ScheduleEntry.belongsTo(University, { foreignKey: 'universityId', as: 'University' });
Faculty.hasMany(ScheduleEntry, { foreignKey: 'facultyId', as: 'ScheduleEntries', onDelete: 'CASCADE' });
ScheduleEntry.belongsTo(Faculty, { foreignKey: 'facultyId', as: 'Faculty' });

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
  Editor,
  EditorAuditLog,
  ContactMessage,
  Transaction,
  Setting,
  UserDeviceAlert,
  News,
  ChatMessage,
  PromoCode,
  BroadcastMessage,
  UserBroadcastNotification,
  University,
  Faculty,
  SubjectFaculty,
  SubjectCourse,
  CatalogFavorite,
  SubscriptionPlan,
  QuestionTag,
  QuestionTagMap,
  MedicalImage,
  ScheduleEntry
};

