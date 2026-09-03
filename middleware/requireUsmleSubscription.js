const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { userHasUsmleAccess } = require('../utils/adminUserAccess');

/**
 * Доступ к разделу USMLE только с активной подпиской USMLE
 * (админ-аккаунт — всегда).
 */
async function requireUsmleSubscription(req, res, next) {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        error: 'Требуется авторизация',
        code: 'USMLE_AUTH_REQUIRED'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'email', 'username', 'usmleSubscriptionEndDate']
    });

    if (!user) {
      return res.status(401).json({
        error: 'Пользователь не найден',
        code: 'USMLE_AUTH_REQUIRED'
      });
    }

    if (!(await userHasUsmleAccess(user))) {
      return res.status(403).json({
        error: 'Раздел USMLE доступен только с активной подпиской USMLE',
        code: 'USMLE_SUBSCRIPTION_REQUIRED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Недействительный токен',
      code: 'USMLE_AUTH_REQUIRED'
    });
  }
}

module.exports = requireUsmleSubscription;
