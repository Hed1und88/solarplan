import {
  attachCompanyOwnership,
  getEntityCompanyId,
  getEntityOwnerEmail,
  getUserCompanyId,
  getUserEmail,
  resolveAccessContext,
} from '@/lib/accessControl';

export async function currentUserSafe(base44) {
  try {
    if (base44?.auth?.me) return await base44.auth.me();
    if (base44?.auth?.currentUser) return await base44.auth.currentUser();
  } catch {}
  return null;
}

export function canViewWorkspaceRecord(user = {}, record = {}) {
  const access = resolveAccessContext(user);
  if (access.isSuperadmin) return true;
  const userCompany = getUserCompanyId(user);
  const recordCompany = getEntityCompanyId(record);
  if (userCompany && recordCompany && String(userCompany) === String(recordCompany)) return true;
  return Boolean(getUserEmail(user) && getUserEmail(user) === getEntityOwnerEmail(record));
}

export function canEditWorkspaceRecord(user = {}, record = {}) {
  const access = resolveAccessContext(user);
  if (access.isSuperadmin) return true;
  if (!access.isCompanyAdmin && !access.isEmployee) return false;
  return canViewWorkspaceRecord(user, record);
}

export function filterWorkspaceRecords(records = [], user = {}) {
  return (Array.isArray(records) ? records : []).filter(record => canViewWorkspaceRecord(user, record));
}

export function withWorkspaceOwnership(data = {}, user = {}) {
  return attachCompanyOwnership(data, user);
}
