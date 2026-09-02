const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const adminAuth = require('../middleware/adminAuth');
const { User, Subject, Test, Question, Answer, TestResult, UserStats, Admin, Editor, EditorAuditLog, ContactMessage, Setting, UserDeviceAlert, News, ChatMessage, PromoCode, BroadcastMessage, UserBroadcastNotification, Transaction, University, Faculty, SubjectFaculty, SubjectCourse, SubscriptionPlan, QuestionTag, QuestionTagMap, ScheduleEntry, sequelize } = require('../models');
const { snapshotFromQuestion, logQuestionAudit } = require('../utils/questionAuditLog');
const { ensurePlansForUniversity, getPlansForUniversity, ensurePlansForUsmle, getPlansForUsmle, ALLOWED_MONTHS, planTitle, uniPlanScope, USMLE_PLAN_SCOPE } = require('../utils/subscriptionPlans');
const {
  ALLOWED_COURSES,
  normalizeCourseList,
  normalizeFacultyIds,
  ensureLechfakForUniversity,
  setSubjectFaculties,
  setSubjectCourses
} = require('../utils/ensureFaculties');
const { normalizeTagName, slugifyTag: slugifyTagNorm, mergeMatchingUsmleTags } = require('../utils/usmleTagNormalize');
const {
  fetchKgmaMeta,
  listKgmaCourses,
  listKgmaGroups,
  fetchKgmaWeekSchedule,
  flattenKgmaWeekToEntries,
  getWeekStart,
  formatDateISO,
  getDefaultAcademicYear,
  getDefaultSemester,
  KGMA_SCHEDULE_URL
} = require('../utils/kgmaSchedule');
const schedulePublic = require('./schedule');
const { Op, QueryTypes } = require('sequelize');
const { Sequelize } = require('sequelize');

function subjectFacultyInclude() {
  return {
    model: Faculty,
    as: 'Faculties',
    attributes: ['id', 'name', 'shortName', 'universityId', 'isActive'],
    through: { attributes: [] },
    required: false
  };
}

function subjectCourseInclude() {
  return {
    model: SubjectCourse,
    as: 'Courses',
    attributes: ['id', 'course'],
    required: false
  };
}

function serializeSubjectCourses(subjectJson) {
  const courses = Array.isArray(subjectJson.Courses)
    ? subjectJson.Courses.map((c) => Number(c.course)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
    : [];
  subjectJson.courses = courses;
  return subjectJson;
}

function slugifyTag(name) {
  const normalized = normalizeTagName(name) || name;
  return slugifyTagNorm(normalized);
}

async function syncQuestionTags(questionId, tagIds) {
  const ids = [...new Set((Array.isArray(tagIds) ? tagIds : [])
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0))];

  await QuestionTagMap.destroy({ where: { questionId } });
  if (!ids.length) return [];

  const tags = await QuestionTag.findAll({ where: { id: { [Op.in]: ids }, isActive: true } });
  for (const tag of tags) {
    await QuestionTagMap.findOrCreate({
      where: { questionId, tagId: tag.id },
      defaults: { questionId, tagId: tag.id }
    });
  }
  return tags;
}

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
    const now = new Date();
    const [
      totalUsers,
      totalSubjects,
      totalTests,
      totalQuestions,
      totalResults,
      recentUsers,
      recentResults,
      universities,
      paidTransactions,
      activeUniversitySubs,
      activeUsmleSubs
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
      }),
      University.findAll({
        attributes: ['id', 'name', 'shortName', 'isActive'],
        order: [['name', 'ASC']]
      }),
      Transaction.findAll({
        where: {
          status: 'SUCCEEDED',
          userId: { [Op.ne]: null }
        },
        attributes: ['userId', 'fields']
      }),
      User.count({
        where: { subscriptionEndDate: { [Op.gt]: now } }
      }),
      User.count({
        where: { usmleSubscriptionEndDate: { [Op.gt]: now } }
      })
    ]);

    const uniPaidUserIds = new Set();
    const usmlePaidUserIds = new Set();
    for (const row of paidTransactions) {
      const fields = row.fields || {};
      const paymentType = String(fields.paymentType || '').toLowerCase();
      const programType = String(fields.programType || '').toLowerCase();
      const uid = Number(row.userId);
      if (!Number.isFinite(uid) || uid <= 0) continue;

      if (paymentType === 'usmle_subscription' || programType === 'usmle') {
        usmlePaidUserIds.add(uid);
      } else if (
        paymentType === 'registration'
        || paymentType === 'subscription'
        || fields.registrationData
      ) {
        uniPaidUserIds.add(uid);
      }
    }

    const everPaidUserIds = new Set([...uniPaidUserIds, ...usmlePaidUserIds]);
    const freeRegistrationCount = Math.max(0, totalUsers - everPaidUserIds.size);

    const uniPaidList = [...uniPaidUserIds];
    let byUniversity = [];
    if (uniPaidList.length) {
      const paidUsers = await User.findAll({
        where: { id: { [Op.in]: uniPaidList } },
        attributes: ['id', 'universityId']
      });
      const countByUni = new Map();
      let withoutUniversity = 0;
      for (const u of paidUsers) {
        if (u.universityId) {
          countByUni.set(u.universityId, (countByUni.get(u.universityId) || 0) + 1);
        } else {
          withoutUniversity += 1;
        }
      }
      byUniversity = universities.map((uni) => ({
        id: uni.id,
        name: uni.name,
        shortName: uni.shortName || uni.name,
        isActive: uni.isActive !== false,
        paidUsers: countByUni.get(uni.id) || 0
      })).filter((u) => u.paidUsers > 0)
        .sort((a, b) => b.paidUsers - a.paidUsers);

      if (withoutUniversity > 0) {
        byUniversity.push({
          id: null,
          name: 'Без университета',
          shortName: '—',
          isActive: true,
          paidUsers: withoutUniversity
        });
      }
    }

    res.json({
      stats: {
        totalUsers,
        totalSubjects,
        totalTests,
        totalQuestions,
        totalResults,
        freeRegistrationCount,
        universityPaidUsers: uniPaidUserIds.size,
        usmlePaidUsers: usmlePaidUserIds.size,
        activeUniversitySubscriptions: activeUniversitySubs,
        activeUsmleSubscriptions: activeUsmleSubs
      },
      usersBreakdown: {
        freeRegistration: freeRegistrationCount,
        universityPaid: uniPaidUserIds.size,
        usmlePaid: usmlePaidUserIds.size,
        byUniversity,
        activeUniversity: activeUniversitySubs,
        activeUsmle: activeUsmleSubs
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
    if (req.query.universityId) {
      where.universityId = req.query.universityId;
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
      }, {
        model: University,
        as: 'University',
        attributes: ['id', 'name', 'shortName'],
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

// Управление университетами
router.get('/universities', adminAuth, async (req, res) => {
  try {
    if (req.query.compact === '1') {
      const universities = await University.findAll({
        attributes: ['id', 'name', 'shortName', 'isActive'],
        order: [['shortName', 'ASC']]
      });
      return res.json(universities);
    }

    const universities = await University.findAll({
      order: [['shortName', 'ASC']]
    });

    const ids = universities.map((u) => u.id);
    let countMap = new Map();
    if (ids.length) {
      const rows = await Test.findAll({
        attributes: ['universityId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        where: { universityId: { [Op.in]: ids } },
        group: ['universityId'],
        raw: true
      });
      countMap = new Map(rows.map((r) => [Number(r.universityId), Number(r.count)]));
    }

    res.json(universities.map((u) => {
      const json = u.toJSON();
      json.testCount = countMap.get(u.id) || 0;
      return json;
    }));
  } catch (error) {
    console.error('Ошибка получения университетов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/universities/:id', adminAuth, async (req, res) => {
  try {
    const university = await University.findByPk(req.params.id);
    if (!university) {
      return res.status(404).json({ error: 'Университет не найден' });
    }
    res.json(university);
  } catch (error) {
    console.error('Ошибка получения университета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/universities', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название обязательно'),
  body('shortName').trim().isLength({ min: 2, max: 50 }).withMessage('Краткое название: 2–50 символов'),
  body('description').optional({ nullable: true }),
  body('isActive').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const name = String(req.body.name).trim();
    const shortName = String(req.body.shortName).trim().toUpperCase();
    const description = req.body.description ? String(req.body.description).trim() : null;
    const isActive = req.body.isActive === undefined
      ? true
      : (req.body.isActive === true || req.body.isActive === 'true');

    const existing = await University.findOne({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: name } },
          { shortName: { [Op.iLike]: shortName } }
        ]
      }
    });
    if (existing) {
      return res.status(400).json({ error: 'Университет с таким названием или тегом уже существует' });
    }

    const university = await University.create({ name, shortName, description, isActive });
    await ensurePlansForUniversity(university.id);
    await ensureLechfakForUniversity(university.id);
    res.status(201).json(university);
  } catch (error) {
    console.error('Ошибка создания университета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/universities/:id', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название обязательно'),
  body('shortName').trim().isLength({ min: 2, max: 50 }).withMessage('Краткое название: 2–50 символов'),
  body('description').optional({ nullable: true }),
  body('isActive').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const university = await University.findByPk(req.params.id);
    if (!university) {
      return res.status(404).json({ error: 'Университет не найден' });
    }

    const name = String(req.body.name).trim();
    const shortName = String(req.body.shortName).trim().toUpperCase();
    const description = req.body.description !== undefined
      ? (req.body.description ? String(req.body.description).trim() : null)
      : university.description;

    const existing = await University.findOne({
      where: {
        id: { [Op.ne]: university.id },
        [Op.or]: [
          { name: { [Op.iLike]: name } },
          { shortName: { [Op.iLike]: shortName } }
        ]
      }
    });
    if (existing) {
      return res.status(400).json({ error: 'Университет с таким названием или тегом уже существует' });
    }

    university.name = name;
    university.shortName = shortName;
    university.description = description;
    if (req.body.isActive !== undefined) {
      university.isActive = req.body.isActive === true || req.body.isActive === 'true';
    }
    await university.save();

    res.json(university);
  } catch (error) {
    console.error('Ошибка обновления университета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/universities/:id', adminAuth, async (req, res) => {
  try {
    const university = await University.findByPk(req.params.id);
    if (!university) {
      return res.status(404).json({ error: 'Университет не найден' });
    }

    const testsCount = await Test.count({ where: { universityId: university.id } });
    const usersCount = await User.count({ where: { universityId: university.id } });
    const subjectsCount = await Subject.count({ where: { universityId: university.id } });
    if (testsCount > 0 || usersCount > 0 || subjectsCount > 0) {
      return res.status(400).json({
        error: `Нельзя удалить: привязано предметов ${subjectsCount}, тестов ${testsCount}, пользователей ${usersCount}. Сначала переназначьте или отключите университет.`
      });
    }

    await university.destroy();
    res.json({ message: 'Университет удален' });
  } catch (error) {
    console.error('Ошибка удаления университета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ——— Факультеты ———
router.get('/faculties', adminAuth, async (req, res) => {
  try {
    const where = {};
    if (req.query.universityId) {
      where.universityId = parseInt(req.query.universityId, 10);
    }
    const faculties = await Faculty.findAll({
      where,
      include: [{
        model: University,
        as: 'University',
        attributes: ['id', 'name', 'shortName']
      }],
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });
    res.json(faculties);
  } catch (error) {
    console.error('Ошибка получения факультетов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/faculties', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название обязательно'),
  body('shortName').trim().isLength({ min: 2, max: 50 }).withMessage('Краткое название: 2–50 символов'),
  body('universityId').notEmpty().withMessage('Университет обязателен')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const universityId = parseInt(req.body.universityId, 10);
    const university = await University.findByPk(universityId);
    if (!university) {
      return res.status(400).json({ error: 'Университет не найден' });
    }

    const name = String(req.body.name).trim();
    const shortName = String(req.body.shortName).trim();
    const sortOrder = parseInt(req.body.sortOrder, 10);
    const isActive = req.body.isActive === undefined
      ? true
      : (req.body.isActive === true || req.body.isActive === 'true');

    const existing = await Faculty.findOne({
      where: {
        universityId,
        shortName: { [Op.iLike]: shortName }
      }
    });
    if (existing) {
      return res.status(400).json({ error: 'Факультет с таким кратким названием уже есть у этого вуза' });
    }

    const faculty = await Faculty.create({
      universityId,
      name,
      shortName,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive
    });
    res.status(201).json(faculty);
  } catch (error) {
    console.error('Ошибка создания факультета:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Факультет с таким кратким названием уже существует' });
    }
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/faculties/:id', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название обязательно'),
  body('shortName').trim().isLength({ min: 2, max: 50 }).withMessage('Краткое название: 2–50 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const faculty = await Faculty.findByPk(req.params.id);
    if (!faculty) {
      return res.status(404).json({ error: 'Факультет не найден' });
    }

    const name = String(req.body.name).trim();
    const shortName = String(req.body.shortName).trim();
    const existing = await Faculty.findOne({
      where: {
        id: { [Op.ne]: faculty.id },
        universityId: faculty.universityId,
        shortName: { [Op.iLike]: shortName }
      }
    });
    if (existing) {
      return res.status(400).json({ error: 'Факультет с таким кратким названием уже есть у этого вуза' });
    }

    faculty.name = name;
    faculty.shortName = shortName;
    if (req.body.sortOrder !== undefined) {
      const sortOrder = parseInt(req.body.sortOrder, 10);
      if (Number.isFinite(sortOrder)) faculty.sortOrder = sortOrder;
    }
    if (req.body.isActive !== undefined) {
      faculty.isActive = req.body.isActive === true || req.body.isActive === 'true';
    }
    await faculty.save();
    res.json(faculty);
  } catch (error) {
    console.error('Ошибка обновления факультета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/faculties/:id', adminAuth, async (req, res) => {
  try {
    const faculty = await Faculty.findByPk(req.params.id);
    if (!faculty) {
      return res.status(404).json({ error: 'Факультет не найден' });
    }

    const linked = await SubjectFaculty.count({ where: { facultyId: faculty.id } });
    if (linked > 0) {
      return res.status(400).json({
        error: `Нельзя удалить: к факультету привязано предметов: ${linked}. Сначала отвяжите предметы.`
      });
    }

    await faculty.destroy();
    res.json({ message: 'Факультет удален' });
  } catch (error) {
    console.error('Ошибка удаления факультета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Тарифы подписок по университетам
router.get('/subscription-plans', adminAuth, async (req, res) => {
  try {
    const universities = await University.findAll({
      attributes: ['id', 'name', 'shortName', 'isActive'],
      order: [['shortName', 'ASC']]
    });

    const result = [];
    for (const uni of universities) {
      const plans = await getPlansForUniversity(uni.id, { includeInactive: true });
      result.push({
        universityId: uni.id,
        name: uni.name,
        shortName: uni.shortName,
        isActive: uni.isActive,
        plans
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Ошибка получения тарифов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/subscription-plans/:universityId', adminAuth, async (req, res) => {
  try {
    const university = await University.findByPk(req.params.universityId, {
      attributes: ['id', 'name', 'shortName', 'isActive']
    });
    if (!university) {
      return res.status(404).json({ error: 'Университет не найден' });
    }

    const plans = await getPlansForUniversity(university.id, { includeInactive: true });
    res.json({
      universityId: university.id,
      name: university.name,
      shortName: university.shortName,
      isActive: university.isActive,
      plans
    });
  } catch (error) {
    console.error('Ошибка получения тарифов университета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/subscription-plans/:universityId', adminAuth, [
  body('plans').isArray({ min: 1 }).withMessage('Нужен массив тарифов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const university = await University.findByPk(req.params.universityId);
    if (!university) {
      return res.status(404).json({ error: 'Университет не найден' });
    }

    const incoming = Array.isArray(req.body.plans) ? req.body.plans : [];
    const seenMonths = new Set();

    for (const item of incoming) {
      const months = parseInt(item.months, 10);
      if (!ALLOWED_MONTHS.has(months)) {
        return res.status(400).json({ error: `Недопустимая длительность: ${item.months}. Допустимо: 1, 3, 12` });
      }
      if (seenMonths.has(months)) {
        return res.status(400).json({ error: `Дубликат тарифа на ${months} мес.` });
      }
      seenMonths.add(months);

      const price = parseFloat(item.price);
      if (!Number.isFinite(price) || price < 0.01) {
        return res.status(400).json({ error: `Некорректная цена для ${months} мес.` });
      }

      let oldPrice = null;
      if (item.oldPrice !== undefined && item.oldPrice !== null && item.oldPrice !== '') {
        oldPrice = parseFloat(item.oldPrice);
        if (!Number.isFinite(oldPrice) || oldPrice < 0) {
          return res.status(400).json({ error: `Некорректная старая цена для ${months} мес.` });
        }
      }

      const isActive = item.isActive === undefined
        ? true
        : (item.isActive === true || item.isActive === 'true');
      const title = item.title ? String(item.title).trim().slice(0, 100) : planTitle(months);
      const planScope = uniPlanScope(university.id);

      const [plan] = await SubscriptionPlan.findOrCreate({
        where: { planScope, months },
        defaults: {
          programType: 'university',
          planScope,
          universityId: university.id,
          months,
          price,
          oldPrice,
          title,
          isActive
        }
      });

      plan.programType = 'university';
      plan.planScope = planScope;
      plan.universityId = university.id;
      plan.price = price;
      plan.oldPrice = oldPrice;
      plan.title = title;
      plan.isActive = isActive;
      await plan.save();
    }

    // Добиваем отсутствующие длительности дефолтами (неактивными не делаем — ensure создаст)
    await ensurePlansForUniversity(university.id);

    const plans = await getPlansForUniversity(university.id, { includeInactive: true });
    res.json({
      universityId: university.id,
      name: university.name,
      shortName: university.shortName,
      plans
    });
  } catch (error) {
    console.error('Ошибка сохранения тарифов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Статистика подписок USMLE
router.get('/usmle-stats', adminAuth, async (req, res) => {
  try {
    const now = new Date();

    const [activeSubscribers, expiredSubscribers, everSubscribers, paidTx] = await Promise.all([
      User.count({
        where: {
          usmleSubscriptionEndDate: { [Op.gt]: now }
        }
      }),
      User.count({
        where: {
          usmleSubscriptionEndDate: {
            [Op.and]: [
              { [Op.ne]: null },
              { [Op.lte]: now }
            ]
          }
        }
      }),
      User.count({
        where: {
          usmleSubscriptionEndDate: { [Op.ne]: null }
        }
      }),
      Transaction.findAll({
        where: { status: 'SUCCEEDED' },
        attributes: ['id', 'amount', 'userId', 'fields', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit: 5000
      })
    ]);

    let paidCount = 0;
    let revenue = 0;
    const buyerIds = new Set();
    for (const tx of paidTx) {
      const fields = tx.fields || {};
      const pType = fields.paymentType || '';
      const program = fields.programType || '';
      const isUsmle = pType === 'usmle_subscription' || program === 'usmle';
      if (!isUsmle) continue;
      paidCount++;
      revenue += parseFloat(tx.amount) || 0;
      if (tx.userId) buyerIds.add(tx.userId);
    }

    res.json({
      activeSubscribers,
      expiredSubscribers,
      everSubscribers,
      paidTransactions: paidCount,
      uniqueBuyers: buyerIds.size,
      revenue: Math.round(revenue * 100) / 100
    });
  } catch (error) {
    console.error('Ошибка статистики USMLE:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Тарифы USMLE
router.get('/usmle-subscription-plans', adminAuth, async (req, res) => {
  try {
    const plans = await getPlansForUsmle({ includeInactive: true });
    res.json({ programType: 'usmle', plans });
  } catch (error) {
    console.error('Ошибка получения тарифов USMLE:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/usmle-subscription-plans', adminAuth, [
  body('plans').isArray({ min: 1 }).withMessage('Нужен массив тарифов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await ensurePlansForUsmle();
    const incoming = Array.isArray(req.body.plans) ? req.body.plans : [];
    const seenMonths = new Set();

    for (const item of incoming) {
      const months = parseInt(item.months, 10);
      if (!ALLOWED_MONTHS.has(months)) {
        return res.status(400).json({ error: `Недопустимая длительность: ${item.months}` });
      }
      if (seenMonths.has(months)) {
        return res.status(400).json({ error: `Дубликат тарифа на ${months} мес.` });
      }
      seenMonths.add(months);

      const price = parseFloat(item.price);
      if (!Number.isFinite(price) || price < 0.01) {
        return res.status(400).json({ error: `Некорректная цена для ${months} мес.` });
      }

      let oldPrice = null;
      if (item.oldPrice !== undefined && item.oldPrice !== null && item.oldPrice !== '') {
        oldPrice = parseFloat(item.oldPrice);
        if (!Number.isFinite(oldPrice) || oldPrice < 0) {
          return res.status(400).json({ error: `Некорректная старая цена для ${months} мес.` });
        }
      }

      const isActive = item.isActive === undefined
        ? true
        : (item.isActive === true || item.isActive === 'true');
      const title = item.title
        ? String(item.title).trim().slice(0, 100)
        : planTitle(months, 'usmle');

      const [plan] = await SubscriptionPlan.findOrCreate({
        where: { planScope: USMLE_PLAN_SCOPE, months },
        defaults: {
          programType: 'usmle',
          planScope: USMLE_PLAN_SCOPE,
          universityId: null,
          months,
          price,
          oldPrice,
          title,
          isActive
        }
      });

      plan.programType = 'usmle';
      plan.planScope = USMLE_PLAN_SCOPE;
      plan.universityId = null;
      plan.price = price;
      plan.oldPrice = oldPrice;
      plan.title = title;
      plan.isActive = isActive;
      await plan.save();
    }

    const plans = await getPlansForUsmle({ includeInactive: true });
    res.json({ programType: 'usmle', plans });
  } catch (error) {
    console.error('Ошибка сохранения тарифов USMLE:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Теги вопросов USMLE
router.get('/question-tags', adminAuth, async (req, res) => {
  try {
    const tags = await QuestionTag.findAll({ order: [['name', 'ASC']] });
    res.json(tags);
  } catch (error) {
    console.error('Ошибка получения тегов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** Слить совпадающие/алиасные теги (Cardiology → Cardiovascular System и т.п.) */
router.post('/question-tags/merge-duplicates', adminAuth, async (req, res) => {
  try {
    const result = await mergeMatchingUsmleTags();
    const tags = await QuestionTag.findAll({ order: [['name', 'ASC']] });
    res.json({
      message: `Слито тегов: ${result.mergedTags}, перенесено связей: ${result.movedLinks}`,
      ...result,
      tags
    });
  } catch (error) {
    console.error('Ошибка слияния тегов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/question-tags', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название тега обязательно')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const name = normalizeTagName(String(req.body.name).trim()) || String(req.body.name).trim();
    const slug = req.body.slug ? slugifyTag(req.body.slug) : slugifyTag(name);
    const tag = await QuestionTag.create({
      name,
      slug,
      isActive: req.body.isActive === undefined ? true : (req.body.isActive === true || req.body.isActive === 'true')
    });
    res.status(201).json(tag);
  } catch (error) {
    console.error('Ошибка создания тега:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Тег с таким именем уже существует' });
    }
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/question-tags/:id', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название тега обязательно')
], async (req, res) => {
  try {
    const tag = await QuestionTag.findByPk(req.params.id);
    if (!tag) return res.status(404).json({ error: 'Тег не найден' });
    tag.name = String(req.body.name).trim();
    if (req.body.slug) tag.slug = slugifyTag(req.body.slug);
    if (req.body.isActive !== undefined) {
      tag.isActive = req.body.isActive === true || req.body.isActive === 'true';
    }
    await tag.save();
    res.json(tag);
  } catch (error) {
    console.error('Ошибка обновления тега:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Тег с таким именем уже существует' });
    }
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/question-tags/:id', adminAuth, async (req, res) => {
  try {
    const tag = await QuestionTag.findByPk(req.params.id);
    if (!tag) return res.status(404).json({ error: 'Тег не найден' });
    await QuestionTagMap.destroy({ where: { tagId: tag.id } });
    await tag.destroy();
    res.json({ message: 'Тег удалён' });
  } catch (error) {
    console.error('Ошибка удаления тега:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление предметами
router.get('/subjects/:id', adminAuth, async (req, res) => {
  try {
    const subject = await Subject.findByPk(req.params.id, {
      include: [{
        model: University,
        as: 'University',
        attributes: ['id', 'name', 'shortName']
      }, subjectFacultyInclude(), subjectCourseInclude()]
    });
    if (!subject) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }
    res.json(serializeSubjectCourses(subject.toJSON()));
  } catch (error) {
    console.error('Ошибка получения предмета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/subjects', adminAuth, async (req, res) => {
  try {
    const where = {};
    if (req.query.universityId) {
      where.universityId = req.query.universityId;
    }
    if (req.query.programType === 'usmle' || req.query.program === 'usmle') {
      where.programType = 'usmle';
    } else if (req.query.programType === 'university' || req.query.program === 'university') {
      where.programType = 'university';
    }

    const facultyId = parseInt(req.query.facultyId, 10);
    const courseFilter = parseInt(req.query.course, 10);
    const include = [{
      model: University,
      as: 'University',
      attributes: ['id', 'name', 'shortName'],
      required: false
    }, subjectFacultyInclude(), subjectCourseInclude()];

    if (Number.isFinite(facultyId) && facultyId > 0) {
      include[1] = {
        ...subjectFacultyInclude(),
        where: { id: facultyId },
        required: true
      };
    }
    if (Number.isFinite(courseFilter) && ALLOWED_COURSES.includes(courseFilter)) {
      include[2] = {
        ...subjectCourseInclude(),
        where: { course: courseFilter },
        required: true
      };
    }

    if (req.query.compact === '1') {
      const subjects = await Subject.findAll({
        where,
        attributes: ['id', 'name', 'universityId', 'programType'],
        include: [{
          model: University,
          as: 'University',
          attributes: ['id', 'shortName'],
          required: false
        }],
        order: [['name', 'ASC']]
      });
      return res.json(subjects);
    }

    const subjects = await Subject.findAll({
      where,
      attributes: ['id', 'name', 'description', 'universityId', 'programType', 'createdAt', 'updatedAt'],
      include,
      order: [['createdAt', 'DESC']],
      distinct: true
    });

    const withCounts = await attachTestCountsToSubjects(subjects);
    res.json(withCounts.map((s) => serializeSubjectCourses(s)));
  } catch (error) {
    console.error('Ошибка получения предметов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

async function applySubjectFacultyAndCourses(subject, body) {
  if (subject.programType !== 'university' || !subject.universityId) {
    await setSubjectFaculties(subject.id, []);
    await setSubjectCourses(subject.id, []);
    return;
  }

  let facultyIds = normalizeFacultyIds(body.facultyIds);
  if (!facultyIds.length && body.facultyId != null) {
    facultyIds = normalizeFacultyIds([body.facultyId]);
  }
  if (!facultyIds.length) {
    const lechfak = await ensureLechfakForUniversity(subject.universityId);
    facultyIds = [lechfak.id];
  } else {
    const valid = await Faculty.findAll({
      where: { id: { [Op.in]: facultyIds }, universityId: subject.universityId },
      attributes: ['id']
    });
    facultyIds = valid.map((f) => f.id);
    if (!facultyIds.length) {
      const lechfak = await ensureLechfakForUniversity(subject.universityId);
      facultyIds = [lechfak.id];
    }
  }
  await setSubjectFaculties(subject.id, facultyIds);

  let courses = normalizeCourseList(body.courses);
  if (!courses.length && body.course != null) {
    courses = normalizeCourseList([body.course]);
  }
  if (!courses.length) courses = [1];
  await setSubjectCourses(subject.id, courses);
}

// Создать предмет
router.post('/subjects', adminAuth, [
  body('name').trim().notEmpty().withMessage('Название предмета обязательно'),
  body('description').optional(),
  body('programType').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const programType = String(req.body.programType || 'university').toLowerCase() === 'usmle'
      ? 'usmle'
      : 'university';
    const { name, description } = req.body;

    let universityId = null;
    if (programType === 'university') {
      universityId = parseInt(req.body.universityId, 10);
      if (!Number.isFinite(universityId)) {
        return res.status(400).json({ error: 'Университет обязателен' });
      }
      const university = await University.findByPk(universityId);
      if (!university) {
        return res.status(400).json({ error: 'Университет не найден' });
      }
    }

    const existing = await Subject.findOne({
      where: {
        programType,
        universityId: universityId,
        name: { [Op.iLike]: String(name).trim() }
      }
    });
    if (existing) {
      return res.status(400).json({
        error: programType === 'usmle'
          ? 'Предмет USMLE с таким названием уже есть'
          : 'Предмет с таким названием уже есть у этого университета'
      });
    }

    const stepGroup = (programType === 'usmle' && req.body.stepGroup)
      ? String(req.body.stepGroup).toLowerCase().replace(/[^a-z0-9]/g, '')
      : null;

    const subject = await Subject.create({
      name: String(name).trim(),
      description,
      universityId,
      programType,
      stepGroup: stepGroup || null
    });

    await applySubjectFacultyAndCourses(subject, req.body);

    const full = await Subject.findByPk(subject.id, {
      include: [{
        model: University,
        as: 'University',
        attributes: ['id', 'name', 'shortName']
      }, subjectFacultyInclude(), subjectCourseInclude()]
    });
    res.status(201).json(serializeSubjectCourses(full.toJSON()));
  } catch (error) {
    console.error('Ошибка создания предмета:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Предмет с таким названием уже существует' });
    }
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

    const { name, description, universityId, programType: rawProgram } = req.body;
    const nextName = String(name).trim();
    const nextProgram = rawProgram !== undefined
      ? (String(rawProgram).toLowerCase() === 'usmle' ? 'usmle' : 'university')
      : (subject.programType || 'university');

    let nextUniversityId = subject.universityId;
    if (nextProgram === 'usmle') {
      nextUniversityId = null;
    } else if (universityId !== undefined) {
      nextUniversityId = parseInt(universityId, 10);
      const university = await University.findByPk(nextUniversityId);
      if (!university) {
        return res.status(400).json({ error: 'Университет не найден' });
      }
    }

    if (nextProgram === 'university' && !nextUniversityId) {
      return res.status(400).json({ error: 'Университет обязателен' });
    }

    const existing = await Subject.findOne({
      where: {
        id: { [Op.ne]: subject.id },
        programType: nextProgram,
        universityId: nextUniversityId,
        name: { [Op.iLike]: nextName }
      }
    });
    if (existing) {
      return res.status(400).json({ error: 'Предмет с таким названием уже существует' });
    }

    subject.name = nextName;
    if (description !== undefined) subject.description = description;
    subject.programType = nextProgram;
    subject.universityId = nextUniversityId;
    if (nextProgram === 'usmle' && req.body.stepGroup !== undefined) {
      subject.stepGroup = String(req.body.stepGroup).toLowerCase().replace(/[^a-z0-9]/g, '') || 'step1';
    } else if (nextProgram !== 'usmle') {
      subject.stepGroup = null;
    }
    await subject.save();

    await Test.update(
      {
        universityId: nextUniversityId,
        programType: nextProgram
      },
      { where: { subjectId: subject.id } }
    );

    if (req.body.facultyIds !== undefined || req.body.facultyId !== undefined
      || req.body.courses !== undefined || req.body.course !== undefined) {
      await applySubjectFacultyAndCourses(subject, req.body);
    } else if (nextProgram === 'university') {
      // Если связей ещё нет (старые записи) — проставим Лечфак + курс 1
      const [facCount, courseCount] = await Promise.all([
        SubjectFaculty.count({ where: { subjectId: subject.id } }),
        SubjectCourse.count({ where: { subjectId: subject.id } })
      ]);
      if (facCount === 0 || courseCount === 0) {
        await applySubjectFacultyAndCourses(subject, {
          facultyIds: facCount === 0 ? undefined : (await SubjectFaculty.findAll({
            where: { subjectId: subject.id },
            attributes: ['facultyId']
          })).map((r) => r.facultyId),
          courses: courseCount === 0 ? undefined : (await SubjectCourse.findAll({
            where: { subjectId: subject.id },
            attributes: ['course']
          })).map((r) => r.course)
        });
      }
    } else if (nextProgram === 'usmle') {
      await setSubjectFaculties(subject.id, []);
      await setSubjectCourses(subject.id, []);
    }

    const full = await Subject.findByPk(subject.id, {
      include: [{
        model: University,
        as: 'University',
        attributes: ['id', 'name', 'shortName']
      }, subjectFacultyInclude(), subjectCourseInclude()]
    });
    res.json(serializeSubjectCourses(full.toJSON()));
  } catch (error) {
    console.error('Ошибка обновления предмета:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Предмет с таким названием уже существует' });
    }
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

    await SubjectFaculty.destroy({ where: { subjectId: subject.id } });
    await SubjectCourse.destroy({ where: { subjectId: subject.id } });
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
      }, {
        model: University,
        as: 'University',
        attributes: ['id', 'name', 'shortName']
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
    const universityId = req.query.universityId;
    const where = {};
    if (subjectId) {
      where.subjectId = subjectId;
    }
    if (universityId) {
      where.universityId = universityId;
    }
    if (req.query.programType === 'usmle' || req.query.program === 'usmle') {
      where.programType = 'usmle';
    } else if (req.query.programType === 'university' || req.query.program === 'university') {
      where.programType = 'university';
    }

    if (req.query.compact === '1') {
      const tests = await Test.findAll({
        where,
        attributes: ['id', 'name', 'subjectId', 'universityId', 'hasExplanations', 'programType'],
        order: [['name', 'ASC']]
      });
      return res.json(tests);
    }

    const tests = await Test.findAll({
      where,
      include: [{
        model: Subject,
        as: 'Subject',
        attributes: ['id', 'name', 'programType']
      }, {
        model: University,
        as: 'University',
        attributes: ['id', 'name', 'shortName'],
        required: false
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
  body('subjectId').isInt().withMessage('ID предмета обязателен'),
  body('universityId').optional({ nullable: true })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, subjectId, universityId, isFree, hasExplanations } = req.body;

    const subject = await Subject.findByPk(subjectId);
    if (!subject) {
      return res.status(400).json({ error: 'Предмет не найден' });
    }
    if (!subject.universityId && subject.programType !== 'usmle') {
      return res.status(400).json({ error: 'У предмета не указан университет' });
    }

    const requestedUni = universityId != null ? parseInt(universityId, 10) : null;
    if (
      subject.programType !== 'usmle' &&
      requestedUni &&
      Number(requestedUni) !== Number(subject.universityId)
    ) {
      return res.status(400).json({
        error: 'Университет теста должен совпадать с университетом предмета'
      });
    }

    if (subject.programType !== 'usmle') {
      const university = await University.findByPk(subject.universityId);
      if (!university) {
        return res.status(400).json({ error: 'Университет не найден' });
      }
    }

    const test = await Test.create({
      name,
      description,
      subjectId: parseInt(subjectId, 10),
      universityId: subject.programType === 'usmle' ? null : subject.universityId,
      programType: subject.programType === 'usmle' ? 'usmle' : 'university',
      isFree: isFree === true || isFree === 'true',
      hasExplanations: hasExplanations === true || hasExplanations === 'true'
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

    const { name, description, subjectId, universityId, isFree, hasExplanations } = req.body;
    test.name = name;
    if (description !== undefined) test.description = description;

    const nextSubjectId = subjectId !== undefined ? parseInt(subjectId, 10) : test.subjectId;
    const subject = await Subject.findByPk(nextSubjectId);
    if (!subject) {
      return res.status(400).json({ error: 'Предмет не найден' });
    }
    if (!subject.universityId && subject.programType !== 'usmle') {
      return res.status(400).json({ error: 'У предмета не указан университет' });
    }

    if (universityId !== undefined && subject.programType !== 'usmle') {
      const requestedUni = parseInt(universityId, 10);
      if (Number(requestedUni) !== Number(subject.universityId)) {
        return res.status(400).json({
          error: 'Университет теста должен совпадать с университетом предмета'
        });
      }
    }

    test.subjectId = nextSubjectId;
    test.universityId = subject.programType === 'usmle' ? null : subject.universityId;
    test.programType = subject.programType === 'usmle' ? 'usmle' : 'university';

    if (isFree !== undefined) test.isFree = isFree === true || isFree === 'true';
    if (hasExplanations !== undefined) {
      test.hasExplanations = hasExplanations === true || hasExplanations === 'true';
    }
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
        attributes: ['id', 'name', 'subjectId', 'hasExplanations', 'programType']
      }, {
        model: Answer,
        as: 'Answers'
      }, {
        model: QuestionTag,
        as: 'Tags',
        attributes: ['id', 'name', 'slug'],
        through: { attributes: [] }
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

    const { text, testId, answers, explanation, setTestWithExplanations, tagIds } = req.body;
    const withExplanations = setTestWithExplanations === true || setTestWithExplanations === 'true';

    // Проверяем, что есть хотя бы один правильный ответ
    const hasCorrectAnswer = answers.some(a => a.isCorrect);
    if (!hasCorrectAnswer) {
      return res.status(400).json({ error: 'Должен быть хотя бы один правильный ответ' });
    }

    const question = await Question.create({
      text,
      testId,
      explanation: withExplanations && explanation != null && String(explanation).trim()
        ? String(explanation).trim()
        : null
    });

    const { syncTestHasExplanations } = require('../utils/syncTestExplanations');
    await syncTestHasExplanations(testId, withExplanations);
    
    // Создаем ответы
    await Promise.all(answers.map(answer => 
      Answer.create({
        text: answer.text,
        isCorrect: Boolean(answer.isCorrect), // Принудительно преобразуем в boolean
        questionId: question.id
      })
    ));

    await syncQuestionTags(question.id, tagIds);

    const questionWithAnswers = await Question.findByPk(question.id, {
      include: [{
        model: Answer,
        as: 'Answers'
      }, {
        model: Test,
        as: 'Test',
        attributes: ['id', 'name', 'programType']
      }, {
        model: QuestionTag,
        as: 'Tags',
        attributes: ['id', 'name', 'slug'],
        through: { attributes: [] }
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

    const { text, testId, answers, explanation, setTestWithExplanations, tagIds } = req.body;
    const withExplanations = setTestWithExplanations === true || setTestWithExplanations === 'true';
    const { deleteQuestionImageFile } = require('../utils/questionImages');
    const { syncTestHasExplanations } = require('../utils/syncTestExplanations');

    const hasCorrectAnswer = answers.some(a => a.isCorrect);
    if (!hasCorrectAnswer) {
      return res.status(400).json({ error: 'Должен быть хотя бы один правильный ответ' });
    }

    question.text = text;
    if (!withExplanations) {
      if (question.explanationImageUrl) {
        deleteQuestionImageFile(question.explanationImageUrl);
        question.explanationImageUrl = null;
      }
      question.explanation = null;
    } else {
      question.explanation = explanation != null && String(explanation).trim()
        ? String(explanation).trim()
        : null;
    }
    if (testId !== undefined && testId !== null) {
      question.testId = testId;
    }
    await question.save();
    await syncTestHasExplanations(testId ?? question.testId, withExplanations);

    const existingAnswers = await Answer.findAll({ where: { questionId: question.id } });
    const submittedIds = new Set(
      answers
        .filter(a => a.id !== undefined && a.id !== null && a.id !== '')
        .map(a => Number(a.id))
    );

    for (const existing of existingAnswers) {
      if (!submittedIds.has(existing.id)) {
        if (existing.imageUrl) {
          deleteQuestionImageFile(existing.imageUrl);
        }
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

    if (tagIds !== undefined) {
      await syncQuestionTags(question.id, tagIds);
    }

    const questionWithAnswers = await Question.findByPk(question.id, {
      include: [{
        model: Answer,
        as: 'Answers'
      }, {
        model: Test,
        as: 'Test',
        attributes: ['id', 'name', 'programType']
      }, {
        model: QuestionTag,
        as: 'Tags',
        attributes: ['id', 'name', 'slug'],
        through: { attributes: [] }
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

// Обновить только теги вопроса (для предпросмотра загрузки)
router.put('/questions/:id/tags', adminAuth, async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден' });
    }
    const tags = await syncQuestionTags(question.id, req.body.tagIds);
    res.json({ id: question.id, tags });
  } catch (error) {
    console.error('Ошибка обновления тегов вопроса:', error);
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
    if (question.explanationImageUrl) {
      deleteQuestionImageFile(question.explanationImageUrl);
    }
    if (Array.isArray(question.Answers)) {
      for (const answer of question.Answers) {
        if (answer.imageUrl) {
          deleteQuestionImageFile(answer.imageUrl);
        }
      }
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

const SCHEDULE_LESSON_TYPES = ['lecture', 'practice', 'lab', 'seminar', 'other'];
const SCHEDULE_WEEK_PARITIES = ['all', 'odd', 'even'];
const SCHEDULE_SEMESTERS = ['autumn', 'spring'];

function parseScheduleCourse(raw) {
  const course = parseInt(raw, 10);
  if (!Number.isFinite(course) || course < 1 || course > 6) return null;
  return course;
}

function parseScheduleDay(raw) {
  const day = parseInt(raw, 10);
  if (!Number.isFinite(day) || day < 1 || day > 6) return null;
  return day;
}

function normalizeTimeHHMM(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function validateScheduleFaculty(universityId, facultyId) {
  const faculty = await Faculty.findByPk(facultyId);
  if (!faculty || faculty.universityId !== universityId) {
    return null;
  }
  return faculty;
}

function scheduleInclude() {
  return [
    { model: University, as: 'University', attributes: ['id', 'name', 'shortName'], required: false },
    { model: Faculty, as: 'Faculty', attributes: ['id', 'name', 'shortName'], required: false }
  ];
}

function buildScheduleWhere(query) {
  const where = {};
  const universityId = parseInt(query.universityId, 10);
  const facultyId = parseInt(query.facultyId, 10);
  const course = parseScheduleCourse(query.course);
  const dayOfWeek = parseScheduleDay(query.dayOfWeek);

  if (Number.isFinite(universityId) && universityId > 0) where.universityId = universityId;
  if (Number.isFinite(facultyId) && facultyId > 0) where.facultyId = facultyId;
  if (course) where.course = course;
  if (dayOfWeek) where.dayOfWeek = dayOfWeek;

  const groupName = (query.groupName || '').trim();
  if (groupName) {
    where[Op.or] = [
      { groupName },
      { groupName: null },
      { groupName: '' }
    ];
  }

  const academicYear = (query.academicYear || '').trim();
  if (academicYear) where.academicYear = academicYear;

  const semester = (query.semester || '').trim();
  if (SCHEDULE_SEMESTERS.includes(semester)) where.semester = semester;

  if (query.isActive === 'true') where.isActive = true;
  else if (query.isActive === 'false') where.isActive = false;

  return where;
}

router.get('/schedule/kgma/meta', adminAuth, async (req, res) => {
  try {
    const meta = await fetchKgmaMeta();
    const facultyId = req.query.facultyId;
    const course = parseInt(req.query.course, 10);
    res.json({
      sourceUrl: KGMA_SCHEDULE_URL,
      faculty: meta.faculty,
      courses: facultyId ? listKgmaCourses(meta, facultyId) : [],
      groups: (facultyId && Number.isFinite(course))
        ? listKgmaGroups(meta, facultyId, course)
        : []
    });
  } catch (error) {
    console.error('Ошибка meta КГМА (admin):', error);
    res.status(502).json({ error: 'Не удалось загрузить данные с kgma.kg' });
  }
});

router.get('/schedule/kgma/week', adminAuth, async (req, res) => {
  try {
    const kgmaGroupId = String(req.query.kgmaGroupId || '').trim();
    if (!kgmaGroupId) {
      return res.status(400).json({ error: 'Укажите kgmaGroupId' });
    }
    const weekStart = req.query.weekStart ? getWeekStart(req.query.weekStart) : getWeekStart();
    const week = await fetchKgmaWeekSchedule(kgmaGroupId, weekStart);
    res.json({ sourceUrl: KGMA_SCHEDULE_URL, kgmaGroupId, ...week });
  } catch (error) {
    console.error('Ошибка расписания КГМА (admin):', error);
    res.status(502).json({ error: error.message || 'Не удалось загрузить расписание' });
  }
});

router.post('/schedule/kgma/import', adminAuth, async (req, res) => {
  try {
    const {
      kgmaFacultyId,
      course: rawCourse,
      kgmaGroupId,
      importAllGroups = false,
      weekStart: rawWeekStart,
      academicYear,
      semester
    } = req.body || {};

    const course = parseInt(rawCourse, 10);
    if (!kgmaFacultyId || !Number.isFinite(course) || course < 1) {
      return res.status(400).json({ error: 'Укажите факультет и курс КГМА' });
    }

    const university = await schedulePublic.getKgmaUniversity();
    if (!university) {
      return res.status(400).json({ error: 'Университет КГМА не найден в системе' });
    }

    const meta = await fetchKgmaMeta();
    const kgmaFaculty = meta.faculty.find((f) => String(f.id) === String(kgmaFacultyId));
    if (!kgmaFaculty) {
      return res.status(400).json({ error: 'Факультет КГМА не найден' });
    }

    const faculty = await schedulePublic.resolveFacultyForKgma(university.id, kgmaFaculty);
    const groups = importAllGroups
      ? listKgmaGroups(meta, kgmaFacultyId, course)
      : listKgmaGroups(meta, kgmaFacultyId, course).filter((g) => String(g.id) === String(kgmaGroupId));

    if (!groups.length) {
      return res.status(400).json({ error: 'Группы не найдены' });
    }

    const weekStart = rawWeekStart ? getWeekStart(rawWeekStart) : getWeekStart();
    const year = (academicYear || '').trim() || getDefaultAcademicYear(weekStart);
    const sem = semester === 'spring' || semester === 'autumn' ? semester : getDefaultSemester(weekStart);

    let imported = 0;
    let updated = 0;
    const groupResults = [];

    for (const group of groups) {
      const week = await fetchKgmaWeekSchedule(group.id, weekStart);
      const rows = flattenKgmaWeekToEntries({
        week,
        universityId: university.id,
        facultyId: faculty.id,
        course,
        groupName: group.name,
        kgmaFacultyId,
        kgmaGroupId: group.id,
        academicYear: year,
        semester: sem
      });

      for (const row of rows) {
        const existing = row.externalKey
          ? await ScheduleEntry.findOne({ where: { externalKey: row.externalKey } })
          : null;
        if (existing) {
          await existing.update(row);
          updated += 1;
        } else {
          await ScheduleEntry.create(row);
          imported += 1;
        }
      }

      groupResults.push({
        groupId: group.id,
        groupName: group.name,
        lessons: rows.length,
        empty: week.empty
      });
    }

    res.json({
      message: 'Импорт завершён',
      sourceUrl: KGMA_SCHEDULE_URL,
      weekStart: formatDateISO(weekStart),
      imported,
      updated,
      groups: groupResults
    });
  } catch (error) {
    console.error('Ошибка импорта КГМА:', error);
    res.status(500).json({ error: error.message || 'Ошибка импорта' });
  }
});

router.get('/schedule/groups', adminAuth, async (req, res) => {
  try {
    const query = { ...req.query };
    delete query.groupName;
    const entries = await ScheduleEntry.findAll({
      where: buildScheduleWhere(query),
      attributes: ['groupName'],
      raw: true
    });
    const groups = [...new Set(
      entries.map((e) => (e.groupName || '').trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ru'));
    res.json(groups);
  } catch (error) {
    console.error('Ошибка получения групп расписания:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/schedule', adminAuth, async (req, res) => {
  try {
    const entries = await ScheduleEntry.findAll({
      where: buildScheduleWhere(req.query),
      include: scheduleInclude(),
      order: [
        ['dayOfWeek', 'ASC'],
        ['lessonNumber', 'ASC'],
        ['timeStart', 'ASC'],
        ['id', 'ASC']
      ]
    });
    res.json(entries);
  } catch (error) {
    console.error('Ошибка получения расписания:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/schedule/:id', adminAuth, async (req, res) => {
  try {
    const entry = await ScheduleEntry.findByPk(req.params.id, { include: scheduleInclude() });
    if (!entry) {
      return res.status(404).json({ error: 'Запись расписания не найдена' });
    }
    res.json(entry);
  } catch (error) {
    console.error('Ошибка получения записи расписания:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/schedule', adminAuth, [
  body('universityId').isInt({ min: 1 }).withMessage('Укажите университет'),
  body('facultyId').isInt({ min: 1 }).withMessage('Укажите факультет'),
  body('course').isInt({ min: 1, max: 6 }).withMessage('Курс должен быть от 1 до 6'),
  body('dayOfWeek').isInt({ min: 1, max: 6 }).withMessage('День недели от 1 до 6'),
  body('subjectName').trim().notEmpty().withMessage('Название предмета обязательно'),
  body('lessonType').optional().isIn(SCHEDULE_LESSON_TYPES),
  body('weekParity').optional().isIn(SCHEDULE_WEEK_PARITIES),
  body('semester').optional().isIn(SCHEDULE_SEMESTERS)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const universityId = parseInt(req.body.universityId, 10);
    const facultyId = parseInt(req.body.facultyId, 10);
    const faculty = await validateScheduleFaculty(universityId, facultyId);
    if (!faculty) {
      return res.status(400).json({ error: 'Факультет не найден или не принадлежит университету' });
    }

    const timeStart = normalizeTimeHHMM(req.body.timeStart);
    const timeEnd = normalizeTimeHHMM(req.body.timeEnd);
    if (req.body.timeStart && !timeStart) {
      return res.status(400).json({ error: 'Некорректное время начала (формат HH:MM)' });
    }
    if (req.body.timeEnd && !timeEnd) {
      return res.status(400).json({ error: 'Некорректное время окончания (формат HH:MM)' });
    }

    const lessonNumberRaw = req.body.lessonNumber;
    const lessonNumber = lessonNumberRaw == null || lessonNumberRaw === ''
      ? null
      : parseInt(lessonNumberRaw, 10);

    const entry = await ScheduleEntry.create({
      universityId,
      facultyId,
      course: parseScheduleCourse(req.body.course),
      groupName: (req.body.groupName || '').trim() || null,
      dayOfWeek: parseScheduleDay(req.body.dayOfWeek),
      lessonNumber: Number.isFinite(lessonNumber) && lessonNumber > 0 ? lessonNumber : null,
      timeStart,
      timeEnd,
      subjectName: req.body.subjectName.trim(),
      teacher: (req.body.teacher || '').trim() || null,
      room: (req.body.room || '').trim() || null,
      lessonType: SCHEDULE_LESSON_TYPES.includes(req.body.lessonType) ? req.body.lessonType : 'lecture',
      weekParity: SCHEDULE_WEEK_PARITIES.includes(req.body.weekParity) ? req.body.weekParity : 'all',
      semester: SCHEDULE_SEMESTERS.includes(req.body.semester) ? req.body.semester : 'autumn',
      academicYear: (req.body.academicYear || '').trim() || '',
      notes: (req.body.notes || '').trim() || null,
      isActive: req.body.isActive !== false && req.body.isActive !== 'false'
    });

    const full = await ScheduleEntry.findByPk(entry.id, { include: scheduleInclude() });
    res.status(201).json(full);
  } catch (error) {
    console.error('Ошибка создания записи расписания:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/schedule/:id', adminAuth, [
  body('course').optional().isInt({ min: 1, max: 6 }),
  body('dayOfWeek').optional().isInt({ min: 1, max: 6 }),
  body('subjectName').optional().trim().notEmpty(),
  body('lessonType').optional().isIn(SCHEDULE_LESSON_TYPES),
  body('weekParity').optional().isIn(SCHEDULE_WEEK_PARITIES),
  body('semester').optional().isIn(SCHEDULE_SEMESTERS)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const entry = await ScheduleEntry.findByPk(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'Запись расписания не найдена' });
    }

    if (req.body.universityId != null || req.body.facultyId != null) {
      const universityId = parseInt(req.body.universityId ?? entry.universityId, 10);
      const facultyId = parseInt(req.body.facultyId ?? entry.facultyId, 10);
      const faculty = await validateScheduleFaculty(universityId, facultyId);
      if (!faculty) {
        return res.status(400).json({ error: 'Факультет не найден или не принадлежит университету' });
      }
      entry.universityId = universityId;
      entry.facultyId = facultyId;
    }

    if (req.body.course != null) {
      const course = parseScheduleCourse(req.body.course);
      if (!course) return res.status(400).json({ error: 'Курс должен быть от 1 до 6' });
      entry.course = course;
    }
    if (req.body.dayOfWeek != null) {
      const day = parseScheduleDay(req.body.dayOfWeek);
      if (!day) return res.status(400).json({ error: 'День недели от 1 до 6' });
      entry.dayOfWeek = day;
    }
    if (req.body.groupName !== undefined) {
      entry.groupName = (req.body.groupName || '').trim() || null;
    }
    if (req.body.lessonNumber !== undefined) {
      const lessonNumber = parseInt(req.body.lessonNumber, 10);
      entry.lessonNumber = Number.isFinite(lessonNumber) && lessonNumber > 0 ? lessonNumber : null;
    }
    if (req.body.timeStart !== undefined) {
      const timeStart = normalizeTimeHHMM(req.body.timeStart);
      if (req.body.timeStart && !timeStart) {
        return res.status(400).json({ error: 'Некорректное время начала (формат HH:MM)' });
      }
      entry.timeStart = timeStart;
    }
    if (req.body.timeEnd !== undefined) {
      const timeEnd = normalizeTimeHHMM(req.body.timeEnd);
      if (req.body.timeEnd && !timeEnd) {
        return res.status(400).json({ error: 'Некорректное время окончания (формат HH:MM)' });
      }
      entry.timeEnd = timeEnd;
    }
    if (req.body.subjectName != null) entry.subjectName = req.body.subjectName.trim();
    if (req.body.teacher !== undefined) entry.teacher = (req.body.teacher || '').trim() || null;
    if (req.body.room !== undefined) entry.room = (req.body.room || '').trim() || null;
    if (req.body.lessonType != null && SCHEDULE_LESSON_TYPES.includes(req.body.lessonType)) {
      entry.lessonType = req.body.lessonType;
    }
    if (req.body.weekParity != null && SCHEDULE_WEEK_PARITIES.includes(req.body.weekParity)) {
      entry.weekParity = req.body.weekParity;
    }
    if (req.body.semester != null && SCHEDULE_SEMESTERS.includes(req.body.semester)) {
      entry.semester = req.body.semester;
    }
    if (req.body.academicYear !== undefined) {
      entry.academicYear = (req.body.academicYear || '').trim() || '';
    }
    if (req.body.notes !== undefined) entry.notes = (req.body.notes || '').trim() || null;
    if (req.body.isActive !== undefined) {
      entry.isActive = req.body.isActive === true || req.body.isActive === 'true';
    }

    await entry.save();
    const full = await ScheduleEntry.findByPk(entry.id, { include: scheduleInclude() });
    res.json(full);
  } catch (error) {
    console.error('Ошибка обновления записи расписания:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/schedule/:id', adminAuth, async (req, res) => {
  try {
    const entry = await ScheduleEntry.findByPk(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'Запись расписания не найдена' });
    }
    await entry.destroy();
    res.json({ message: 'Запись расписания удалена' });
  } catch (error) {
    console.error('Ошибка удаления записи расписания:', error);
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

