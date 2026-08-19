function parseImageUrls(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  }

  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean))];
      }
    } catch (_) {
      // fallback to legacy single-url string below
    }
  }

  return [trimmed];
}

function stringifyImageUrls(urls) {
  const normalized = parseImageUrls(urls);
  if (normalized.length === 0) return null;
  if (normalized.length === 1) return normalized[0];
  return JSON.stringify(normalized);
}

function firstImageUrl(value) {
  return parseImageUrls(value)[0] || null;
}

function appendImageUrl(value, newUrl) {
  return stringifyImageUrls([...parseImageUrls(value), newUrl]);
}

function removeImageUrl(value, targetUrl) {
  const filtered = parseImageUrls(value).filter((item) => item !== targetUrl);
  return stringifyImageUrls(filtered);
}

module.exports = {
  parseImageUrls,
  stringifyImageUrls,
  firstImageUrl,
  appendImageUrl,
  removeImageUrl,
};
