const { Op } = require('sequelize');

function toIntList(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0))];
}

function toBool(v, defaultValue = false) {
  if (v === undefined || v === null) return defaultValue;
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function normalizeUniversityEntry(raw, fallbackId) {
  if (typeof raw === 'number' || typeof raw === 'string') {
    const universityId = parseInt(raw, 10);
    if (!Number.isFinite(universityId) || universityId <= 0) return null;
    return {
      universityId,
      allSubjects: true,
      subjectIds: [],
      flashcards: true
    };
  }
  if (!raw || typeof raw !== 'object') return null;
  const universityId = parseInt(raw.universityId ?? raw.id ?? fallbackId, 10);
  if (!Number.isFinite(universityId) || universityId <= 0) return null;
  const subjectIds = toIntList(raw.subjectIds);
  let allSubjects;
  if (raw.allSubjects === false || raw.allSubjects === 'false' || raw.allSubjects === 0) {
    allSubjects = false;
  } else if (raw.allSubjects === true || raw.allSubjects === 'true' || raw.allSubjects === 1) {
    allSubjects = true;
  } else {
    allSubjects = subjectIds.length === 0;
  }
  return {
    universityId,
    allSubjects,
    subjectIds: allSubjects ? [] : subjectIds,
    flashcards: toBool(raw.flashcards, true)
  };
}

/**
 * Permissions shape (stored in Editor.permissions JSONB):
 * {
 *   usmle: { enabled, allSubjects, subjectIds[], flashcards, medicalImages },
 *   universities: [{ universityId, allSubjects, subjectIds[], flashcards }]
 * }
 * Legacy: { usmle: true, universityIds: [1,2] } is accepted and upgraded.
 */
function normalizePermissions(raw) {
  let src = raw;
  if (typeof src === 'string') {
    try { src = JSON.parse(src); } catch (_) { src = {}; }
  }
  if (!src || typeof src !== 'object' || Array.isArray(src)) src = {};

  let usmle;
  if (src.usmle && typeof src.usmle === 'object' && !Array.isArray(src.usmle)) {
    const subjectIds = toIntList(src.usmle.subjectIds);
    const explicitEnabled = src.usmle.enabled !== undefined
      ? toBool(src.usmle.enabled, false)
      : true;
    let allSubjects;
    if (src.usmle.allSubjects === false || src.usmle.allSubjects === 'false' || src.usmle.allSubjects === 0) {
      allSubjects = false;
    } else if (src.usmle.allSubjects === true || src.usmle.allSubjects === 'true' || src.usmle.allSubjects === 1) {
      allSubjects = true;
    } else {
      allSubjects = subjectIds.length === 0;
    }
    usmle = {
      enabled: explicitEnabled,
      allSubjects: explicitEnabled ? allSubjects : false,
      subjectIds: explicitEnabled && !allSubjects ? subjectIds : [],
      flashcards: explicitEnabled ? toBool(src.usmle.flashcards, true) : false,
      medicalImages: explicitEnabled ? toBool(src.usmle.medicalImages, true) : false
    };
  } else {
    const enabled = toBool(src.usmle, false);
    usmle = {
      enabled,
      allSubjects: enabled,
      subjectIds: [],
      flashcards: enabled,
      medicalImages: enabled
    };
  }

  let universities = [];
  if (Array.isArray(src.universities) && src.universities.length) {
    universities = src.universities
      .map((u) => normalizeUniversityEntry(u))
      .filter(Boolean);
  } else if (Array.isArray(src.universityIds) && src.universityIds.length) {
    universities = toIntList(src.universityIds).map((id) => ({
      universityId: id,
      allSubjects: true,
      subjectIds: [],
      flashcards: true
    }));
  }

  const byId = new Map();
  for (const u of universities) byId.set(u.universityId, u);
  universities = [...byId.values()].sort((a, b) => a.universityId - b.universityId);

  return { usmle, universities };
}

function hasAnyPermission(permissions) {
  const p = normalizePermissions(permissions);
  if (p.usmle.enabled) return true;
  return p.universities.some((u) =>
    u.allSubjects || u.subjectIds.length > 0 || u.flashcards
  );
}

function buildActorScope(actorType, permissions) {
  if (actorType === 'admin') {
    return {
      full: true,
      usmle: true,
      universityIds: [],
      usmleAccess: {
        enabled: true,
        allSubjects: true,
        subjectIds: [],
        flashcards: true,
        medicalImages: true
      },
      uniAccess: {}
    };
  }
  const p = normalizePermissions(permissions);
  const uniAccess = {};
  for (const u of p.universities) {
    uniAccess[u.universityId] = u;
  }
  return {
    full: false,
    usmle: !!p.usmle.enabled,
    universityIds: p.universities.map((u) => u.universityId),
    usmleAccess: p.usmle,
    uniAccess
  };
}

function getUniAccess(scope, universityId) {
  const uid = parseInt(universityId, 10);
  if (!Number.isFinite(uid)) return null;
  return scope?.uniAccess?.[uid] || null;
}

function canAccessSubjectIds(access, subjectId) {
  if (!access) return false;
  if (access.allSubjects) return true;
  const sid = parseInt(subjectId, 10);
  if (!Number.isFinite(sid)) return false;
  return (access.subjectIds || []).includes(sid);
}

/**
 * @param {object} scope
 * @param {{ programType?: string, universityId?: number|null, subjectId?: number|null, resource?: 'content'|'flashcards'|'medicalImages' }} meta
 */
function canAccessScope(scope, meta = {}) {
  if (!scope || scope.full) return true;

  const resource = meta.resource || 'content';
  const type = meta.programType === 'usmle' ? 'usmle' : 'university';

  if (type === 'usmle') {
    const access = scope.usmleAccess;
    if (!access?.enabled) return false;
    if (resource === 'flashcards') return !!access.flashcards;
    if (resource === 'medicalImages') return !!access.medicalImages;
    if (meta.subjectId != null && meta.subjectId !== '') {
      return canAccessSubjectIds(access, meta.subjectId);
    }
    return !!(access.allSubjects || (access.subjectIds || []).length);
  }

  const uni = getUniAccess(scope, meta.universityId);
  if (!uni) return false;
  if (resource === 'flashcards') return !!uni.flashcards;
  if (resource === 'medicalImages') return false;
  if (meta.subjectId != null && meta.subjectId !== '') {
    return canAccessSubjectIds(uni, meta.subjectId);
  }
  return !!(uni.allSubjects || (uni.subjectIds || []).length || uni.flashcards);
}

function denyScope(res, message = 'Нет прав на этот раздел') {
  return res.status(403).json({ error: message });
}

/** Where for Subject list */
function scopeSubjectWhere(scope) {
  if (!scope || scope.full) return null;
  const or = [];

  if (scope.usmleAccess?.enabled) {
    if (scope.usmleAccess.allSubjects) {
      or.push({ programType: 'usmle' });
    } else if ((scope.usmleAccess.subjectIds || []).length) {
      or.push({ programType: 'usmle', id: { [Op.in]: scope.usmleAccess.subjectIds } });
    }
  }

  for (const uid of Object.keys(scope.uniAccess || {})) {
    const uni = scope.uniAccess[uid];
    const universityId = parseInt(uid, 10);
    if (!uni || !Number.isFinite(universityId)) continue;
    if (uni.allSubjects) {
      or.push({ programType: 'university', universityId });
    } else if ((uni.subjectIds || []).length) {
      or.push({
        programType: 'university',
        universityId,
        id: { [Op.in]: uni.subjectIds }
      });
    }
  }

  if (!or.length) return { id: -1 };
  return { [Op.or]: or };
}

/** @deprecated alias — subject list filter */
function scopeProgramUniversityWhere(scope) {
  return scopeSubjectWhere(scope);
}

/** Where for Test list */
function scopeTestWhere(scope) {
  if (!scope || scope.full) return null;
  const or = [];

  if (scope.usmleAccess?.enabled) {
    if (scope.usmleAccess.allSubjects) {
      or.push({ programType: 'usmle' });
    } else if ((scope.usmleAccess.subjectIds || []).length) {
      or.push({
        programType: 'usmle',
        subjectId: { [Op.in]: scope.usmleAccess.subjectIds }
      });
    }
  }

  for (const uid of Object.keys(scope.uniAccess || {})) {
    const uni = scope.uniAccess[uid];
    const universityId = parseInt(uid, 10);
    if (!uni || !Number.isFinite(universityId)) continue;
    if (uni.allSubjects) {
      or.push({ programType: 'university', universityId });
    } else if ((uni.subjectIds || []).length) {
      or.push({
        programType: 'university',
        universityId,
        subjectId: { [Op.in]: uni.subjectIds }
      });
    }
  }

  if (!or.length) return { id: -1 };
  return { [Op.or]: or };
}

/** Where for Flashcard list */
function scopeFlashcardWhere(scope) {
  if (!scope || scope.full) return null;
  const or = [];
  if (scope.usmleAccess?.enabled && scope.usmleAccess.flashcards) {
    or.push({ programType: 'usmle' });
  }
  for (const uid of Object.keys(scope.uniAccess || {})) {
    const uni = scope.uniAccess[uid];
    const universityId = parseInt(uid, 10);
    if (uni?.flashcards && Number.isFinite(universityId)) {
      or.push({ programType: 'university', universityId });
    }
  }
  if (!or.length) return { id: -1 };
  return { [Op.or]: or };
}

function canAccessFlashcards(scope, { programType, universityId } = {}) {
  return canAccessScope(scope, { programType, universityId, resource: 'flashcards' });
}

function canAccessMedicalImages(scope) {
  if (!scope || scope.full) return true;
  return !!(scope.usmleAccess?.enabled && scope.usmleAccess.medicalImages);
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
    universityIds: permissions.universities.map((u) => u.universityId),
    createdAt: editor.createdAt,
    updatedAt: editor.updatedAt
  };
}

module.exports = {
  normalizePermissions,
  hasAnyPermission,
  buildActorScope,
  canAccessScope,
  canAccessFlashcards,
  canAccessMedicalImages,
  denyScope,
  scopeProgramUniversityWhere,
  scopeSubjectWhere,
  scopeTestWhere,
  scopeFlashcardWhere,
  mergeWhere,
  serializeEditor
};
