export const SUPER_ADMIN_EMAILS = new Set([
  'lyntrasolutions@gmail.com',
  'hedlund1212@gmail.com',
]);

const PRICE_FIELDS = [
  'price',
  'cost_price',
  'purchase_price',
  'supplier_price',
  'company_purchase_price',
  'margin_percent',
  'margin',
];

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function normalizeId(value) {
  return String(value || '').trim();
}

export function userEmail(userOrContext = {}) {
  return normalizeEmail(
    userOrContext.email ||
    userOrContext.user?.email ||
    userOrContext.data?.email ||
    userOrContext.user?.data?.email
  );
}

export function userCompanyId(userOrContext = {}) {
  return normalizeId(
    userOrContext.companyId ||
    userOrContext.company_id ||
    userOrContext.membership?.company_id ||
    userOrContext.user?.company_id ||
    userOrContext.user?.companyId ||
    userOrContext.user?.data?.company_id ||
    userOrContext.data?.company_id
  );
}

export function userCompanyRole(userOrContext = {}) {
  return String(
    userOrContext.role ||
    userOrContext.membership?.role ||
    userOrContext.user?.company_role ||
    userOrContext.user?.role ||
    userOrContext.user?.data?.company_role ||
    userOrContext.data?.company_role ||
    ''
  ).trim();
}

export function isSuperAdminEmail(email) {
  return SUPER_ADMIN_EMAILS.has(normalizeEmail(email));
}

export function isSuperAdmin(userOrContext = {}) {
  return Boolean(userOrContext.isSuperAdmin) || isSuperAdminEmail(userEmail(userOrContext));
}

export function isCompanyAdmin(userOrContext = {}) {
  if (isSuperAdmin(userOrContext)) return true;
  const role = userCompanyRole(userOrContext).toLowerCase();
  return ['admin', 'owner', 'company-admin', 'company_admin', 'company admin'].includes(role);
}

export function isSameCompany(record = {}, userOrContext = {}) {
  if (isSuperAdmin(userOrContext)) return true;
  const recordCompanyId = normalizeId(record.company_id || record.companyId);
  const currentCompanyId = userCompanyId(userOrContext);
  return Boolean(recordCompanyId && currentCompanyId && recordCompanyId === currentCompanyId);
}

export function attachCompanyOwnership(data = {}, userOrContext = {}) {
  if (isSuperAdmin(userOrContext)) return { ...(data || {}) };
  const companyId = userCompanyId(userOrContext);
  return companyId ? { ...(data || {}), company_id: companyId } : { ...(data || {}) };
}

export function canViewProject(project = {}, userOrContext = {}) {
  return isSuperAdmin(userOrContext) || isSameCompany(project, userOrContext);
}

export function filterProjectsForUser(projects = [], userOrContext = {}) {
  const rows = Array.isArray(projects) ? projects : [];
  return isSuperAdmin(userOrContext) ? rows : rows.filter(project => canViewProject(project, userOrContext));
}

export function isStandardProduct(product = {}) {
  if (product.is_standard === true) return true;
  if (product.is_standard === false) return false;
  return !normalizeId(product.company_id || product.companyId);
}

export function canViewProduct(product = {}, userOrContext = {}) {
  if (isSuperAdmin(userOrContext)) return true;
  if (isStandardProduct(product)) return true;
  return isSameCompany(product, userOrContext);
}

export function canViewProductPrice(product = {}, userOrContext = {}) {
  if (isSuperAdmin(userOrContext)) return true;
  if (isStandardProduct(product)) return canViewProduct(product, userOrContext);
  return isSameCompany(product, userOrContext);
}

export function canEditProduct(product = {}, userOrContext = {}) {
  if (isSuperAdmin(userOrContext)) return true;
  return isCompanyAdmin(userOrContext) && !isStandardProduct(product) && isSameCompany(product, userOrContext);
}

export function sanitizeProductForUser(product = {}, userOrContext = {}) {
  if (canViewProductPrice(product, userOrContext)) return product;
  const sanitized = { ...(product || {}) };
  PRICE_FIELDS.forEach(field => {
    if (field in sanitized) delete sanitized[field];
  });
  return sanitized;
}

export function filterProductsForUser(products = [], userOrContext = {}) {
  const rows = Array.isArray(products) ? products : [];
  return rows
    .filter(product => canViewProduct(product, userOrContext))
    .map(product => sanitizeProductForUser(product, userOrContext));
}
