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
  DOCUMENTS: '/documents',
  DOCUMENTS_UPLOAD: '/documents/upload',
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
  DOCUMENTS: {
    LIST: '/api/documents',
    UPLOAD: '/api/documents/upload',
    UPLOAD_URL: '/api/documents/url',
    GET: (id: string) => `/api/documents/${id}`,
    STATUS: (id: string) => `/api/documents/${id}/status`,
    DOWNLOAD: (id: string) => `/api/documents/${id}/download`,
    DELETE: (id: string) => `/api/documents/${id}`,
    STATS: '/api/documents/stats',
  },
  PROFILE: {
    GET: '/api/profile',
    UPDATE_OPENAI_KEY: '/api/profile/openai-key',
    OPENAI_KEY_STATUS: '/api/profile/openai-key/status',
  },
} as const;
