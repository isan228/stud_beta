const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { Transaction, User } = require('../models');
const { validateFinikSignature } = require('../utils/finikValidator');
const { createPayment } = require('../utils/finikClient');

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
    if (!validateFinikSignature(req, payload)) {
      console.error('Invalid Finik signature');
      console.error('Headers:', req.headers);
      console.error('Payload:', JSON.stringify(payload, null, 2));
      return res.status(401).json({ error: 'Invalid signature' });
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
    let transaction = await Transaction.findOne({
      where: { finikTransactionId }
    });
    
    if (transaction) {
      // Обновляем существующую транзакцию
      transaction.status = payload.status === 'SUCCEEDED' ? 'SUCCEEDED' : 
                          payload.status === 'FAILED' ? 'FAILED' : 'PENDING';
      transaction.amount = payload.amount || transaction.amount;
      transaction.net = payload.net || transaction.net;
      transaction.receiptNumber = payload.receiptNumber || transaction.receiptNumber;
      transaction.transactionDate = payload.transactionDate || transaction.transactionDate;
      transaction.transactionType = payload.transactionType || transaction.transactionType;
      transaction.fields = payload.fields || transaction.fields;
      transaction.data = payload.data || transaction.data;
      transaction.rawPayload = payload;
      
      await transaction.save();
      
      console.log(`📝 Transaction ${transaction.id} updated to status: ${transaction.status}`);
      
      // Обработка успешного платежа
      if (transaction.status === 'SUCCEEDED') {
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
        
        // 3. Если не нашли, проверяем в payload.data (пришло от Finik)
        if (!registrationData && payload.data && payload.data.registrationData) {
          registrationData = payload.data.registrationData;
          if (typeof registrationData === 'string') {
            try {
              registrationData = JSON.parse(registrationData);
            } catch (e) {
              console.error('Error parsing registrationData from payload.data:', e);
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
              
              // Создаем нового пользователя
              console.log('👤 Creating new user account...');
              const newUser = await User.create({
                username: registrationData.username,
                email: registrationData.email,
                password: registrationData.password, // Будет захеширован в hook
                status: 'approved' // Автоматически одобряем после оплаты
              });
              
              console.log(`✅ User account created: ID ${newUser.id}, email: ${newUser.email}`);
              
              // Создаем статистику для пользователя
              await require('../models').UserStats.create({ userId: newUser.id });
              console.log(`✅ UserStats created for user ${newUser.id}`);
              
              // Привязываем транзакцию к пользователю
              transaction.userId = newUser.id;
              await transaction.save();
              
              console.log(`✅ Transaction ${transaction.id} linked to new user ${newUser.id}`);
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
          // Здесь можно добавить бизнес-логику:
          // - Активировать подписку пользователя
          // - Добавить баланс
          // - Отправить уведомление
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
      
      // Извлекаем registrationData из fields если есть
      let registrationDataFromFields = null;
      if (payload.fields && payload.fields.registrationData) {
        try {
          // Если это строка JSON, парсим
          if (typeof payload.fields.registrationData === 'string') {
            registrationDataFromFields = JSON.parse(payload.fields.registrationData);
          } else {
            registrationDataFromFields = payload.fields.registrationData;
          }
        } catch (e) {
          console.error('Error parsing registrationData:', e);
        }
      }
      
      transaction = await Transaction.create({
        userId,
        finikTransactionId,
        finikAccountId: payload.accountId,
        amount: payload.amount,
        net: payload.net,
        status: payload.status === 'SUCCEEDED' ? 'SUCCEEDED' : 
                payload.status === 'FAILED' ? 'FAILED' : 'PENDING',
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
      
      console.log(`✨ New transaction ${transaction.id} created`);
      
      // Обработка успешного платежа (для новых транзакций)
      if (transaction.status === 'SUCCEEDED') {
        // Ищем registrationData в разных местах
        let registrationData = registrationDataFromFields;
        
        // Если не нашли в payload.fields, проверяем payload.data
        if (!registrationData && payload.data && payload.data.registrationData) {
          try {
            if (typeof payload.data.registrationData === 'string') {
              registrationData = JSON.parse(payload.data.registrationData);
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
            console.log('🔍 Found registrationData in new transaction, attempting to create user:', {
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
              
              // Создаем нового пользователя
              console.log('👤 Creating new user account...');
              const newUser = await User.create({
                username: registrationData.username,
                email: registrationData.email,
                password: registrationData.password, // Будет захеширован в hook
                status: 'approved' // Автоматически одобряем после оплаты
              });
              
              console.log(`✅ User account created: ID ${newUser.id}, email: ${newUser.email}`);
              
              // Создаем статистику для пользователя
              await require('../models').UserStats.create({ userId: newUser.id });
              console.log(`✅ UserStats created for user ${newUser.id}`);
              
              // Привязываем транзакцию к пользователю
              transaction.userId = newUser.id;
              await transaction.save();
              
              console.log(`✅ Transaction ${transaction.id} linked to new user ${newUser.id}`);
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
        } else if (!registrationData) {
          console.log('ℹ️  No registrationData found in payload for new transaction');
          console.log('Payload fields:', JSON.stringify(payload.fields, null, 2));
          console.log('Payload data:', JSON.stringify(payload.data, null, 2));
        } else if (registrationData && transaction.userId) {
          console.log(`ℹ️  User already linked to transaction: userId=${transaction.userId}`);
        }
        
        if (transaction.userId) {
          console.log(`✅ Processing successful payment for user ${transaction.userId}`);
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
 * Получить список транзакций пользователя
 * GET /api/payments/transactions
 */
router.get('/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    
    res.json({ transactions });
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
 * Создать платеж через Finik API
 * POST /api/payments/create
 * ВРЕМЕННО БЕЗ АВТОРИЗАЦИИ ДЛЯ ТЕСТИРОВАНИЯ
 */
router.post('/create', [
  body('amount').isFloat({ min: 0.01 }).withMessage('Сумма должна быть больше 0'),
  body('description').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { amount, description, paymentType } = req.body;
    
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
    
    // Получаем userId из токена (если есть) или null для тестирования
    let userId = null;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
      }
    } catch (e) {
      // Игнорируем ошибки токена - работаем без авторизации для теста
      console.log('Тестовый режим: платеж без авторизации');
    }
    
    // Формируем redirect URL с параметрами
    const redirectUrlWithParams = new URL(redirectUrl);
    if (userId) {
      redirectUrlWithParams.searchParams.set('userId', userId);
    }
    redirectUrlWithParams.searchParams.set('amount', amount);
    if (description) {
      redirectUrlWithParams.searchParams.set('description', description);
    }
    
    // Создаем платеж через Finik API
    const paymentResult = await createPayment({
      amount: amount,
      redirectUrl: redirectUrlWithParams.toString(),
      accountId: accountId,
      merchantCategoryCode: merchantCategoryCode,
      nameEn: nameEn,
      webhookUrl: webhookUrl,
      description: description || `Оплата: ${paymentType || 'subscription'}`,
      customFields: {
        ...(userId && { userId: userId.toString() }),
        paymentType: paymentType || 'subscription',
        testMode: 'true' // Помечаем как тестовый платеж
      }
    });
    
    // Сохраняем транзакцию в БД (со статусом PENDING)
    const transaction = await Transaction.create({
      userId: userId, // Может быть null для тестирования
      finikTransactionId: paymentResult.paymentId,
      amount: amount,
      status: 'PENDING',
      fields: {
        paymentType: paymentType || 'subscription',
        description: description || `Оплата: ${paymentType || 'subscription'}`,
        testMode: true
      }
    });
    
    console.log(`Payment created: ${paymentResult.paymentId} ${userId ? `for user ${userId}` : '(test mode, no user)'}`);
    console.log('📤 Payment result:', {
      success: paymentResult.success,
      paymentId: paymentResult.paymentId,
      paymentUrl: paymentResult.paymentUrl,
      status: paymentResult.status
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
      amount: amount
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
  body('registrationData').isObject().withMessage('Данные регистрации обязательны'),
  body('registrationData.username').trim().isLength({ min: 3, max: 50 }).withMessage('Никнейм должен быть от 3 до 50 символов'),
  body('registrationData.email').isEmail().withMessage('Некорректный email'),
  body('registrationData.password').isLength({ min: 6 }).withMessage('Пароль должен быть минимум 6 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { amount, description, paymentType, registrationData } = req.body;
    
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
    
    // Формируем redirect URL с параметрами
    const redirectUrlWithParams = new URL(redirectUrl);
    redirectUrlWithParams.searchParams.set('registration', 'true');
    redirectUrlWithParams.searchParams.set('amount', amount);
    if (description) {
      redirectUrlWithParams.searchParams.set('description', description);
    }
    
    // Создаем платеж через Finik API
    const paymentResult = await createPayment({
      amount: amount,
      redirectUrl: redirectUrlWithParams.toString(),
      accountId: accountId,
      merchantCategoryCode: merchantCategoryCode,
      nameEn: nameEn,
      webhookUrl: webhookUrl,
      description: description || `Регистрация: ${paymentType || 'subscription'}`,
      customFields: {
        registrationData: JSON.stringify(registrationData), // Сохраняем данные регистрации
        paymentType: paymentType || 'registration',
        subscriptionType: registrationData.subscription?.type || '1'
      }
    });
    
    // Сохраняем транзакцию в БД (со статусом PENDING)
    // userId будет null до успешной оплаты
    const transactionFields = {
      paymentType: paymentType || 'registration',
      registrationData: registrationData, // Сохраняем данные для создания аккаунта
      subscriptionType: registrationData.subscription?.type || '1'
    };
    
    const transaction = await Transaction.create({
      userId: null, // Будет установлен после создания пользователя
      finikTransactionId: paymentResult.paymentId,
      amount: amount,
      status: 'PENDING',
      fields: transactionFields
    });
    
    console.log(`📝 Registration payment created: ${paymentResult.paymentId}`);
    console.log('💾 Transaction saved with registrationData:', {
      transactionId: transaction.id,
      paymentId: paymentResult.paymentId,
      email: registrationData.email,
      username: registrationData.username,
      hasRegistrationData: !!transactionFields.registrationData
    });
    
    res.json({
      success: true,
      message: 'Платеж создан успешно',
      paymentId: paymentResult.paymentId,
      paymentUrl: paymentResult.paymentUrl,
      transactionId: transaction.id,
      amount: amount
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

module.exports = router;

