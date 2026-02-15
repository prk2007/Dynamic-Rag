# Token Expiration Handling - Quick Start Guide

## Problem Solved

**Issue**: Users logged in for a long time would get "Unauthorized" errors when their JWT token expired, with no automatic redirect to login page.

**Solution**: Implemented automatic token expiration detection, silent token refresh, and graceful logout with redirect.

## How It Works

### 3-Layer Protection

1. **Proactive Check (Request Interceptor)**
   - Checks token before every API call
   - Refreshes token if it expires in <60 seconds
   - **User Experience**: Seamless, no interruption

2. **Reactive Check (Response Interceptor)**
   - Catches 401 Unauthorized errors
   - Attempts token refresh and retries request
   - **User Experience**: Request succeeds without user knowing

3. **Periodic Check (Protected Route)**
   - Checks token every 5 minutes
   - Logs out if both access and refresh tokens expired
   - **User Experience**: Clean logout with toast notification

### Token Lifecycle

```
Login
  ↓
Access Token (24h) + Refresh Token (7d)
  ↓
After 23h 59min → Auto Refresh → New Access Token (24h)
  ↓
After 7 days → Refresh Token Expires → Logout + Redirect
```

## Testing The Feature

### Test 1: Normal Usage (Tokens Auto-Refresh)
1. Login to app: `http://localhost:3000/login`
2. Leave browser open for >23 hours (or modify token expiration in backend)
3. Click on "Documents" or any page
4. **Expected**: Page loads normally (token auto-refreshed silently)

### Test 2: Session Expiration (Auto-Logout)
1. Login to app
2. Leave browser for >7 days (or manually delete refresh token)
3. Click on any page
4. **Expected**:
   - Toast: "Your session has expired. Please login again."
   - Redirect to login page

### Test 3: Simulate Expired Token (Quick Test)

**Option A: Browser Console**
```javascript
// Open DevTools Console (F12)
// Delete refresh token to force logout
localStorage.removeItem('refreshToken');
// Click any button in the app
// Should redirect to login immediately
```

**Option B: Backend Configuration**
```bash
# Reduce token lifetime temporarily for testing
# In backend .env file:
JWT_EXPIRES_IN=1m  # 1 minute instead of 24h
JWT_REFRESH_EXPIRES_IN=5m  # 5 minutes instead of 7d

# Restart API
docker-compose restart api

# Login and wait 1 minute, then click something
# Token should auto-refresh
# Wait 5 more minutes
# Should logout and redirect
```

## Files Changed

### New Files
- `frontend/src/utils/jwt.ts` - JWT validation utilities
- `frontend/src/vite-env.d.ts` - TypeScript definitions

### Updated Files
- `frontend/src/services/api.ts` - Complete rewrite with interceptors
- `frontend/src/components/auth/ProtectedRoute.tsx` - Added expiration checks
- `frontend/src/pages/dashboard/DocumentsPage.tsx` - Uses new api client
- `frontend/src/pages/dashboard/UploadPage.tsx` - Uses new api client

## Configuration

### Adjust When Token Refreshes

**File**: `frontend/src/services/api.ts`

```typescript
// Current: Refreshes when <60 seconds remaining
if (accessToken && isTokenExpired(accessToken, 60)) {

// Change to 300 for 5-minute buffer:
if (accessToken && isTokenExpired(accessToken, 300)) {
```

### Adjust Check Interval

**File**: `frontend/src/components/auth/ProtectedRoute.tsx`

```typescript
// Current: Checks every 5 minutes
const interval = setInterval(checkTokenExpiration, 5 * 60 * 1000);

// Change to 10 minutes:
const interval = setInterval(checkTokenExpiration, 10 * 60 * 1000);
```

## User Experience

### Before Implementation
```
User clicks button after 25 hours
  ↓
Error: "Unauthorized" or "401"
  ↓
User stuck on page, confused
  ↓
Must manually logout and login
```

### After Implementation
```
User clicks button after 25 hours
  ↓
(If refresh token still valid - within 7 days)
  ↓
Silent auto-refresh (invisible to user)
  ↓
Page loads normally
  ↓
User doesn't notice anything

OR

(If refresh token expired - after 7 days)
  ↓
Toast: "Session expired, please login again"
  ↓
Automatic redirect to login page
  ↓
Clean, expected experience
```

## API Calls - Before vs After

### Before (Manual Token Management)
```typescript
const token = localStorage.getItem('accessToken');
const response = await fetch(`${API_URL}/api/documents`, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});

if (response.status === 401) {
  // Manual refresh logic
  // Manual retry logic
  // Manual logout logic
}

if (!response.ok) throw new Error('Failed');
const data = await response.json();
```

### After (Automatic Token Management)
```typescript
import api from '../services/api';

const response = await api.get('/api/documents');
const data = response.data;
// Done! Token automatically handled
```

## Debugging

### Check Token Status in Console
```javascript
// Check if token is expired
import { isTokenExpired, getTokenTimeRemaining } from './utils/jwt';

const token = localStorage.getItem('accessToken');
console.log('Expired?', isTokenExpired(token));
console.log('Time remaining:', getTokenTimeRemaining(token), 'seconds');
```

### Enable Verbose Logging

Token refresh attempts are automatically logged:
```
Access token expired or expiring soon, attempting refresh...
Attempting to refresh access token...
Access token refreshed successfully
Token refreshed successfully before request
```

Check browser console for these messages.

### Check Storage
```javascript
// View tokens in console
console.log('Access:', localStorage.getItem('accessToken'));
console.log('Refresh:', localStorage.getItem('refreshToken'));
console.log('User:', localStorage.getItem('user'));
```

## Common Issues

### Issue: Still getting 401 errors
**Cause**: Backend token might be invalidated
**Solution**: Logout and login again to get fresh tokens

### Issue: Infinite refresh loop
**Solution**: Already prevented - max 1 retry per request

### Issue: Token refresh failing
**Check**:
1. Is backend running? `curl http://localhost:3001/health`
2. Is refresh token valid? Check in browser DevTools → Application → Local Storage
3. Check network tab for refresh endpoint response

### Issue: Not redirecting to login
**Check**: Look for error messages in console
**Fix**: Clear browser cache and localStorage, then refresh page

## Production Checklist

- [ ] Update `VITE_API_URL` to production URL
- [ ] Ensure HTTPS is enabled
- [ ] Consider shorter access token lifetime (15min recommended)
- [ ] Consider longer refresh token lifetime (30 days for better UX)
- [ ] Test token refresh in production environment
- [ ] Monitor refresh endpoint performance
- [ ] Set up error tracking (Sentry, etc.)

## Summary

✅ **Automatic token expiration detection**
✅ **Silent token refresh (seamless UX)**
✅ **Graceful logout with user notification**
✅ **No code changes needed in components**
✅ **TypeScript type safety**
✅ **Production ready**

**Status**: Fully implemented and tested
**Build**: Passing
**Frontend**: Running on http://localhost:3000
**Backend API**: Running on http://localhost:3001

---

For detailed technical documentation, see: `TOKEN_EXPIRATION_HANDLING.md`
