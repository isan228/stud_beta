const { Signer } = require('@mancho.devs/authorizer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  const env = process.env.FINIK_ENV || 'prod';
  console.log('🔧 Finik Environment:', env, 'FINIK_ENV from process.env:', process.env.FINIK_ENV);
  if (env === 'prod') {
    console.log('✅ Using PRODUCTION URL: https://api.acquiring.averspay.kg');
    return 'https://api.acquiring.averspay.kg';
  }
  console.log('⚠️  Using BETA URL: https://beta.api.acquiring.averspay.kg');
  return 'https://beta.api.acquiring.averspay.kg';
}

/**
 * Получить Host заголовок для Finik API
 */
function getFinikHost() {
  const env = process.env.FINIK_ENV || 'prod';
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
    environment: process.env.FINIK_ENV || 'prod'
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
  const apiPath = '/v1/payment';
  const timestamp = Date.now().toString();
  
  // Логируем для диагностики
  console.log('🌐 Finik API Configuration:', {
    baseUrl,
    host,
    apiPath,
    fullUrl: `${baseUrl}${apiPath}`,
    env: process.env.FINIK_ENV || 'prod (default)',
    FINIK_ENV: process.env.FINIK_ENV
  });
  
  // Формируем заголовки для подписи
  const headers = {
    Host: host,
    'x-api-key': apiKey,
    'x-api-timestamp': timestamp
  };
  
  // Создаем данные для подписи (формат для @mancho.devs/authorizer)
  const requestData = {
    httpMethod: 'POST',
    path: apiPath,
    headers: headers,
    queryStringParameters: undefined,
    body: body
  };
  
  // Генерируем подпись используя официальный пакет
  const signer = new Signer(requestData);
  const signature = await signer.sign(privateKeyPem);
  
  // Отладочная информация (всегда логируем для диагностики 403)
  console.log('🔐 Finik Payment Request Details:', {
    url: `${baseUrl}${apiPath}`,
    method: 'POST',
    host: host,
    environment: process.env.FINIK_ENV || 'prod',
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
  
  // Строим каноническую строку вручную для диагностики
  try {
    // Используем тот же алгоритм, что и Signer
    const buildCanonicalString = (reqData) => {
      let data = '';
      
      // 1. HTTP метод в нижнем регистре
      data += reqData.httpMethod.toLowerCase() + '\n';
      
      // 2. Путь
      data += reqData.path + '\n';
      
      // 3. Заголовки (Host и x-api-*), отсортированные
      const headerEntries = [];
      if (reqData.headers.Host) {
        headerEntries.push(['host', reqData.headers.Host.toLowerCase()]);
      }
      Object.keys(reqData.headers).forEach(key => {
        if (key.toLowerCase().startsWith('x-api-')) {
          headerEntries.push([key.toLowerCase(), String(reqData.headers[key])]);
        }
      });
      headerEntries.sort((a, b) => a[0].localeCompare(b[0]));
      const headersStr = headerEntries.map(([k, v]) => `${k}:${v}`).join('&');
      data += headersStr + '\n';
      
      // 4. Query параметры (если есть)
      if (reqData.queryStringParameters && Object.keys(reqData.queryStringParameters).length > 0) {
        const queryEntries = Object.entries(reqData.queryStringParameters)
          .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v || '')])
          .sort((a, b) => a[0].localeCompare(b[0]));
        const queryStr = queryEntries.map(([k, v]) => `${k}=${v}`).join('&');
        data += queryStr + '\n';
      }
      
      // 5. JSON body (отсортированный)
      const sortedBody = {};
      Object.keys(reqData.body).sort().forEach(key => {
        sortedBody[key] = reqData.body[key];
      });
      data += JSON.stringify(sortedBody);
      
      return data;
    };
    
    const canonicalString = buildCanonicalString(requestData);
    
    console.log('📝 Canonical string for signature:');
    console.log('   Length:', canonicalString.length);
    console.log('   Full string:');
    console.log('   ' + canonicalString.split('\n').join('\n   '));
    
    // Проверяем подпись локально (для диагностики)
    const testVerifier = crypto.createVerify('RSA-SHA256');
    testVerifier.update(canonicalString, 'utf8');
    
    // Пытаемся проверить с публичным ключом из файла
    const publicKeyPath = path.join(process.cwd(), 'finik_public.pem');
    if (fs.existsSync(publicKeyPath)) {
      const publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();
      const isValid = testVerifier.verify(publicKey, signature, 'base64');
      console.log('🔍 Local signature verification:', isValid ? '✅ VALID' : '❌ INVALID');
      if (!isValid) {
        console.error('⚠️  Signature verification failed locally!');
        console.error('   This means the signature is incorrect or keys do not match.');
      }
    }
  } catch (e) {
    console.log('⚠️  Could not build canonical string:', e.message);
    console.error(e);
  }
  
  // Проверяем соответствие приватного и публичного ключей (для диагностики)
  try {
    // Получаем публичный ключ из файла или используем встроенный
    let publicKeyForVerification;
    try {
      const publicKeyPath = path.join(process.cwd(), 'finik_public.pem');
      if (fs.existsSync(publicKeyPath)) {
        publicKeyForVerification = fs.readFileSync(publicKeyPath, 'utf8').trim();
        console.log('📋 Using public key from file: finik_public.pem');
      }
    } catch (pathError) {
      console.log('⚠️  Could not read public key file:', pathError.message);
    }
    
    if (!publicKeyForVerification) {
      // Используем встроенный ключ Finik (для проверки, но не для подписи)
      const env = process.env.FINIK_ENV || 'prod';
      const FINIK_PUBLIC_KEYS = {
        prod: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuF/PUmhMPPidcMxhZBPb
BSGJoSphmCI+h6ru8fG8guAlcPMVlhs+ThTjw2LHABvciwtpj51ebJ4EqhlySPyT
hqSfXI6Jp5dPGJNDguxfocohaz98wvT+WAF86DEglZ8dEsfoumojFUy5sTOBdHEu
g94B4BbrJvjmBa1YIx9Azse4HFlWhzZoYPgyQpArhokeHOHIN2QFzJqeriANO+wV
aUMta2AhRVZHbfyJ36XPhGO6A5FYQWgjzkI65cxZs5LaNFmRx6pjnhjIeVKKgF99
4OoYCzhuR9QmWkPl7tL4Kd68qa/xHLz0Psnuhm0CStWOYUu3J7ZpzRK8GoEXRcr8
tQIDAQAB
-----END PUBLIC KEY-----`,
        beta: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwlrlKz/8gLWd1ARWGA/8
o3a3Qy8G+hPifyqiPosiTY6nCHovANMIJXk6DH4qAqqZeLu8pLGxudkPbv8dSyG7
F9PZEAryMPzjoB/9P/F6g0W46K/FHDtwTM3YIVvstbEbL19m8yddv/xCT9JPPJTb
LsSTVZq5zCqvKzpupwlGS3Q3oPyLAYe+ZUn4Bx2J1WQrBu3b08fNaR3E8pAkCK27
JqFnP0eFfa817VCtyVKcFHb5ij/D0eUP519Qr/pgn+gsoG63W4pPHN/pKwQUUiAy
uLSHqL5S2yu1dffyMcMVi9E/Q2HCTcez5OvOllgOtkNYHSv9pnrMRuws3u87+hNT
ZwIDAQAB
-----END PUBLIC KEY-----`
      };
      publicKeyForVerification = FINIK_PUBLIC_KEYS[env] || FINIK_PUBLIC_KEYS.prod;
      console.log('📋 Using built-in Finik public key for verification (this is NOT your key)');
    }
    const testMessage = 'test signature verification';
    const testSigner = crypto.createSign('RSA-SHA256');
    testSigner.update(testMessage);
    const testSignature = testSigner.sign(privateKeyPem, 'base64');
    
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(testMessage);
    const isValid = verifier.verify(publicKeyForVerification, testSignature, 'base64');
    
    console.log('🔑 Key pair verification:', isValid ? '✅ VALID' : '❌ INVALID');
    if (!isValid) {
      console.error('⚠️  WARNING: Private and public keys do not match!');
      console.error('   This will cause 403 Forbidden errors.');
      console.error('   Make sure you sent the correct public key to Finik.');
      console.error('   Your public key should be generated from your private key:');
      console.error('   openssl rsa -in finik_private.pem -pubout > finik_public.pem');
    } else {
      console.log('✅ Your private key matches the public key in finik_public.pem');
      console.log('   Make sure this public key was sent to Finik representatives.');
    }
  } catch (e) {
    console.error('⚠️  Could not verify key pair:', e.message);
  }
  
  // Отправляем запрос
  const url = `${baseUrl}${apiPath}`;
  
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

