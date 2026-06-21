import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, CalendarDays, UsersRound, Package, Settings, ChevronLeft, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompanySession } from '@/lib/CompanySessionContext';

const ROOT_ROUTES = ['/', '/projects', '/calendar', '/leads', '/products', '/settings', '/solar-shadow', '/solarplan-3d-projektering'];

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/projects', icon: FolderOpen, label: 'Projekt' },
  { path: '/calendar', icon: CalendarDays, label: 'Kalender' },
  { path: '/leads', icon: UsersRound, label: 'Leads' },
  { path: '/solarplan-3d-projektering', icon: Sun, label: '3D Projektering' },
  { path: '/products', icon: Package, label: 'Produkter' },
  { path: '/settings', icon: Settings, label: 'Inställningar' },
];

function isRootRoute(pathname) { return ROOT_ROUTES.includes(pathname); }

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useCompanySession();
  const onRoot = isRootRoute(location.pathname);
  const companyLogo = user?.company_logo_url || '';
  const companyName = user?.company_name || 'Lyntra Solutions AB';
  const logoSrc = companyLogo || '/lyntra-solutions-mark.png';

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex-col">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border bg-slate-950/40">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 p-1 ring-1 ring-sky-400/25">
            <img src={logoSrc} alt={`${companyName} logotyp`} className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 leading-tight">
            {companyLogo ? <>
              <div className="truncate text-[15px] font-black tracking-[0.02em] text-white">{companyName}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-300">SolarPlan</div>
            </> : <>
              <div className="text-[21px] font-black uppercase tracking-[0.08em] text-white">Lyntra</div>
              <div className="text-[14px] font-black uppercase tracking-[0.12em] text-sky-300">Solutions AB</div>
            </>}
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
            return <Link key={path} to={path} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active ? 'bg-primary text-white shadow-md shadow-primary/30' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'}`}><Icon className="w-4 h-4 flex-shrink-0" />{label}</Link>;
          })}
        </nav>
        <div className="px-6 py-4 border-t border-sidebar-border"><p className="truncate text-sidebar-foreground/40 text-xs">{companyLogo ? companyName : 'v1.0 · SolarPlan Pro'}</p></div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:ml-64">
        <header className="lg:hidden flex items-center justify-between bg-card border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))', paddingBottom: '10px', minHeight: 56 }}>
          {!onRoot ? <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-primary font-medium text-sm p-1.5 rounded-lg active:bg-muted"><ChevronLeft className="w-5 h-5" /> Tillbaka</button> : <div className="w-20" />}
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5"><img src={logoSrc} alt={`${companyName} logotyp`} className="h-full w-full object-contain" /></div>
            <div className="min-w-0 leading-none">
              <div className="max-w-36 truncate text-[13px] font-black tracking-[0.02em] text-slate-950">{companyName}</div>
              <div className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-sky-700">SolarPlan</div>
            </div>
          </div>
          <div className="w-20" />
        </header>
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} transition={{ duration: 0.18, ease: 'easeInOut' }} className="h-full"><Outlet /></motion.div>
          </AnimatePresence>
        </main>
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border overflow-x-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
          <div className="flex min-w-max">
            {navItems.map(({ path, icon: Icon, label }) => {
              const active = location.pathname === path || (path !== '/' && path !== '/settings' && location.pathname.startsWith(path));
              return <Link key={path} to={path} className={`flex w-[78px] flex-none flex-col items-center justify-center pt-2 pb-1 gap-0.5 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}><Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : ''}`} /><span className="max-w-[74px] truncate text-[10px] font-medium">{label}</span></Link>;
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
