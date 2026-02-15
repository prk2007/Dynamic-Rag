import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { VerificationPendingPage } from './pages/auth/VerificationPendingPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ProfilePage } from './pages/dashboard/ProfilePage';
import { ApiKeysPage } from './pages/dashboard/ApiKeysPage';
import { DocumentsPage } from './pages/dashboard/DocumentsPage';
import { UploadPage } from './pages/dashboard/UploadPage';
import { useAuthStore } from './store/authStore';
import { ROUTES } from './utils/constants';

function App() {
  const { initialize } = useAuthStore();

  // Initialize auth state on app mount
  useEffect(() => {
    console.log('App mounted, initializing auth state...');
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 6000,
          style: {
            background: '#fff',
            color: '#363636',
            padding: '16px',
            fontSize: '15px',
            fontWeight: '500',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            borderRadius: '8px',
            minWidth: '300px',
          },
          success: {
            duration: 5000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 7000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      <Routes>
        {/* Public routes */}
        <Route path={ROUTES.HOME} element={<Navigate to={ROUTES.LOGIN} replace />} />
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />
        <Route path={ROUTES.SIGNUP} element={<SignupPage />} />
        <Route path={ROUTES.VERIFY_EMAIL} element={<VerifyEmailPage />} />
        <Route
          path={ROUTES.VERIFICATION_PENDING}
          element={<VerificationPendingPage />}
        />

        {/* Protected routes */}
        <Route
          path={ROUTES.DASHBOARD}
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <DashboardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.PROFILE}
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ProfilePage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.API_KEYS}
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ApiKeysPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.DOCUMENTS}
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <DocumentsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.DOCUMENTS_UPLOAD}
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <UploadPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* 404 */}
        <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
