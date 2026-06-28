import { base44 } from '@/api/base44Client';
import {
  attachCompanyOwnership,
  canEditProduct,
  filterProductsForUser,
  resolveAccessContext,
} from '@/lib/accessControl';
import { resolveUserCompanyContext } from '@/lib/companyContext';
import { filterWorkspaceRecords } from '@/lib/workspaceAccess';

const MAX_QUERY_LIMIT = 5000;

function cleanQuery(query = {}) {
  return Object.fromEntries(Object.entries(query || {}).filter(([, value]) => value !== undefined));
}

function hasQuery(query = {}) {
  return Object.keys(cleanQuery(query)).length > 0;
}

function branchLimit(limit, skip = 0) {
  if (limit == null) return undefined;
  return Math.min(MAX_QUERY_LIMIT, (Number(limit) || 0) + (Number(skip) || 0));
}

function uniqueById(rows = []) {
  const seen = new Set();
  return rows.filter(row => {
    const key = row?.id || JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareValues(a, b, descending) {
  const leftDate = typeof a === 'string' ? Date.parse(a) : NaN;
  const rightDate = typeof b === 'string' ? Date.parse(b) : NaN;
  const left = Number.isFinite(leftDate) && Number.isFinite(rightDate) ? leftDate : a;
  const right = Number.isFinite(leftDate) && Number.isFinite(rightDate) ? rightDate : b;
  if (left == null && right == null) return 0;
  if (left == null) return descending ? 1 : -1;
  if (right == null) return descending ? -1 : 1;
  if (typeof left === 'number' && typeof right === 'number') return descending ? right - left : left - right;
  return descending ? String(right).localeCompare(String(left), 'sv') : String(left).localeCompare(String(right), 'sv');
}

function sortRows(rows = [], sort) {
  if (!sort) return rows;
  const descending = String(sort).startsWith('-');
  const field = String(sort).replace(/^[+-]/, '');
  return [...rows].sort((a, b) => compareValues(a?.[field], b?.[field], descending));
}

function applyPage(rows = [], limit, skip = 0) {
  const offset = Number(skip) || 0;
  if (limit == null) return offset > 0 ? rows.slice(offset) : rows;
  return rows.slice(offset, offset + Number(limit));
}

export async function getTenantUser() {
  const user = await base44.auth.me();
  return resolveUserCompanyContext(base44, user || {});
}

function requireCompanyId(user) {
  const access = resolveAccessContext(user || {});
  if (access.isSuperadmin) return access;
  if (!access.companyId) {
    throw new Error('Din användare saknar företagskoppling. Be en administratör lägga till CompanyMembership.');
  }
  return access;
}

export async function listTenantProjects(sort = '-created_date', limit, skip, fields) {
  const user = await getTenantUser();
  const access = resolveAccessContext(user || {});
  if (access.isSuperadmin) return base44.entities.Project.list(sort, limit, skip, fields);
  if (!access.companyId) return [];
  const rows = await base44.entities.Project.filter({ company_id: access.companyId }, sort, limit, skip, fields);
  return filterWorkspaceRecords(rows || [], user || {});
}

export async function listTenantEntity(entityName, sort = '-created_date', limit, skip, fields) {
  const user = await getTenantUser();
  const access = resolveAccessContext(user || {});
  const entity = base44.entities?.[entityName];
  if (!entity) return [];
  if (access.isSuperadmin) return entity.list(sort, limit, skip, fields);
  if (!access.companyId) return [];
  const rows = await entity.filter({ company_id: access.companyId }, sort, limit, skip, fields);
  return filterWorkspaceRecords(rows || [], user || {});
}

export async function createTenantProject(data = {}) {
  const user = await getTenantUser();
  requireCompanyId(user);
  return base44.entities.Project.create(attachCompanyOwnership(data, user || {}));
}

export async function listVisibleProducts(sort = '-created_date', limit, skip, fields) {
  return filterVisibleProducts({}, sort, limit, skip, fields);
}

export async function filterVisibleProducts(query = {}, sort = '-created_date', limit, skip, fields) {
  const user = await getTenantUser();
  const access = resolveAccessContext(user || {});
  const scopedQuery = cleanQuery(query);

  if (access.isSuperadmin) {
    return hasQuery(scopedQuery)
      ? base44.entities.Product.filter(scopedQuery, sort, limit, skip, fields)
      : base44.entities.Product.list(sort, limit, skip, fields);
  }

  if (!access.companyId) return [];

  const fetchLimit = branchLimit(limit, skip);
  const [standardProducts, companyProducts] = await Promise.all([
    base44.entities.Product.filter({ ...scopedQuery, is_standard: true }, sort, fetchLimit, 0, fields),
    base44.entities.Product.filter({ ...scopedQuery, company_id: access.companyId }, sort, fetchLimit, 0, fields),
  ]);

  const rows = sortRows(uniqueById([...(standardProducts || []), ...(companyProducts || [])]), sort);
  return applyPage(filterProductsForUser(rows, user || {}), limit, skip);
}

export async function createTenantProduct(data = {}) {
  const user = await getTenantUser();
  const access = requireCompanyId(user);
  if (!access.isSuperadmin && !access.isCompanyAdmin) throw new Error('Endast företagsadmin kan skapa egna produkter.');
  const payload = access.isSuperadmin
    ? { company_id: '', is_standard: true, ...data }
    : { ...data, company_id: access.companyId, is_standard: false };
  return base44.entities.Product.create(payload);
}

export async function createStandardProduct(data = {}) {
  const user = await getTenantUser();
  const access = resolveAccessContext(user || {});
  if (!access.isSuperadmin) throw new Error('Endast superadmin kan skapa standardprodukter.');
  return base44.entities.Product.create({ ...data, company_id: '', is_standard: true });
}

export async function updateTenantProduct(product = {}, data = {}) {
  const user = await getTenantUser();
  if (!product?.id || !canEditProduct(user || {}, product)) throw new Error('Du saknar behörighet att ändra den här produkten.');
  const access = resolveAccessContext(user || {});
  const payload = access.isSuperadmin ? data : { ...data, company_id: access.companyId, is_standard: false };
  return base44.entities.Product.update(product.id, payload);
}

export async function deleteTenantProduct(product = {}) {
  const user = await getTenantUser();
  if (!product?.id || !canEditProduct(user || {}, product)) throw new Error('Du saknar behörighet att ta bort den här produkten.');
  return base44.entities.Product.delete(product.id);
}
