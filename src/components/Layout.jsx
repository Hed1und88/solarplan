import { Link, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, Package, Menu } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/projects', icon: FolderOpen, label: 'Projekt' },
  { path: '/products', icon: Package, label: 'Produkter' },
];

export default function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col transition-transform duration-300
        lg:relative lg:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center px-4 py-3 border-b border-sidebar-border">
          <img
            src="https://media.base44.com/images/public/69d685f7c2da2257faa73124/82fc4e45e_Screenshot_20260408_224436_com_android_chrome_ChromeTabbedActivity.jpg"
            alt="NEPAB Logo"
            className="h-14 w-auto object-contain"
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${active
                    ? 'bg-primary text-white shadow-md shadow-primary/30'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white'
                  }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-sidebar-border">
          <p className="text-sidebar-foreground/40 text-xs">v1.0 · SolarPlan Pro</p>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-muted">
            <Menu className="w-5 h-5" />
          </button>
          <img
            src="https://media.base44.com/images/public/69d685f7c2da2257faa73124/82fc4e45e_Screenshot_20260408_224436_com_android_chrome_ChromeTabbedActivity.jpg"
            alt="NEPAB Logo"
            className="h-8 w-auto object-contain"
          />
          <div className="w-9" />
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}