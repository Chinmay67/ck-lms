import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/layout/Layout';
import Sidebar, { type TabType } from './components/layout/Sidebar';
import StudentsList from './components/StudentsList.new';
import StudentProfilePage from './components/students/StudentProfilePage';
import FeesOverviewDashboard from './components/fees/FeesOverviewDashboard';
import CourseConfigurationPanel from './components/courses/CourseConfigurationPanel';
import BatchManagementPanel from './components/batches/BatchManagementPanel';
import LeadsList from './components/leads/LeadsList';
import { Login } from './components/Login';
import LoadingSpinner from './components/ui/LoadingSpinner';
import './App.css';

const ROUTE_TO_TAB: Record<string, TabType> = {
  '/students': 'students',
  '/fees': 'fees',
  '/leads': 'leads',
  '/courses': 'courses',
  '/batches': 'batches',
};

const PAGE_TITLES: Record<TabType, string> = {
  students: 'Students',
  fees: 'Fees Overview',
  leads: 'Leads',
  courses: 'Course Stages',
  batches: 'Batches',
};

function AppContent() {
  const { isAuthenticated, loading, login, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-text-secondary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={login} />;
  }

  const isSuperAdmin = user?.role === 'superadmin';
  const activeTab = ROUTE_TO_TAB[location.pathname] ?? 'students';
  const pageTitle = location.pathname.startsWith('/students/')
    ? 'Student Profile'
    : PAGE_TITLES[activeTab];

  const handleTabChange = (tab: TabType) => {
    navigate(`/${tab}`);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isSuperAdmin={isSuperAdmin}
      />
      <Layout pageTitle={pageTitle}>
        <div className="animate-fade-in">
          <Routes>
            <Route path="/students" element={<StudentsList />} />
            <Route path="/students/:id" element={<StudentProfilePage />} />
            <Route path="/fees" element={<FeesOverviewDashboard />} />
            <Route path="/leads" element={<LeadsList />} />
            {isSuperAdmin && <Route path="/courses" element={<CourseConfigurationPanel />} />}
            {isSuperAdmin && <Route path="/batches" element={<BatchManagementPanel />} />}
            <Route path="*" element={<Navigate to="/students" replace />} />
          </Routes>
        </div>
      </Layout>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1a1e28',
              color: '#f0f2f7',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '13px',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            },
            success: {
              duration: 3000,
              iconTheme: { primary: '#059669', secondary: '#f0f2f7' },
              style: { background: '#0d2318', borderColor: 'rgba(5,150,105,0.25)' },
            },
            error: {
              duration: 4000,
              iconTheme: { primary: '#dc2626', secondary: '#f0f2f7' },
              style: { background: '#200d0d', borderColor: 'rgba(220,38,38,0.25)' },
            },
          }}
        />
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
