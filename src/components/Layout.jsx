import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, Package, Settings, ChevronLeft, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ROOT_ROUTES = ['/', '/projects', '/products', '/settings', '/solar-shadow', '/solarplan-3d-projektering'];

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/projects', icon: FolderOpen, label: 'Projekt' },
  { path: '/solarplan-3d-projektering', icon: Sun, label: '3D Projektering' },
  { path: '/products', icon: Package, label: 'Produkter' },
  { path: '/settings', icon: Settings, label: 'Inställningar' },
];

function isRootRoute(pathname) { return ROOT_ROUTES.includes(pathname); }

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const onRoot = isRootRoute(location.pathname);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex-col">
        <div className="flex items-center px-4 py-3 border-b border-sidebar-border">
          <img src="https://media.base44.com/images/public/69d685f7c2da2257faa73124/82fc4e45e_Screenshot_20260408_224436_com_android_chrome_ChromeTabbedActivity.jpg" alt="NEPAB Logo" className="h-14 w-auto object-contain" />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
            return <Link key={path} to={path} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active ? 'bg-primary text-white shadow-md shadow-primary/30' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'}`}><Icon className="w-4 h-4 flex-shrink-0" />{label}</Link>;
          })}
        </nav>
        <div className="px-6 py-4 border-t border-sidebar-border"><p className="text-sidebar-foreground/40 text-xs">v1.0 · SolarPlan Pro</p></div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:ml-64">
        <header className="lg:hidden flex items-center justify-between bg-card border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))', paddingBottom: '10px', minHeight: 56 }}>
          {!onRoot ? <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-primary font-medium text-sm p-1.5 rounded-lg active:bg-muted"><ChevronLeft className="w-5 h-5" /> Tillbaka</button> : <div className="w-20" />}
          <img src="https://media.base44.com/images/public/69d685f7c2da2257faa73124/82fc4e45e_Screenshot_20260408_224436_com_android_chrome_ChromeTabbedActivity.jpg" alt="NEPAB Logo" className="h-8 w-auto object-contain" />
          <div className="w-20" />
        </header>
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} transition={{ duration: 0.18, ease: 'easeInOut' }} className="h-full"><Outlet /></motion.div>
          </AnimatePresence>
        </main>
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path || (path !== '/' && path !== '/settings' && location.pathname.startsWith(path));
            return <Link key={path} to={path} className={`flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}><Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : ''}`} /><span className="text-[10px] font-medium">{label}</span></Link>;
          })}
        </nav>
      </div>
    </div>
  );
}
