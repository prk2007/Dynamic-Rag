# Authentication Improvements - Design Document

## Overview

Enhanced authentication system adding three critical features:
1. **Email Verification** - Verify email ownership before account activation
2. **Multi-Factor Authentication (MFA)** - TOTP-based 2FA for enhanced security
3. **Single Sign-On (SSO)** - OAuth2 integration (Google, Microsoft, GitHub)

## 1. Email Verification

### Requirements

- Send verification email on signup
- Account status: `pending_verification` until verified
- Verification link with secure token (expires in 24h)
- Resend verification email option
- Block login until email verified

### Database Changes

```sql
-- Add to customers table
ALTER TABLE customers
ADD COLUMN email_verified BOOLEAN DEFAULT false,
ADD COLUMN email_verification_token VARCHAR(255),
ADD COLUMN email_verification_expires TIMESTAMP;

-- Add email verification log table
CREATE TABLE email_verifications (
    id SERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_verifications_token ON email_verifications(token);
CREATE INDEX idx_email_verifications_customer ON email_verifications(customer_id);
```

### API Endpoints

```
POST   /api/auth/signup
       → Sends verification email, returns status 201

GET    /api/auth/verify-email?token=xxx
       → Verifies email, activates account

POST   /api/auth/resend-verification
       Body: { email }
       → Resends verification email

POST   /api/auth/login
       → Returns 403 if email not verified
```

### Email Template

```html
Subject: Verify your Dynamic RAG account

Hi {{company_name}},

Welcome to Dynamic RAG! Please verify your email address to activate your account.

Click here to verify: {{verification_link}}

This link expires in 24 hours.

If you didn't create this account, please ignore this email.

---
Dynamic RAG Team
```

### Implementation Files

```
src/
├── services/
│   ├── email.ts              # Email service (SendGrid/AWS SES)
│   ├── email-templates.ts    # Email templates
│   └── verification.ts       # Token generation & validation
├── models/
│   └── email-verification.ts # Email verification CRUD
└── routes/
    └── auth.ts               # Updated with verification endpoints
```

## 2. Multi-Factor Authentication (MFA)

### Requirements

- TOTP-based 2FA (compatible with Google Authenticator, Authy, etc.)
- Optional per-customer (not enforced by default)
- Backup codes (10 single-use codes)
- QR code generation for easy setup
- Recovery options if device lost

### Database Changes

```sql
-- Add to customers table
ALTER TABLE customers
ADD COLUMN mfa_enabled BOOLEAN DEFAULT false,
ADD COLUMN mfa_secret VARCHAR(255), -- Encrypted TOTP secret
ADD COLUMN mfa_backup_codes TEXT; -- Encrypted JSON array

-- MFA sessions table (for "remember this device" feature)
CREATE TABLE mfa_trusted_devices (
    id SERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    trusted_until TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(customer_id, device_fingerprint)
);

CREATE INDEX idx_mfa_trusted_devices_customer ON mfa_trusted_devices(customer_id);
CREATE INDEX idx_mfa_trusted_devices_fingerprint ON mfa_trusted_devices(device_fingerprint);

-- MFA audit log
CREATE TABLE mfa_events (
    id SERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- setup, verify_success, verify_fail, disable
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_mfa_events_customer ON mfa_events(customer_id);
CREATE INDEX idx_mfa_events_type ON mfa_events(event_type);
```

### API Endpoints

```
POST   /api/auth/mfa/setup
       Header: Authorization: Bearer <accessToken>
       → Returns: qrCode (data URL), secret, backupCodes

POST   /api/auth/mfa/verify-setup
       Header: Authorization: Bearer <accessToken>
       Body: { code }
       → Enables MFA for account

POST   /api/auth/mfa/verify
       Body: { email, password, code }
       → Verifies MFA code, returns tokens

POST   /api/auth/mfa/disable
       Header: Authorization: Bearer <accessToken>
       Body: { password, code }
       → Disables MFA (requires verification)

POST   /api/auth/mfa/regenerate-backup-codes
       Header: Authorization: Bearer <accessToken>
       Body: { password }
       → Generates new backup codes

GET    /api/auth/mfa/trusted-devices
       Header: Authorization: Bearer <accessToken>
       → Returns list of trusted devices

DELETE /api/auth/mfa/trusted-devices/:id
       Header: Authorization: Bearer <accessToken>
       → Removes trusted device
```

### Updated Login Flow

```
1. User submits email + password
   ↓
2. Verify credentials
   ↓
3. Check if MFA enabled
   ↓
   If NO:  Return access + refresh tokens
   If YES: ↓
4. Check if device is trusted
   ↓
   If YES: Return access + refresh tokens
   If NO:  ↓
5. Return mfaRequired: true, mfaToken (temp token)
   ↓
6. User submits mfaToken + code
   ↓
7. Verify TOTP code
   ↓
8. Generate device fingerprint, mark as trusted (optional)
   ↓
9. Return access + refresh tokens
```

### Implementation Files

```
src/
├── services/
│   ├── mfa.ts                # TOTP generation & verification
│   ├── qrcode.ts             # QR code generation
│   └── backup-codes.ts       # Backup code generation
├── models/
│   ├── mfa.ts                # MFA settings CRUD
│   └── trusted-devices.ts    # Trusted device management
└── routes/
    └── mfa.ts                # MFA endpoints
```

### Dependencies

```bash
npm install speakeasy qrcode otplib
npm install --save-dev @types/qrcode
```

## 3. Single Sign-On (SSO)

### Requirements

- OAuth2 providers: Google, Microsoft, GitHub
- Link SSO accounts to existing email accounts
- Allow multiple SSO providers per account
- Automatic account creation on first SSO login
- Profile sync (name, avatar) from provider

### Database Changes

```sql
-- SSO providers table
CREATE TABLE sso_providers (
    id SERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- google, microsoft, github
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),
    provider_name VARCHAR(255),
    provider_avatar TEXT,
    access_token TEXT, -- Encrypted
    refresh_token TEXT, -- Encrypted
    token_expires_at TIMESTAMP,
    profile_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)
);

CREATE INDEX idx_sso_providers_customer ON sso_providers(customer_id);
CREATE INDEX idx_sso_providers_provider ON sso_providers(provider, provider_user_id);

-- SSO login events
CREATE TABLE sso_events (
    id SERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- login, link, unlink
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sso_events_customer ON sso_events(customer_id);
CREATE INDEX idx_sso_events_provider ON sso_events(provider);
```

### Environment Variables

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/sso/google/callback

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_CALLBACK_URL=http://localhost:3001/api/auth/sso/microsoft/callback

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3001/api/auth/sso/github/callback

# Frontend URL (for redirects after SSO)
FRONTEND_URL=http://localhost:3000
```

### API Endpoints

```
GET    /api/auth/sso/:provider/login
       Query: ?redirect_uri=/dashboard
       → Redirects to provider OAuth page

GET    /api/auth/sso/:provider/callback
       → OAuth callback, exchanges code for tokens
       → Creates/links account, returns JWT tokens

POST   /api/auth/sso/:provider/link
       Header: Authorization: Bearer <accessToken>
       → Links SSO provider to existing account

DELETE /api/auth/sso/:provider/unlink
       Header: Authorization: Bearer <accessToken>
       → Unlinks SSO provider from account

GET    /api/auth/sso/providers
       Header: Authorization: Bearer <accessToken>
       → Returns list of linked providers
```

### SSO Login Flow

```
1. User clicks "Sign in with Google"
   ↓
2. Redirect to /api/auth/sso/google/login
   ↓
3. API redirects to Google OAuth
   ↓
4. User authorizes app on Google
   ↓
5. Google redirects to /api/auth/sso/google/callback?code=xxx
   ↓
6. API exchanges code for access token
   ↓
7. API fetches user profile from Google
   ↓
8. Check if sso_providers record exists
   ↓
   If YES: Load existing customer
   If NO:  ↓
9. Check if email exists in customers table
   ↓
   If YES: Link SSO to existing customer
   If NO:  Create new customer (email_verified=true)
   ↓
10. Generate JWT tokens (using customer's secrets)
    ↓
11. Redirect to frontend with tokens
    ↓
12. Frontend stores tokens, redirects to dashboard
```

### Implementation Files

```
src/
├── services/
│   ├── sso/
│   │   ├── google.ts         # Google OAuth integration
│   │   ├── microsoft.ts      # Microsoft OAuth integration
│   │   ├── github.ts         # GitHub OAuth integration
│   │   └── base.ts           # Base SSO provider class
│   └── oauth.ts              # OAuth utilities
├── models/
│   └── sso-provider.ts       # SSO provider CRUD
└── routes/
    └── sso.ts                # SSO endpoints
```

### Dependencies

```bash
npm install passport passport-google-oauth20 passport-microsoft passport-github2
npm install --save-dev @types/passport @types/passport-google-oauth20
```

## 4. Updated Customer Model

### Extended Customer Interface

```typescript
export interface Customer {
  id: string;
  email: string;
  password_hash: string | null; // Null for SSO-only accounts
  company_name: string | null;
  api_key: string;
  openai_api_key: string | null;
  jwt_secret: string;
  jwt_refresh_secret: string;
  status: 'pending_verification' | 'active' | 'suspended' | 'deleted';

  // Email verification
  email_verified: boolean;
  email_verification_token: string | null;
  email_verification_expires: Date | null;

  // MFA
  mfa_enabled: boolean;
  mfa_secret: string | null; // Encrypted
  mfa_backup_codes: string | null; // Encrypted JSON

  // Profile
  avatar_url: string | null;

  created_at: Date;
  updated_at: Date;
}
```

## 5. Updated Signup Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Enhanced Signup Flow                       │
└──────────────────────────────────────────────────────────────┘

User                API Server           Email Service        Database
  │                      │                      │                 │
  │  POST /signup        │                      │                 │
  │  email, password     │                      │                 │
  ├─────────────────────>│                      │                 │
  │                      │                      │                 │
  │                      │ 1. Validate input    │                 │
  │                      │                      │                 │
  │                      │ 2. Create customer   │                 │
  │                      │    status: pending   │                 │
  │                      │    email_verified:   │                 │
  │                      │    false             │                 │
  │                      ├─────────────────────────────────────>│
  │                      │                      │                 │
  │                      │ 3. Generate token    │                 │
  │                      │    (32 random bytes) │                 │
  │                      │                      │                 │
  │                      │ 4. Send verification │                 │
  │                      │    email             │                 │
  │                      ├─────────────────────>│                 │
  │                      │                      │                 │
  │  201 Created         │                      │                 │
  │  { message: "Please  │                      │                 │
  │    verify email" }   │                      │                 │
  │<─────────────────────┤                      │                 │
  │                      │                      │                 │
  │  (User checks email) │                      │                 │
  │                      │                      │                 │
  │  GET /verify-email   │                      │                 │
  │  ?token=xxx          │                      │                 │
  ├─────────────────────>│                      │                 │
  │                      │                      │                 │
  │                      │ 5. Validate token    │                 │
  │                      ├─────────────────────────────────────>│
  │                      │                      │                 │
  │                      │ 6. Update customer   │                 │
  │                      │    email_verified:   │                 │
  │                      │    true              │                 │
  │                      │    status: active    │                 │
  │                      ├─────────────────────────────────────>│
  │                      │                      │                 │
  │  200 OK              │                      │                 │
  │  { message: "Email   │                      │                 │
  │    verified!" }      │                      │                 │
  │<─────────────────────┤                      │                 │
  │                      │                      │                 │
```

## 6. Updated Login Flow (with MFA)

```
┌──────────────────────────────────────────────────────────────┐
│                 Enhanced Login Flow (MFA)                     │
└──────────────────────────────────────────────────────────────┘

User                API Server              Database
  │                      │                      │
  │  POST /login         │                      │
  │  email, password     │                      │
  ├─────────────────────>│                      │
  │                      │                      │
  │                      │ 1. Find customer     │
  │                      ├─────────────────────>│
  │                      │                      │
  │                      │ 2. Check email       │
  │                      │    verified          │
  │                      │                      │
  │  403 Forbidden       │    If not verified:  │
  │  { error: "Email not │                      │
  │    verified" }       │                      │
  │<─────────────────────┤                      │
  │                      │                      │
  │                      │ 3. Verify password   │
  │                      │                      │
  │                      │ 4. Check MFA enabled │
  │                      │                      │
  │  200 OK (MFA)        │    If MFA enabled:   │
  │  { mfaRequired: true,│                      │
  │    mfaToken: "..." } │                      │
  │<─────────────────────┤                      │
  │                      │                      │
  │  POST /mfa/verify    │                      │
  │  mfaToken, code      │                      │
  ├─────────────────────>│                      │
  │                      │                      │
  │                      │ 5. Verify MFA token  │
  │                      │                      │
  │                      │ 6. Verify TOTP code  │
  │                      │                      │
  │  200 OK              │                      │
  │  { accessToken,      │                      │
  │    refreshToken }    │                      │
  │<─────────────────────┤                      │
  │                      │                      │
```

## 7. Implementation Priority

### Phase 1: Email Verification (Highest Priority)
1. Update database schema
2. Create email service
3. Update signup/login routes
4. Add verification endpoints
5. Test email flow

### Phase 2: MFA/2FA
1. Update database schema
2. Install dependencies (speakeasy, qrcode)
3. Create MFA service
4. Add MFA endpoints
5. Update login flow
6. Test with authenticator apps

### Phase 3: SSO
1. Update database schema
2. Register OAuth apps (Google, Microsoft, GitHub)
3. Install dependencies (passport)
4. Create SSO services
5. Add SSO endpoints
6. Test each provider

## 8. Security Considerations

### Email Verification
- Tokens must be cryptographically random (32+ bytes)
- Tokens must expire (24h recommended)
- Rate limit resend requests (max 3 per hour)
- Log verification attempts

### MFA
- TOTP secrets must be encrypted at rest
- Backup codes must be hashed (like passwords)
- Rate limit MFA verification (max 5 attempts per 15 min)
- Log all MFA events
- Require password + MFA code to disable MFA

### SSO
- Validate redirect URIs to prevent open redirects
- Encrypt OAuth tokens at rest
- Implement CSRF protection (state parameter)
- Verify OAuth token signatures
- Sync profile data on each login

## 9. Testing Checklist

### Email Verification
- [ ] Signup sends verification email
- [ ] Verification link activates account
- [ ] Expired token returns error
- [ ] Invalid token returns error
- [ ] Resend verification works
- [ ] Login blocked until verified

### MFA
- [ ] Setup generates QR code
- [ ] QR code scans in Google Authenticator
- [ ] TOTP codes verify successfully
- [ ] Backup codes work
- [ ] Trusted device bypass works
- [ ] Invalid codes rejected (rate limited)
- [ ] Disable MFA requires password + code

### SSO
- [ ] Google OAuth login works
- [ ] Microsoft OAuth login works
- [ ] GitHub OAuth login works
- [ ] SSO links to existing email account
- [ ] SSO creates new account if email not found
- [ ] Multiple providers can link to one account
- [ ] Unlink provider works
- [ ] Profile sync works

## 10. Email Service Options

### Option 1: SendGrid (Recommended)
```bash
npm install @sendgrid/mail
```
- Pros: Easy to use, generous free tier, good deliverability
- Free tier: 100 emails/day
- Pricing: $19.95/mo for 40K emails

### Option 2: AWS SES
```bash
npm install @aws-sdk/client-ses
```
- Pros: Very cheap, integrates with AWS
- Pricing: $0.10 per 1,000 emails
- Requires verified domain

### Option 3: Resend (Modern)
```bash
npm install resend
```
- Pros: Developer-friendly, React email templates
- Free tier: 100 emails/day
- Pricing: $20/mo for 50K emails

## 11. File Structure

```
src/
├── services/
│   ├── email/
│   │   ├── email.service.ts       # Email sending
│   │   ├── templates/
│   │   │   ├── verification.ts    # Verification email template
│   │   │   ├── mfa-enabled.ts     # MFA enabled notification
│   │   │   ├── password-reset.ts  # Password reset (future)
│   │   │   └── welcome.ts         # Welcome email
│   │   └── providers/
│   │       ├── sendgrid.ts        # SendGrid implementation
│   │       ├── ses.ts             # AWS SES implementation
│   │       └── resend.ts          # Resend implementation
│   │
│   ├── mfa/
│   │   ├── mfa.service.ts         # MFA operations
│   │   ├── totp.ts                # TOTP generation/verification
│   │   ├── backup-codes.ts        # Backup code management
│   │   └── qrcode.ts              # QR code generation
│   │
│   ├── sso/
│   │   ├── sso.service.ts         # Base SSO service
│   │   ├── google.strategy.ts     # Google OAuth
│   │   ├── microsoft.strategy.ts  # Microsoft OAuth
│   │   ├── github.strategy.ts     # GitHub OAuth
│   │   └── oauth-utils.ts         # OAuth utilities
│   │
│   └── verification.service.ts    # Email verification logic
│
├── models/
│   ├── email-verification.ts      # Email verification CRUD
│   ├── mfa.ts                     # MFA settings CRUD
│   ├── sso-provider.ts            # SSO provider CRUD
│   └── trusted-device.ts          # Trusted device CRUD
│
├── routes/
│   ├── auth.ts                    # Updated auth routes
│   ├── mfa.ts                     # MFA endpoints
│   └── sso.ts                     # SSO endpoints
│
└── middleware/
    ├── verify-email.ts            # Email verification check
    └── mfa-required.ts            # MFA check middleware
```

---

**Status**: Design Complete, Ready for Implementation
**Estimated Time**:
- Email Verification: 1-2 days
- MFA: 2-3 days
- SSO: 3-4 days
**Total**: ~1.5 weeks for full implementation
