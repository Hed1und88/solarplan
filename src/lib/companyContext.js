import { base44 } from '@/api/base44Client';
import {
  isCompanyAdmin,
  isSuperAdminEmail,
  normalizeEmail,
  userCompanyId,
  userCompanyRole,
  userEmail,
} from '@/lib/accessControl';

let cachedContextPromise = null;

function activeMembershipForEmail(memberships = [], email) {
  const normalizedEmail = normalizeEmail(email);
  return (memberships || []).find(membership => {
    if (membership.is_active === false) return false;
    return normalizeEmail(membership.email) === normalizedEmail;
  }) || null;
}

export function clearCompanyContextCache() {
  cachedContextPromise = null;
}

export async function resolveCompanyContext(userOverride = null) {
  const user = userOverride || await base44.auth.me();
  const email = userEmail(user);
  const superAdmin = isSuperAdminEmail(email);
  let membership = null;

  if (email && base44.entities?.CompanyMembership?.filter) {
    try {
      const memberships = await base44.entities.CompanyMembership.filter({ email }, '-created_date', 20);
      membership = activeMembershipForEmail(memberships, email);
    } catch (error) {
      console.warn('Could not resolve CompanyMembership for current user.', error);
    }
  }

  const companyId = membership?.company_id || userCompanyId(user);
  const role = superAdmin ? 'superadmin' : (membership?.role || userCompanyRole(user) || 'company-user');
  const context = {
    user,
    email,
    companyId,
    company_id: companyId,
    role,
    membership,
    isSuperAdmin: superAdmin,
  };
  context.isCompanyAdmin = isCompanyAdmin(context);
  return context;
}

export function getCompanyContext({ force = false } = {}) {
  if (!cachedContextPromise || force) {
    cachedContextPromise = resolveCompanyContext();
  }
  return cachedContextPromise;
}
