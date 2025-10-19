# Authentication Implementation Plan

## 📋 Implementation Strategy

### Current Phase: **Email Verification** (Phase 1.5)
### Future Phases: **MFA/2FA** (Phase 1.6) + **SSO** (Phase 1.7)

> **Important**: All current implementations MUST be designed to support future SSO and MFA integration. The database schema and code architecture already include these features, but they will remain dormant until explicitly implemented.

## 🎯 Phase 1.5: Email Verification (CURRENT)

**Status**: In Progress
**Priority**: HIGH
**Timeline**: 1-2 days

### Design Principles (Forward Compatibility)

1. ✅ **Database schema** already includes MFA and SSO fields (dormant)
2. ✅ **Customer model** supports nullable `password_hash` for future SSO-only accounts
3. ✅ **Status field** supports `pending_verification` state
4. ✅ All code must not break when MFA/SSO tables exist
5. ✅ Email verification flow must work independently of MFA/SSO

### What We're Building Now

#### 1. Email Service Infrastructure
```
src/services/email/
├── email.service.ts          # Main email service (SendGrid)
├── email.interface.ts         # Email provider interface
└── templates/
    ├── verification.html.ts   # Email verification template
    └── welcome.html.ts        # Welcome email after verification
```

**Key Features**:
- Provider-agnostic interface (easy to swap SendGrid for SES/Resend later)
- HTML email templates with inline CSS
- Error handling and retry logic
- Rate limiting on email sending

#### 2. Verification Service
```
src/services/verification.service.ts
```

**Responsibilities**:
- Generate cryptographically secure tokens (32 bytes)
- Set expiration (24 hours)
- Validate tokens
- Track verification attempts
- Rate limit resend requests

#### 3. Email Verification Model
```
src/models/email-verification.ts
```

**CRUD Operations**:
- `createVerification(customerId, token, expiresAt, metadata)`
- `findByToken(token)`
- `markAsVerified(token, ipAddress, userAgent)`
- `cleanupExpired()`

#### 4. Updated Customer Model
```
src/models/customer.ts
```

**New Functions**:
- `updateEmailVerificationToken(customerId, token, expires)`
- `markEmailAsVerified(customerId)`
- `isEmailVerified(customerId)`

#### 5. Updated Auth Routes
```
src/routes/auth.ts
```

**Modified Endpoints**:
- `POST /api/auth/signup`
  - Creates customer with `status: 'pending_verification'`
  - Generates verification token
  - Sends verification email
  - Returns 201 with message to check email

- `POST /api/auth/login`
  - Checks `email_verified` field
  - Returns 403 if not verified
  - Allows login if verified

**New Endpoints**:
- `GET /api/auth/verify-email?token=xxx`
  - Validates token
  - Marks email as verified
  - Updates status to 'active'
  - Returns success message

- `POST /api/auth/resend-verification`
  - Body: `{ email }`
  - Rate limited (3 per hour per email)
  - Generates new token
  - Sends new verification email

#### 6. Middleware (Optional)
```
src/middleware/verify-email.ts
```

**Purpose**: Check email verification on protected routes (if needed)

### Dependencies to Install

```bash
# Email service (SendGrid - recommended)
npm install @sendgrid/mail

# Types
npm install --save-dev @types/node
```

### Environment Variables to Add

```bash
# Email Service
SENDGRID_API_KEY=your-sendgrid-api-key-here
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME="Dynamic RAG"

# Verification
EMAIL_VERIFICATION_URL=http://localhost:3001/api/auth/verify-email
FRONTEND_URL=http://localhost:3000

# Optional: Rate limiting
EMAIL_RESEND_LIMIT_PER_HOUR=3
```

### Database Migration

The schema is already updated with:
- `customers.email_verified`
- `customers.email_verification_token`
- `customers.email_verification_expires`
- `customers.status` (with 'pending_verification')
- `email_verifications` table

**Migration needed**: Update existing customers:
```sql
-- Migrate existing customers (mark as verified to avoid breaking existing accounts)
UPDATE customers
SET email_verified = true,
    status = 'active'
WHERE email_verified IS NULL;
```

### Testing Checklist

- [ ] SendGrid API key configured
- [ ] Signup sends verification email
- [ ] Email template renders correctly (HTML + plain text)
- [ ] Verification link contains valid token
- [ ] Token click verifies email and activates account
- [ ] Expired token returns error (400)
- [ ] Invalid token returns error (400)
- [ ] Already verified token returns success (200)
- [ ] Login blocked until email verified (403)
- [ ] Login works after verification
- [ ] Resend verification generates new token
- [ ] Resend is rate limited (3 per hour)
- [ ] Verification logged in `email_verifications` table

## 🔮 Phase 1.6: MFA/2FA (FUTURE)

**Status**: Designed, Not Implemented
**Priority**: MEDIUM
**Timeline**: 2-3 days (when ready)

### Why Future SSO/MFA Won't Break Current Code

#### Database Schema
- ✅ All MFA/SSO tables already exist (empty)
- ✅ `customers.mfa_enabled` defaults to `false`
- ✅ `customers.password_hash` is nullable
- ✅ Foreign keys reference `customers.id` correctly

#### Code Compatibility
- ✅ Current login flow doesn't check `mfa_enabled` (will be added later)
- ✅ Current signup allows null `password_hash` (for future SSO-only)
- ✅ JWT verification doesn't depend on auth method

#### What Will Change (When Implementing MFA)
1. Add MFA check in login flow (after email verification check)
2. Create MFA setup endpoints
3. Add TOTP verification step
4. No breaking changes to existing endpoints

### Dependencies (Not Installing Yet)
```bash
# These will be installed in Phase 1.6
npm install speakeasy qrcode otplib
npm install --save-dev @types/qrcode
```

## 🔮 Phase 1.7: SSO (FUTURE)

**Status**: Designed, Not Implemented
**Priority**: MEDIUM-LOW
**Timeline**: 3-4 days (when ready)

### Why Future SSO Won't Break Current Code

#### Database Schema
- ✅ `sso_providers` table ready
- ✅ `sso_events` table for audit
- ✅ `customers.password_hash` already nullable

#### Code Compatibility
- ✅ Current signup/login uses email/password
- ✅ SSO will be separate endpoints (`/api/auth/sso/*`)
- ✅ Both auth methods generate same JWT tokens
- ✅ No conflicts between email/password and SSO

#### What Will Change (When Implementing SSO)
1. Add SSO routes (`/sso/:provider/login`, `/sso/:provider/callback`)
2. Create SSO provider services
3. Link SSO accounts to existing customers
4. Auto-verify email for SSO signups
5. No breaking changes to existing endpoints

### Dependencies (Not Installing Yet)
```bash
# These will be installed in Phase 1.7
npm install passport passport-google-oauth20 passport-microsoft passport-github2
npm install --save-dev @types/passport @types/passport-google-oauth20
```

## 🏗️ Architecture Decisions (Forward Compatibility)

### 1. Authentication Method Flexibility

Current customer can authenticate via:
- ✅ Email + Password (implemented)
- 🔮 Email + Password + MFA (future)
- 🔮 SSO (Google/Microsoft/GitHub) (future)
- 🔮 SSO + MFA (future)

### 2. JWT Token Generation

**Same for all auth methods**:
```typescript
// Works for email/password, SSO, or both
const tokens = await generateTokenPair(
  customer.id,
  customer.email,
  jwtSecret,
  jwtRefreshSecret
);
```

**This means**:
- SSO users get same JWT tokens
- MFA users get same JWT tokens
- Token verification doesn't care about auth method

### 3. Account Status Flow

```
New Account (Email/Password):
  pending_verification → active
  ↓
  email verification required

New Account (SSO):
  active (immediately)
  ↓
  email pre-verified by provider

Existing Account (Add SSO):
  active → active
  ↓
  link SSO provider to existing account
```

### 4. Database Queries

All queries filter by `customer_id`, never by auth method:
```typescript
// ✅ Works for email/password, SSO, or both
const customer = await findCustomerById(customerId);

// ✅ Never assume password exists
if (customer.password_hash) {
  // Email/password auth available
}

// ✅ Check for SSO providers
const ssoProviders = await getSSOProviders(customerId);
if (ssoProviders.length > 0) {
  // SSO auth available
}
```

## 📝 Code Guidelines for Phase 1.5

### DO's ✅

1. **Use nullable password_hash**:
```typescript
export interface Customer {
  password_hash: string | null; // Nullable for future SSO
}
```

2. **Check email_verified before login**:
```typescript
if (!customer.email_verified) {
  return res.status(403).json({
    error: 'Email not verified',
    message: 'Please verify your email address'
  });
}
```

3. **Use status enum correctly**:
```typescript
status: 'pending_verification' | 'active' | 'suspended' | 'deleted'
```

4. **Log verification events**:
```typescript
await createEmailVerification({
  customer_id: customerId,
  token,
  expires_at,
  ip_address: req.ip,
  user_agent: req.headers['user-agent']
});
```

### DON'Ts ❌

1. **Don't assume password always exists**:
```typescript
// ❌ Wrong
const valid = await verifyPassword(password, customer.password_hash);

// ✅ Correct
if (!customer.password_hash) {
  return res.status(400).json({ error: 'Password not set' });
}
const valid = await verifyPassword(password, customer.password_hash);
```

2. **Don't hardcode email provider**:
```typescript
// ❌ Wrong
import sgMail from '@sendgrid/mail';
sgMail.send(...);

// ✅ Correct
import { emailService } from './services/email/email.service';
await emailService.send(...);
```

3. **Don't skip verification for any reason**:
```typescript
// ❌ Wrong
const customer = await createCustomer({ email, password });
return res.json({ customer, tokens }); // No verification!

// ✅ Correct
const customer = await createCustomer({ email, password });
await sendVerificationEmail(customer.email, token);
return res.status(201).json({ message: 'Please verify email' });
```

## 🚀 Implementation Steps (Phase 1.5)

### Step 1: Install Dependencies
```bash
npm install @sendgrid/mail
```

### Step 2: Setup SendGrid
1. Create SendGrid account
2. Generate API key
3. Add to `.env`

### Step 3: Create Email Service
- Email interface
- SendGrid implementation
- Email templates

### Step 4: Create Verification Service
- Token generation
- Token validation
- Rate limiting

### Step 5: Update Models
- Email verification model
- Customer model updates

### Step 6: Update Auth Routes
- Modify signup
- Modify login
- Add verify-email endpoint
- Add resend-verification endpoint

### Step 7: Test Everything
- Unit tests
- Integration tests
- Manual testing

### Step 8: Update Documentation
- API documentation
- User guide
- Deployment notes

## 📊 Progress Tracking

### Phase 1.5: Email Verification
- [x] Design complete
- [x] Database schema updated
- [ ] Dependencies installed
- [ ] Email service created
- [ ] Verification service created
- [ ] Models updated
- [ ] Routes updated
- [ ] Tests written
- [ ] Documentation updated
- [ ] Deployed

### Phase 1.6: MFA/2FA (Future)
- [x] Design complete
- [x] Database schema ready
- [ ] Dependencies installed (when ready)
- [ ] Implementation started
- [ ] Tests written
- [ ] Documentation updated
- [ ] Deployed

### Phase 1.7: SSO (Future)
- [x] Design complete
- [x] Database schema ready
- [ ] OAuth apps registered (when ready)
- [ ] Dependencies installed (when ready)
- [ ] Implementation started
- [ ] Tests written
- [ ] Documentation updated
- [ ] Deployed

---

**Current Focus**: Phase 1.5 - Email Verification Only
**Future Ready**: MFA and SSO designs complete, database ready
**Forward Compatible**: All code designed for future enhancements
