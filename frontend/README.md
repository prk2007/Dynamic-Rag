# Dynamic RAG Frontend

Modern React + TypeScript frontend for the Dynamic RAG authentication system with email verification.

## Features

- ✅ User authentication (login/signup)
- ✅ Email verification flow
- ✅ JWT token management with automatic refresh
- ✅ Protected routes
- ✅ Responsive design (mobile-first)
- ✅ Beautiful UI with Tailwind CSS
- ✅ Form validation with Zod
- ✅ Toast notifications
- ✅ Forward-compatible with MFA/SSO

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **React Router v6** - Routing
- **Zustand** - State management
- **Axios** - HTTP client with interceptors
- **React Hook Form** - Form handling
- **Zod** - Schema validation
- **Tailwind CSS** - Styling
- **Heroicons** - Icons
- **React Hot Toast** - Notifications

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running on `http://localhost:3001`

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
VITE_API_URL=http://localhost:3001
VITE_APP_NAME="Dynamic RAG"
```

## Project Structure

```
src/
├── components/        # Reusable components
│   ├── ui/           # UI components (Button, Input, etc.)
│   ├── auth/         # Auth components (ProtectedRoute)
│   └── layout/       # Layout components (DashboardLayout)
├── pages/            # Route pages
│   ├── auth/         # Auth pages (Login, Signup, etc.)
│   └── dashboard/    # Dashboard pages
├── services/         # API services
├── hooks/            # Custom React hooks
├── store/            # Zustand stores
├── types/            # TypeScript types
├── utils/            # Utility functions
└── App.tsx           # Main app component
```

## Available Routes

### Public Routes
- `/login` - Login page
- `/signup` - Signup page
- `/verify-email` - Email verification handler
- `/verification-pending` - Verification pending page

### Protected Routes
- `/dashboard` - Main dashboard
- `/profile` - User profile
- `/api-keys` - API key management

## Features

### Authentication Flow

1. **Signup** → Creates account with `pending_verification` status
2. **Email sent** → User receives verification email
3. **Verification** → User clicks link to verify email
4. **Login** → User can now login and access dashboard

### Token Management

- JWT access tokens stored in localStorage
- Automatic token refresh on 401 errors
- Tokens cleared on logout
- Protected routes check authentication

### State Management

- Zustand for global auth state
- localStorage persistence
- Automatic initialization on app load

## Development

### Code Style

- ESLint + TypeScript for linting
- Prettier for formatting (recommended)
- Tailwind CSS for styling

### Adding New Pages

1. Create page component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add navigation link if needed
4. Add protected route wrapper if needed

## Production Build

```bash
# Build for production
npm run build

# Output will be in dist/ directory
```

## Future Enhancements

- [ ] Dark mode toggle
- [ ] Password strength meter
- [ ] Forgot password flow
- [ ] MFA/2FA setup UI (Phase 1.6)
- [ ] SSO buttons (Phase 1.7)
- [ ] Document management (Phase 2)

## API Integration

The frontend integrates with the Dynamic RAG API:

- Base URL: `http://localhost:3001`
- Authentication: Bearer token in Authorization header
- Auto token refresh on 401 errors

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome)

## License

MIT
