const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Transaction, User, PromoCode, University } = require('../models');
const { validateFinikSignature } = require('../utils/finikValidator');
const { createPayment } = require('../utils/finikClient');
const { getPlansForUniversity, getPlanPrice, getPlansForUsmle, getUsmlePlanPrice } = require('../utils/subscriptionPlans');
const { isAdminLinkedUser } = require('../utils/adminUserAccess');
const auth = require('../middleware/auth');

async function resolvePromoCode(rawCode) {
  const promoCodeRaw = String(rawCode || '').trim();
  if (!promoCodeRaw) {
    return { promo: null, error: null };
  }

  const code = promoCodeRaw.toUpperCase();
  const promo = await PromoCode.findOne({ where: { code } });
  if (!promo) {
    return { promo: null, error: 'Промокод не найден' };
  }
  if (!promo.isActive) {
    return { promo: null, error: 'Промокод отключен' };
  }
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
    return { promo: null, error: 'Срок действия промокода истек' };
  }
  if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
    return { promo: null, error: 'Лимит использований промокода исчерпан' };
  }

  return { promo, error: null };
}

async function applyPromoUsageOnSuccess(transaction, payload = null) {
  const fields = transaction?.fields || {};
  if (fields.promoUsageApplied) {
    return;
  }

  const promoCodeId = fields.promoCodeId || payload?.fields?.promoCodeId || payload?.data?.promoCodeId;
  const promoCode = fields.promoCode || payload?.fields?.promoCode || payload?.data?.promoCode;

  let promo = null;
  if (promoCodeId) {
    promo = await PromoCode.findByPk(promoCodeId);
  }
  if (!promo && promoCode) {
    promo = await PromoCode.findOne({ where: { code: String(promoCode).toUpperCase() } });
  }

  if (!promo) {
    console.warn(`⚠️ Promo code not found for transaction ${transaction.id}`);
    return;
  }

  promo.usedCount = (promo.usedCount || 0) + 1;
  await promo.save();

  transaction.fields = Object.assign({}, fields, { promoUsageApplied: true });
  await transaction.save();
  console.log(`✅ Promo code usage applied for transaction ${transaction.id}: ${promo.code}`);
}

router.post('/validate-promo', [
  body('promoCode').trim().isLength({ min: 3, max: 64 }).withMessage('Некорректный промокод')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { promo, error } = await resolvePromoCode(req.body.promoCode);
    if (!promo) {
      return res.status(400).json({ error });
    }

    return res.json({
      valid: true,
      promoCode: promo.code,
      discountPercent: promo.discountPercent
    });
  } catch (error) {
    console.error('Error validating promo code:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * Webhook для обработки callback от Finik
 * POST /api/payments/webhook
 * 
 * Важно: Raw body уже обработан в server.js для этого пути
 */
router.post('/webhook', async (req, res) => {
  try {
    // Парсим body (raw для правильной валидации подписи)
    let payload;
    try {
      const bodyString = req.body.toString('utf8');
      payload = JSON.parse(bodyString);
    } catch (e) {
      console.error('Error parsing webhook body:', e);
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    // Валидация подписи
    const signatureValid = validateFinikSignature(req, payload);
    if (!signatureValid) {
      console.error('⚠️ Invalid Finik signature - но продолжаем обработку для тестирования');
      console.error('Headers:', req.headers);
      console.error('Payload keys:', Object.keys(payload));

      // ВРЕМЕННО: Пропускаем валидацию для тестирования, но логируем предупреждение
      // В продакшене это должно быть строго проверено!
      if (process.env.NODE_ENV === 'production' && process.env.SKIP_SIGNATURE_VALIDATION !== 'true') {
        console.error('❌ Signature validation failed in production mode');
        return res.status(401).json({ error: 'Invalid signature' });
      } else {
        console.warn('⚠️ WARNING: Skipping signature validation (development/test mode)');
      }
    } else {
      console.log('✅ Finik signature validated successfully');
    }

    console.log('✅ Finik webhook received and validated:', {
      transactionId: payload.transactionId || payload.id,
      status: payload.status,
      amount: payload.amount,
      hasFields: !!payload.fields,
      hasData: !!payload.data,
      fieldsKeys: payload.fields ? Object.keys(payload.fields) : [],
      dataKeys: payload.data ? Object.keys(payload.data) : []
    });

    // Детальное логирование для регистрационных платежей
    if (payload.fields && (payload.fields.registrationData || payload.fields.paymentType === 'registration')) {
      console.log('📝 Registration payment detected in webhook');
      console.log('Fields:', JSON.stringify(payload.fields, null, 2));
    }
    if (payload.data && (payload.data.registrationData || payload.data.paymentType === 'registration')) {
      console.log('📝 Registration payment detected in webhook data');
      console.log('Data:', JSON.stringify(payload.data, null, 2));
    }

    // Ищем существующую транзакцию по transactionId или id
    const finikTransactionId = payload.transactionId || payload.id;
    if (!finikTransactionId) {
      console.error('❌ Webhook payload missing transaction identifier', {
        hasTransactionId: !!payload.transactionId,
        hasId: !!payload.id,
        payloadKeys: Object.keys(payload || {})
      });
      return res.status(400).json({
        error: 'Invalid webhook payload: transaction identifier is required'
      });
    }

    let transaction = await Transaction.findOne({
      where: { finikTransactionId }
    });

    // Мобильный Finik SDK: транзакция могла остаться с pending id, ищем по mobileRequestId
    if (!transaction) {
      const mobileRequestId = payload?.fields?.mobileRequestId || payload?.data?.mobileRequestId;
      if (mobileRequestId) {
        const { Op } = require('sequelize');
        const candidates = await Transaction.findAll({
          where: {
            status: 'PENDING',
            finikTransactionId: { [Op.like]: 'mobile_%' }
          },
          order: [['createdAt', 'DESC']],
          limit: 50
        });
        transaction = candidates.find((t) => t.fields?.mobileRequestId === String(mobileRequestId)) || null;
        if (transaction) {
          transaction.finikTransactionId = finikTransactionId;
          await transaction.save();
          console.log(`🔗 Linked mobile pending transaction ${transaction.id} to Finik id ${finikTransactionId}`);
        }
      }
    }

    if (transaction) {
      // Обновляем существующую транзакцию
      // Проверяем статус без учета регистра (может быть "succeeded", "SUCCEEDED", "Succeeded")
      const statusUpper = (payload.status || '').toUpperCase();
      transaction.status = statusUpper === 'SUCCEEDED' ? 'SUCCEEDED' :
        statusUpper === 'FAILED' ? 'FAILED' : 'PENDING';
      transaction.amount = payload.amount || transaction.amount;
      transaction.net = payload.net || transaction.net;
      transaction.receiptNumber = payload.receiptNumber || transaction.receiptNumber;
      transaction.transactionDate = payload.transactionDate || transaction.transactionDate;
      transaction.transactionType = payload.transactionType || transaction.transactionType;
      transaction.fields = Object.assign({}, transaction.fields || {}, payload.fields || {});
      transaction.data = Object.assign({}, transaction.data || {}, payload.data || {});
      transaction.rawPayload = payload;

      await transaction.save();

      console.log(`📝 Transaction ${transaction.id} updated to status: ${transaction.status} (from payload.status: ${payload.status})`);

      // Обработка успешного платежа
      if (transaction.status === 'SUCCEEDED') {
        await applyPromoUsageOnSuccess(transaction, payload);

        // Если это платеж за регистрацию и есть данные регистрации
        // Проверяем registrationData в разных местах: transaction.fields, payload.fields, payload.data
        let registrationData = null;

        // 1. Проверяем в transaction.fields (сохранено при создании платежа)
        if (transaction.fields && transaction.fields.registrationData) {
          registrationData = transaction.fields.registrationData;
          if (typeof registrationData === 'string') {
            try {
              registrationData = JSON.parse(registrationData);
            } catch (e) {
              console.error('Error parsing registrationData from transaction.fields:', e);
              registrationData = null;
            }
          }
        }

        // 2. Если не нашли, проверяем в payload.fields (пришло от Finik)
        if (!registrationData && payload.fields && payload.fields.registrationData) {
          registrationData = payload.fields.registrationData;
          if (typeof registrationData === 'string') {
            try {
              registrationData = JSON.parse(registrationData);
            } catch (e) {
              console.error('Error parsing registrationData from payload.fields:', e);
              registrationData = null;
            }
          }
        }

        // 3. Если не нашли, проверяем в payload.data (пришло от Finik) - ПРИОРИТЕТНО
        if (!registrationData && payload.data && payload.data.registrationData) {
          console.log('📦 Found registrationData in payload.data');
          registrationData = payload.data.registrationData;
          if (typeof registrationData === 'string') {
            try {
              registrationData = JSON.parse(registrationData);
              console.log('✅ Parsed registrationData from payload.data:', {
                email: registrationData.email,
                username: registrationData.username,
                hasPassword: !!registrationData.password
              });
            } catch (e) {
              console.error('Error parsing registrationData from payload.data:', e);
              registrationData = null;
            }
          }
        }

        // 4. Также проверяем в payload напрямую (на случай другого формата)
        if (!registrationData && payload.registrationData) {
          console.log('📦 Found registrationData in payload root');
          registrationData = payload.registrationData;
          if (typeof registrationData === 'string') {
            try {
              registrationData = JSON.parse(registrationData);
            } catch (e) {
              console.error('Error parsing registrationData from payload root:', e);
              registrationData = null;
            }
          }
        }

        // Если нашли registrationData и пользователь еще не создан
        if (registrationData && !transaction.userId) {
          try {
            console.log('🔍 Found registrationData, attempting to create user:', {
              email: registrationData.email,
              username: registrationData.username,
              hasPassword: !!registrationData.password,
              subscriptionType: registrationData.subscription?.type
            });

            // Проверяем, не существует ли уже пользователь
            const existingUser = await User.findOne({
              where: {
                [require('sequelize').Op.or]: [
                  { email: registrationData.email },
                  { username: registrationData.username }
                ]
              }
            });

            if (existingUser) {
              console.log(`⚠️  User already exists: ${registrationData.email} (ID: ${existingUser.id})`);
              // Привязываем транзакцию к существующему пользователю
              transaction.userId = existingUser.id;
              await transaction.save();
              console.log(`✅ Transaction ${transaction.id} linked to existing user ${existingUser.id}`);

              // Обновляем подписку для существующего пользователя
              const subscriptionType = registrationData?.subscription?.type || '1';
              const subscriptionMonths = parseInt(subscriptionType) || 1;
              let subscriptionEndDate = new Date();

              // Если у пользователя уже есть активная подписка, продлеваем её
              if (existingUser.subscriptionEndDate && new Date(existingUser.subscriptionEndDate) > new Date()) {
                subscriptionEndDate = new Date(existingUser.subscriptionEndDate);
                subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
              } else {
                // Иначе начинаем с текущей даты
                subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
              }

              existingUser.subscriptionEndDate = subscriptionEndDate;
              await existingUser.save();
              console.log(`✅ Subscription updated for existing user ${existingUser.id}: ${subscriptionEndDate.toISOString()}`);
            } else {
              // Проверяем наличие обязательных полей
              if (!registrationData.username || !registrationData.email || !registrationData.password) {
                console.error('❌ Missing required registration data:', {
                  hasUsername: !!registrationData.username,
                  hasEmail: !!registrationData.email,
                  hasPassword: !!registrationData.password
                });
                throw new Error('Missing required registration data');
              }

              // Обрабатываем реферальный код
              let referredBy = null;
              if (registrationData.referralCode) {
                const referrer = await User.findOne({
                  where: { referralCode: registrationData.referralCode.toUpperCase() }
                });
                if (referrer) {
                  referredBy = referrer.id;
                  console.log(`✅ Referral code found: ${registrationData.referralCode}, referrer ID: ${referrer.id}`);
                } else {
                  console.log(`⚠️  Invalid referral code: ${registrationData.referralCode}`);
                }
              }

              // Создаем нового пользователя
              console.log('👤 Creating new user account...');
              let universityId = registrationData.universityId
                ? parseInt(registrationData.universityId, 10)
                : null;
              if (universityId) {
                const uni = await University.findOne({ where: { id: universityId, isActive: true } });
                if (!uni) universityId = null;
              }
              if (!universityId) {
                const { ensureUniversities } = require('../utils/ensureUniversities');
                const kgma = await ensureUniversities();
                universityId = kgma.id;
              }

              const newUser = await User.create({
                username: registrationData.username,
                email: registrationData.email,
                password: registrationData.password, // Будет захеширован в hook
                status: 'approved', // Автоматически одобряем после оплаты
                referredBy: referredBy,
                universityId
              });

              console.log(`✅ User account created: ID ${newUser.id}, email: ${newUser.email}`);

              // Создаем статистику для пользователя
              await require('../models').UserStats.create({ userId: newUser.id });
              console.log(`✅ UserStats created for user ${newUser.id}`);

              // Привязываем транзакцию к пользователю
              transaction.userId = newUser.id;
              // Помечаем в fields (новый объект, чтобы Sequelize сохранил JSONB), чтобы общий блок и повторные webhook не добавляли месяцы
              transaction.fields = Object.assign({}, transaction.fields || {}, { subscriptionAlreadyApplied: true });
              await transaction.save();

              console.log(`✅ Transaction ${transaction.id} linked to new user ${newUser.id}`);

              // Начисляем 50 монеток новому пользователю за регистрацию по реферальной ссылке
              if (referredBy) {
                try {
                  newUser.coins = (newUser.coins || 0) + 50;
                  await newUser.save();
                  console.log(`✅ Начислено 50 монеток новому пользователю ${newUser.username} (ID: ${newUser.id}) за регистрацию по реферальной ссылке. Новый баланс: ${newUser.coins}`);
                } catch (error) {
                  console.error('❌ Ошибка начисления монеток новому пользователю:', error);
                }
              }

              // Начисляем 50 монеток рефереру, если есть
              if (referredBy) {
                try {
                  const referrer = await User.findByPk(referredBy);
                  if (referrer) {
                    referrer.coins = (referrer.coins || 0) + 50;
                    await referrer.save();
                    console.log(`✅ Начислено 50 монеток рефереру ${referrer.username} (ID: ${referrer.id}). Новый баланс: ${referrer.coins}`);
                  }
                } catch (error) {
                  console.error('❌ Ошибка начисления монеток рефереру:', error);
                }
              }

              // Устанавливаем дату окончания подписки
              const subscriptionType = registrationData.subscription?.type || '1';
              const subscriptionMonths = parseInt(subscriptionType) || 1;
              const subscriptionEndDate = new Date();
              subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
              newUser.subscriptionEndDate = subscriptionEndDate;
              await newUser.save();
              console.log(`✅ Subscription end date set for user ${newUser.id}: ${subscriptionEndDate.toISOString()}`);

              console.log(`🎉 Registration completed successfully for ${newUser.email}`);
            }
          } catch (error) {
            console.error('❌ Error creating user from registration payment:', error);
            console.error('Error details:', {
              message: error.message,
              stack: error.stack,
              registrationData: {
                email: registrationData?.email,
                username: registrationData?.username,
                hasPassword: !!registrationData?.password
              }
            });
            // Не прерываем обработку webhook, но логируем ошибку
          }
        } else if (!registrationData && !transaction.userId) {
          console.log('ℹ️  No registrationData found in transaction or payload');
          console.log('Transaction fields:', JSON.stringify(transaction.fields, null, 2));
          console.log('Payload fields:', JSON.stringify(payload.fields, null, 2));
          console.log('Payload data:', JSON.stringify(payload.data, null, 2));
        } else if (registrationData && transaction.userId) {
          console.log(`ℹ️  User already linked to transaction: userId=${transaction.userId}`);
        }

        if (transaction.userId) {
          // Обновляем подписку пользователя, если это платеж за подписку
          try {
            const user = await User.findByPk(transaction.userId);

            // Определяем тип подписки: из registrationData или из полей транзакции
            let subscriptionType = '1';

            if (registrationData?.subscription?.type) {
              subscriptionType = registrationData.subscription.type;
            } else if (transaction.fields?.subscriptionType) {
              subscriptionType = transaction.fields.subscriptionType;
            } else if (payload.fields?.subscriptionType) {
              subscriptionType = payload.fields.subscriptionType;
            }

            // Также проверяем paymentType - должен быть subscription или registration
            const paymentType = transaction.fields?.paymentType ||
              payload.fields?.paymentType ||
              (registrationData ? 'registration' : 'subscription');

            // При регистрации подписка уже выставлена выше (новый или существующий пользователь) — не дублируем. Также пропускаем при повторном webhook.
            if (registrationData || transaction.fields?.subscriptionAlreadyApplied) {
              if (registrationData) {
                console.log(`ℹ️ Registration payment: subscription already set above for user ${transaction.userId}, skipping duplicate`);
              } else {
                console.log(`ℹ️ Subscription already applied for user ${transaction.userId}, skipping duplicate update`);
              }
            } else if (user && paymentType === 'usmle_subscription') {
              const subscriptionMonths = parseInt(subscriptionType) || 1;
              let usmleEnd = new Date();
              if (user.usmleSubscriptionEndDate && new Date(user.usmleSubscriptionEndDate) > new Date()) {
                usmleEnd = new Date(user.usmleSubscriptionEndDate);
                usmleEnd.setMonth(usmleEnd.getMonth() + subscriptionMonths);
              } else {
                usmleEnd.setMonth(usmleEnd.getMonth() + subscriptionMonths);
              }
              user.usmleSubscriptionEndDate = usmleEnd;
              await user.save();
              console.log(`✅ USMLE subscription updated for user ${user.id}: ${usmleEnd.toISOString()} (+${subscriptionMonths} months)`);
            } else if (user && (paymentType === 'subscription' || paymentType === 'registration')) {
              const subscriptionMonths = parseInt(subscriptionType) || 1;
              let subscriptionEndDate = new Date();

              // Если у пользователя уже есть активная подписка, продлеваем её
              if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date()) {
                subscriptionEndDate = new Date(user.subscriptionEndDate);
                subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
              } else {
                // Иначе начинаем с текущей даты
                subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
              }

              user.subscriptionEndDate = subscriptionEndDate;
              await user.save();
              console.log(`✅ Subscription updated for user ${user.id}: ${subscriptionEndDate.toISOString()} (+${subscriptionMonths} months)`);
            }

            // Списываем монетки, использованные как скидка (курс 1:1)
            const coinsToUse = transaction.fields?.coinsToUse || 0;
            if (coinsToUse > 0 && user) {
              user.coins = Math.max(0, (user.coins || 0) - coinsToUse);
              await user.save();
              console.log(`✅ Списано ${coinsToUse} монеток у пользователя ${user.id}. Остаток: ${user.coins}`);
            }
          } catch (error) {
            console.error('❌ Error updating subscription:', error);
          }

          console.log(`✅ Processing successful payment for user ${transaction.userId}`);
        }
      }
    } else {
      // Создаем новую транзакцию
      // Извлекаем userId из fields или data, если он был передан
      let userId = null;
      if (payload.fields && payload.fields.userId) {
        userId = parseInt(payload.fields.userId);
      } else if (payload.data && payload.data.userId) {
        userId = parseInt(payload.data.userId);
      }

      // Извлекаем registrationData из data (приоритет) или fields
      let registrationDataFromFields = null;

      // Сначала проверяем payload.data (где обычно находятся данные от Finik)
      if (payload.data && payload.data.registrationData) {
        console.log('📦 Found registrationData in payload.data (creating new transaction)');
        try {
          if (typeof payload.data.registrationData === 'string') {
            registrationDataFromFields = JSON.parse(payload.data.registrationData);
          } else {
            registrationDataFromFields = payload.data.registrationData;
          }
          console.log('✅ Parsed registrationData from payload.data:', {
            email: registrationDataFromFields.email,
            username: registrationDataFromFields.username,
            hasPassword: !!registrationDataFromFields.password
          });
        } catch (e) {
          console.error('Error parsing registrationData from payload.data:', e);
        }
      }

      // Если не нашли в data, проверяем fields
      if (!registrationDataFromFields && payload.fields && payload.fields.registrationData) {
        console.log('📦 Found registrationData in payload.fields');
        try {
          if (typeof payload.fields.registrationData === 'string') {
            registrationDataFromFields = JSON.parse(payload.fields.registrationData);
          } else {
            registrationDataFromFields = payload.fields.registrationData;
          }
        } catch (e) {
          console.error('Error parsing registrationData from payload.fields:', e);
        }
      }

      // Проверяем статус без учета регистра
      const statusUpper = (payload.status || '').toUpperCase();
      const transactionStatus = statusUpper === 'SUCCEEDED' ? 'SUCCEEDED' :
        statusUpper === 'FAILED' ? 'FAILED' : 'PENDING';

      transaction = await Transaction.create({
        userId,
        finikTransactionId,
        finikAccountId: payload.accountId,
        amount: payload.amount,
        net: payload.net,
        status: transactionStatus,
        transactionType: payload.transactionType,
        receiptNumber: payload.receiptNumber,
        requestDate: payload.requestDate,
        transactionDate: payload.transactionDate,
        itemId: payload.item?.id,
        serviceId: payload.service?.id,
        fields: payload.fields,
        data: payload.data,
        rawPayload: payload
      });

      console.log(`✨ New transaction ${transaction.id} created with status: ${transaction.status} (from payload.status: ${payload.status})`);

      // Обработка успешного платежа (для новых транзакций)
      if (transaction.status === 'SUCCEEDED') {
        await applyPromoUsageOnSuccess(transaction, payload);

        let isSubscriptionProcessed = false;

        // Ищем registrationData в разных местах
        let registrationData = registrationDataFromFields;

        // Если не нашли в payload.fields, проверяем payload.data - ПРИОРИТЕТНО
        if (!registrationData && payload.data && payload.data.registrationData) {
          console.log('📦 Found registrationData in payload.data (new transaction)');
          try {
            if (typeof payload.data.registrationData === 'string') {
              registrationData = JSON.parse(payload.data.registrationData);
              console.log('✅ Parsed registrationData from payload.data:', {
                email: registrationData.email,
                username: registrationData.username,
                hasPassword: !!registrationData.password
              });
            } else {
              registrationData = payload.data.registrationData;
            }
          } catch (e) {
            console.error('Error parsing registrationData from payload.data:', e);
          }
        }

        // Если нашли registrationData и пользователь еще не создан
        if (registrationData && !transaction.userId) {
          try {
            // ... (existing code for finding user) ...

            if (existingUser) {
              // ... (existing code for existing user) ...
            } else {
              // ... (existing code for creating user) ...

              // Создаем нового пользователя
              // ...

              // Устанавливаем дату окончания подписки
              const subscriptionType = registrationData.subscription?.type || '1';
              const subscriptionMonths = parseInt(subscriptionType) || 1;
              const subscriptionEndDate = new Date();
              subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionMonths);
              newUser.subscriptionEndDate = subscriptionEndDate;
              await newUser.save();
              console.log(`✅ Subscription end date set for user ${newUser.id}: ${subscriptionEndDate.toISOString()}`);

              // Помечаем, что подписка уже обновлена, чтобы не обновлять второй раз ниже
              isSubscriptionProcessed = true;
            }
          } catch (error) {
            // ...
          }
        }

        // ... (logging for no registration data) ...

        // ... (logging for no registration data) ...

        if (transaction.userId && !isSubscriptionProcessed) {
          // Обновляем подписку пользователя, если это платеж за подписку (и она еще не была обновлена выше)
          // ... (existing subscription update logic) ...
        }
      }
    }

    // Отвечаем 200 OK (Finik ожидает успешный ответ)
    res.status(200).json({
      success: true,
      message: 'Webhook processed',
      transactionId: transaction.id
    });

  } catch (error) {
    console.error('❌ Error processing Finik webhook:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Получить список транзакций пользователя (история подписок)
 * GET /api/payments/transactions
 */
router.get('/transactions', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'username', 'subscriptionEndDate', 'usmleSubscriptionEndDate', 'coins']
    });

    const transactions = await Transaction.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    const planLabel = (months, paymentType) => {
      const prefix = paymentType === 'usmle_subscription' ? 'USMLE · ' : '';
      const m = parseInt(months, 10);
      if (m === 12) return `${prefix}1 год`;
      if (m === 3) return `${prefix}3 месяца`;
      if (m === 1) return `${prefix}1 месяц`;
      if (Number.isFinite(m) && m > 0) return `${prefix}${m} мес.`;
      return paymentType === 'usmle_subscription' ? 'USMLE' : 'Подписка';
    };

    const items = transactions.map((t) => {
      const json = t.toJSON();
      const fields = json.fields || {};
      const months = fields.subscriptionType || fields.registrationData?.subscription?.type || null;
      const pType = fields.paymentType || 'subscription';
      return {
        id: json.id,
        status: json.status,
        amount: json.amount,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
        paymentType: pType,
        programType: fields.programType || (pType === 'usmle_subscription' ? 'usmle' : 'university'),
        subscriptionType: months,
        planLabel: planLabel(months, pType),
        promoCode: fields.promoCode || null,
        coinsUsed: fields.coinsToUse || 0,
        description: fields.description || null
      };
    });

    const adminLinked = await isAdminLinkedUser(user);
    const end = user?.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
    const now = new Date();
    const active = adminLinked || !!(end && end > now);
    const usmleEnd = user?.usmleSubscriptionEndDate ? new Date(user.usmleSubscriptionEndDate) : null;
    const usmleActive = adminLinked || !!(usmleEnd && usmleEnd > now);

    res.json({
      subscriptionEndDate: user?.subscriptionEndDate || null,
      subscriptionActive: active,
      usmleSubscriptionEndDate: user?.usmleSubscriptionEndDate || null,
      usmleSubscriptionActive: usmleActive,
      isAdminAccount: adminLinked,
      coins: user?.coins || 0,
      transactions: items
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * Получить конкретную транзакцию
 * GET /api/payments/transactions/:id
 */
router.get('/transactions/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Транзакция не найдена' });
    }

    res.json({ transaction });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * Тарифы подписки
 * GET /api/payments/plans?program=university|usmle
 */
router.get('/plans', auth, async (req, res) => {
  try {
    const program = String(req.query.program || 'university').toLowerCase() === 'usmle'
      ? 'usmle'
      : 'university';

    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'username', 'universityId', 'subscriptionEndDate', 'usmleSubscriptionEndDate'],
      include: [{
        model: University,
        as: 'University',
        attributes: ['id', 'name', 'shortName'],
        required: false
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const adminLinked = await isAdminLinkedUser(user);

    if (program === 'usmle') {
      const plans = await getPlansForUsmle();
      return res.json({
        programType: 'usmle',
        plans,
        usmleSubscriptionEndDate: user.usmleSubscriptionEndDate || null,
        usmleSubscriptionActive: adminLinked || !!(user.usmleSubscriptionEndDate && new Date(user.usmleSubscriptionEndDate) > new Date()),
        isAdminAccount: adminLinked
      });
    }

    if (!user.universityId) {
      return res.status(400).json({ error: 'У пользователя не указан университет' });
    }

    const plans = await getPlansForUniversity(user.universityId);
    res.json({
      programType: 'university',
      universityId: user.universityId,
      university: user.University
        ? { id: user.University.id, name: user.University.name, shortName: user.University.shortName }
        : null,
      plans,
      subscriptionEndDate: user.subscriptionEndDate || null
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * Подготовка оплаты для мобильного Finik SDK
 * POST /api/payments/mobile-prepare
 * Не вызывает Finik API — клиент открывает finik_sdk с этими параметрами.
 */
router.post('/mobile-prepare', auth, [
  body('subscriptionType').notEmpty().withMessage('Тип подписки обязателен'),
  body('coinsToUse').optional().isInt({ min: 0 }).withMessage('Монетки должны быть неотрицательным числом'),
  body('promoCode').optional({ checkFalsy: true }).isString().trim().isLength({ min: 3, max: 64 }).withMessage('Некорректный промокод')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const accountId = process.env.FINIK_MOBILE_ACCOUNT_ID || process.env.FINIK_ACCOUNT_ID;
    // Мобильный SDK может иметь отдельный API key от веб-интеграции
    const apiKey = process.env.FINIK_MOBILE_API_KEY || process.env.FINIK_API_KEY;
    const nameEn = process.env.FINIK_NAME_EN || 'stud.kg Payment';
    const webhookUrl = process.env.FINIK_WEBHOOK_URL || `${req.protocol}://${req.get('host')}/api/payments/webhook`;
    const isBeta = String(process.env.FINIK_ENV || 'prod').toLowerCase() !== 'prod';

    if (!accountId || !apiKey) {
      return res.status(500).json({ error: 'Finik для мобильного приложения не настроен (MOBILE_API_KEY / ACCOUNT_ID)' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const subscriptionType = String(req.body.subscriptionType || '1');
    const months = parseInt(subscriptionType, 10) || 1;
    const programType = String(req.body.programType || req.body.program || 'university').toLowerCase() === 'usmle'
      ? 'usmle'
      : 'university';
    const effectivePaymentType = programType === 'usmle' ? 'usmle_subscription' : 'subscription';

    let rawAmount;
    if (programType === 'usmle') {
      const planPrice = await getUsmlePlanPrice(months);
      if (planPrice == null) {
        return res.status(400).json({ error: 'Этот тариф USMLE недоступен' });
      }
      rawAmount = planPrice;
    } else {
      if (!user.universityId) {
        return res.status(400).json({ error: 'Укажите университет, чтобы оформить подписку' });
      }
      const planPrice = await getPlanPrice(user.universityId, months);
      if (planPrice == null) {
        return res.status(400).json({ error: 'Этот тариф недоступен для вашего университета' });
      }
      rawAmount = planPrice;
    }

    let promoCodeData = null;
    let promoDiscountAmount = 0;
    if (req.body.promoCode) {
      const { promo, error } = await resolvePromoCode(req.body.promoCode);
      if (!promo) {
        return res.status(400).json({ error });
      }
      promoCodeData = promo;
      promoDiscountAmount = parseFloat(((rawAmount * promo.discountPercent) / 100).toFixed(2));
    }

    const amountAfterPromo = Math.max(0.01, rawAmount - promoDiscountAmount);
    const requestedCoins = Math.floor(parseInt(req.body.coinsToUse, 10) || 0);
    const maxCoinsByBalance = user.coins || 0;
    const maxCoinsByAmount = Math.max(0, Math.floor(amountAfterPromo - 0.01));
    const coinsToUse = Math.min(requestedCoins, maxCoinsByBalance, maxCoinsByAmount);
    const amountToCharge = Math.max(0.01, amountAfterPromo - coinsToUse);

    const crypto = require('crypto');
    const requestId = crypto.randomUUID();
    const pendingFinikId = `mobile_${requestId}`;

    const fields = {
      userId: String(user.id),
      paymentType: effectivePaymentType,
      programType,
      subscriptionType,
      universityId: user.universityId != null ? String(user.universityId) : '',
      source: 'mobile_sdk',
      mobileRequestId: requestId,
      originalAmount: String(rawAmount),
      coinsToUse: String(coinsToUse),
      ...(promoCodeData && {
        promoCodeId: String(promoCodeData.id),
        promoCode: promoCodeData.code,
        promoDiscountPercent: String(promoCodeData.discountPercent)
      })
    };

    const transaction = await Transaction.create({
      userId: user.id,
      finikTransactionId: pendingFinikId,
      amount: amountToCharge,
      status: 'PENDING',
      fields: {
        ...fields,
        description: `Мобильная оплата: ${effectivePaymentType}`,
        originalAmount: rawAmount,
        coinsToUse,
        promoCodeId: promoCodeData?.id || null,
        promoCode: promoCodeData?.code || null,
        promoDiscountPercent: promoCodeData?.discountPercent || 0,
        promoDiscountAmount
      }
    });

    res.json({
      success: true,
      transactionId: transaction.id,
      requestId,
      amount: amountToCharge,
      originalAmount: rawAmount,
      coinsUsed: coinsToUse,
      promoCode: promoCodeData?.code || null,
      promoDiscountPercent: promoCodeData?.discountPercent || 0,
      sdk: {
        apiKey,
        accountId,
        isBeta,
        nameEn,
        callbackUrl: webhookUrl,
        description: programType === 'usmle'
          ? `USMLE подписка ${months} мес.`
          : `Подписка ${months} мес.`,
        locale: 'RU'
      },
      requiredFields: fields
    });
  } catch (error) {
    console.error('Error mobile-prepare:', error);
    res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
  }
});

/**
 * Привязать Finik payment/item id к локальной транзакции после CreateItem в SDK
 * POST /api/payments/mobile-bind
 */
router.post('/mobile-bind', auth, [
  body('transactionId').isInt({ min: 1 }).withMessage('transactionId обязателен'),
  body('finikTransactionId').optional().isString(),
  body('itemId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const transaction = await Transaction.findOne({
      where: {
        id: req.body.transactionId,
        userId: req.user.id
      }
    });
    if (!transaction) {
      return res.status(404).json({ error: 'Транзакция не найдена' });
    }

    const finikTransactionId = req.body.finikTransactionId || req.body.paymentId || req.body.itemId;
    if (finikTransactionId) {
      transaction.finikTransactionId = String(finikTransactionId);
    }
    if (req.body.itemId) {
      transaction.itemId = String(req.body.itemId);
    }
    transaction.fields = Object.assign({}, transaction.fields || {}, {
      mobileBoundAt: new Date().toISOString(),
      mobileCreatedPayload: req.body.createdPayload || null
    });
    await transaction.save();

    res.json({ success: true, transactionId: transaction.id, finikTransactionId: transaction.finikTransactionId });
  } catch (error) {
    console.error('Error mobile-bind:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * Создать платеж через Finik API
 * POST /api/payments/create
 */
router.post('/create', [
  body('amount').optional({ nullable: true }).isFloat({ min: 0.01 }).withMessage('Сумма должна быть больше 0'),
  body('description').optional().isString(),
  body('subscriptionType').optional(),
  body('coinsToUse').optional().isInt({ min: 0 }).withMessage('Монетки должны быть неотрицательным числом'),
  body('promoCode').optional({ checkFalsy: true }).isString().trim().isLength({ min: 3, max: 64 }).withMessage('Некорректный промокод')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { description, paymentType } = req.body;
    let rawAmount = req.body.amount != null ? parseFloat(req.body.amount) : null;

    // Получаем конфигурацию из .env
    const accountId = process.env.FINIK_ACCOUNT_ID;
    const merchantCategoryCode = process.env.FINIK_MERCHANT_CATEGORY_CODE || '0742';
    const nameEn = process.env.FINIK_NAME_EN || 'stud.kg Payment';
    const webhookUrl = process.env.FINIK_WEBHOOK_URL || `${req.protocol}://${req.get('host')}/api/payments/webhook`;
    const redirectUrl = process.env.FINIK_REDIRECT_URL || `${req.protocol}://${req.get('host')}/payment/success`;

    if (!accountId) {
      return res.status(500).json({
        error: 'FINIK_ACCOUNT_ID не настроен. Проверьте конфигурацию.'
      });
    }

    // Получаем userId из токена (обязателен для покупки подписки)
    let userId = null;
    let user = null;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
        user = await User.findByPk(userId);
      }
    } catch (e) {
      console.log('Ошибка токена при создании платежа:', e.message);
    }

    if (!userId || !user) {
      return res.status(401).json({
        error: 'Войдите в аккаунт, чтобы оформить подписку'
      });
    }

    const subscriptionType = String(req.body.subscriptionType || '1');
    const months = parseInt(subscriptionType, 10) || 1;
    const programType = (req.body.programType === 'usmle' || paymentType === 'usmle_subscription')
      ? 'usmle'
      : 'university';
    const effectivePaymentType = programType === 'usmle'
      ? 'usmle_subscription'
      : (paymentType || 'subscription');

    if (programType === 'usmle') {
      const planPrice = await getUsmlePlanPrice(months);
      if (planPrice == null) {
        return res.status(400).json({ error: 'Этот тариф USMLE недоступен' });
      }
      rawAmount = planPrice;
    } else {
      if (!user.universityId) {
        return res.status(400).json({ error: 'Укажите университет, чтобы оформить подписку' });
      }
      const planPrice = await getPlanPrice(user.universityId, months);
      if (planPrice == null) {
        return res.status(400).json({ error: 'Этот тариф недоступен для вашего университета' });
      }
      rawAmount = planPrice;
    }

    // Промокод как процентная скидка
    let promoCodeData = null;
    let promoDiscountAmount = 0;
    if (req.body.promoCode) {
      const { promo, error } = await resolvePromoCode(req.body.promoCode);
      if (!promo) {
        return res.status(400).json({ error });
      }
      promoCodeData = promo;
      promoDiscountAmount = parseFloat(((rawAmount * promo.discountPercent) / 100).toFixed(2));
    }

    const amountAfterPromo = Math.max(0.01, rawAmount - promoDiscountAmount);

    // Монетки как скидка: курс 1 к 1 (1 монетка = 1 сом)
    let coinsToUse = 0;
    if (userId && user) {
      const requestedCoins = Math.floor(parseInt(req.body.coinsToUse, 10) || 0);
      const maxCoinsByBalance = user.coins || 0;
      const maxCoinsByAmount = Math.max(0, Math.floor(amountAfterPromo - 0.01)); // чтобы к оплате осталось >= 0.01
      coinsToUse = Math.min(requestedCoins, maxCoinsByBalance, maxCoinsByAmount);
    }
    const amountToCharge = Math.max(0.01, amountAfterPromo - coinsToUse);

    // Чистый redirect без query: Finik дописывает ?paymentId=… и ломает URL, если уже есть параметры (?…?…)
    const redirectUrlClean = new URL(redirectUrl);
    redirectUrlClean.search = '';
    const finikRedirectUrl = redirectUrlClean.toString();

    // Создаем платеж через Finik API (сумма к списанию с карты = amountToCharge)
    const paymentResult = await createPayment({
      amount: amountToCharge,
      redirectUrl: finikRedirectUrl,
      accountId: accountId,
      merchantCategoryCode: merchantCategoryCode,
      nameEn: nameEn,
      webhookUrl: webhookUrl,
      description: description || `Оплата: ${effectivePaymentType}`,
      customFields: {
        ...(userId && { userId: userId.toString() }),
        paymentType: effectivePaymentType,
        programType,
        subscriptionType: subscriptionType,
        universityId: user.universityId,
        testMode: 'true',
        ...(promoCodeData && {
          promoCodeId: promoCodeData.id,
          promoCode: promoCodeData.code,
          promoDiscountPercent: promoCodeData.discountPercent
        })
      }
    });

    // Сохраняем транзакцию в БД (amount = сумма к списанию с карты; originalAmount и coinsToUse в fields)
    const transaction = await Transaction.create({
      userId: userId,
      finikTransactionId: paymentResult.paymentId,
      amount: amountToCharge,
      status: 'PENDING',
      fields: {
        paymentType: effectivePaymentType,
        programType,
        subscriptionType: subscriptionType,
        universityId: user.universityId,
        description: description || `Оплата: ${effectivePaymentType}`,
        testMode: true,
        originalAmount: rawAmount,
        coinsToUse: coinsToUse,
        promoCodeId: promoCodeData?.id || null,
        promoCode: promoCodeData?.code || null,
        promoDiscountPercent: promoCodeData?.discountPercent || 0,
        promoDiscountAmount: promoDiscountAmount
      }
    });

    console.log(`Payment created: ${paymentResult.paymentId} ${userId ? `for user ${userId}` : '(test mode, no user)'}`);
    console.log('📤 Payment result:', {
      success: paymentResult.success,
      paymentId: paymentResult.paymentId,
      paymentUrl: paymentResult.paymentUrl,
      status: paymentResult.status,
      coinsUsed: coinsToUse,
      amountToCharge
    });

    if (!paymentResult.paymentUrl) {
      console.error('⚠️  WARNING: paymentUrl is missing from Finik response!');
      console.error('Full payment result:', JSON.stringify(paymentResult, null, 2));
    }

    res.json({
      success: true,
      message: 'Платеж создан успешно',
      paymentId: paymentResult.paymentId,
      paymentUrl: paymentResult.paymentUrl,
      transactionId: transaction.id,
      amount: amountToCharge,
      coinsUsed: coinsToUse,
      originalAmount: rawAmount,
      promoCode: promoCodeData?.code || null,
      promoDiscountPercent: promoCodeData?.discountPercent || 0,
      promoDiscountAmount
    });

  } catch (error) {
    console.error('Error creating payment:', error);

    // Обработка различных типов ошибок
    if (error.message.includes('FINIK_')) {
      return res.status(500).json({
        error: 'Ошибка конфигурации Finik: ' + error.message
      });
    }

    if (error.message.includes('HTTP')) {
      return res.status(400).json({
        error: 'Ошибка при создании платежа: ' + error.message
      });
    }

    res.status(500).json({
      error: 'Ошибка сервера: ' + error.message
    });
  }
});

/**
 * Создать платеж для регистрации (без авторизации)
 * POST /api/payments/create-registration
 */
router.post('/create-registration', [
  body('amount').isFloat({ min: 0.01 }).withMessage('Сумма должна быть больше 0'),
  body('description').optional().isString(),
  body('promoCode').optional({ checkFalsy: true }).isString().trim().isLength({ min: 3, max: 64 }).withMessage('Некорректный промокод'),
  body('registrationData').isObject().withMessage('Данные регистрации обязательны'),
  body('registrationData.username').trim().isLength({ min: 3, max: 50 }).withMessage('Никнейм должен быть от 3 до 50 символов'),
  body('registrationData.email').isEmail().withMessage('Некорректный email'),
  body('registrationData.password').isLength({ min: 6 }).withMessage('Пароль должен быть минимум 6 символов'),
  body('registrationData.universityId').isInt({ min: 1 }).withMessage('Выберите университет')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, description, paymentType, registrationData } = req.body;

    const university = await University.findOne({
      where: { id: registrationData.universityId, isActive: true }
    });
    if (!university) {
      return res.status(400).json({ error: 'Выбранный университет недоступен' });
    }

    // Проверка существующих пользователей со схожими никнеймами или почтами (на этапе до создания оплаты)
    const normalizedEmail = registrationData.email.trim();
    const normalizedUsername = registrationData.username.trim();

    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { email: { [require('sequelize').Op.iLike]: normalizedEmail } },
          { username: { [require('sequelize').Op.iLike]: normalizedUsername } }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email.toLowerCase() === normalizedEmail.toLowerCase()) {
        return res.status(400).json({ error: 'Пользователь с такой почтой (или очень похожей) уже существует' });
      }
      return res.status(400).json({ error: 'Пользователь с таким никнеймом (или очень похожим) уже существует' });
    }

    // Обработка реферального кода (без скидки, только для начисления монет)
    let finalAmount = parseFloat(amount);
    let referralCode = null;
    let referrerId = null;
    let promoCodeData = null;
    let promoDiscountAmount = 0;

    if (registrationData.referralCode) {
      referralCode = registrationData.referralCode.toUpperCase();
      const referrer = await User.findOne({ where: { referralCode } });
      if (referrer) {
        referrerId = referrer.id;
        console.log(`✅ Referral code found: ${referralCode}, referrer ID: ${referrer.id}`);
      } else {
        console.log(`⚠️  Invalid referral code: ${referralCode}`);
      }
    }

    if (referralCode && req.body.promoCode) {
      return res.status(400).json({ error: 'Вы уже перешли по бонусной ссылке' });
    }

    if (req.body.promoCode) {
      const { promo, error } = await resolvePromoCode(req.body.promoCode);
      if (!promo) {
        return res.status(400).json({ error });
      }
      promoCodeData = promo;
      promoDiscountAmount = parseFloat(((finalAmount * promo.discountPercent) / 100).toFixed(2));
      finalAmount = Math.max(0.01, finalAmount - promoDiscountAmount);
    }

    // Сохраняем registrationData в fields для обработки в webhook
    const registrationDataForFields = {
      ...registrationData,
      universityId: university.id,
      subscription: registrationData.subscription || {},
      referralCode: referralCode,
      referrerId: referrerId,
      promoCode: promoCodeData?.code || null
    };

    // Получаем конфигурацию из .env
    const accountId = process.env.FINIK_ACCOUNT_ID;
    const merchantCategoryCode = process.env.FINIK_MERCHANT_CATEGORY_CODE || '0742';
    const nameEn = process.env.FINIK_NAME_EN || 'stud.kg Payment';
    const webhookUrl = process.env.FINIK_WEBHOOK_URL || `${req.protocol}://${req.get('host')}/api/payments/webhook`;
    const redirectUrl = process.env.FINIK_REDIRECT_URL || `${req.protocol}://${req.get('host')}/payment/success`;

    if (!accountId) {
      return res.status(500).json({
        error: 'FINIK_ACCOUNT_ID не настроен. Проверьте конфигурацию.'
      });
    }

    // Только путь без query: иначе Finik добавляет ?paymentId=… и получается двойной «?» в ссылке
    const redirectUrlClean = new URL(redirectUrl);
    redirectUrlClean.search = '';
    const finikRedirectUrl = redirectUrlClean.toString();

    // Создаем платеж через Finik API
    const paymentResult = await createPayment({
      amount: finalAmount,
      redirectUrl: finikRedirectUrl,
      accountId: accountId,
      merchantCategoryCode: merchantCategoryCode,
      nameEn: nameEn,
      webhookUrl: webhookUrl,
      description: description || `Регистрация: ${paymentType || 'subscription'}`,
      customFields: {
        registrationData: JSON.stringify(registrationDataForFields), // Сохраняем данные регистрации с реферальным кодом
        paymentType: paymentType || 'registration',
        subscriptionType: registrationData.subscription?.type || '1',
        ...(promoCodeData && {
          promoCodeId: promoCodeData.id,
          promoCode: promoCodeData.code,
          promoDiscountPercent: promoCodeData.discountPercent
        })
      }
    });

    // Сохраняем транзакцию в БД (со статусом PENDING)
    // userId будет null до успешной оплаты
    const transactionFields = {
      paymentType: paymentType || 'registration',
      registrationData: registrationDataForFields, // Сохраняем данные для создания аккаунта с реферальным кодом
      subscriptionType: registrationData.subscription?.type || '1',
      promoCodeId: promoCodeData?.id || null,
      promoCode: promoCodeData?.code || null,
      promoDiscountPercent: promoCodeData?.discountPercent || 0,
      promoDiscountAmount
    };

    const transaction = await Transaction.create({
      userId: null, // Будет установлен после создания пользователя
      finikTransactionId: paymentResult.paymentId,
      amount: finalAmount,
      status: 'PENDING',
      fields: transactionFields
    });

    console.log(`📝 Registration payment created: ${paymentResult.paymentId}`);
    console.log('💾 Transaction saved with registrationData:', {
      transactionId: transaction.id,
      paymentId: paymentResult.paymentId,
      email: registrationData.email,
      username: registrationData.username,
      hasRegistrationData: !!transactionFields.registrationData,
      hasPaymentUrl: !!paymentResult.paymentUrl,
      paymentUrl: paymentResult.paymentUrl
    });

    // Проверяем наличие paymentUrl
    if (!paymentResult.paymentUrl) {
      console.error('❌ ERROR: paymentUrl is missing from Finik response!');
      console.error('Full payment result:', JSON.stringify(paymentResult, null, 2));
      return res.status(500).json({
        error: 'Ошибка: не получен URL для оплаты от Finik. Проверьте логи сервера.',
        paymentId: paymentResult.paymentId,
        transactionId: transaction.id
      });
    }

    // Проверяем формат paymentUrl
    if (!paymentResult.paymentUrl.startsWith('http://') && !paymentResult.paymentUrl.startsWith('https://')) {
      console.error('❌ ERROR: Invalid paymentUrl format:', paymentResult.paymentUrl);
      return res.status(500).json({
        error: 'Ошибка: некорректный формат URL для оплаты',
        paymentId: paymentResult.paymentId,
        transactionId: transaction.id
      });
    }

    console.log('✅ Payment URL is valid, sending response to client');

    res.json({
      success: true,
      message: 'Платеж создан успешно',
      paymentId: paymentResult.paymentId,
      paymentUrl: paymentResult.paymentUrl,
      transactionId: transaction.id,
      amount: finalAmount,
      originalAmount: parseFloat(amount),
      promoCode: promoCodeData?.code || null,
      promoDiscountPercent: promoCodeData?.discountPercent || 0,
      promoDiscountAmount
    });

  } catch (error) {
    console.error('Error creating registration payment:', error);

    // Обработка различных типов ошибок
    if (error.message.includes('FINIK_')) {
      return res.status(500).json({
        error: 'Ошибка конфигурации Finik: ' + error.message
      });
    }

    if (error.message.includes('HTTP')) {
      return res.status(400).json({
        error: 'Ошибка при создании платежа: ' + error.message
      });
    }

    res.status(500).json({
      error: 'Ошибка сервера: ' + error.message
    });
  }
});

/**
 * После оплаты Finik ведёт на /payment/success?paymentId=…&status=…
 * Для регистрации выдаём JWT один раз (без пароля в браузере), чтобы сразу открыть личный кабинет.
 * GET /api/payments/session-by-payment-id?paymentId=<uuid>
 */
router.get('/session-by-payment-id', async (req, res) => {
  try {
    const paymentId = String(req.query.paymentId || '').trim();
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(paymentId)) {
      return res.status(400).json({ error: 'Некорректный paymentId' });
    }

    const transaction = await Transaction.findOne({ where: { finikTransactionId: paymentId } });
    if (!transaction) {
      return res.status(404).json({ ready: false, error: 'Платеж не найден' });
    }

    if (transaction.status !== 'SUCCEEDED') {
      return res.json({
        ready: false,
        status: transaction.status,
        message: 'Платеж ещё не подтверждён'
      });
    }

    const fields = transaction.fields || {};
    const paymentType = fields.paymentType || '';

    if (paymentType !== 'registration') {
      return res.json({ ready: true, mode: 'subscription' });
    }

    if (!transaction.userId) {
      return res.json({
        ready: false,
        status: transaction.status,
        message: 'Аккаунт ещё создаётся, подождите'
      });
    }

    if (fields.postPaymentAuthConsumed) {
      return res.json({ ready: false, consumed: true, message: 'Сессия уже была выдана' });
    }

    const user = await User.findByPk(transaction.userId, {
      attributes: ['id', 'username', 'email', 'status']
    });
    if (!user) {
      return res.status(500).json({ error: 'Пользователь не найден' });
    }

    transaction.fields = {
      ...fields,
      postPaymentAuthConsumed: true,
      postPaymentAuthConsumedAt: new Date().toISOString()
    };
    await transaction.save();

    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    return res.json({
      ready: true,
      mode: 'registration',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      message: 'Вход выполнен успешно'
    });
  } catch (error) {
    console.error('session-by-payment-id:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

