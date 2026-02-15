# Frontend Implementation Plan - Dynamic RAG Authentication

## 📋 Overview

This document outlines the complete implementation plan for building a modern, secure frontend for the Dynamic RAG authentication system with email verification, designed to be forward-compatible with MFA and SSO.

---

## 🎯 Goals

1. **User-friendly authentication flows** (signup, login, email verification)
2. **Modern, responsive UI** using React + TypeScript + Tailwind CSS
3. **Secure token management** (JWT access + refresh tokens)
4. **Forward-compatible** with MFA and SSO
5. **Production-ready** with error handling and loading states

---

## 🛠️ Tech Stack

### Core Framework
- **React 18** with TypeScript
- **Vite** for fast development and optimized builds
- **React Router v6** for routing

### Styling
- **Tailwind CSS** for utility-first styling
- **Headless UI** for accessible components
- **Heroicons** for icons
- **Framer Motion** for animations (optional)

### State Management
- **Zustand** for global state (auth, user)
- **React Query (TanStack Query)** for API data fetching

### Forms & Validation
- **React Hook Form** for form handling
- **Zod** for schema validation

### HTTP Client
- **Axios** with interceptors for token refresh

### Utilities
- **date-fns** for date formatting
- **clsx** for conditional classNames
- **react-hot-toast** for notifications

---

## 📁 Project Structure

```
frontend/
├── public/
│   └── favicon.ico
├── src/
│   ├── assets/              # Images, logos
│   ├── components/
│   │   ├── ui/              # Reusable UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Alert.tsx
│   │   │   ├── Spinner.tsx
│   │   │   └── Badge.tsx
│   │   ├── auth/            # Auth-specific components
│   │   │   ├── LoginForm.tsx
│   │   │   ├── SignupForm.tsx
│   │   │   ├── VerificationPending.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   └── layout/          # Layout components
│   │       ├── AuthLayout.tsx
│   │       ├── DashboardLayout.tsx
│   │       ├── Header.tsx
│   │       └── Sidebar.tsx
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── SignupPage.tsx
│   │   │   ├── VerifyEmailPage.tsx
│   │   │   └── VerificationPendingPage.tsx
│   │   ├── dashboard/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── ApiKeysPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── services/
│   │   ├── api.ts           # Axios instance with interceptors
│   │   ├── auth.service.ts  # Auth API calls
│   │   └── customer.service.ts
│   ├── hooks/
│   │   ├── useAuth.ts       # Auth state and actions
│   │   ├── useLocalStorage.ts
│   │   └── useApiError.ts
│   ├── store/
│   │   ├── authStore.ts     # Zustand auth store
│   │   └── userStore.ts
│   ├── types/
│   │   ├── auth.types.ts
│   │   ├── user.types.ts
│   │   └── api.types.ts
│   ├── utils/
│   │   ├── validators.ts    # Zod schemas
│   │   ├── storage.ts       # LocalStorage helpers
│   │   ├── constants.ts
│   │   └── helpers.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── router.tsx           # React Router configuration
├── .env.example
├── .env.local
├── .gitignore
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🎨 Pages & Routes

### Public Routes (Unauthenticated)

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `LandingPage` | Landing page with CTA to login/signup |
| `/login` | `LoginPage` | Email + password login form |
| `/signup` | `SignupPage` | Email + password signup form |
| `/verify-email` | `VerifyEmailPage` | Email verification handler (with token param) |
| `/verification-pending` | `VerificationPendingPage` | Shown after signup, with resend option |

### Protected Routes (Authenticated)

| Route | Component | Description |
|-------|-----------|-------------|
| `/dashboard` | `DashboardPage` | Main dashboard with metrics |
| `/profile` | `ProfilePage` | User profile and settings |
| `/api-keys` | `ApiKeysPage` | API key management |
| `/settings` | `SettingsPage` | Account settings |
| `/documents` | `DocumentsPage` | Document management (Phase 2) |

### Redirects & Guards

- Unauthenticated user accessing protected route → Redirect to `/login`
- Authenticated user accessing `/login` or `/signup` → Redirect to `/dashboard`
- Unverified user accessing protected route → Redirect to `/verification-pending`

---

## 🔐 Authentication Flow

### 1. Signup Flow

```
User visits /signup
  ↓
Fills form (email, password, company name)
  ↓
Submits → POST /api/auth/signup
  ↓
Success Response:
  {
    message: "Please check your email...",
    customer: { id, email, status: "pending_verification" }
  }
  ↓
Redirect to /verification-pending
  ↓
Show message: "Check your email"
Show button: "Resend verification email"
  ↓
User checks email and clicks link
  ↓
Redirect to /verify-email?token=xxx
  ↓
Auto-verify → GET /api/auth/verify-email?token=xxx
  ↓
Success → Show "Email verified!" + Redirect to /login
```

### 2. Login Flow

```
User visits /login
  ↓
Fills form (email, password)
  ↓
Submits → POST /api/auth/login
  ↓
Response Scenarios:

A. Success (200):
   {
     accessToken, refreshToken, customer
   }
   ↓
   Store tokens in localStorage
   Store user in Zustand store
   Redirect to /dashboard

B. Email Not Verified (403):
   {
     error: "Email Not Verified"
   }
   ↓
   Show error
   Show "Resend verification" button
   Redirect to /verification-pending

C. Invalid Credentials (401):
   Show error: "Invalid email or password"
```

### 3. Verification Flow

```
User clicks link in email
  ↓
Browser opens: /verify-email?token=abc123...
  ↓
Page automatically calls:
  GET /api/auth/verify-email?token=abc123...
  ↓
Response Scenarios:

A. Success (200):
   {
     success: true,
     message: "Email verified!"
   }
   ↓
   Show success message with confetti
   Show "Go to Login" button
   Auto-redirect after 3 seconds

B. Invalid/Expired (400):
   Show error: "Invalid or expired token"
   Show "Request new verification email" button
```

### 4. Token Refresh Flow

```
API call returns 401 Unauthorized
  ↓
Interceptor catches error
  ↓
Check if we have refreshToken
  ↓
Call: POST /api/auth/refresh { refreshToken }
  ↓
Success:
  {
    accessToken, refreshToken
  }
  ↓
  Store new tokens
  Retry original request
  ↓
Failure:
  Clear tokens
  Redirect to /login
```

---

## 🧩 Core Components

### 1. Button Component

```tsx
// src/components/ui/Button.tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}
```

**Features**:
- Multiple variants (primary, secondary, outline)
- Loading state with spinner
- Disabled state
- Full width option
- Accessible (keyboard navigation, ARIA attributes)

### 2. Input Component

```tsx
// src/components/ui/Input.tsx
interface InputProps {
  label: string;
  type?: 'text' | 'email' | 'password';
  placeholder?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
}
```

**Features**:
- Label with required indicator
- Error state with message
- Helper text
- Password visibility toggle
- Accessible (proper labels, ARIA)

### 3. Alert Component

```tsx
// src/components/ui/Alert.tsx
interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}
```

**Features**:
- Different types with icons and colors
- Optional title
- Dismissible with close button
- Auto-dismiss after timeout (optional)

### 4. Protected Route

```tsx
// src/components/auth/ProtectedRoute.tsx
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireVerification?: boolean;
}

// Usage:
<Route path="/dashboard" element={
  <ProtectedRoute requireVerification>
    <DashboardPage />
  </ProtectedRoute>
} />
```

**Features**:
- Checks if user is authenticated
- Optionally checks if email is verified
- Redirects to appropriate page
- Shows loading state while checking

---

## 🎨 UI/UX Design

### Color Scheme

```javascript
// tailwind.config.js
colors: {
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    500: '#0ea5e9',  // Main brand color
    600: '#0284c7',
    700: '#0369a1',
  },
  success: {
    500: '#10b981',
    600: '#059669',
  },
  error: {
    500: '#ef4444',
    600: '#dc2626',
  },
  warning: {
    500: '#f59e0b',
    600: '#d97706',
  },
}
```

### Typography

- **Headings**: Inter font family, bold
- **Body**: Inter font family, regular
- **Monospace**: JetBrains Mono (for API keys, tokens)

### Spacing

- Consistent 4px grid system
- Generous whitespace
- Clear visual hierarchy

---

## 📝 Implementation Phases

### Phase A: Project Setup (Day 1)

**Tasks**:
1. Initialize Vite + React + TypeScript project
2. Install and configure Tailwind CSS
3. Install dependencies (React Router, Zustand, Axios, etc.)
4. Setup folder structure
5. Configure environment variables
6. Setup ESLint and Prettier

**Deliverables**:
- Working dev environment
- Basic routing structure
- Tailwind configured

### Phase B: Core Infrastructure (Day 1-2)

**Tasks**:
1. Create API service with Axios interceptors
2. Implement token refresh logic
3. Create Zustand auth store
4. Create authentication hooks (useAuth)
5. Build base UI components (Button, Input, Alert)
6. Setup React Router with protected routes

**Deliverables**:
- API client ready
- Token management working
- Base components library

### Phase C: Authentication Pages (Day 2-3)

**Tasks**:
1. **Login Page**:
   - Email + password form
   - Form validation with Zod
   - Error handling (401, 403)
   - Loading states
   - "Forgot password" link (future)

2. **Signup Page**:
   - Email + password + company form
   - Password strength indicator
   - Form validation
   - Success → Redirect to verification pending

3. **Verification Pending Page**:
   - Clear message to check email
   - Resend verification button
   - Rate limit handling (show countdown)

4. **Verify Email Page**:
   - Auto-verify on mount
   - Loading state
   - Success state (with confetti)
   - Error state (with resend button)

**Deliverables**:
- Complete auth flow UI
- All pages responsive
- Error handling complete

### Phase D: Dashboard & Profile (Day 3-4)

**Tasks**:
1. **Dashboard Layout**:
   - Header with user menu
   - Sidebar navigation
   - Main content area

2. **Dashboard Page**:
   - Welcome message
   - Quick stats (if available)
   - API key display with copy button
   - Recent activity (Phase 2)

3. **Profile Page**:
   - Display user info (email, company, created date)
   - Edit profile form
   - Change password form
   - Account status badge

4. **API Keys Page**:
   - Display API key with copy button
   - Regenerate API key button
   - Usage stats (future)

**Deliverables**:
- Complete dashboard UI
- Profile management
- API key management

### Phase E: Polish & Testing (Day 4-5)

**Tasks**:
1. Add loading skeletons
2. Add toast notifications
3. Add form validation feedback
4. Responsive design testing
5. Cross-browser testing
6. Accessibility audit
7. Error boundary implementation
8. Performance optimization

**Deliverables**:
- Production-ready frontend
- Tested on all major browsers
- Accessible (WCAG 2.1 AA)
- Fast performance

---

## 🔧 Key Implementation Details

### 1. Token Storage

```typescript
// src/utils/storage.ts
export const TokenStorage = {
  getAccessToken: () => localStorage.getItem('accessToken'),
  setAccessToken: (token: string) => localStorage.setItem('accessToken', token),

  getRefreshToken: () => localStorage.getItem('refreshToken'),
  setRefreshToken: (token: string) => localStorage.setItem('refreshToken', token),

  clearTokens: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
};
```

### 2. Axios Interceptor

```typescript
// src/services/api.ts
import axios from 'axios';
import { TokenStorage } from '../utils/storage';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Add access token
api.interceptors.request.use(
  (config) => {
    const token = TokenStorage.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle 401 and refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = TokenStorage.getRefreshToken();
        const { data } = await axios.post('/api/auth/refresh', {
          refreshToken,
        });

        TokenStorage.setAccessToken(data.accessToken);
        TokenStorage.setRefreshToken(data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        TokenStorage.clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
```

### 3. Auth Store (Zustand)

```typescript
// src/store/authStore.ts
import { create } from 'zustand';
import { Customer } from '../types/user.types';

interface AuthState {
  user: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: Customer) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: true, isLoading: false }),

  logout: () => {
    TokenStorage.clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),
}));
```

### 4. Form Validation

```typescript
// src/utils/validators.ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[@$!%*?&#]/, 'Must contain at least one special character'),
  company_name: z.string().optional(),
});
```

---

## 🌐 API Integration

### Auth Service

```typescript
// src/services/auth.service.ts
import api from './api';
import {
  LoginRequest,
  SignupRequest,
  AuthResponse,
  VerifyEmailResponse
} from '../types/auth.types';

export const authService = {
  // Signup
  signup: async (data: SignupRequest) => {
    const response = await api.post('/api/auth/signup', data);
    return response.data;
  },

  // Login
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await api.post('/api/auth/login', data);
    return response.data;
  },

  // Verify email
  verifyEmail: async (token: string): Promise<VerifyEmailResponse> => {
    const response = await api.get(`/api/auth/verify-email?token=${token}`);
    return response.data;
  },

  // Resend verification
  resendVerification: async (email: string) => {
    const response = await api.post('/api/auth/resend-verification', { email });
    return response.data;
  },

  // Get current user
  me: async () => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },

  // Logout
  logout: async (refreshToken: string) => {
    const response = await api.post('/api/auth/logout', { refreshToken });
    return response.data;
  },

  // Refresh token
  refreshToken: async (refreshToken: string) => {
    const response = await api.post('/api/auth/refresh', { refreshToken });
    return response.data;
  },
};
```

---

## 🎨 Sample Page Implementations

### Login Page

```tsx
// src/pages/auth/LoginPage.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { useAuthStore } from '../../store/authStore';
import { loginSchema } from '../../utils/validators';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data) => {
    setError('');
    setIsLoading(true);

    try {
      const response = await authService.login(data);

      // Store tokens
      TokenStorage.setAccessToken(response.accessToken);
      TokenStorage.setRefreshToken(response.refreshToken);

      // Store user
      setUser(response.customer);

      // Redirect
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Login failed';

      if (err.response?.status === 403) {
        // Email not verified
        setError(errorMessage);
        // Show resend button or redirect
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/signup" className="text-primary-600 hover:text-primary-500">
              create a new account
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {error && <Alert type="error" message={error} />}

          <Input
            label="Email address"
            type="email"
            {...register('email')}
            error={errors.email?.message}
            required
          />

          <Input
            label="Password"
            type="password"
            {...register('password')}
            error={errors.password?.message}
            required
          />

          <Button
            type="submit"
            fullWidth
            loading={isLoading}
            disabled={isLoading}
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
};
```

---

## 📱 Responsive Design

### Breakpoints

```javascript
// tailwind.config.js
screens: {
  'sm': '640px',   // Mobile landscape
  'md': '768px',   // Tablet
  'lg': '1024px',  // Desktop
  'xl': '1280px',  // Large desktop
  '2xl': '1536px', // Extra large
}
```

### Mobile-First Approach

- Design for mobile first (320px+)
- Progressive enhancement for larger screens
- Touch-friendly targets (min 44x44px)
- Collapsible navigation on mobile

---

## ♿ Accessibility

### Requirements (WCAG 2.1 AA)

- ✅ Keyboard navigation support
- ✅ Screen reader compatible (ARIA labels)
- ✅ Color contrast ratio 4.5:1 minimum
- ✅ Focus indicators visible
- ✅ Form labels and error messages
- ✅ Alt text for images
- ✅ Skip navigation links

### Testing Tools

- Lighthouse audit
- axe DevTools
- Screen reader testing (NVDA, VoiceOver)

---

## ⚡ Performance

### Optimization Strategies

1. **Code Splitting**: React.lazy() for route-based splitting
2. **Tree Shaking**: Remove unused code (Vite does this)
3. **Image Optimization**: WebP format, lazy loading
4. **Bundle Analysis**: vite-bundle-visualizer
5. **Caching**: Service workers (future)

### Performance Targets

- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.5s
- Lighthouse Score: > 90

---

## 🚀 Deployment

### Build Process

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Variables

```bash
# .env.production
VITE_API_URL=https://api.dynamicrag.com
VITE_APP_NAME=Dynamic RAG
VITE_ENABLE_ANALYTICS=true
```

### Hosting Options

1. **Vercel** (Recommended): Zero-config deployment
2. **Netlify**: Easy setup with form handling
3. **AWS S3 + CloudFront**: Full control
4. **Docker**: Containerized with nginx

---

## 🔮 Future Enhancements (Phase 1.6+)

### MFA/2FA Support

- QR code display for TOTP setup
- Backup codes display and download
- Trusted device management UI
- MFA verification step in login flow

### SSO Support

- "Sign in with Google" button
- "Sign in with Microsoft" button
- "Sign in with GitHub" button
- Account linking interface
- Multiple provider management

### Additional Features

- Dark mode toggle
- Password reset flow
- Account recovery
- Email preferences
- Notification settings
- Activity log viewer
- Two-column layout for documents (Phase 2)

---

## 📊 Estimated Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Phase A: Setup** | 0.5 days | Project init, dependencies, config |
| **Phase B: Infrastructure** | 1 day | API client, auth store, base components |
| **Phase C: Auth Pages** | 1.5 days | Login, signup, verification pages |
| **Phase D: Dashboard** | 1 day | Dashboard, profile, API keys |
| **Phase E: Polish** | 1 day | Testing, responsive, accessibility |
| **Total** | **5 days** | Complete frontend implementation |

---

## 📋 Checklist

### Must Have (MVP)
- [ ] Project setup with Vite + React + TypeScript
- [ ] Tailwind CSS configured
- [ ] API client with token refresh
- [ ] Auth store (Zustand)
- [ ] Base UI components (Button, Input, Alert)
- [ ] Login page
- [ ] Signup page
- [ ] Email verification page
- [ ] Verification pending page
- [ ] Protected route wrapper
- [ ] Dashboard layout
- [ ] Dashboard page
- [ ] Profile page
- [ ] API keys page
- [ ] Responsive design
- [ ] Error handling
- [ ] Loading states
- [ ] Toast notifications

### Nice to Have
- [ ] Dark mode
- [ ] Password strength meter
- [ ] Forgot password flow
- [ ] Remember me checkbox
- [ ] Activity log
- [ ] Analytics integration
- [ ] Service worker (offline support)

### Future (Phase 1.6+)
- [ ] MFA setup UI
- [ ] Trusted device management
- [ ] SSO buttons and flows
- [ ] Account linking
- [ ] Advanced settings

---

## 📚 Resources

### Documentation
- [React Documentation](https://react.dev)
- [Vite Guide](https://vitejs.dev/guide/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [React Router v6](https://reactrouter.com/en/main)
- [Zustand Guide](https://github.com/pmndrs/zustand)
- [React Hook Form](https://react-hook-form.com)
- [Zod Documentation](https://zod.dev)

### Design Inspiration
- [Tailwind UI](https://tailwindui.com) (Premium components)
- [Headless UI](https://headlessui.com) (Free accessible components)
- [Shadcn UI](https://ui.shadcn.com) (Copy-paste components)

---

## 🎯 Success Criteria

- ✅ Complete authentication flow working end-to-end
- ✅ Email verification fully functional
- ✅ Token refresh automatic and seamless
- ✅ Responsive on all screen sizes (320px - 2560px)
- ✅ Accessible (WCAG 2.1 AA)
- ✅ Fast performance (Lighthouse > 90)
- ✅ Production-ready code quality
- ✅ Forward-compatible with MFA/SSO

---

**Ready to implement?** Let's build this frontend! 🚀

**Recommended Start**: Phase A (Project Setup)
**Estimated Completion**: 5 days
**Tech Stack**: React + TypeScript + Vite + Tailwind CSS + Zustand
