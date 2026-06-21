import { getUserEmail, resolveAccessContext } from '@/lib/accessControl';

const normalizeEmail = value => String(value || '').trim().toLowerCase();

async function listMembershipsForEmail(base44, email) {
  if (!email) return [];
  try {
    if (base44?.entities?.CompanyMembership?.filter) {
      return await base44.entities.CompanyMembership.filter({ user_email: email }, '-created_date', 20, 0);
    }
  } catch {}
  try {
    const rows = await base44.entities.CompanyMembership.list('-created_date');
    return (rows || []).filter(item => normalizeEmail(item.user_email) === email);
  } catch {
    return [];
  }
}

async function getCompany(base44, companyId) {
  if (!companyId) return null;
  try {
    if (base44?.entities?.Company?.get) return await base44.entities.Company.get(companyId);
  } catch {}
  try {
    const rows = await base44.entities.Company.list('-created_date');
    return (rows || []).find(item => String(item.id) === String(companyId)) || null;
  } catch {
    return null;
  }
}

function mergeCompanyIntoUser(user, membership, company) {
  if (!membership || !company) return user;
  const access = resolveAccessContext(user || {});
  return {
    ...(user || {}),
    company_id: company.id,
    company_name: company.name || membership.company_name || '',
    company_logo_url: company.logo_url || '',
    company_organization_number: company.organization_number || '',
    company_email: company.email || '',
    company_phone: company.phone || '',
    company_address: company.address || '',
    company_postal_code: company.postal_code || '',
    company_city: company.city || '',
    company_membership_id: membership.id,
    company_membership_managed: true,
    access_role: access.isSuperadmin ? access.role : membership.access_role || 'employee',
  };
}

export async function resolveUserCompanyContext(base44, user = {}) {
  const email = getUserEmail(user);
  if (!email) return user;
  const memberships = await listMembershipsForEmail(base44, email);
  const membership = (memberships || []).find(item => item.active !== false) || null;

  if (!membership) {
    if (user.company_membership_managed && !resolveAccessContext(user).isSuperadmin) {
      const cleared = {
        ...user,
        company_id: '',
        company_name: '',
        company_logo_url: '',
        company_membership_id: '',
        company_membership_managed: false,
        access_role: 'anonymous',
      };
      try {
        await base44.auth.updateMe({
          company_id: '',
          company_name: '',
          company_logo_url: '',
          company_membership_id: '',
          company_membership_managed: false,
          access_role: 'anonymous',
        });
      } catch {}
      return cleared;
    }
    return user;
  }

  const company = await getCompany(base44, membership.company_id);
  if (!company || company.active === false) return user;
  const merged = mergeCompanyIntoUser(user, membership, company);

  const changed = String(user.company_id || '') !== String(company.id)
    || user.company_logo_url !== (company.logo_url || '')
    || user.company_name !== (company.name || '')
    || (!resolveAccessContext(user).isSuperadmin && user.access_role !== membership.access_role);

  if (changed) {
    try {
      await base44.auth.updateMe({
        company_id: company.id,
        company_name: company.name || '',
        company_logo_url: company.logo_url || '',
        company_membership_id: membership.id,
        company_membership_managed: true,
        access_role: resolveAccessContext(user).isSuperadmin ? resolveAccessContext(user).role : membership.access_role || 'employee',
      });
    } catch {}
  }

  return merged;
}

export async function resolveCompanyForRecord(base44, record = {}, user = {}) {
  const directId = record.company_id || record.companyId || user.company_id || user.companyId;
  if (directId) {
    const company = await getCompany(base44, directId);
    if (company) return company;
  }

  const ownerEmail = normalizeEmail(record.owner_email || record.created_by_email || user.email);
  if (ownerEmail) {
    const memberships = await listMembershipsForEmail(base44, ownerEmail);
    const membership = memberships.find(item => item.active !== false);
    if (membership) {
      const company = await getCompany(base44, membership.company_id);
      if (company) return company;
    }
  }

  if (user.company_name || user.company_logo_url) {
    return {
      id: user.company_id || '',
      name: user.company_name || '',
      logo_url: user.company_logo_url || '',
      organization_number: user.company_organization_number || '',
      email: user.company_email || '',
      phone: user.company_phone || '',
      address: user.company_address || '',
      postal_code: user.company_postal_code || '',
      city: user.company_city || '',
    };
  }
  return null;
}

export async function uploadCompanyLogo(base44, file) {
  if (!file) throw new Error('Välj en logotyp.');
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Logotypen måste vara PNG eller JPG.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Logotypen får vara högst 5 MB.');
  const result = await base44.integrations.Core.UploadFile({ file });
  if (!result?.file_url) throw new Error('Logotypen kunde inte laddas upp.');
  return result.file_url;
}
