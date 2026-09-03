const { Op } = require('sequelize');
const { Admin } = require('../models');
const { isSubscriptionActive } = require('./subscriptionPlans');

/**
 * Пользователь сайта считается админом, если email или username
 * совпадает с записью в таблице Admins.
 */
async function isAdminLinkedUser(user) {
  if (!user) return false;

  const email = user.email ? String(user.email).trim().toLowerCase() : '';
  const username = user.username ? String(user.username).trim() : '';
  if (!email && !username) return false;

  const or = [];
  if (email) or.push({ email: { [Op.iLike]: email } });
  if (username) or.push({ username: { [Op.iLike]: username } });

  const admin = await Admin.findOne({
    where: { [Op.or]: or },
    attributes: ['id']
  });
  return !!admin;
}

async function userHasUniversityAccess(user) {
  if (await isAdminLinkedUser(user)) return true;
  return isSubscriptionActive(user?.subscriptionEndDate);
}

async function userHasUsmleAccess(user) {
  if (await isAdminLinkedUser(user)) return true;
  return isSubscriptionActive(user?.usmleSubscriptionEndDate);
}

module.exports = {
  isAdminLinkedUser,
  userHasUniversityAccess,
  userHasUsmleAccess
};
