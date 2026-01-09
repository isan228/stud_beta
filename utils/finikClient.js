const { Signer } = require('@mancho.devs/authorizer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Используем node-fetch для Node.js < 18, или встроенный fetch для Node.js 18+
let fetch;
try {
  // Пытаемся использовать встроенный fetch (Node.js 18+)
  fetch = globalThis.fetch;
  if (!fetch) {
    throw new Error('No built-in fetch');
  }
} catch (e) {
  // Используем node-fetch для старых версий
  fetch = require('node-fetch');
}

/**
 * Получить приватный ключ из файла или переменной окружения
 */
function getPrivateKey() {
  // Сначала пытаемся прочитать из файла
  const privateKeyPath = path.join(process.cwd(), 'finik_private.pem');
  
  if (fs.existsSync(privateKeyPath)) {
    try {
      const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Приватный ключ загружен из файла: finik_private.pem');
      }
      return privateKey.trim();
    } catch (error) {
      console.error('Ошибка чтения файла приватного ключа:', error);
    }
  }
  
  // Если файл не найден, используем переменную окружения
  const envKey = process.env.FINIK_PRIVATE_KEY_PEM;
  if (envKey) {
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Приватный ключ загружен из переменной окружения');
    }
    // Заменяем \n на реальные переносы строк, если нужно
    return envKey.replace(/\\n/g, '\n').trim();
  }
  
  throw new Error('Приватный ключ не найден. Создайте файл finik_private.pem в корне проекта или установите FINIK_PRIVATE_KEY_PEM в .env');
}

/**
 * Получить базовый URL Finik API
 */
function getFinikBaseUrl() {
  const env = process.env.FINIK_ENV || 'beta';
  if (env === 'prod') {
    return 'https://api.acquiring.averspay.kg';
  }
  return 'https://beta.api.acquiring.averspay.kg';
}

/**
 * Получить Host заголовок для Finik API
 */
function getFinikHost() {
  const env = process.env.FINIK_ENV || 'beta';
  if (env === 'prod') {
    return 'api.acquiring.averspay.kg';
  }
  return 'beta.api.acquiring.averspay.kg';
}

/**
 * Создать платеж в Finik
 * @param {Object} params - Параметры платежа
 * @param {number} params.amount - Сумма платежа
 * @param {string} params.redirectUrl - URL для редиректа после оплаты
 * @param {string} params.accountId - Account ID от Finik
 * @param {string} params.merchantCategoryCode - MCC код
 * @param {string} params.nameEn - Название QR кода (англ.)
 * @param {string} params.webhookUrl - URL для webhook
 * @param {string} params.description - Описание платежа (опционально)
 * @param {number} params.startDate - Начало действия QR (timestamp, опционально)
 * @param {number} params.endDate - Конец действия QR (timestamp, опционально)
 * @param {Object} params.customFields - Дополнительные поля (опционально)
 * @returns {Promise<Object>} - Результат создания платежа
 */
async function createPayment(params) {
  const {
    amount,
    redirectUrl,
    accountId,
    merchantCategoryCode,
    nameEn,
    webhookUrl,
    description,
    startDate,
    endDate,
    customFields = {}
  } = params;
  
  // Проверка обязательных параметров
  if (!amount || amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  if (!redirectUrl) {
    throw new Error('RedirectUrl is required');
  }
  if (!accountId) {
    throw new Error('AccountId is required');
  }
  if (!merchantCategoryCode) {
    throw new Error('MerchantCategoryCode is required');
  }
  if (!nameEn) {
    throw new Error('NameEn is required');
  }
  if (!webhookUrl) {
    throw new Error('WebhookUrl is required');
  }
  
  // Получаем конфигурацию
  const apiKey = process.env.FINIK_API_KEY;
  
  if (!apiKey) {
    throw new Error('FINIK_API_KEY is not set in environment variables');
  }
  
  // Получаем приватный ключ из файла или переменной окружения
  const privateKeyPem = getPrivateKey();
  
  // Проверяем формат приватного ключа
  if (!privateKeyPem.includes('BEGIN PRIVATE KEY') && !privateKeyPem.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error('Invalid private key format. Must start with -----BEGIN PRIVATE KEY----- or -----BEGIN RSA PRIVATE KEY-----');
  }
  
  // Логируем конфигурацию (всегда для диагностики)
  console.log('✅ Configuration loaded:', {
    apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET',
    privateKey: privateKeyPem ? 'LOADED' : 'NOT LOADED',
    privateKeyLength: privateKeyPem ? privateKeyPem.length : 0,
    privateKeyFormat: privateKeyPem.includes('BEGIN PRIVATE KEY') ? 'PKCS#8' : 
                     privateKeyPem.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1' : 'UNKNOWN',
    accountId: accountId ? 'SET' : 'NOT SET',
    environment: process.env.FINIK_ENV || 'beta'
  });
  
  // Генерируем PaymentId (UUID)
  const paymentId = uuidv4();
  
  // Формируем тело запроса
  const body = {
    Amount: amount,
    CardType: 'FINIK_QR',
    PaymentId: paymentId,
    RedirectUrl: redirectUrl,
    Data: {
      accountId: accountId,
      merchantCategoryCode: merchantCategoryCode,
      name_en: nameEn,
      webhookUrl: webhookUrl,
      ...(description && { description }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...customFields
    }
  };
  
  // Получаем URL и Host
  const baseUrl = getFinikBaseUrl();
  const host = getFinikHost();
  const path = '/v1/payment';
  const timestamp = Date.now().toString();
  
  // Формируем заголовки для подписи
  const headers = {
    Host: host,
    'x-api-key': apiKey,
    'x-api-timestamp': timestamp
  };
  
  // Создаем данные для подписи (формат для @mancho.devs/authorizer)
  const requestData = {
    httpMethod: 'POST',
    path: path,
    headers: headers,
    queryStringParameters: undefined,
    body: body
  };
  
  // Генерируем подпись используя официальный пакет
  const signer = new Signer(requestData);
  const signature = await signer.sign(privateKeyPem);
  
  // Отладочная информация (всегда логируем для диагностики 403)
  console.log('🔐 Finik Payment Request Details:', {
    url: `${baseUrl}${path}`,
    method: 'POST',
    host: host,
    environment: process.env.FINIK_ENV || 'beta',
    headers: {
      'Host': host,
      'x-api-key': apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET',
      'x-api-timestamp': timestamp,
      'signature': signature ? `${signature.substring(0, 20)}...` : 'NOT SET'
    },
    body: {
      Amount: body.Amount,
      CardType: body.CardType,
      PaymentId: body.PaymentId,
      RedirectUrl: body.RedirectUrl,
      Data: {
        accountId: body.Data.accountId,
        merchantCategoryCode: body.Data.merchantCategoryCode,
        name_en: body.Data.name_en,
        webhookUrl: body.Data.webhookUrl
      }
    },
    requestData: {
      httpMethod: requestData.httpMethod,
      path: requestData.path,
      headers: requestData.headers
    }
  });
  
  // Проверяем каноническую строку для подписи (для отладки)
  try {
    const canonicalString = signer.getCanonicalString ? signer.getCanonicalString() : 'N/A';
    console.log('📝 Canonical string length:', canonicalString.length);
    if (process.env.NODE_ENV === 'development') {
      console.log('📝 Canonical string (first 200 chars):', canonicalString.substring(0, 200));
    }
  } catch (e) {
    // Метод может быть недоступен
  }
  
  // Отправляем запрос
  const url = `${baseUrl}${path}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'x-api-timestamp': timestamp,
        'signature': signature
      },
      body: JSON.stringify(body),
      redirect: 'manual' // Не следовать редиректу автоматически
    });
    
    // Обрабатываем ответ
    if (response.status === 302 || response.status === 301) {
      // Редирект - это нормально, получаем payment URL
      const paymentUrl = response.headers.get('location');
      return {
        success: true,
        paymentId: paymentId,
        paymentUrl: paymentUrl,
        status: 'CREATED'
      };
    } else if (response.status === 201) {
      // JSON ответ (если API вернет JSON)
      const data = await response.json();
      return {
        success: true,
        paymentId: paymentId,
        paymentUrl: data.paymentUrl || response.headers.get('location'),
        status: data.status || 'CREATED',
        data: data
      };
    } else {
      // Ошибка
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { errorMessage: errorText };
      }
      
      // Логируем детали ошибки для отладки
      console.error('Finik API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        url: url,
        headers: {
          'x-api-key': apiKey ? 'SET' : 'NOT SET',
          'x-api-timestamp': timestamp
        }
      });
      
      const errorMessage = errorData.message || 
                          errorData.ErrorMessage || 
                          errorData.errorMessage || 
                          `HTTP ${response.status}: ${errorText}`;
      
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error.message.includes('Failed to generate signature')) {
      throw error;
    }
    throw new Error(`Failed to create payment: ${error.message}`);
  }
}

module.exports = {
  createPayment,
  getFinikBaseUrl,
  getFinikHost
};

