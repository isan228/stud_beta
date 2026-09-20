const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { userHasUsmleAccess } = require('../utils/adminUserAccess');

/**
 * Soft gate for /api/tests/usmle/*:
 * - attaches req.user when JWT is valid
 * - sets req.hasUsmleSubscription
 * - does NOT block unpaid/guest users (they may use free banks only)
 */
async function requireUsmleSubscription(req, res, next) {
  try {
    req.hasUsmleSubscription = false;
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return next();

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next();
    }

    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'email', 'username', 'usmleSubscriptionEndDate', 'isUgc']
    });
    if (!user) return next();

    req.user = user;
    req.hasUsmleSubscription = !!(await userHasUsmleAccess(user));
    return next();
  } catch (error) {
    return next();
  }
}

module.exports = requireUsmleSubscription;
