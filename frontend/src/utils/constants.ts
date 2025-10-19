export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Dynamic RAG';
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

export const ROUTES = {
  // Public routes
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  VERIFY_EMAIL: '/verify-email',
  VERIFICATION_PENDING: '/verification-pending',

  // Protected routes
  DASHBOARD: '/dashboard',
  PROFILE: '/profile',
  API_KEYS: '/api-keys',
  SETTINGS: '/settings',
} as const;

export const API_ENDPOINTS = {
  AUTH: {
    SIGNUP: '/api/auth/signup',
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    ME: '/api/auth/me',
    VERIFY_EMAIL: '/api/auth/verify-email',
    RESEND_VERIFICATION: '/api/auth/resend-verification',
  },
} as const;
