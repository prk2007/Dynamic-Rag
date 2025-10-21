import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ROUTES } from '../../utils/constants';
import { Spinner } from '../ui/Spinner';
import { TokenStorage } from '../../utils/storage';
import { isTokenExpired } from '../../utils/jwt';

interface ProtectedRouteProps {
  children: ReactNode;
  requireVerification?: boolean;
}

export const ProtectedRoute = ({
  children,
  requireVerification = true,
}: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, user, initialize, logout } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    // Check token expiration on route mount and periodically
    const checkTokenExpiration = () => {
      const accessToken = TokenStorage.getAccessToken();
      const refreshToken = TokenStorage.getRefreshToken();

      // If both tokens are expired, logout
      if (
        (!accessToken || isTokenExpired(accessToken, 0)) &&
        (!refreshToken || isTokenExpired(refreshToken, 0))
      ) {
        console.log('Both tokens expired, logging out from ProtectedRoute');
        logout();
      }
    };

    // Check immediately
    checkTokenExpiration();

    // Check every 5 minutes
    const interval = setInterval(checkTokenExpiration, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [logout]);

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
