import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ROUTES } from '../../utils/constants';
import { Spinner } from '../ui/Spinner';

interface ProtectedRouteProps {
  children: ReactNode;
  requireVerification?: boolean;
}

export const ProtectedRoute = ({
  children,
  requireVerification = true,
}: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, user, initialize } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  // Check if email verification is required
  if (requireVerification && user && !user.email_verified) {
    return (
      <Navigate
        to={ROUTES.VERIFICATION_PENDING}
        state={{ email: user.email }}
        replace
      />
    );
  }

  return <>{children}</>;
};
