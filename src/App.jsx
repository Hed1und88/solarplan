import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { CompanySessionProvider } from '@/lib/CompanySessionContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetailMapWrapper.jsx';
import CalendarPage from '@/pages/Calendar';
import SalesPipeline from '@/pages/Leads';
import Products from '@/pages/Products';
import Settings from '@/pages/SettingsRestoreWrapper.jsx';
import SolarShadowAnalysis from '@/pages/SolarShadowAnalysis';
import PanelMapViewportController from '@/components/project/PanelMapViewportController.jsx';
import CompactProjectInspector from '@/components/project/CompactProjectInspector.jsx';
import '@/styles/solarWorkbenchLight.css';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <div className="fixed inset-0 flex items-center justify-center bg-background"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div></div>;
  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }
  return <CompanySessionProvider><Routes>
    <Route element={<Layout />}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/projects/:id" element={<ProjectDetail />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/leads" element={<SalesPipeline />} />
      <Route path="/solar-shadow" element={<SolarShadowAnalysis />} />
      <Route path="/solanalys" element={<SolarShadowAnalysis />} />
      <Route path="/3d-solanalys" element={<SolarShadowAnalysis />} />
      <Route path="/solarplan-3d-projektering" element={<SolarShadowAnalysis />} />
      <Route path="/products" element={<Products />} />
      <Route path="/settings" element={<Settings />} />
    </Route>
    <Route path="*" element={<PageNotFound />} />
  </Routes></CompanySessionProvider>;
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <PanelMapViewportController />
          <CompactProjectInspector />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
