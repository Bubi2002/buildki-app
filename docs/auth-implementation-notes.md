# Auth Implementation Notes

## Current State
- Registration is AsyncStorage-only (register.tsx stores email/password locally)
- Login checks AsyncStorage first, then falls back to OAuth
- No server-side email/password auth exists
- DB schema has no password_hash, reset_token, or email_verified columns
- Backend uses Manus OAuth (sdk.ts) for real auth
- notifyOwner() exists but no general email sending capability

## Strategy for Password Reset & Email Confirmation
Since the app currently uses a LOCAL-FIRST approach (AsyncStorage for registration),
and the Strato email (info@iserloh.net) is available for sending:

### Password Reset (Local-First Approach):
- Add "Passwort vergessen?" link to login screen
- User enters email → app generates a 6-digit code
- Code is stored in AsyncStorage with expiry (10 min)
- For MVP: Show code in Alert (since no email server yet)
- For Production: Send via Strato SMTP (server endpoint)

### Email Confirmation (Double-Opt-In):
- After registration, show "Bestätigungs-E-Mail gesendet" screen
- For MVP: Auto-confirm (skip email verification)
- For Production: Server sends email via Strato SMTP with confirmation link

### Strato SMTP Config (for production):
- Host: smtp.strato.de
- Port: 465 (SSL) or 587 (STARTTLS)
- User: info@iserloh.net
- Pass: Jeanpierre190+

## Implementation Plan
1. Add password-reset screen (forgot-password.tsx)
2. Add server endpoint for sending reset email via Strato SMTP
3. Add email confirmation screen (verify-email.tsx)
4. Add server endpoint for sending confirmation email
5. Update DB schema with verification tokens (optional for MVP)
