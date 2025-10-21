/**
 * API Client with Enhanced Token Management
 * Centralized HTTP client with automatic token handling, expiration checks, and error interceptors
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { TokenStorage, clearAllStorage } from '../utils/storage';
import { API_URL, API_ENDPOINTS, ROUTES } from '../utils/constants';
import { isTokenExpired } from '../utils/jwt';
import toast from 'react-hot-toast';

console.log('API Service initialized with baseURL:', API_URL);

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

/**
 * Subscribe to token refresh
 */
function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

/**
 * Notify all subscribers when token is refreshed
 */
function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

/**
 * Attempt to refresh the access token
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = TokenStorage.getRefreshToken();

  if (!refreshToken) {
    return null;
  }

  // Check if refresh token itself is expired
  if (isTokenExpired(refreshToken, 0)) {
    console.log('Refresh token is expired');
    return null;
  }

  try {
    console.log('Attempting to refresh access token...');
    const response = await axios.post(`${API_URL}${API_ENDPOINTS.AUTH.REFRESH}`, {
      refreshToken,
    });

    const { accessToken, refreshToken: newRefreshToken } = response.data;

    // Store new tokens
    TokenStorage.setAccessToken(accessToken);
    TokenStorage.setRefreshToken(newRefreshToken);

    console.log('Access token refreshed successfully');
    return accessToken;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return null;
  }
}

/**
 * Handle logout and redirect to login page
 */
function handleLogout(showMessage = true) {
  console.log('Handling logout due to session expiration');
  clearAllStorage();

  // Redirect to login page if not already there
  if (window.location.pathname !== ROUTES.LOGIN) {
    if (showMessage) {
      toast.error('Your session has expired. Please login again.');
    }
    setTimeout(() => {
      window.location.href = ROUTES.LOGIN;
    }, 100);
  }
}

/**
 * Request Interceptor
 * Adds authorization header and checks token expiration before request
 */
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const accessToken = TokenStorage.getAccessToken();

    // Skip auth endpoints
    const url = config.url || '';
    if (
      url.includes('/auth/login') ||
      url.includes('/auth/signup') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/verify-email')
    ) {
      return config;
    }

    // Check if token is expired before making request (with 60 second buffer)
    if (accessToken && isTokenExpired(accessToken, 60)) {
      console.log('Access token expired or expiring soon, attempting refresh...');

      if (!isRefreshing) {
        isRefreshing = true;

        const newToken = await refreshAccessToken();

        if (newToken) {
          console.log('Token refreshed successfully before request');
          onTokenRefreshed(newToken);
          config.headers.Authorization = `Bearer ${newToken}`;
        } else {
          console.log('Token refresh failed, logging out');
          isRefreshing = false;
          handleLogout();
          return Promise.reject(new Error('Session expired'));
        }

        isRefreshing = false;
      } else {
        // Wait for ongoing token refresh to complete
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            config.headers.Authorization = `Bearer ${token}`;
            resolve(config);
          });
        });
      }
    } else if (accessToken) {
      // Token is valid, add to headers
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * Handles 401 errors and attempts token refresh
 */
api.interceptors.response.use(
  (response) => {
    // Success response, return as-is
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401) {
      console.log('Received 401 Unauthorized response');

      // Prevent infinite retry loop
      if (originalRequest._retry) {
        console.log('Retry already attempted, logging out');
        handleLogout();
        return Promise.reject(error);
      }

      // Skip refresh for auth endpoints
      const url = originalRequest.url || '';
      if (
        url.includes('/auth/login') ||
        url.includes('/auth/signup') ||
        url.includes('/auth/refresh')
      ) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;

        const newToken = await refreshAccessToken();

        if (newToken) {
          console.log('Token refreshed after 401, retrying request');
          isRefreshing = false;
          onTokenRefreshed(newToken);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          console.log('Token refresh failed after 401, logging out');
          isRefreshing = false;
          handleLogout();
          return Promise.reject(error);
        }
      } else {
        // Wait for ongoing refresh
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }
    }

    // Handle 403 Forbidden errors (email not verified, etc.)
    if (error.response?.status === 403) {
      const data = error.response.data as { message?: string };
      if (data.message?.includes('email') || data.message?.includes('verified')) {
        toast.error('Please verify your email address to continue.');
        setTimeout(() => {
          window.location.href = ROUTES.VERIFICATION_PENDING;
        }, 1000);
      }
    }

    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error.message);
      // Don't show toast for network errors to avoid spam
    }

    return Promise.reject(error);
  }
);

export default api;
