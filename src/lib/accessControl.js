export const APP_OWNER_EMAIL = 'lyntrasolutions@gmail.com';

export const ACCESS_ROLES = {
  SUPERADMIN: 'superadmin',
  COMPANY_ADMIN: 'company_admin',
  EMPLOYEE: 'employee',
  WHOLESALER: 'wholesaler',
  ANONYMOUS: 'anonymous',
};

const SUPERADMIN_EMAILS = new Set([APP_OWNER_EMAIL]);

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function readFirst(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

export function getUserEmail(user = {}) {
  return norm(readFirst(user, ['email', 'user_email', 'owner_email', 'created_by_email']));
}

export function getUserCompanyId(user = {}) {
  return String(readFirst(user, ['company_id', 'companyId', 'organization_id', 'organizationId', 'tenant_id', 'tenantId']) || user?.company?.id || user?.organization?.id || '').trim();
}

export function getEntityCompanyId(entity = {}) {
  return String(readFirst(entity, ['company_id', 'companyId', 'organization_id', 'organizationId', 'tenant_id', 'tenantId', 'owner_company_id', 'ownerCompanyId']) || entity?.company?.id || entity?.organization?.id || '').trim();
}

export function getEntityOwnerEmail(entity = {}) {
  return norm(readFirst(entity, ['owner_email', 'created_by', 'created_by_email', 'user_email', 'customer_email']));
}

export function normalizeAccessRole(user = {}) {
  const email = getUserEmail(user);
  if (SUPERADMIN_EMAILS.has(email)) return ACCESS_ROLES.SUPERADMIN;

  const rawRole = norm(readFirst(user, ['access_role', 'role', 'user_role', 'account_type', 'type']));
  if (['superadmin', 'super_admin', 'owner', 'app_owner', 'appensagare', 'appägare'].includes(rawRole)) return ACCESS_ROLES.SUPERADMIN;
  if (['company_admin', 'company-admin', 'company', 'admin', 'foretag', 'företag', 'company_owner'].includes(rawRole)) return ACCESS_ROLES.COMPANY_ADMIN;
  if (['employee', 'anstalld', 'anställd', 'user', 'member'].includes(rawRole)) return ACCESS_ROLES.EMPLOYEE;
  if (['wholesaler', 'grossist', 'guest', 'leverantor', 'leverantör', 'supplier'].includes(rawRole)) return ACCESS_ROLES.WHOLESALER;
  return ACCESS_ROLES.ANONYMOUS;
}

export function resolveAccessContext(user = {}) {
  const role = normalizeAccessRole(user);
  const email = getUserEmail(user);
  const companyId = getUserCompanyId(user);
  return {
    user,
    email,
    companyId,
    role,
    isSuperadmin: role === ACCESS_ROLES.SUPERADMIN,
    isCompanyAdmin: role === ACCESS_ROLES.COMPANY_ADMIN,
    isEmployee: role === ACCESS_ROLES.EMPLOYEE,
    isWholesaler: role === ACCESS_ROLES.WHOLESALER,
    isCompanyUser: role === ACCESS_ROLES.COMPANY_ADMIN || role === ACCESS_ROLES.EMPLOYEE,
  };
}

function sameCompany(access, entity = {}) {
  const entityCompanyId = getEntityCompanyId(entity);
  return Boolean(access.companyId && entityCompanyId && String(access.companyId) === String(entityCompanyId));
}

function ownsByEmail(access, entity = {}) {
  const ownerEmail = getEntityOwnerEmail(entity);
  return Boolean(access.email && ownerEmail && access.email === ownerEmail);
}

function listIncludesEmail(list, email) {
  if (!email) return false;
  if (Array.isArray(list)) return list.map(norm).includes(email);
  return norm(list) === email;
}

function wholesalerAllowed(access, entity = {}) {
  if (!access.isWholesaler) return false;
  if (listIncludesEmail(entity.wholesaler_emails || entity.allowed_wholesaler_emails || entity.guest_emails, access.email)) return true;
  if (entity.wholesaler_email && norm(entity.wholesaler_email) === access.email) return true;
  if (entity.grossist_email && norm(entity.grossist_email) === access.email) return true;
  return false;
}

export function canViewProject(user, project = {}) {
  const access = resolveAccessContext(user);
  if (access.isSuperadmin) return true;
  if (access.isCompanyUser) return sameCompany(access, project) || ownsByEmail(access, project);
  if (access.isWholesaler) return wholesalerAllowed(access, project);
  return false;
}

export function canEditProject(user, project = {}) {
  const access = resolveAccessContext(user);
  if (access.isSuperadmin) return true;
  if (access.isCompanyAdmin) return sameCompany(access, project) || ownsByEmail(access, project);
  if (access.isEmployee) return sameCompany(access, project) && project.employee_can_edit !== false;
  return false;
}

export function canManageCompanyUsers(user, company = {}) {
  const access = resolveAccessContext(user);
  if (access.isSuperadmin) return true;
  return access.isCompanyAdmin && sameCompany(access, company);
}

export function canViewProduct(user, product = {}, context = {}) {
  const access = resolveAccessContext(user);
  if (access.isSuperadmin) return true;
  if (access.isCompanyUser) {
    const productCompany = getEntityCompanyId(product);
    return !productCompany || sameCompany(access, product);
  }
  if (access.isWholesaler) return Boolean(context.wholesaleRequest || product.wholesale_visible || wholesalerAllowed(access, context.project || {}));
  return false;
}

export function canEditProduct(user, product = {}) {
  const access = resolveAccessContext(user);
  if (access.isSuperadmin) return true;
  if (access.isCompanyAdmin) {
    const productCompany = getEntityCompanyId(product);
    return Boolean(productCompany && sameCompany(access, product));
  }
  return false;
}

export function canViewProductPrice(user, product = {}, context = {}) {
  const access = resolveAccessContext(user);
  if (access.isSuperadmin) return true;
  if (access.isCompanyUser) {
    const productCompany = getEntityCompanyId(product);
    return !productCompany || sameCompany(access, product);
  }
  if (access.isWholesaler) return Boolean(context.wholesaleRequest || wholesalerAllowed(access, context.project || {}));
  return false;
}

const PRICE_FIELDS = ['price', 'cost_price', 'purchase_price', 'supplier_price', 'company_purchase_price', 'margin_percent', 'margin', 'purchasePrice', 'costPrice'];

export function sanitizeProductForUser(product = {}, user = {}, context = {}) {
  if (canViewProductPrice(user, product, context)) return product;
  const sanitized = { ...product };
  PRICE_FIELDS.forEach(field => {
    if (field in sanitized) sanitized[field] = undefined;
  });
  return sanitized;
}

export function filterProjectsForUser(projects = [], user = {}) {
  return (Array.isArray(projects) ? projects : []).filter(project => canViewProject(user, project));
}

export function filterProductsForUser(products = [], user = {}, context = {}) {
  return (Array.isArray(products) ? products : [])
    .filter(product => canViewProduct(user, product, context))
    .map(product => sanitizeProductForUser(product, user, context));
}

export function attachCompanyOwnership(data = {}, user = {}) {
  const access = resolveAccessContext(user);
  const patch = { ...(data || {}) };
  if (access.companyId && !patch.company_id) patch.company_id = access.companyId;
  if (access.email && !patch.owner_email) patch.owner_email = access.email;
  if (access.role && !patch.owner_role) patch.owner_role = access.role;
  return patch;
}
