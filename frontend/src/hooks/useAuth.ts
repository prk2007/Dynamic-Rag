import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth.service';
import { LoginRequest, SignupRequest } from '../types/auth.types';
import { ROUTES } from '../utils/constants';
import { TokenStorage } from '../utils/storage';
import toast from 'react-hot-toast';

export const useAuth = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, setUser, setTokens, logout, setLoading } =
    useAuthStore();

  const login = async (data: LoginRequest) => {
    console.log('useAuth.login called with:', data.email);
    try {
      console.log('Calling authService.login...');
      const response = await authService.login(data);
      console.log('authService.login response:', response);

      // Store tokens first
      setTokens(response.accessToken, response.refreshToken);
      console.log('Tokens stored');

      // Store user and update authentication state
      setUser(response.customer);
      console.log('User stored, isAuthenticated should now be true');

      // Show success message
      toast.success('Login successful!');
      console.log('Toast shown, navigating to dashboard...');

      // Navigate after a small delay to ensure state is updated
      setTimeout(() => {
        navigate(ROUTES.DASHBOARD);
      }, 100);
    } catch (error: any) {
      console.error('useAuth.login error:', error);
      const errorMessage = error.response?.data?.message || 'Login failed';
      console.log('Error message:', errorMessage, 'Status:', error.response?.status);

      if (error.response?.status === 403) {
        // Email not verified
        console.log('Email not verified, showing toast and navigating...');
        toast.error(errorMessage);
        setTimeout(() => {
          navigate(ROUTES.VERIFICATION_PENDING, {
            state: { email: data.email },
          });
        }, 100);
      } else {
        console.log('Showing error toast...');
        toast.error(errorMessage);
      }

      throw error;
    }
  };

  const signup = async (data: SignupRequest) => {
    try {
      const response = await authService.signup(data);

      toast.success(response.message);
      navigate(ROUTES.VERIFICATION_PENDING, {
        state: { email: data.email },
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Signup failed';
      toast.error(errorMessage);
      throw error;
    }
  };

  const verifyEmail = async (token: string) => {
    try {
      const response = await authService.verifyEmail(token);
      toast.success(response.message);
      return response;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Verification failed';
      toast.error(errorMessage);
      throw error;
    }
  };

  const resendVerification = async (email: string) => {
    try {
      const response = await authService.resendVerification({ email });
      toast.success(response.message);
      return response;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to resend email';
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      const refreshToken = TokenStorage.getRefreshToken();
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
      toast.success('Logged out successfully');
      navigate(ROUTES.LOGIN);
    }
  };

  const fetchUser = async () => {
    try {
      setLoading(true);
      const response = await authService.me();
      setUser(response.customer);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    signup,
    logout: handleLogout,
    verifyEmail,
    resendVerification,
    fetchUser,
  };
};
