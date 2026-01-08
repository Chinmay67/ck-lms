import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import StudentsList from './components/StudentsList.new';
import FeesOverviewDashboard from './components/fees/FeesOverviewDashboard';
import CourseConfigurationPanel from './components/courses/CourseConfigurationPanel';
import { Login } from './components/Login';
import LoadingSpinner from './components/ui/LoadingSpinner';
import './App.css';

type TabType = 'students' | 'fees' | 'courses';

function AppContent() {
  const { isAuthenticated, loading, login, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('students');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={login} />;
  }

  const isSuperAdmin = user?.role === 'superadmin';

  return (
    <Layout>
      {/* Navigation Tabs */}
      <div className="mb-6">
        <div className="flex space-x-1 bg-surface rounded-xl shadow-navy p-1.5 border border-primary-100">
          <button
            onClick={() => setActiveTab('students')}
            className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-200 ${
              activeTab === 'students'
                ? 'bg-gradient-primary text-white shadow-glow'
                : 'text-text-secondary hover:bg-primary-50 hover:text-primary-600'
            }`}
          >
            Students
          </button>
          <button
            onClick={() => setActiveTab('fees')}
            className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-200 ${
              activeTab === 'fees'
                ? 'bg-gradient-primary text-white shadow-glow'
                : 'text-text-secondary hover:bg-primary-50 hover:text-primary-600'
            }`}
          >
            Fees Overview
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('courses')}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-200 ${
                activeTab === 'courses'
                  ? 'bg-gradient-primary text-white shadow-glow'
                  : 'text-text-secondary hover:bg-primary-50 hover:text-primary-600'
              }`}
            >
              Course Configuration
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'students' && <StudentsList />}
        {activeTab === 'fees' && <FeesOverviewDashboard />}
        {activeTab === 'courses' && isSuperAdmin && <CourseConfigurationPanel />}
      </div>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e3a8a',
            color: '#fff',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 10px 25px -5px rgba(30, 58, 138, 0.3)',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
            style: {
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
            style: {
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            },
          },
        }}
      />
      <AppContent />
    </AuthProvider>
  );
}

export default App;
