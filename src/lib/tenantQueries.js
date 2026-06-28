import { base44 } from '@/api/base44Client';
import {
  attachCompanyOwnership,
  canEditProduct,
  canViewProject,
  filterProductsForUser,
  filterProjectsForUser,
  isSuperAdmin,
} from '@/lib/accessControl';
import { getCompanyContext } from '@/lib/companyContext';

const MAX_QUERY_LIMIT = 5000;

function cleanQuery(query = {}) {
  return Object.fromEntries(Object.entries(query || {}).filter(([, value]) => value !== undefined));
}

function hasQuery(query = {}) {
  return Object.keys(cleanQuery(query)).length > 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
  return descending
    ? String(right).localeCompare(String(left), 'sv')
    : String(left).localeCompare(String(right), 'sv');
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

function branchLimit(limit, skip = 0) {
  if (limit == null) return undefined;
  return Math.min(MAX_QUERY_LIMIT, (Number(limit) || 0) + (Number(skip) || 0));
}

function requireCompanyId(context) {
  if (context.isSuperAdmin) return;
  if (!context.companyId) {
    throw new Error('Din användare saknar företagskoppling. Be en administratör lägga till CompanyMembership.');
  }
}

export async function listTenantProjects(sort = '-created_date', limit, skip, fields) {
  const context = await getCompanyContext();
  if (context.isSuperAdmin) {
    return base44.entities.Project.list(sort, limit, skip, fields);
  }
  if (!context.companyId) return [];
  const rows = await base44.entities.Project.filter({ company_id: context.companyId }, sort, limit, skip, fields);
  return filterProjectsForUser(rows, context);
}

export async function fetchTenantProjectById(projectId) {
  if (!projectId) return null;
  const context = await getCompanyContext();

  if (base44.entities?.Project?.get) {
    try {
      const project = await base44.entities.Project.get(projectId);
      if (project?.id && canViewProject(project, context)) return project;
      return null;
    } catch {}
  }

  const rows = await listTenantProjects('-updated_date');
  return rows.find(project => project.id === projectId) || null;
}

export async function createTenantProject(data = {}) {
  const context = await getCompanyContext();
  requireCompanyId(context);
  return base44.entities.Project.create(attachCompanyOwnership(data, context));
}

export async function listVisibleProducts(sort = '-created_date', limit, skip, fields) {
  return filterVisibleProducts({}, sort, limit, skip, fields);
}

export async function filterVisibleProducts(query = {}, sort = '-created_date', limit, skip, fields) {
  const context = await getCompanyContext();
  const scopedQuery = cleanQuery(query);

  if (isSuperAdmin(context)) {
    return hasQuery(scopedQuery)
      ? base44.entities.Product.filter(scopedQuery, sort, limit, skip, fields)
      : base44.entities.Product.list(sort, limit, skip, fields);
  }

  if (!context.companyId) return [];

  const fetchLimit = branchLimit(limit, skip);
  const [standardProducts, companyProducts] = await Promise.all([
    base44.entities.Product.filter({ ...scopedQuery, is_standard: true }, sort, fetchLimit, 0, fields),
    base44.entities.Product.filter({ ...scopedQuery, company_id: context.companyId }, sort, fetchLimit, 0, fields),
  ]);

  const rows = sortRows(uniqueById([...asArray(standardProducts), ...asArray(companyProducts)]), sort);
  return applyPage(filterProductsForUser(rows, context), limit, skip);
}

export async function createTenantProduct(data = {}) {
  const context = await getCompanyContext();
  requireCompanyId(context);
  if (!context.isSuperAdmin && !context.isCompanyAdmin) {
    throw new Error('Endast företagsadmin kan skapa egna produkter.');
  }
  const payload = context.isSuperAdmin
    ? { company_id: '', is_standard: true, ...data }
    : { ...data, company_id: context.companyId, is_standard: false };
  return base44.entities.Product.create(payload);
}

export async function createStandardProduct(data = {}) {
  const context = await getCompanyContext();
  if (!context.isSuperAdmin) {
    throw new Error('Endast superadmin kan skapa standardprodukter.');
  }
  return base44.entities.Product.create({ ...data, company_id: '', is_standard: true });
}

export async function updateTenantProduct(productOrId, data = {}) {
  const context = await getCompanyContext();
  const product = typeof productOrId === 'string' ? await base44.entities.Product.get(productOrId) : productOrId;
  if (!product?.id || !canEditProduct(product, context)) {
    throw new Error('Du saknar behörighet att ändra den här produkten.');
  }
  const payload = context.isSuperAdmin
    ? data
    : { ...data, company_id: context.companyId, is_standard: false };
  return base44.entities.Product.update(product.id, payload);
}

export async function deleteTenantProduct(productOrId) {
  const context = await getCompanyContext();
  const product = typeof productOrId === 'string' ? await base44.entities.Product.get(productOrId) : productOrId;
  if (!product?.id || !canEditProduct(product, context)) {
    throw new Error('Du saknar behörighet att ta bort den här produkten.');
  }
  return base44.entities.Product.delete(product.id);
}
