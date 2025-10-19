import { create } from 'zustand';
import { Customer } from '../types/auth.types';
import { TokenStorage, UserStorage, clearAllStorage } from '../utils/storage';

interface AuthState {
  user: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: Customer) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user: Customer) => {
    UserStorage.setUser(user);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  setTokens: (accessToken: string, refreshToken: string) => {
    TokenStorage.setAccessToken(accessToken);
    TokenStorage.setRefreshToken(refreshToken);
  },

  logout: () => {
    clearAllStorage();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  initialize: () => {
    const user = UserStorage.getUser();
    const hasTokens = TokenStorage.hasTokens();

    if (user && hasTokens) {
      set({ user, isAuthenticated: true, isLoading: false });
    } else {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
