const crypto = require('crypto');
const { URL } = require('url');

/**
 * URL encode строку
 */
function uriEncode(str) {
  return encodeURIComponent(str).replace(/%20/g, '+');
}

/**
 * Сортировка и конкатенация заголовков для подписи
 */
function buildHeadersString(headers) {
  const headerList = [];
  
  // Добавляем Host
  if (headers.host || headers.Host) {
    headerList.push({ 
      name: 'host', 
      value: (headers.host || headers.Host).toLowerCase() 
    });
  }
  
  // Добавляем заголовки x-api-*
  Object.keys(headers).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith('x-api-')) {
      headerList.push({ 
        name: lowerKey, 
        value: String(headers[key]) 
      });
    }
  });
  
  // Сортируем по имени
  headerList.sort((a, b) => a.name.localeCompare(b.name));
  
  // Конкатенируем
  return headerList.map(h => `${h.name}:${h.value}`).join('&');
}

/**
 * Сортировка и конкатенация query параметров
 */
function buildQueryString(queryParams) {
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return '';
  }
  
  const params = [];
  Object.keys(queryParams).forEach(key => {
    params.push({ 
      key, 
      value: queryParams[key] || '' 
    });
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
  
  return JSON.stringify(sorted, null, 0); // compact JSON
}

/**
 * Построить каноническую строку для подписи
 */
function buildCanonicalString(requestData) {
  let data = '';
  
  // 1. HTTP метод в нижнем регистре
  data += requestData.httpMethod.toLowerCase() + '\n';
  
  // 2. URI абсолютный путь
  data += requestData.path + '\n';
  
  // 3. Заголовки (Host и x-api-*)
  const headersStr = buildHeadersString(requestData.headers || {});
  data += headersStr + '\n';
  
  // 4. Query параметры
  const queryStr = buildQueryString(requestData.queryStringParameters);
  if (queryStr) {
    data += queryStr + '\n';
  }
  
  // 5. JSON body (отсортированный)
  const bodyStr = sortAndStringify(requestData.body);
  data += bodyStr;
  
  return data;
}

/**
 * Класс для генерации подписи Finik
 */
class FinikSigner {
  /**
   * @param {Object} requestData - Данные запроса
   * @param {string} requestData.httpMethod - HTTP метод (POST, GET, etc.)
   * @param {string} requestData.path - Абсолютный путь URL
   * @param {Object} requestData.headers - HTTP заголовки (Host, x-api-*, etc.)
   * @param {Object} requestData.queryStringParameters - Query параметры (опционально)
   * @param {Object} requestData.body - Тело запроса (JSON объект)
   */
  constructor(requestData) {
    this.requestData = requestData;
  }
  
  /**
   * Генерировать подпись
   * @param {string} privateKeyPem - Приватный ключ в формате PEM
   * @returns {string} - Base64 подпись
   */
  sign(privateKeyPem) {
    try {
      // Строим каноническую строку
      const canonicalString = buildCanonicalString(this.requestData);
      
      // Создаем подпись
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(canonicalString, 'utf8');
      
      // Подписываем приватным ключом
      const signature = signer.sign(privateKeyPem, 'base64');
      
      return signature;
    } catch (error) {
      console.error('Error generating Finik signature:', error);
      throw new Error(`Failed to generate signature: ${error.message}`);
    }
  }
  
  /**
   * Получить каноническую строку (для отладки)
   */
  getCanonicalString() {
    return buildCanonicalString(this.requestData);
  }
}

module.exports = {
  FinikSigner,
  buildCanonicalString
};

