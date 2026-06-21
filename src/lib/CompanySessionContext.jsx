import { createContext, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { resolveUserCompanyContext } from '@/lib/companyContext';

const CompanySessionContext = createContext(null);

export function CompanySessionProvider({ children }) {
  const { user } = useAuth();
  const [resolvedUser, setResolvedUser] = useState(user || null);
  const [loadingCompany, setLoadingCompany] = useState(Boolean(user));

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      if (!user) {
        if (active) {
          setResolvedUser(null);
          setLoadingCompany(false);
        }
        return;
      }
      setLoadingCompany(true);
      try {
        const nextUser = await resolveUserCompanyContext(base44, user);
        if (active) setResolvedUser(nextUser);
      } catch {
        if (active) setResolvedUser(user);
      } finally {
        if (active) setLoadingCompany(false);
      }
    };
    resolve();
    return () => { active = false; };
  }, [user]);

  if (loadingCompany) {
    return <div className="fixed inset-0 flex items-center justify-center bg-background"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" /></div>;
  }

  return <CompanySessionContext.Provider value={{ user: resolvedUser, refreshCompany: () => resolveUserCompanyContext(base44, resolvedUser || user || {}) }}>{children}</CompanySessionContext.Provider>;
}

export function useCompanySession() {
  const context = useContext(CompanySessionContext);
  if (!context) throw new Error('useCompanySession must be used within CompanySessionProvider');
  return context;
}
