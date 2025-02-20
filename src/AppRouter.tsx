import React, { Suspense, memo, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { LoadingSpinner } from './components/LoadingSpinner';
import Sidebar from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTheme } from './hooks/useTheme';

// Lazy load pages with descriptive chunk names
const Dashboard = React.lazy(() => 
  import('./pages/Dashboard' /* webpackChunkName: "dashboard" */)
);
const TokenSearch = React.lazy(() => 
  import('./pages/TokenSearch' /* webpackChunkName: "token-search" */)
);
const Alerts = React.lazy(() => 
  import('./pages/Alerts' /* webpackChunkName: "alerts" */)
);
const ScamDetector = React.lazy(() => 
  import('./pages/ScamDetector' /* webpackChunkName: "scam-detector" */)
);
const AIAnalysis = React.lazy(() => 
  import('./pages/AIAnalysis' /* webpackChunkName: "ai-analysis" */)
);

// Enhanced loading fallback component
const PageLoadingFallback = memo(() => (
  <div className="w-full h-[calc(100vh-4rem)] flex items-center justify-center">
    <LoadingSpinner />
  </div>
));
PageLoadingFallback.displayName = 'PageLoadingFallback';

// Enhanced error fallback component
const PageErrorFallback = memo(({ error }: { error: Error }) => (
  <div className="w-full min-h-[400px] flex items-center justify-center">
    <div className="text-center p-8 max-w-md">
      <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-4">
        Error Loading Page
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        {error.message || 'An unexpected error occurred while loading this page.'}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
      >
        Retry
      </button>
    </div>
  </div>
));
PageErrorFallback.displayName = 'PageErrorFallback';

// Main router component
export const AppRouter = memo(() => {
  const location = useLocation();
  const { theme } = useTheme();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className={`flex min-h-screen bg-gray-50 dark:bg-gray-900 ${
      theme === 'dark' ? 'dark' : ''
    }`}>
      <Sidebar className="sticky top-0 h-screen" />
      <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
        <ErrorBoundary>
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/token-search" element={<TokenSearch />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/scam-detector" element={<ScamDetector />} />
              <Route path="/ai-analysis" element={<AIAnalysis />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
});
AppRouter.displayName = 'AppRouter';