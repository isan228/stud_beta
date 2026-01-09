const crypto = require('crypto');
const { URL } = require('url');
const { Signer } = require('@mancho.devs/authorizer');
const fs = require('fs');
const path = require('path');

// Публичные ключи Finik (встроенные, используются если файл не найден)
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

/**
 * Получить публичный ключ из файла или использовать встроенный
 */
function getPublicKey() {
  // Сначала пытаемся прочитать из файла (если вы используете свой публичный ключ)
  const publicKeyPath = path.join(process.cwd(), 'finik_public.pem');
  
  if (fs.existsSync(publicKeyPath)) {
    try {
      const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Публичный ключ загружен из файла: finik_public.pem');
      }
      return publicKey.trim();
    } catch (error) {
      console.error('Ошибка чтения файла публичного ключа:', error);
    }
  }
  
  // Если файл не найден, используем встроенные ключи Finik
  const env = process.env.FINIK_ENV || 'prod';
  const builtInKey = FINIK_PUBLIC_KEYS[env] || FINIK_PUBLIC_KEYS.prod;
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ Используется встроенный публичный ключ Finik (${env})`);
  }
  return builtInKey;
}

/**
 * URL encode строку
 */
function uriEncode(str) {
  return encodeURIComponent(str).replace(/%20/g, '+');
}

/**
 * Сортировка и конкатенация заголовков
 */
function buildHeadersString(req) {
  const headers = [];
  
  // Добавляем Host
  if (req.headers.host) {
    headers.push({ name: 'host', value: req.headers.host });
  }
  
  // Добавляем заголовки x-api-*
  Object.keys(req.headers).forEach(key => {
    if (key.toLowerCase().startsWith('x-api-')) {
      headers.push({ 
        name: key.toLowerCase(), 
        value: req.headers[key] 
      });
    }
  });
  
  // Сортируем по имени
  headers.sort((a, b) => a.name.localeCompare(b.name));
  
  // Конкатенируем
  return headers.map(h => `${h.name}:${h.value}`).join('&');
}

/**
 * Сортировка и конкатенация query параметров
 */
function buildQueryString(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const params = [];
  
  url.searchParams.forEach((value, key) => {
    params.push({ key, value: value || '' });
  });
  
  // Сортируем по ключу
  params.sort((a, b) => a.key.localeCompare(b.key));
  
  // Конкатенируем
  return params.map(p => `${uriEncode(p.key)}=${uriEncode(p.value)}`).join('&');
}

/**
 * Сортировка JSON объекта по ключам и строкификация
 */
function sortAndStringify(obj) {
  if (!obj || typeof obj !== 'object') {
    return '';
  }
  
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = obj[key];
  });
  
  return JSON.stringify(sorted);
}

/**
 * Построить строку данных для валидации
 */
function buildValidationString(req, body) {
  let data = '';
  
  // 1. HTTP метод в нижнем регистре
  data += req.method.toLowerCase() + '\n';
  
  // 2. URI абсолютный путь
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  data += url.pathname + '\n';
  
  // 3. Заголовки (Host и x-api-*)
  const headersStr = buildHeadersString(req);
  data += headersStr + '\n';
  
  // 4. Query параметры
  const queryStr = buildQueryString(req);
  if (queryStr) {
    data += queryStr + '\n';
  }
  
  // 5. JSON body (отсортированный)
  const bodyStr = sortAndStringify(body);
  data += bodyStr;
  
  return data;
}

/**
 * Валидация подписи Finik
 * Использует тот же алгоритм, что и для создания подписи через @mancho.devs/authorizer
 * @param {Object} req - Express request object
 * @param {Object} body - Parsed request body
 * @returns {boolean} - true если подпись валидна
 */
function validateFinikSignature(req, body) {
  try {
    const signature = req.headers.signature || req.headers['x-signature'];
    
    if (!signature) {
      console.error('Finik signature header not found');
      return false;
    }
    
    // Получаем публичный ключ
    const publicKey = getPublicKey();
    
    // Строим данные запроса в формате для Signer (для консистентности)
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    
    // Собираем заголовки для подписи (Host и x-api-*)
    const signHeaders = {};
    if (req.headers.host) {
      signHeaders.Host = req.headers.host;
    }
    Object.keys(req.headers).forEach(key => {
      if (key.toLowerCase().startsWith('x-api-')) {
        signHeaders[key] = req.headers[key];
      }
    });
    
    // Формируем query параметры (если есть)
    const queryParams = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    
    const requestData = {
      httpMethod: req.method,
      path: url.pathname,
      headers: signHeaders,
      queryStringParameters: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      body: body
    };
    
    // Используем Signer для построения канонической строки (внутренний метод)
    // Если метод недоступен, используем наш алгоритм
    let canonicalString;
    try {
      const signer = new Signer(requestData);
      // Пытаемся получить каноническую строку через внутренний метод
      // Если метод недоступен, используем наш алгоритм
      canonicalString = buildValidationString(req, body);
    } catch (e) {
      // Fallback на наш алгоритм
      canonicalString = buildValidationString(req, body);
    }
    
    // Валидируем подпись
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(canonicalString, 'utf8');
    
    const isValid = verifier.verify(publicKey, signature, 'base64');
    
    if (!isValid) {
      console.error('Finik signature validation failed');
      console.error('Canonical string:', canonicalString);
      console.error('Signature:', signature);
    }
    
    return isValid;
  } catch (error) {
    console.error('Error validating Finik signature:', error);
    return false;
  }
}

module.exports = {
  validateFinikSignature,
  getPublicKey,
  buildValidationString
};

