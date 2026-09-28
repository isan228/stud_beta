const DESCRIPTOR_LENGTH = 128;
const MIN_ENROLL_SAMPLES = 3;
const MAX_ENROLL_SAMPLES = 10;

/** Строже, чем 0.6 по умолчанию в face-api: ищем среди всех пользователей, а не сверяем с одним. */
const LOGIN_MATCH_THRESHOLD = 0.45;
/** Если второй кандидат почти так же близко — не угадываем, а отказываем. */
const LOGIN_AMBIGUITY_MARGIN = 0.06;
/** Лицо считается уже зарегистрированным, если оно ближе этого к чьему-то профилю. */
const DUPLICATE_THRESHOLD = 0.45;
/** Подтверждение лица конкретного аккаунта (1:1) — порог face-api чуть мягче поиска по всем. */
const VERIFY_THRESHOLD = 0.5;

function normalizeDescriptor(raw) {
  if (!Array.isArray(raw) || raw.length !== DESCRIPTOR_LENGTH) return null;
  const out = new Array(DESCRIPTOR_LENGTH);
  for (let i = 0; i < DESCRIPTOR_LENGTH; i++) {
    const n = Number(raw[i]);
    if (!Number.isFinite(n) || Math.abs(n) > 10) return null;
    out[i] = n;
  }
  return out;
}

function normalizeEnrollDescriptors(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length < MIN_ENROLL_SAMPLES || raw.length > MAX_ENROLL_SAMPLES) return null;
  const list = raw.map(normalizeDescriptor);
  return list.every(Boolean) ? list : null;
}

function normalizeProbeDescriptors(body) {
  const raw = Array.isArray(body?.descriptors) ? body.descriptors.slice(0, 3) : [body?.descriptor];
  return raw.map(normalizeDescriptor).filter(Boolean);
}

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < DESCRIPTOR_LENGTH; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function minDistance(probes, descriptors) {
  let best = Infinity;
  for (const probe of probes) {
    for (const d of descriptors || []) {
      if (!Array.isArray(d) || d.length !== DESCRIPTOR_LENGTH) continue;
      const dist = euclidean(probe, d);
      if (dist < best) best = dist;
    }
  }
  return best;
}

/**
 * @param {number[][]} probes
 * @param {{ id: number, userId: number|null, descriptors: number[][] }[]} profiles
 * @returns {{ best: object|null, bestDistance: number, secondDistance: number }}
 */
function rankProfiles(probes, profiles) {
  let best = null;
  let bestDistance = Infinity;
  let secondDistance = Infinity;
  for (const profile of profiles) {
    const dist = minDistance(probes, profile.descriptors);
    if (dist < bestDistance) {
      secondDistance = bestDistance;
      bestDistance = dist;
      best = profile;
    } else if (dist < secondDistance) {
      secondDistance = dist;
    }
  }
  return { best, bestDistance, secondDistance };
}

function isConfidentLoginMatch({ best, bestDistance, secondDistance }) {
  if (!best || bestDistance >= LOGIN_MATCH_THRESHOLD) return false;
  return secondDistance - bestDistance >= LOGIN_AMBIGUITY_MARGIN;
}

function isDuplicateFace(descriptors, profiles) {
  const { best, bestDistance } = rankProfiles(descriptors, profiles);
  return !!best && bestDistance < DUPLICATE_THRESHOLD;
}

function matchesProfile(probes, descriptors) {
  return minDistance(probes, descriptors) < VERIFY_THRESHOLD;
}

module.exports = {
  normalizeDescriptor,
  normalizeEnrollDescriptors,
  normalizeProbeDescriptors,
  rankProfiles,
  isConfidentLoginMatch,
  isDuplicateFace,
  matchesProfile
};
