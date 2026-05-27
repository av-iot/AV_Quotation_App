# API & Data Security Audit Report

## Executive Summary
The system contains **3 CRITICAL** and **2 HIGH** security vulnerabilities that need immediate attention before production deployment.

---

## CRITICAL ISSUES 🔴

### 1. Hardcoded Development Token in Production Code
**File**: `src/app/api/projects/upload/route.ts:322`
**Issue**: `dev_session_token` hardcoded as authentication bypass
```typescript
if (token === "dev_session_token") {
  decoded = { uid: "dev_user", email: "dev@altavision.lk", role: "superadmin" };
}
```
**Impact**: Anyone with the magic string can bypass authentication and upload data
**Fix Required**: 
- Remove hardcoded token completely
- Use environment-variable-based feature flags only if dev mode is truly needed
- Never commit dev tokens to production code

### 2. Hardcoded Superadmin Email Addresses
**File**: `src/app/api/projects/upload/route.ts:351-355`
**Issue**: Superadmin roles assigned to hardcoded emails, including your personal email
```typescript
const isSuperAdminEmail =
  decoded.email === "admin@altavision.lk" ||
  decoded.email === "dev@altavision.lk" ||
  decoded.email === "devopsaltavision@gmail.com" ||
  decoded.email === process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
```
**Impact**: 
- Email addresses are exposed in source code
- Makes user accounts vulnerable if emails are compromised
- Same issue in: `src/app/api/backup/route.ts`, `src/app/api/backup/cleanup/route.ts`

**Fix Required**:
- Move ALL hardcoded emails to `NEXT_PUBLIC_SUPER_ADMIN_EMAILS` environment variable (array)
- Audit all API endpoints that reference these emails

### 3. Sensitive Data Stored in Plain Text
**File**: TOON schema stores:
- WiFi usernames & passwords: `wifi_u`, `wifi_p`
- NIC numbers (national identity): `nic`
- Full customer addresses: `a`
- Customer phone numbers: `ph`
- Inverter serial numbers: `inv_sn`

**Issue**: No encryption at rest; Firestore collection readable by any authenticated user
**Impact**: 
- GDPR/Privacy violations (personal data)
- Credentials exposed if database is compromised
- Service account info leaked

**Fix Required**:
- Encrypt sensitive fields before storage (use `libsodium` or similar)
- Restrict Firestore collection access to superadmin only
- Implement field-level encryption for PII (Personally Identifiable Information)

---

## HIGH PRIORITY ISSUES 🟠

### 4. CSV Parsing Vulnerability - No Quoted Field Handling
**File**: `src/app/api/projects/upload/route.ts:263, 271`
```typescript
const headers = lines[0].split(",").map(h => h.trim());
const row = lines[i].split(",").map(c => c.trim());
```
**Issue**: Simple string.split(",") doesn't handle quoted fields with commas
**Impact**:
- Malformed CSV data stored in database
- Customer addresses like `"123 Main St, Apt 4"` get split into multiple fields
- Data corruption

**Examples from CSV**:
- Row with embedded commas: `"46/2,Youn Mawatha,Yatiyana Rd,Meddawatta, Matara."`
- This creates wrong field mapping and garbage data in database

**Fix Required**:
- Use proper CSV parser library (`papaparse`, `csv-parse`)
- Add CSV format validation before upload

### 5. Missing API Rate Limiting
**Issue**: Upload endpoint has no rate limiting
**Impact**: 
- Denial of Service attack possible
- Large file uploads can crash server
- No protection against brute force or data exfiltration

**Fix Required**:
- Add `rateLimit` middleware (e.g., `express-rate-limit`)
- Limit to: 10 uploads/hour per IP, max 10MB per file
- Implement request size limits in Next.js middleware

---

## MEDIUM PRIORITY ISSUES 🟡

### 6. No Input Validation on CSV Content
**Issue**: No checks on field content before storage
**Examples**:
- Phone numbers stored as-is (no format validation)
- Email addresses not validated
- Numeric fields not type-checked

**Fix Required**:
- Validate data types (phone: must match format, email: valid email, capacity: must be number)
- Reject invalid data with clear error messages

### 7. Insufficient Firestore Security Rules
**Issue**: Need to check current Firestore security rules
**Potential Problems**:
- Collections might be readable by all authenticated users
- No document-level encryption
- No field-level access control

**Fix Required**:
- Implement strict Firestore rules:
  ```
  match /old_project_data/{document=**} {
    allow read: if request.auth != null && 
                   hasRole(request.auth.uid, 'superadmin');
    allow write: if false;  // Disable direct writes
  }
  ```

---

## RECOMMENDATIONS - Priority Order

### IMMEDIATE (This Week)
1. ✅ Remove hardcoded `dev_session_token` 
2. ✅ Move hardcoded emails to environment variables
3. ✅ Fix CSV parsing with proper library
4. ✅ Add Firestore security rules

### SHORT TERM (Next Sprint)
5. ✅ Implement field encryption for sensitive data
6. ✅ Add rate limiting to all upload endpoints
7. ✅ Add input validation for all fields
8. ✅ Implement field-level access control

### LONG TERM
9. ✅ Complete security audit of all /api/*/route.ts files
10. ✅ Add request logging and monitoring
11. ✅ Implement audit trail for sensitive operations
12. ✅ Set up automated security scanning in CI/CD

---

## Files Requiring Security Review

- `src/app/api/projects/upload/route.ts` - CRITICAL
- `src/app/api/backup/route.ts` - HIGH  
- `src/app/api/backup/cleanup/route.ts` - HIGH
- `src/app/api/projects/legacy/route.ts` - MEDIUM
- `src/app/api/services/legacy/route.ts` - MEDIUM
- All other API endpoints

---

## Testing Checklist

- [ ] Verify hardcoded tokens are removed
- [ ] Confirm Firestore rules restrict access properly
- [ ] Test CSV parsing with edge cases (commas, quotes)
- [ ] Verify rate limiting works
- [ ] Run OWASP Top 10 security scan
- [ ] Check for exposed credentials in git history

---

## Next Steps

1. Review and approve this security plan
2. Create tickets for each critical issue
3. Implement fixes before production deployment
4. Run security testing
5. Schedule security training for team

---

## FIXES APPLIED - May 27, 2026

### ✅ CRITICAL FIXES COMPLETED

1. **First-Login Approval Lockdown** (NEW)
   - Created `src/middleware.ts` — server-side Edge-level route guard
   - New users get `approved: false` by default
   - ALL routes blocked for unapproved users (100% data lockdown)
   - Even if they discover API endpoints, middleware returns 401/403
   - Existing users get `approved: true` (backward compatible)

2. **Removed Hardcoded Superadmin Emails**
   - Removed from: `src/app/api/auth/session/route.ts`
   - Now uses `SUPER_ADMIN_EMAILS` env var (server-only, no NEXT_PUBLIC_)
   - Parse as comma-separated list

3. **Protected All Unauthenticated API Routes**
   - ✅ `/api/projects/legacy` — added auth check
   - ✅ `/api/services/legacy` — added auth check
   - ✅ `/api/proxy` — added auth + URL whitelist (FIXED SSRF)
   - ✅ `/api/docs/attachments` — added auth + role check
   - ✅ `/api/docs/legal` — added auth check

4. **Fixed myiot Role Escalation**
   - Added role whitelist validation in `src/lib/firebase-admin.ts`
   - Only valid roles: `engineer`, `site_engineer`, `team_leader`, `technician`
   - Invalid roles default to `engineer`

5. **Improved Cookie Security**
   - Changed `sameSite: "lax"` → `sameSite: "strict"`
   - Added `__user_approved` cookie for middleware checks

6. **Sanitized Error Messages**
   - Replaced `error: err.message` with generic messages
   - Does not leak internal details

### ⚠️ STILL TODO (Lower Priority)

- [ ] Implement admin approval UI in Users page
- [ ] Fix CSV parsing (use proper CSV library)
- [ ] Add rate limiting to auth endpoints
- [ ] Encrypt WiFi credentials at rest
- [ ] Implement Firestore security rules (field-level)
- [ ] Add Content-Security-Policy headers
- [ ] Audit all remaining API routes for error leaks

**Last Updated**: 2026-05-27 (Security fixes applied)
