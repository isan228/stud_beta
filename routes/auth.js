const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, UserStats, UserDeviceAlert, UserBroadcastNotification, BroadcastMessage, University, Faculty } = require('../models');
const { ALLOWED_COURSES, ensureLechfakForUniversity } = require('../utils/ensureFaculties');
const { fetchKgmaMeta, listKgmaGroups } = require('../utils/kgmaSchedule');

const USER_PROFILE_ATTRIBUTES = [
  'id', 'username', 'email', 'createdAt', 'referralCode', 'coins',
  'subscriptionEndDate', 'usmleSubscriptionEndDate',
  'universityId', 'facultyId', 'course', 'groupName', 'kgmaGroupId'
];

function userProfileIncludes() {
  return [{
    model: University,
    as: 'University',
    attributes: ['id', 'name', 'shortName'],
    required: false
  }, {
    model: Faculty,
    as: 'Faculty',
    attributes: ['id', 'name', 'shortName', 'universityId'],
    required: false
  }];
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  return req.headers['x-real-ip'] || req.ip || null;
}

// Регистрация
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Никнейм должен быть от 3 до 50 символов'),
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').isLength({ min: 6 }).withMessage('Пароль должен быть минимум 6 символов'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Пароли не совпадают');
    }
    return true;
  }),
  body('dataConsent').equals('true').withMessage('Необходимо согласие на обработку данных'),
  body('publicOffer').equals('true').withMessage('Необходимо согласие с публичной офертой'),
  body('universityId').isInt({ min: 1 }).withMessage('Выберите университет')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, referralCode, universityId } = req.body;

    const university = await University.findOne({
      where: { id: universityId, isActive: true }
    });
    if (!university) {
      return res.status(400).json({ error: 'Выбранный университет недоступен' });
    }

    // Проверка существующих пользователей со схожими никнеймами или почтами (без учета регистра)
    const normalizedEmail = email.trim();
    const normalizedUsername = username.trim();

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { email: { [Op.iLike]: normalizedEmail } },
          { username: { [Op.iLike]: normalizedUsername } }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email.toLowerCase() === normalizedEmail.toLowerCase()) {
        return res.status(400).json({ error: 'Пользователь с такой почтой (или очень похожей) уже существует' });
      }
      return res.status(400).json({ error: 'Пользователь с таким никнеймом (или очень похожим) уже существует' });
    }

    // Проверка и обработка реферального кода
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ where: { referralCode: referralCode.toUpperCase() } });
      if (referrer) {
        referredBy = referrer.id;
      }
    }

    // Создание пользователя со статусом approved (автоматически одобрен)
    const user = await User.create({ 
      username, 
      email, 
      password,
      status: 'approved',
      referredBy,
      universityId: university.id
    });

    // Создание статистики
    await UserStats.create({ userId: user.id });

    // Реферальные бонусы при бесплатной регистрации
    if (referredBy) {
      try {
        user.coins = (user.coins || 0) + 50;
        await user.save();
        const referrer = await User.findByPk(referredBy);
        if (referrer) {
          referrer.coins = (referrer.coins || 0) + 50;
          await referrer.save();
        }
      } catch (coinErr) {
        console.error('Ошибка начисления реферальных монет:', coinErr);
      }
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      message: 'Регистрация успешно завершена!',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        universityId: user.universityId,
        coins: user.coins || 0
      }
    });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вход
router.post('/login', [
  body('identifier').notEmpty().withMessage('Email или никнейм обязателен'),
  body('password').notEmpty().withMessage('Пароль обязателен')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { identifier, password } = req.body;

    // Определяем, является ли введенное значение email или никнеймом
    const isEmail = identifier.includes('@');
    
    // Ищем пользователя по email или username
    const user = await User.findOne({
      where: isEmail 
        ? { email: identifier }
        : { username: identifier }
    });

    if (!user) {
      console.log('[auth/login] user_not_found', { isEmail, identifier: String(identifier).trim() });
      return res.status(401).json({ error: 'Неверный email/никнейм или пароль' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('[auth/login] wrong_password', { userId: user.id, email: user.email });
      return res.status(401).json({ error: 'Неверный email/никнейм или пароль' });
    }

    // Проверка статуса пользователя (только для отклоненных)
    if (user.status === 'rejected') {
      console.log('[auth/login] rejected', { userId: user.id, email: user.email, status: user.status });
      return res.status(403).json({ 
        error: 'Ваша регистрация была отклонена. Обратитесь к администратору.' 
      });
    }
    
    // Пользователи со статусом 'pending' или 'approved' могут входить
    // (для обратной совместимости со старыми пользователями)

    // Уведомление для админа: вход пользователя с нового устройства
    // Админов не затрагивает, так как они логинятся через отдельный /api/admin/login
    const userAgent = req.headers['user-agent'] || 'unknown';
    const deviceSignature = crypto
      .createHash('sha256')
      .update(userAgent.toLowerCase())
      .digest('hex');
    const ipAddress = getClientIp(req);

    const knownDeviceCount = await UserDeviceAlert.count({ where: { userId: user.id } });
    const existingDeviceAlert = await UserDeviceAlert.findOne({
      where: {
        userId: user.id,
        deviceSignature
      }
    });

    // Не создаем уведомление для самого первого устройства пользователя.
    // Создаем только если найден новый deviceSignature.
    if (!existingDeviceAlert && knownDeviceCount > 0) {
      await UserDeviceAlert.create({
        userId: user.id,
        username: user.username,
        email: user.email,
        ipAddress,
        userAgent,
        deviceSignature,
        isRead: false,
        dismissedByUser: false
      });
    } else if (!existingDeviceAlert && knownDeviceCount === 0) {
      // Регистрируем первое устройство без тревоги для админа и без колокольчика у пользователя.
      await UserDeviceAlert.create({
        userId: user.id,
        username: user.username,
        email: user.email,
        ipAddress,
        userAgent,
        deviceSignature,
        isRead: true,
        dismissedByUser: true
      });
    } else if (existingDeviceAlert && ipAddress && existingDeviceAlert.ipAddress !== ipAddress) {
      existingDeviceAlert.ipAddress = ipAddress;
      await existingDeviceAlert.save();
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    console.log('[auth/login] ok', { userId: user.id, email: user.email, status: user.status });

    res.json({
      message: 'Вход выполнен успешно',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Уведомления аккаунта: вход с нового устройства (для колокольчика в шапке, не путать с чатом)
router.get('/account-alerts/device', require('../middleware/auth'), async (req, res) => {
  try {
    const rows = await UserDeviceAlert.findAll({
      where: {
        userId: req.user.id,
        isRead: false,
        [Op.or]: [
          { dismissedByUser: false },
          { dismissedByUser: null }
        ]
      },
      attributes: ['id', 'ipAddress', 'userAgent', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    res.json({ deviceAlerts: rows.map((r) => r.toJSON()) });
  } catch (error) {
    console.error('Ошибка account-alerts/device:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/account-alerts/device/:id/dismiss', require('../middleware/auth'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Некорректный идентификатор' });
    }
    const alert = await UserDeviceAlert.findOne({
      where: { id, userId: req.user.id }
    });
    if (!alert) {
      return res.status(404).json({ error: 'Уведомление не найдено' });
    }
    alert.dismissedByUser = true;
    await alert.save();
    res.json({ ok: true });
  } catch (error) {
    console.error('Ошибка dismiss device alert:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Уведомления от администрации (колокольчик)
router.get('/account-alerts/broadcast', require('../middleware/auth'), async (req, res) => {
  try {
    const rows = await UserBroadcastNotification.findAll({
      where: {
        userId: req.user.id,
        dismissedByUser: false
      },
      include: [{
        model: BroadcastMessage,
        as: 'BroadcastMessage',
        attributes: ['title', 'message', 'createdAt']
      }],
      order: [['createdAt', 'DESC']],
      limit: 30
    });

    const broadcastAlerts = rows.map((row) => {
      const json = row.toJSON();
      const msg = json.BroadcastMessage || {};
      return {
        id: json.id,
        title: msg.title || 'Сообщение',
        message: msg.message || '',
        createdAt: msg.createdAt || json.createdAt
      };
    });

    res.json({ broadcastAlerts });
  } catch (error) {
    console.error('Ошибка account-alerts/broadcast:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/account-alerts/broadcast/:id/dismiss', require('../middleware/auth'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Некорректный идентификатор' });
    }
    const alert = await UserBroadcastNotification.findOne({
      where: { id, userId: req.user.id }
    });
    if (!alert) {
      return res.status(404).json({ error: 'Уведомление не найдено' });
    }
    alert.dismissedByUser = true;
    await alert.save();
    res.json({ ok: true });
  } catch (error) {
    console.error('Ошибка dismiss broadcast alert:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение текущего пользователя
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: USER_PROFILE_ATTRIBUTES,
      include: userProfileIncludes()
    });
    
    // Если у пользователя нет реферального кода, генерируем его
    if (!user.referralCode) {
      const crypto = require('crypto');
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
      await user.save();
      console.log(`✅ Generated referral code for user ${user.id}: ${user.referralCode}`);
    }

    // Направление по умолчанию
    if (user.universityId && (!user.facultyId || !user.course)) {
      const lechfak = await ensureLechfakForUniversity(user.universityId);
      if (!user.facultyId) user.facultyId = lechfak.id;
      if (!user.course) user.course = 1;
      await user.save();
      await user.reload({
        include: userProfileIncludes()
      });
    }
    
    // Логируем для отладки (только в development)
    if (process.env.NODE_ENV === 'development') {
      console.log('📋 User data for /me:', {
        id: user.id,
        username: user.username,
        email: user.email,
        subscriptionEndDate: user.subscriptionEndDate,
        subscriptionEndDateType: typeof user.subscriptionEndDate,
        hasSubscription: !!user.subscriptionEndDate
      });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Ошибка получения пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Изменить факультет и курс (направление)
router.put('/direction', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!user.universityId) {
      return res.status(400).json({ error: 'Сначала должен быть выбран университет' });
    }

    const facultyId = parseInt(req.body.facultyId, 10);
    const course = parseInt(req.body.course, 10);
    const kgmaGroupId = req.body.kgmaGroupId != null ? String(req.body.kgmaGroupId).trim() : null;
    const groupName = req.body.groupName != null ? String(req.body.groupName).trim() : null;
    if (!Number.isFinite(facultyId) || facultyId <= 0) {
      return res.status(400).json({ error: 'Выберите факультет' });
    }
    if (!ALLOWED_COURSES.includes(course)) {
      return res.status(400).json({ error: 'Курс должен быть от 1 до 6' });
    }

    const faculty = await Faculty.findOne({
      where: { id: facultyId, universityId: user.universityId, isActive: true }
    });
    if (!faculty) {
      return res.status(400).json({ error: 'Факультет не найден в вашем университете' });
    }

    user.facultyId = faculty.id;
    user.course = course;

    if (kgmaGroupId) {
      user.kgmaGroupId = kgmaGroupId;
      user.groupName = groupName || user.groupName || null;
    } else if (groupName) {
      user.groupName = groupName;
      user.kgmaGroupId = null;
    } else if (req.body.kgmaGroupId === '' || req.body.groupName === '') {
      user.kgmaGroupId = null;
      user.groupName = null;
    }

    await user.save();

    const full = await User.findByPk(user.id, {
      attributes: USER_PROFILE_ATTRIBUTES,
      include: userProfileIncludes()
    });

    res.json({ user: full, message: 'Направление сохранено' });
  } catch (error) {
    console.error('Ошибка сохранения направления:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Изменение пароля
router.post('/change-password', require('../middleware/auth'), [
  body('currentPassword').notEmpty().withMessage('Текущий пароль обязателен'),
  body('newPassword').isLength({ min: 6 }).withMessage('Новый пароль должен быть минимум 6 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Проверяем текущий пароль
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }

    // Обновляем пароль
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Пароль успешно изменен' });
  } catch (error) {
    console.error('Ошибка изменения пароля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

