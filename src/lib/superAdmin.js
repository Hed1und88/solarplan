const SUPER_ADMIN_EMAILS = new Set([
  'lyntrasolutions@gmail.com',
  'hedlund1212@gmail.com',
]);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const isSuperAdminEmail = (email) => SUPER_ADMIN_EMAILS.has(normalizeEmail(email));

export const withSuperAdminClaims = (user = {}) => {
  if (!isSuperAdminEmail(user.email)) return user;

  return {
    ...user,
    role: 'super_admin',
    app_role: 'super_admin',
    access_role: 'super_admin',
    is_super_admin: true,
    permissions: {
      ...(user.permissions || {}),
      super_admin: true,
      manage_companies: true,
      manage_company_users: true,
      manage_users: true,
      manage_projects: true,
      manage_products: true,
      manage_settings: true,
    },
  };
};

export const ensureSuperAdminClaims = async (base44, user = {}) => {
  if (!isSuperAdminEmail(user.email)) return user;

  const patchedUser = withSuperAdminClaims(user);
  const needsUpdate =
    user.role !== 'super_admin' ||
    user.app_role !== 'super_admin' ||
    user.access_role !== 'super_admin' ||
    user.is_super_admin !== true ||
    user.permissions?.super_admin !== true ||
    user.permissions?.manage_companies !== true ||
    user.permissions?.manage_company_users !== true;

  if (!needsUpdate) return patchedUser;

  try {
    await base44.auth.updateMe({
      role: 'super_admin',
      app_role: 'super_admin',
      access_role: 'super_admin',
      is_super_admin: true,
      permissions: patchedUser.permissions,
    });
  } catch (error) {
    console.warn('Could not persist super admin claims:', error);
  }

  return patchedUser;
};
