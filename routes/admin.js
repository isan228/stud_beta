const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const adminAuth = require('../middleware/adminAuth');
const { User, Subject, Test, Question, Answer, TestResult, UserStats, Admin, Editor, EditorAuditLog, ContactMessage, Setting, UserDeviceAlert, News, ChatMessage, PromoCode, BroadcastMessage, UserBroadcastNotification, Transaction, sequelize } = require('../models');
const { snapshotFromQuestion, logQuestionAudit } = require('../utils/questionAuditLog');
const { Op, QueryTypes } = require('sequelize');
const { Sequelize } = require('sequelize');

async function attachQuestionCountsToTests(tests) {
  if (!tests.length) return [];
  const rows = await Question.findAll({
    attributes: ['testId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    where: { testId: { [Op.in]: tests.map((t) => t.id) } },
    group: ['testId'],
    raw: true
  });
  const countMap = new Map(rows.map((r) => [Number(r.testId), Number(r.count)]));
  return tests.map((t) => {
    const json = t.toJSON();
    json.questionCount = countMap.get(t.id) || 0;
    return json;
  });
}

async function attachTestCountsToSubjects(subjects) {
  if (!subjects.length) return [];
  const rows = await Test.findAll({
    attributes: ['subjectId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    where: { subjectId: { [Op.in]: subjects.map((s) => s.id) } },
    group: ['subjectId'],
    raw: true
  });
  const countMap = new Map(rows.map((r) => [Number(r.subjectId), Number(r.count)]));
  return subjects.map((s) => {
    const json = s.toJSON();
    json.testCount = countMap.get(s.id) || 0;
    return json;
  });
}

// Вход администратора
router.post('/login', [
  body('username').notEmpty().withMessage('Имя пользователя обязательно'),
  body('password').notEmpty().withMessage('Пароль обязателен')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;
    
    console.log('Попытка входа администратора:', { username, passwordLength: password?.length });
    
    // Ищем администратора (без учета регистра для username)
    const admin = await Admin.findOne({ 
      where: Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('username')), 
        username.toLowerCase()
      )
    });

    if (!admin) {
      console.log('Администратор не найден:', username);
      // Проверяем, есть ли вообще администраторы
      const adminCount = await Admin.count();
      console.log('Всего администраторов в БД:', adminCount);
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    console.log('Администратор найден:', { id: admin.id, username: admin.username });
    
    const isMatch = await admin.comparePassword(password);
    console.log('Проверка пароля:', isMatch);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }

    // Проверяем наличие JWT_SECRET
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_key_here') {
      console.error('ОШИБКА: JWT_SECRET не установлен или установлен на значение по умолчанию!');
      return res.status(500).json({ error: 'Ошибка конфигурации сервера. Установите JWT_SECRET в .env файле.' });
    }
    
    const token = jwt.sign({ adminId: admin.id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    console.log('Токен создан успешно для администратора:', admin.username);

    res.json({
      message: 'Вход выполнен успешно',
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Ошибка входа администратора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить текущего администратора
router.get('/me', adminAuth, async (req, res) => {
  try {
    res.json({
      admin: {
        id: req.admin.id,
        username: req.admin.username,
        email: req.admin.email,
        role: req.admin.role
      }
    });
  } catch (error) {
    console.error('Ошибка получения администратора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление аккаунтами редакторов вопросов
router.get('/editors', adminAuth, async (req, res) => {
  try {
    const editors = await Editor.findAll({
      attributes: ['id', 'username', 'displayName', 'isActive', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']]
    });
    res.json(editors);
  } catch (error) {
    console.error('Ошибка получения редакторов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/editors', adminAuth, [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Логин от 3 до 50 символов'),
  body('password').isLength({ min: 6 }).withMessage('Пароль минимум 6 символов'),
  body('displayName').optional().trim().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, displayName } = req.body;
    const existing = await Editor.findOne({
      where: Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('username')),
        username.toLowerCase()
      )
    });
    if (existing) {
      return res.status(400).json({ error: 'Редактор с таким логином уже существует' });
    }

    const editor = await Editor.create({
      username: username.trim(),
      password,
      displayName: displayName?.trim() || null,
      isActive: true
    });

    res.status(201).json({
      id: editor.id,
      username: editor.username,
      displayName: editor.displayName,
      isActive: editor.isActive,
      createdAt: editor.createdAt
    });
  } catch (error) {
    console.error('Ошибка создания редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/editors/:id', adminAuth, [
  body('password').optional().isLength({ min: 6 }).withMessage('Пароль минимум 6 символов'),
  body('displayName').optional().trim().isLength({ max: 100 }),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const editor = await Editor.findByPk(req.params.id);
    if (!editor) {
      return res.status(404).json({ error: 'Редактор не найден' });
    }

    if (req.body.displayName !== undefined) {
      editor.displayName = req.body.displayName?.trim() || null;
    }
    if (req.body.isActive !== undefined) {
      editor.isActive = Boolean(req.body.isActive);
    }
    if (req.body.password) {
      editor.password = req.body.password;
    }
    await editor.save();

    res.json({
      id: editor.id,
      username: editor.username,
      displayName: editor.displayName,
      isActive: editor.isActive,
      updatedAt: editor.updatedAt
    });
  } catch (error) {
    console.error('Ошибка обновления редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/editors/:id', adminAuth, async (req, res) => {
  try {
    const editor = await Editor.findByPk(req.params.id);
    if (!editor) {
      return res.status(404).json({ error: 'Редактор не найден' });
    }

    await editor.destroy();
    res.json({ message: 'Редактор удален' });
  } catch (error) {
    console.error('Ошибка удаления редактора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Журнал правок редакторов и админов
router.get('/audit-logs', adminAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const offset = (page - 1) * limit;
    const action = req.query.action || '';
    const actorType = req.query.actorType || '';
    const editorId = req.query.editorId ? parseInt(req.query.editorId, 10) : null;
    const search = String(req.query.search || '').trim();

    const where = {};
    if (action) where.action = action;
    if (actorType) where.actorType = actorType;
    if (editorId && actorType !== 'admin') {
      where.actorType = 'editor';
      where.actorId = editorId;
    }

    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) {
        const from = new Date(`${req.query.from}T00:00:00`);
        if (!Number.isNaN(from.getTime())) where.createdAt[Op.gte] = from;
      }
      if (req.query.to) {
        const to = new Date(`${req.query.to}T23:59:59.999`);
        if (!Number.isNaN(to.getTime())) where.createdAt[Op.lte] = to;
      }
    }

    if (search) {
      where[Op.or] = [
        { actorUsername: { [Op.iLike]: `%${search}%` } },
        { testName: { [Op.iLike]: `%${search}%` } },
        { details: { [Op.iLike]: `%${search}%` } },
        { questionTextBefore: { [Op.iLike]: `%${search}%` } },
        { questionTextAfter: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await EditorAuditLog.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      logs: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit) || 1
      }
    });
  } catch (error) {
    console.error('Ошибка журнала правок:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

function subscriptionTypeLabel(type) {
  const t = String(type || '1');
  if (t === '3') return '3 месяца';
  if (t === '12') return '1 год';
  if (t === 'group') return 'Групповая';
  return '1 месяц';
}

function classifyPaymentKind(transaction, user) {
  const fields = transaction.fields || {};
  const paymentType = String(fields.paymentType || '').toLowerCase();
  if (paymentType === 'registration' || fields.registrationData) {
    return 'registration';
  }
  if (paymentType === 'subscription') {
    if (user?.createdAt) {
      const paidAt = new Date(transaction.updatedAt || transaction.createdAt);
      const registeredAt = new Date(user.createdAt);
      if (registeredAt < paidAt) {
        return 'renewal';
      }
      return 'subscription_first';
    }
    return 'renewal';
  }
  return 'other';
}

function paymentKindLabel(kind) {
  if (kind === 'registration') return 'Регистрация с оплатой';
  if (kind === 'renewal') return 'Продление подписки';
  if (kind === 'subscription_first') return 'Первая оплата подписки';
  return 'Другое';
}

/** Ключ дня UTC YYYY-MM-DD для группировки оплат по дням графика */
function analyticsUtcDayKey(isoLike) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Одна точка на каждый календарный день между from и to (UTC-сутки): все успешные оплаты */
function buildPurchaseTimeSeries(from, to, paymentRows) {
  const dayMs = 24 * 60 * 60 * 1000;
  const buckets = new Map();
  for (const p of paymentRows) {
    const key = analyticsUtcDayKey(p.paidAt);
    if (!key) continue;
    const agg = buckets.get(key) || { count: 0, revenue: 0 };
    agg.count += 1;
    agg.revenue += Number(p.amount) || 0;
    buckets.set(key, agg);
  }

  const startUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const endUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());

  const series = [];
  for (let t = startUtc; t <= endUtc; t += dayMs) {
    const key = new Date(t).toISOString().slice(0, 10);
    const agg = buckets.get(key) || { count: 0, revenue: 0 };
    series.push({
      date: key,
      count: agg.count,
      revenue: Math.round(agg.revenue * 100) / 100
    });
  }
  return series;
}

function resolveAnalyticsRange(query) {
  const period = String(query.period || '30d').toLowerCase();
  const now = new Date();

  let from;
  let to;

  if (period === 'custom') {
    if (!query.from || !query.to) {
      return { error: 'Укажите даты «с» и «по» для произвольного периода' };
    }
    from = new Date(`${query.from}T00:00:00`);
    to = new Date(`${query.to}T23:59:59.999`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { error: 'Некорректный формат даты' };
    }
  } else if (period === 'today') {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
  } else if (period === '7d') {
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
    from = new Date(to);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    // 30d по умолчанию
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
    from = new Date(to);
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  }

  if (from > to) {
    return { error: 'Дата «с» не может быть позже даты «по»' };
  }

  return {
    period: period === 'custom' ? 'custom' : (period === 'today' || period === '7d' || period === 'month' ? period : '30d'),
    from,
    to,
    fromIso: from.toISOString(),
    toIso: to.toISOString()
  };
}

// Аналитика: регистрации, оплаты, продления за период
router.get('/analytics', adminAuth, async (req, res) => {
  try {
    const range = resolveAnalyticsRange(req.query);
    if (range.error) {
      return res.status(400).json({ error: range.error });
    }

    const { from, to, fromIso, toIso, period } = range;
    const dateWhere = { [Op.between]: [from, to] };

    const now = new Date();
    const [registrations, payments, expiredSubscriptions] = await Promise.all([
      User.findAll({
        where: { createdAt: dateWhere },
        attributes: ['id', 'username', 'email', 'createdAt', 'subscriptionEndDate', 'coins', 'referredBy'],
        order: [['createdAt', 'DESC']]
      }),
      Transaction.findAll({
        where: {
          status: 'SUCCEEDED',
          updatedAt: dateWhere
        },
        include: [{
          model: User,
          as: 'User',
          attributes: ['id', 'username', 'email', 'createdAt'],
          required: false
        }],
        order: [['updatedAt', 'DESC']]
      }),
      User.findAll({
        where: {
          subscriptionEndDate: {
            [Op.and]: [
              { [Op.ne]: null },
              { [Op.between]: [from, to] },
              { [Op.lt]: now }
            ]
          }
        },
        attributes: ['id', 'username', 'email', 'createdAt', 'subscriptionEndDate', 'coins'],
        order: [['subscriptionEndDate', 'DESC']]
      })
    ]);

    let revenueTotal = 0;
    let revenueNet = 0;
    let hasNet = false;

    const paymentRows = payments.map((tx) => {
      const json = tx.toJSON();
      const fields = json.fields || {};
      const amount = Number(json.amount) || 0;
      const net = json.net != null ? Number(json.net) : null;
      revenueTotal += amount;
      if (net != null && !Number.isNaN(net)) {
        revenueNet += net;
        hasNet = true;
      }

      const user = json.User;
      const kind = classifyPaymentKind(json, user);
      const subscriptionType = fields.subscriptionType || '1';
      let regEmail = null;
      let regUsername = null;
      if (fields.registrationData) {
        const rd = typeof fields.registrationData === 'string'
          ? (() => { try { return JSON.parse(fields.registrationData); } catch { return null; } })()
          : fields.registrationData;
        if (rd) {
          regEmail = rd.email || null;
          regUsername = rd.username || null;
        }
      }

      return {
        id: json.id,
        finikTransactionId: json.finikTransactionId,
        userId: json.userId,
        username: user?.username || regUsername || null,
        email: user?.email || regEmail || null,
        amount,
        net,
        originalAmount: fields.originalAmount != null ? Number(fields.originalAmount) : null,
        coinsUsed: fields.coinsToUse != null ? Number(fields.coinsToUse) : 0,
        promoCode: fields.promoCode || null,
        kind,
        kindLabel: paymentKindLabel(kind),
        userRegisteredAt: user?.createdAt || null,
        subscriptionType,
        subscriptionLabel: subscriptionTypeLabel(subscriptionType),
        paidAt: json.updatedAt,
        createdAt: json.createdAt
      };
    });

    const registrationPayments = paymentRows.filter((p) => p.kind === 'registration');
    const renewalPayments = paymentRows.filter((p) => p.kind === 'renewal');
    const renewalRevenue = renewalPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const uniqueRenewalUserIds = new Set(
      renewalPayments.filter((p) => p.userId).map((p) => p.userId)
    );

    const registrationUserIds = new Set(
      registrations.map((u) => u.id)
    );
    const paidRegistrationUserIds = new Set(
      registrationPayments.filter((p) => p.userId).map((p) => p.userId)
    );

    const registrationRows = registrations.map((u) => {
      const json = u.toJSON();
      return {
        id: json.id,
        username: json.username,
        email: json.email,
        createdAt: json.createdAt,
        subscriptionEndDate: json.subscriptionEndDate,
        coins: json.coins,
        referredBy: json.referredBy,
        hasPaidRegistration: paidRegistrationUserIds.has(json.id)
      };
    });

    const expiredRows = expiredSubscriptions.map((u) => {
      const json = u.toJSON();
      const end = json.subscriptionEndDate ? new Date(json.subscriptionEndDate) : null;
      const daysSinceExpired = end && !Number.isNaN(end.getTime())
        ? Math.max(0, Math.floor((now.getTime() - end.getTime()) / (24 * 60 * 60 * 1000)))
        : null;
      return {
        id: json.id,
        username: json.username,
        email: json.email,
        createdAt: json.createdAt,
        subscriptionEndDate: json.subscriptionEndDate,
        daysSinceExpired,
        coins: json.coins
      };
    });

    const purchaseTimeSeries = buildPurchaseTimeSeries(from, to, paymentRows);

    res.json({
      period,
      range: { from: fromIso, to: toIso },
      summary: {
        registrationsCount: registrations.length,
        paymentsCount: paymentRows.length,
        registrationPaymentsCount: registrationPayments.length,
        renewalPaymentsCount: renewalPayments.length,
        uniqueRenewalUsersCount: uniqueRenewalUserIds.size,
        renewalRevenue: Math.round(renewalRevenue * 100) / 100,
        expiredSubscriptionsCount: expiredRows.length,
        revenueTotal: Math.round(revenueTotal * 100) / 100,
        revenueNet: hasNet ? Math.round(revenueNet * 100) / 100 : null,
        averagePayment: paymentRows.length
          ? Math.round((revenueTotal / paymentRows.length) * 100) / 100
          : 0
      },
      registrations: registrationRows,
      payments: paymentRows,
      renewals: renewalPayments,
      expiredSubscriptions: expiredRows,
      purchaseTimeSeries
    });
  } catch (error) {
    console.error('Ошибка аналитики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Статистика для админки
router.get('/dashboard/stats', adminAuth, async (req, res) => {
  try {
    const [
      totalUsers,
      totalSubjects,
      totalTests,
      totalQuestions,
      totalResults,
      recentUsers,
      recentResults
    ] = await Promise.all([
      User.count(),
      Subject.count(),
      Test.count(),
      Question.count(),
      TestResult.count(),
      User.findAll({
        order: [['createdAt', 'DESC']],
        limit: 5,
        attributes: ['id', 'username', 'email', 'createdAt', 'status']
      }),
      TestResult.findAll({
      include: [{
        model: Test,
        as: 'Test',
        include: [{
          model: Subject,
          as: 'Subject'
        }]
      }, {
        model: User,
        as: 'User',
        attributes: ['id', 'username']
      }],
      order: [['createdAt', 'DESC']],
      limit: 10
      })
    ]);

    res.json({
      stats: {
        totalUsers,
        totalSubjects,
        totalTests,
        totalQuestions,
        totalResults,
      },
      recentUsers,
      recentResults
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Список чатов пользователей для админа
router.get('/chats', adminAuth, async (req, res) => {
  try {
    const lastRows = await sequelize.query(
      `SELECT DISTINCT ON ("userId") id, "userId", text, "isAdmin", "isRead", "createdAt"
       FROM "ChatMessages"
       ORDER BY "userId", "createdAt" DESC`,
      { type: QueryTypes.SELECT }
    );

    if (!lastRows.length) {
      return res.json({ chats: [] });
    }

    const userIds = [...new Set(lastRows.map((row) => row.userId))];
    const users = await User.findAll({
      where: { id: userIds },
      attributes: ['id', 'username', 'email']
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const lastByUser = new Map(lastRows.map((row) => [row.userId, row]));

    const unreadRows = await ChatMessage.findAll({
      attributes: ['userId', [sequelize.fn('COUNT', sequelize.col('id')), 'unreadCount']],
      where: { userId: userIds, isAdmin: false, isRead: false },
      group: ['userId'],
      raw: true
    });
    const unreadMap = new Map(unreadRows.map((r) => [Number(r.userId), Number(r.unreadCount)]));

    const chats = userIds
      .map((userId) => {
        const user = userMap.get(userId);
        if (!user) return null;
        const lastMessage = lastByUser.get(userId);
        return {
          user: { id: user.id, username: user.username, email: user.email },
          lastMessage: lastMessage ? {
            id: lastMessage.id,
            text: lastMessage.text,
            isAdmin: lastMessage.isAdmin,
            isRead: lastMessage.isRead,
            createdAt: lastMessage.createdAt
          } : null,
          unreadCount: unreadMap.get(userId) || 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aDate = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const bDate = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        if (aDate !== bDate) return bDate - aDate;
        return String(a.user.username || '').localeCompare(String(b.user.username || ''), 'ru');
      });

    res.json({ chats });
  } catch (error) {
    console.error('Ошибка получения списка чатов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сообщения конкретного чата
router.get('/chats/:userId/messages', adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findByPk(userId, { attributes: ['id', 'username', 'email'] });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const messages = await ChatMessage.findAll({
      where: { userId },
      order: [['createdAt', 'ASC']]
    });

    res.json({ user, messages });
  } catch (error) {
    console.error('Ошибка получения сообщений чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Ответ админа пользователю
router.post('/chats/:userId/messages', adminAuth, [
  body('text')
    .trim()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Сообщение должно быть от 1 до 4000 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = parseInt(req.params.userId, 10);
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const message = await ChatMessage.create({
      userId,
      isAdmin: true,
      text: req.body.text.trim(),
      isRead: false
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Ошибка отправки сообщения админа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Пометить сообщения пользователя как прочитанные админом
router.put('/chats/:userId/read', adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const [updated] = await ChatMessage.update(
      { isRead: true },
      {
        where: {
          userId,
          isAdmin: false,
          isRead: false
        }
      }
    );

    res.json({ updated });
  } catch (error) {
    console.error('Ошибка пометки сообщений пользователя как прочитанных:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Массовое уведомление всем пользователям (колокольчик на сайте)
router.get('/broadcast-notifications', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const rows = await BroadcastMessage.findAll({
      order: [['createdAt', 'DESC']],
      limit,
      attributes: ['id', 'title', 'message', 'recipientCount', 'createdAt']
    });
    res.json({ broadcasts: rows.map((r) => r.toJSON()) });
  } catch (error) {
    console.error('Ошибка списка рассылок:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/broadcast-notifications', adminAuth, [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Заголовок от 1 до 200 символов'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Текст от 1 до 4000 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const title = req.body.title.trim();
    const message = req.body.message.trim();
    const users = await User.findAll({ attributes: ['id'], raw: true });

    if (!users.length) {
      return res.status(400).json({ error: 'Нет пользователей для рассылки' });
    }

    const broadcast = await BroadcastMessage.create({
      title,
      message,
      adminId: req.admin.id,
      recipientCount: users.length
    });

    const deliveries = users.map((u) => ({
      broadcastMessageId: broadcast.id,
      userId: u.id,
      dismissedByUser: false
    }));

    const chunkSize = 500;
    for (let i = 0; i < deliveries.length; i += chunkSize) {
      await UserBroadcastNotification.bulkCreate(deliveries.slice(i, i + chunkSize));
    }

    res.status(201).json({
      broadcast: broadcast.toJSON(),
      recipientCount: users.length
    });
  } catch (error) {
    console.error('Ошибка рассылки уведомлений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Уведомления о входе пользователей с новых устройств
router.get('/device-alerts', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unreadOnly === 'true';

    const where = unreadOnly ? { isRead: false } : {};

    const { count, rows } = await UserDeviceAlert.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const unreadCount = await UserDeviceAlert.count({ where: { isRead: false } });

    res.json({
      alerts: rows,
      unreadCount,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка получения уведомлений о новых устройствах:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Пометить уведомление о новом устройстве как прочитанное
router.put('/device-alerts/:id/read', adminAuth, async (req, res) => {
  try {
    const alert = await UserDeviceAlert.findByPk(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Уведомление не найдено' });
    }

    alert.isRead = true;
    await alert.save();

    res.json({ message: 'Уведомление отмечено как прочитанное' });
  } catch (error) {
    console.error('Ошибка обновления уведомления о новом устройстве:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление пользователями
router.get('/users', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const where = {};
    if (search) {
      where[Op.or] = [
        { username: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [{
        model: UserStats,
        as: 'UserStat',
        required: false
      }],
      attributes: { exclude: ['password'] }
    });

    res.json({
      users,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сброс пароля пользователя администратором
router.put('/users/:id/password', adminAuth, [
  body('newPassword').isLength({ min: 6 }).withMessage('Новый пароль должен быть минимум 6 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    user.password = req.body.newPassword;
    await user.save();

    res.json({ message: 'Пароль пользователя успешно обновлен' });
  } catch (error) {
    console.error('Ошибка сброса пароля пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить количество монет пользователя (дельта или абсолютное значение)
router.put('/users/:id/coins', adminAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const hasDelta = req.body.coinsDelta !== undefined && req.body.coinsDelta !== null && req.body.coinsDelta !== '';
    const hasAbsolute = req.body.coins !== undefined && req.body.coins !== null && req.body.coins !== '';

    if (!hasDelta && !hasAbsolute) {
      return res.status(400).json({ error: 'Передайте coinsDelta (добавить/списать) или coins (установить)' });
    }

    if (hasDelta) {
      const coinsDelta = parseInt(req.body.coinsDelta, 10);
      if (!Number.isInteger(coinsDelta)) {
        return res.status(400).json({ error: 'coinsDelta должен быть целым числом' });
      }
      user.coins = Math.max(0, (user.coins || 0) + coinsDelta);
    } else {
      const coins = parseInt(req.body.coins, 10);
      if (!Number.isInteger(coins) || coins < 0) {
        return res.status(400).json({ error: 'Количество монет должно быть целым числом не меньше 0' });
      }
      user.coins = coins;
    }

    await user.save();

    res.json({
      message: 'Количество монет обновлено',
      user: {
        id: user.id,
        coins: user.coins
      }
    });
  } catch (error) {
    console.error('Ошибка обновления монет пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// Удалить пользователя
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Сбрасываем foreign key referredBy у других пользователей, чтобы избежать ошибки ConstraintError
    await User.update(
      { referredBy: null },
      { where: { referredBy: user.id } }
    );

    await user.destroy();
    res.json({ message: 'Пользователь удален' });
  } catch (error) {
    console.error('Ошибка удаления пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление предметами
router.get('/subjects/:id', adminAuth, async (req, res) => {
  try {
    const subject = await Subject.findByPk(req.params.id);
    if (!subject) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }
    res.json(subject);
  } catch (error) {
    console.error('Ошибка получения предмета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/subjects', adminAuth, async (req, res) => {
  try {
    if (req.query.compact === '1') {
      const subjects = await Subject.findAll({
        attributes: ['id', 'name'],
        order: [['name', 'ASC']]
      });
      return res.json(subjects);
    }

    const subjects = await Subject.findAll({
      attributes: ['id', 'name', 'description', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']]
    });

    res.json(await attachTestCountsToSubjects(subjects));
  } catch (error) {
    console.error('Ошибка получения предметов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать предмет
router.post('/subjects', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название предмета обязательно'),
  body('description').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;
    const subject = await Subject.create({ name, description });
    res.status(201).json(subject);
  } catch (error) {
    console.error('Ошибка создания предмета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить предмет
router.put('/subjects/:id', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название предмета обязательно')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const subject = await Subject.findByPk(req.params.id);
    if (!subject) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }

    const { name, description } = req.body;
    subject.name = name;
    if (description !== undefined) subject.description = description;
    await subject.save();

    res.json(subject);
  } catch (error) {
    console.error('Ошибка обновления предмета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить предмет
router.delete('/subjects/:id', adminAuth, async (req, res) => {
  try {
    const subject = await Subject.findByPk(req.params.id);
    if (!subject) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }

    await subject.destroy();
    res.json({ message: 'Предмет удален' });
  } catch (error) {
    console.error('Ошибка удаления предмета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление тестами
router.get('/tests/:id', adminAuth, async (req, res) => {
  try {
    const test = await Test.findByPk(req.params.id, {
      include: [{
        model: Subject,
        as: 'Subject',
        attributes: ['id', 'name']
      }]
    });
    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }
    res.json(test);
  } catch (error) {
    console.error('Ошибка получения теста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/tests', adminAuth, async (req, res) => {
  try {
    const subjectId = req.query.subjectId;
    const where = {};
    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (req.query.compact === '1') {
      const tests = await Test.findAll({
        where,
        attributes: ['id', 'name', 'subjectId'],
        order: [['name', 'ASC']]
      });
      return res.json(tests);
    }

    const tests = await Test.findAll({
      where,
      include: [{
        model: Subject,
        as: 'Subject',
        attributes: ['id', 'name']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json(await attachQuestionCountsToTests(tests));
  } catch (error) {
    console.error('Ошибка получения тестов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать тест
router.post('/tests', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название теста обязательно'),
  body('subjectId').isInt().withMessage('ID предмета обязателен')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, subjectId, isFree } = req.body;
    const test = await Test.create({ 
      name, 
      description, 
      subjectId, 
      isFree: isFree === true || isFree === 'true' 
    });
    res.status(201).json(test);
  } catch (error) {
    console.error('Ошибка создания теста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить тест
router.put('/tests/:id', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название теста обязательно')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const test = await Test.findByPk(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    const { name, description, isFree } = req.body;
    test.name = name;
    if (description !== undefined) test.description = description;
    if (isFree !== undefined) test.isFree = isFree === true || isFree === 'true';
    await test.save();

    res.json(test);
  } catch (error) {
    console.error('Ошибка обновления теста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить тест
router.delete('/tests/:id', adminAuth, async (req, res) => {
  try {
    const test = await Test.findByPk(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    await test.destroy();
    res.json({ message: 'Тест удален' });
  } catch (error) {
    console.error('Ошибка удаления теста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление вопросами
router.get('/questions/suggestions', adminAuth, async (req, res) => {
  try {
    const testId = req.query.testId;
    const query = String(req.query.query || '').trim();
    if (!testId) {
      return res.json({ suggestions: [] });
    }

    const where = { testId };
    if (query) {
      where.text = { [Op.iLike]: `%${query}%` };
    }

    const rows = await Question.findAll({
      where,
      attributes: ['text'],
      order: [['createdAt', 'DESC']],
      limit: 12
    });

    const unique = Array.from(new Set(
      rows
        .map(r => String(r.text || '').trim())
        .filter(Boolean)
    ));

    res.json({ suggestions: unique });
  } catch (error) {
    console.error('Ошибка получения подсказок вопросов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/questions/:id', adminAuth, async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id, {
      include: [{
        model: Test,
        as: 'Test',
        attributes: ['id', 'name', 'subjectId']
      }, {
        model: Answer,
        as: 'Answers'
      }]
    });
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден' });
    }
    res.json(question);
  } catch (error) {
    console.error('Ошибка получения вопроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/questions', adminAuth, async (req, res) => {
  try {
    const testId = req.query.testId;
    const search = String(req.query.search || '').trim();
    if (!testId) {
      return res.json([]);
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 300, 1), 500);
    const where = { testId };
    if (search) {
      where.text = { [Op.iLike]: `%${search}%` };
    }

    const questions = await Question.findAll({
      where,
      include: [{
        model: Test,
        as: 'Test',
        attributes: ['id', 'name']
      }, {
        model: Answer,
        as: 'Answers',
        attributes: ['id', 'text', 'isCorrect', 'questionId']
      }],
      order: [['createdAt', 'DESC']],
      limit
    });

    res.json(questions);
  } catch (error) {
    console.error('Ошибка получения вопросов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать вопрос
router.post('/questions', adminAuth, [
  body('text').trim().notEmpty().withMessage('Текст вопроса обязателен'),
  body('testId').isInt().withMessage('ID теста обязателен'),
  body('answers').isArray({ min: 2 }).withMessage('Должно быть минимум 2 ответа'),
  body('answers.*.text').trim().notEmpty().withMessage('Текст ответа обязателен'),
  body('answers.*.isCorrect').isBoolean().withMessage('isCorrect должен быть boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { text, testId, answers, explanation } = req.body;

    // Проверяем, что есть хотя бы один правильный ответ
    const hasCorrectAnswer = answers.some(a => a.isCorrect);
    if (!hasCorrectAnswer) {
      return res.status(400).json({ error: 'Должен быть хотя бы один правильный ответ' });
    }

    const question = await Question.create({
      text,
      testId,
      explanation: explanation != null && String(explanation).trim() ? String(explanation).trim() : null
    });
    
    // Создаем ответы
    await Promise.all(answers.map(answer => 
      Answer.create({
        text: answer.text,
        isCorrect: Boolean(answer.isCorrect), // Принудительно преобразуем в boolean
        questionId: question.id
      })
    ));

    const questionWithAnswers = await Question.findByPk(question.id, {
      include: [{
        model: Answer,
        as: 'Answers'
      }, {
        model: Test,
        as: 'Test',
        attributes: ['id', 'name']
      }]
    });

    await logQuestionAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      actorUsername: req.admin.username,
      action: 'create',
      question: questionWithAnswers,
      test: questionWithAnswers?.Test,
      afterSnapshot: snapshotFromQuestion(questionWithAnswers, questionWithAnswers?.Answers)
    });

    res.status(201).json(questionWithAnswers);
  } catch (error) {
    console.error('Ошибка создания вопроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить вопрос
router.put('/questions/:id', adminAuth, [
  body('text').trim().notEmpty().withMessage('Текст вопроса обязателен'),
  body('testId').optional().isInt().withMessage('ID теста должен быть числом'),
  body('answers').isArray({ min: 2 }).withMessage('Должно быть минимум 2 ответа'),
  body('answers.*.text').trim().notEmpty().withMessage('Текст ответа обязателен'),
  body('answers.*.isCorrect').isBoolean().withMessage('isCorrect должен быть boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const question = await Question.findByPk(req.params.id, {
      include: [{ model: Answer, as: 'Answers' }, { model: Test, as: 'Test', attributes: ['id', 'name'] }]
    });
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден' });
    }

    const beforeSnapshot = snapshotFromQuestion(question, question.Answers);
    beforeSnapshot.questionId = question.id;

    const { text, testId, answers, explanation } = req.body;

    const hasCorrectAnswer = answers.some(a => a.isCorrect);
    if (!hasCorrectAnswer) {
      return res.status(400).json({ error: 'Должен быть хотя бы один правильный ответ' });
    }

    question.text = text;
    question.explanation = explanation != null && String(explanation).trim()
      ? String(explanation).trim()
      : null;
    if (testId !== undefined && testId !== null) {
      question.testId = testId;
    }
    await question.save();

    const existingAnswers = await Answer.findAll({ where: { questionId: question.id } });
    const submittedIds = new Set(
      answers
        .filter(a => a.id !== undefined && a.id !== null && a.id !== '')
        .map(a => Number(a.id))
    );

    for (const existing of existingAnswers) {
      if (!submittedIds.has(existing.id)) {
        await existing.destroy();
      }
    }

    for (const answer of answers) {
      const answerId = answer.id !== undefined && answer.id !== null && answer.id !== ''
        ? Number(answer.id)
        : null;

      if (answerId) {
        const existingAnswer = await Answer.findOne({
          where: { id: answerId, questionId: question.id }
        });
        if (existingAnswer) {
          existingAnswer.text = answer.text;
          existingAnswer.isCorrect = Boolean(answer.isCorrect);
          await existingAnswer.save();
          continue;
        }
      }

      await Answer.create({
        text: answer.text,
        isCorrect: Boolean(answer.isCorrect),
        questionId: question.id
      });
    }

    const questionWithAnswers = await Question.findByPk(question.id, {
      include: [{
        model: Answer,
        as: 'Answers'
      }, {
        model: Test,
        as: 'Test',
        attributes: ['id', 'name']
      }]
    });

    await logQuestionAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      actorUsername: req.admin.username,
      action: 'update',
      question: questionWithAnswers,
      test: questionWithAnswers?.Test,
      beforeSnapshot,
      afterSnapshot: snapshotFromQuestion(questionWithAnswers, questionWithAnswers?.Answers)
    });

    res.json(questionWithAnswers);
  } catch (error) {
    console.error('Ошибка обновления вопроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить вопрос
router.delete('/questions/:id', adminAuth, async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id, {
      include: [{ model: Answer, as: 'Answers' }, { model: Test, as: 'Test', attributes: ['id', 'name'] }]
    });
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден' });
    }

    const beforeSnapshot = snapshotFromQuestion(question, question.Answers);
    beforeSnapshot.questionId = question.id;

    await logQuestionAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      actorUsername: req.admin.username,
      action: 'delete',
      question,
      test: question.Test,
      beforeSnapshot
    });

    const { deleteQuestionImageFile } = require('../utils/questionImages');
    if (question.imageUrl) {
      deleteQuestionImageFile(question.imageUrl);
    }

    await question.destroy();
    res.json({ message: 'Вопрос удален' });
  } catch (error) {
    console.error('Ошибка удаления вопроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление новостями
router.get('/news', adminAuth, async (req, res) => {
  try {
    const news = await News.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(news);
  } catch (error) {
    console.error('Ошибка получения новостей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/news', adminAuth, [
  body('title').trim().notEmpty().withMessage('Заголовок обязателен'),
  body('content').trim().notEmpty().withMessage('Текст новости обязателен'),
  body('category').optional().isString().trim(),
  body('icon').optional().isString().trim(),
  body('isPublished').optional().isBoolean().withMessage('isPublished должен быть boolean'),
  body('publishedAt').optional({ values: 'null' }).isISO8601().withMessage('Некорректная дата публикации')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      content,
      category = 'Обновления',
      icon = '📰',
      isPublished = true,
      publishedAt = null
    } = req.body;

    const news = await News.create({
      title,
      content,
      category: category || 'Обновления',
      icon: icon || '📰',
      isPublished: Boolean(isPublished),
      publishedAt: publishedAt || null
    });

    res.status(201).json(news);
  } catch (error) {
    console.error('Ошибка создания новости:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/news/:id', adminAuth, [
  body('title').trim().notEmpty().withMessage('Заголовок обязателен'),
  body('content').trim().notEmpty().withMessage('Текст новости обязателен'),
  body('category').optional().isString().trim(),
  body('icon').optional().isString().trim(),
  body('isPublished').optional().isBoolean().withMessage('isPublished должен быть boolean'),
  body('publishedAt').optional({ values: 'null' }).isISO8601().withMessage('Некорректная дата публикации')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const news = await News.findByPk(req.params.id);
    if (!news) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }

    const {
      title,
      content,
      category = 'Обновления',
      icon = '📰',
      isPublished = true,
      publishedAt = null
    } = req.body;

    news.title = title;
    news.content = content;
    news.category = category || 'Обновления';
    news.icon = icon || '📰';
    news.isPublished = Boolean(isPublished);
    news.publishedAt = publishedAt || null;
    await news.save();

    res.json(news);
  } catch (error) {
    console.error('Ошибка обновления новости:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/news/:id', adminAuth, async (req, res) => {
  try {
    const news = await News.findByPk(req.params.id);
    if (!news) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }
    await news.destroy();
    res.json({ message: 'Новость удалена' });
  } catch (error) {
    console.error('Ошибка удаления новости:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление ответами
router.put('/answers/:id', adminAuth, [
  body('text').trim().notEmpty().withMessage('Текст ответа обязателен'),
  body('isCorrect').isBoolean().withMessage('isCorrect должен быть boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const answer = await Answer.findByPk(req.params.id);
    if (!answer) {
      return res.status(404).json({ error: 'Ответ не найден' });
    }

    const { text, isCorrect } = req.body;
    answer.text = text;
    answer.isCorrect = Boolean(isCorrect); // Принудительно преобразуем в boolean
    await answer.save();

    res.json(answer);
  } catch (error) {
    console.error('Ошибка обновления ответа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить ответ
router.delete('/answers/:id', adminAuth, async (req, res) => {
  try {
    const answer = await Answer.findByPk(req.params.id);
    if (!answer) {
      return res.status(404).json({ error: 'Ответ не найден' });
    }

    await answer.destroy();
    res.json({ message: 'Ответ удален' });
  } catch (error) {
    console.error('Ошибка удаления ответа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление сообщениями обратной связи
router.get('/contact-messages', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || '';
    const search = req.query.search || '';
    const reportType = req.query.reportType || '';

    const where = {};
    const andConditions = [];
    if (status) {
      where.status = status;
    }
    if (reportType === 'test_error') {
      andConditions.push({ subject: 'bug' });
      andConditions.push({ message: { [Op.iLike]: 'Отчет об ошибке в вопросе теста%' } });
    }
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { message: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (andConditions.length > 0) {
      where[Op.and] = andConditions;
    }

    const { count, rows: messages } = await ContactMessage.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      messages,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить одно сообщение
router.get('/contact-messages/:id', adminAuth, async (req, res) => {
  try {
    const message = await ContactMessage.findByPk(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    res.json(message);
  } catch (error) {
    console.error('Ошибка получения сообщения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить статус сообщения
router.put('/contact-messages/:id/status', adminAuth, [
  body('status').isIn(['new', 'read', 'replied', 'archived']).withMessage('Некорректный статус')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const message = await ContactMessage.findByPk(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    message.status = req.body.status;
    await message.save();

    res.json(message);
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить сообщение
router.delete('/contact-messages/:id', adminAuth, async (req, res) => {
  try {
    const message = await ContactMessage.findByPk(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    await message.destroy();
    res.json({ message: 'Сообщение удалено' });
  } catch (error) {
    console.error('Ошибка удаления сообщения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Статистика сообщений для дашборда
router.get('/dashboard/contact-stats', adminAuth, async (req, res) => {
  try {
    const totalMessages = await ContactMessage.count();
    const newMessages = await ContactMessage.count({ where: { status: 'new' } });
    const readMessages = await ContactMessage.count({ where: { status: 'read' } });
    const repliedMessages = await ContactMessage.count({ where: { status: 'replied' } });
    const testErrorReports = await ContactMessage.count({
      where: {
        subject: 'bug',
        message: { [Op.iLike]: 'Отчет об ошибке в вопросе теста%' }
      }
    });
    const newTestErrorReports = await ContactMessage.count({
      where: {
        status: 'new',
        subject: 'bug',
        message: { [Op.iLike]: 'Отчет об ошибке в вопросе теста%' }
      }
    });

    res.json({
      totalMessages,
      newMessages,
      readMessages,
      repliedMessages,
      testErrorReports,
      newTestErrorReports
    });
  } catch (error) {
    console.error('Ошибка получения статистики сообщений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

const DOC_KEYS = { publicOfferUrl: 'publicOfferUrl', privacyPolicyUrl: 'privacyPolicyUrl' };

// Получить ссылки на документы (оферта, политика) для админки
router.get('/settings/docs', adminAuth, async (req, res) => {
  try {
    const rows = await Setting.findAll({ where: { key: Object.values(DOC_KEYS) } });
    const map = {};
    rows.forEach(r => { map[r.key] = r.value || ''; });
    res.json({
      publicOfferUrl: map[DOC_KEYS.publicOfferUrl] || '',
      privacyPolicyUrl: map[DOC_KEYS.privacyPolicyUrl] || ''
    });
  } catch (error) {
    console.error('Ошибка получения настроек документов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сохранить ссылки на документы
router.put('/settings/docs', adminAuth, [
  body('publicOfferUrl').optional({ values: 'null' }).isString().trim(),
  body('privacyPolicyUrl').optional({ values: 'null' }).isString().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { publicOfferUrl = '', privacyPolicyUrl = '' } = req.body;
    const upsert = async (key, value) => {
      const row = await Setting.findOne({ where: { key } });
      if (row) {
        row.value = value || '';
        await row.save();
      } else {
        await Setting.create({ key, value: value || '' });
      }
    };
    await upsert(DOC_KEYS.publicOfferUrl, publicOfferUrl);
    await upsert(DOC_KEYS.privacyPolicyUrl, privacyPolicyUrl);
    res.json({ message: 'Ссылки на документы сохранены', publicOfferUrl, privacyPolicyUrl });
  } catch (error) {
    console.error('Ошибка сохранения настроек документов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Промокоды
router.get('/promo-codes', adminAuth, async (req, res) => {
  try {
    const promoCodes = await PromoCode.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json({ promoCodes });
  } catch (error) {
    console.error('Ошибка получения промокодов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/promo-codes', adminAuth, [
  body('code').trim().isLength({ min: 3, max: 64 }).withMessage('Код должен быть от 3 до 64 символов'),
  body('discountPercent').isInt({ min: 1, max: 100 }).withMessage('Скидка должна быть от 1 до 100%'),
  body('usageLimit').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('Лимит использований должен быть больше 0'),
  body('expiresAt').optional({ values: 'null' }).isISO8601().withMessage('Некорректная дата окончания'),
  body('isActive').optional().isBoolean().withMessage('isActive должен быть boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const code = String(req.body.code || '').trim().toUpperCase();
    const discountPercent = parseInt(req.body.discountPercent, 10);
    const usageLimit = req.body.usageLimit === null || req.body.usageLimit === undefined || req.body.usageLimit === ''
      ? null
      : parseInt(req.body.usageLimit, 10);
    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);

    const existing = await PromoCode.findOne({ where: { code } });
    if (existing) {
      return res.status(400).json({ error: 'Промокод с таким названием уже существует' });
    }

    const promoCode = await PromoCode.create({
      code,
      discountPercent,
      usageLimit,
      expiresAt,
      isActive
    });

    res.status(201).json({ message: 'Промокод создан', promoCode });
  } catch (error) {
    console.error('Ошибка создания промокода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/promo-codes/:id', adminAuth, [
  body('code').optional().trim().isLength({ min: 3, max: 64 }).withMessage('Код должен быть от 3 до 64 символов'),
  body('discountPercent').optional().isInt({ min: 1, max: 100 }).withMessage('Скидка должна быть от 1 до 100%'),
  body('usageLimit').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('Лимит использований должен быть больше 0'),
  body('expiresAt').optional({ values: 'null' }).isISO8601().withMessage('Некорректная дата окончания'),
  body('isActive').optional().isBoolean().withMessage('isActive должен быть boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const promoCode = await PromoCode.findByPk(req.params.id);
    if (!promoCode) {
      return res.status(404).json({ error: 'Промокод не найден' });
    }

    if (req.body.code !== undefined) {
      const code = String(req.body.code || '').trim().toUpperCase();
      const existing = await PromoCode.findOne({ where: { code } });
      if (existing && existing.id !== promoCode.id) {
        return res.status(400).json({ error: 'Промокод с таким названием уже существует' });
      }
      promoCode.code = code;
    }
    if (req.body.discountPercent !== undefined) {
      promoCode.discountPercent = parseInt(req.body.discountPercent, 10);
    }
    if (req.body.usageLimit !== undefined) {
      promoCode.usageLimit = req.body.usageLimit === null || req.body.usageLimit === ''
        ? null
        : parseInt(req.body.usageLimit, 10);
    }
    if (req.body.expiresAt !== undefined) {
      promoCode.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    }
    if (req.body.isActive !== undefined) {
      promoCode.isActive = Boolean(req.body.isActive);
    }

    await promoCode.save();
    res.json({ message: 'Промокод обновлен', promoCode });
  } catch (error) {
    console.error('Ошибка обновления промокода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/promo-codes/:id', adminAuth, async (req, res) => {
  try {
    const promoCode = await PromoCode.findByPk(req.params.id);
    if (!promoCode) {
      return res.status(404).json({ error: 'Промокод не найден' });
    }
    await promoCode.destroy();
    res.json({ message: 'Промокод удален' });
  } catch (error) {
    console.error('Ошибка удаления промокода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

