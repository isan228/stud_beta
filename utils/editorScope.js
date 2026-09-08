const { Op } = require('sequelize');

function normalizePermissions(raw) {
  let src = raw;
  if (typeof src === 'string') {
    try { src = JSON.parse(src); } catch (_) { src = {}; }
  }
  if (!src || typeof src !== 'object' || Array.isArray(src)) src = {};
  const universityIds = Array.isArray(src.universityIds)
    ? [...new Set(src.universityIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0))]
    : [];
  return {
    usmle: src.usmle === true || src.usmle === 1 || src.usmle === '1' || String(src.usmle).toLowerCase() === 'true',
    universityIds
  };
}

function hasAnyPermission(permissions) {
  const p = normalizePermissions(permissions);
  return p.usmle || p.universityIds.length > 0;
}

function buildActorScope(actorType, permissions) {
  if (actorType === 'admin') {
    return { full: true, usmle: true, universityIds: [] };
  }
  const p = normalizePermissions(permissions);
  return {
    full: false,
    usmle: p.usmle,
    universityIds: p.universityIds
  };
}

function canAccessScope(scope, { programType, universityId } = {}) {
  if (!scope || scope.full) return true;
  const type = programType === 'usmle' ? 'usmle' : 'university';
  if (type === 'usmle') return !!scope.usmle;
  const uid = parseInt(universityId, 10);
  if (!Number.isFinite(uid)) return false;
  return (scope.universityIds || []).includes(uid);
}

function denyScope(res, message = 'Нет прав на этот раздел') {
  return res.status(403).json({ error: message });
}

/** Sequelize where-фрагмент для Subject / Test по правам редактора */
function scopeProgramUniversityWhere(scope, { aliasPrefix = '' } = {}) {
  if (!scope || scope.full) return null;

  const programCol = aliasPrefix ? `$${aliasPrefix}.programType$` : 'programType';
  const uniCol = aliasPrefix ? `$${aliasPrefix}.universityId$` : 'universityId';
  // For plain where on Subject/Test themselves, use field names:
  const or = [];
  if (scope.usmle) {
    or.push({ programType: 'usmle' });
  }
  if ((scope.universityIds || []).length) {
    or.push({
      programType: 'university',
      universityId: { [Op.in]: scope.universityIds }
    });
  }
  if (!or.length) {
    return { id: -1 };
  }
  return { [Op.or]: or };
}

function mergeWhere(baseWhere, extra) {
  if (!extra) return baseWhere || {};
  const base = baseWhere && typeof baseWhere === 'object' ? { ...baseWhere } : {};
  if (!Object.keys(base).length) return extra;
  return { [Op.and]: [base, extra] };
}

function serializeEditor(editor) {
  const permissions = normalizePermissions(editor.permissions);
  return {
    id: editor.id,
    username: editor.username,
    displayName: editor.displayName,
    isActive: editor.isActive,
    permissions,
    createdAt: editor.createdAt,
    updatedAt: editor.updatedAt
  };
}

module.exports = {
  normalizePermissions,
  hasAnyPermission,
  buildActorScope,
  canAccessScope,
  denyScope,
  scopeProgramUniversityWhere,
  mergeWhere,
  serializeEditor
};
