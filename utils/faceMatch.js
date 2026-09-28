const DESCRIPTOR_LENGTH = 128;
const MIN_ENROLL_SAMPLES = 3;
const MAX_ENROLL_SAMPLES = 10;

/** Строже, чем 0.6 по умолчанию в face-api: ищем среди всех пользователей, а не сверяем с одним. */
const LOGIN_MATCH_THRESHOLD = 0.45;
/** Одно лицо может быть на нескольких аккаунтах — показываем не больше стольких вариантов. */
const MAX_LOGIN_CANDIDATES = 5;

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

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < DESCRIPTOR_LENGTH; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function minDistance(probe, descriptors) {
  let best = Infinity;
  for (const d of descriptors || []) {
    if (!Array.isArray(d) || d.length !== DESCRIPTOR_LENGTH) continue;
    const dist = euclidean(probe, d);
    if (dist < best) best = dist;
  }
  return best;
}

/**
 * Все профили, похожие на лицо, от самого близкого.
 * @param {number[][]} probes
 * @param {{ id: number, userId: number|null, descriptors: number[][] }[]} profiles
 * @returns {{ profile: object, distance: number }[]}
 */
function findLoginCandidates(probes, profiles) {
  const matches = [];
  for (const profile of profiles) {
    let dist = Infinity;
    for (const probe of probes) {
      dist = Math.min(dist, minDistance(probe, profile.descriptors));
    }
    if (dist < LOGIN_MATCH_THRESHOLD) matches.push({ profile, distance: dist });
  }
  matches.sort((a, b) => a.distance - b.distance);
  return matches.slice(0, MAX_LOGIN_CANDIDATES);
}

module.exports = {
  normalizeDescriptor,
  normalizeEnrollDescriptors,
  findLoginCandidates
};
