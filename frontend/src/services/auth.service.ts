import api from './api';
import {
  LoginRequest,
  SignupRequest,
  AuthResponse,
  SignupResponse,
  VerifyEmailResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
  Customer,
} from '../types/auth.types';
import { API_ENDPOINTS } from '../utils/constants';

export const authService = {
  /**
   * Sign up a new user
   */
  signup: async (data: SignupRequest): Promise<SignupResponse> => {
    const response = await api.post<SignupResponse>(API_ENDPOINTS.AUTH.SIGNUP, data);
    return response.data;
  },

  /**
   * Login with email and password
   */
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>(API_ENDPOINTS.AUTH.LOGIN, data);
    return response.data;
  },

  /**
   * Verify email with token
   */
  verifyEmail: async (token: string): Promise<VerifyEmailResponse> => {
    const response = await api.get<VerifyEmailResponse>(
      `${API_ENDPOINTS.AUTH.VERIFY_EMAIL}?token=${token}`
    );
    return response.data;
  },

  /**
   * Resend verification email
   */
  resendVerification: async (
    data: ResendVerificationRequest
  ): Promise<ResendVerificationResponse> => {
    const response = await api.post<ResendVerificationResponse>(
      API_ENDPOINTS.AUTH.RESEND_VERIFICATION,
      data
    );
    return response.data;
  },

  /**
   * Get current user info
   */
  me: async (): Promise<{ customer: Customer }> => {
    const response = await api.get<{ customer: Customer }>(API_ENDPOINTS.AUTH.ME);
    return response.data;
  },

  /**
   * Logout (revoke refresh token)
   */
  logout: async (refreshToken: string): Promise<void> => {
    await api.post(API_ENDPOINTS.AUTH.LOGOUT, { refreshToken });
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>(API_ENDPOINTS.AUTH.REFRESH, {
      refreshToken,
    });
    return response.data;
  },
};
