import React, { Suspense, memo, useEffect, useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { LoadingSpinner } from './components/LoadingSpinner';
import Sidebar from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';

// Lazy load pages
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const TokenSearch = React.lazy(() => import('./pages/TokenSearch'));
const Alerts = React.lazy(() => import('./pages/Alerts'));
const ScamDetector = React.lazy(() => import('./pages/ScamDetector'));
const AIAnalysis = React.lazy(() => import('./pages/AIAnalysis'));
const Login = React.lazy(() => import('./pages/Login'));

// Loading Fallback Component
const PageLoadingFallback = memo(() => (
  <div className="w-full h-[calc(100vh-4rem)] flex items-center justify-center">
    <LoadingSpinner />
  </div>
));
PageLoadingFallback.displayName = 'PageLoadingFallback';

// Error Fallback Component
const PageErrorFallback = memo(({ error }: { error: Error }) => (
  <div className="w-full min-h-[400px] flex items-center justify-center">
    <div className="text-center p-8 max-w-md">
      <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-4">
        حدث خطأ أثناء تحميل الصفحة
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        {error.message || 'حدث خطأ غير متوقع أثناء تحميل هذه الصفحة.'}
      </p>
      <button
        onClick={() => window.location.assign('/')}
        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
      >
        العودة إلى الصفحة الرئيسية
      </button>
    </div>
  </div>
));
PageErrorFallback.displayName = 'PageErrorFallback';

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

export const AppRouter = memo(() => {
  const location = useLocation();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return <PageLoadingFallback />;
  }

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="flex">
        <Sidebar className="w-64 min-h-screen" />
        <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
          <ErrorBoundary>
            <Suspense fallback={<PageLoadingFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/token-search" element={<TokenSearch />} />
                <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
                <Route path="/scam-detector" element={<ProtectedRoute><ScamDetector /></ProtectedRoute>} />
                <Route path="/ai-analysis" element={<ProtectedRoute><AIAnalysis /></ProtectedRoute>} />
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
});
AppRouter.displayName = 'AppRouter';
