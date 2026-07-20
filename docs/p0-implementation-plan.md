# P0 Implementation Plan – Detailed Technical Notes

## Legal Entity Data (for Impressum/Datenschutz/AGB)
- **Firma:** immobau-ka GmbH
- **Sitz:** Karlsruhe
- **Adresse:** Ringstraße 6, 76228 Karlsruhe
- **Geschäftsführer:** Dipl. Ing. (FH) Jörg Iserloh
- **Registergericht:** Amtsgericht Mannheim
- **HRB:** 00AR 2111/19 (aus Handelsregisteranmeldung – OCR-bedingt unscharf, ggf. "HRB 724211" prüfen)
- **Steuernummer:** 34413/61771, Finanzamt Karlsruhe-Durlach
- **IBAN:** DE19 6605 0101 0108 2934 40
- **BIC:** KARSDE66XXX
- **Bank:** Sparkasse Karlsruhe

## Phase 2: Server-Side Auth Implementation

### Schema Extension (drizzle/schema.ts)
Add to `users` table:
- `passwordHash` varchar(255) nullable
- `emailVerified` boolean default false
- `emailVerifyToken` varchar(64) nullable
- `emailVerifyExpiry` timestamp nullable
- `resetToken` varchar(64) nullable
- `resetExpiry` timestamp nullable
- `stripeCustomerId` varchar(64) nullable
- `subscriptionStatus` varchar(32) nullable
- `phone` varchar(32) nullable
- `company` varchar(255) nullable
- `firstName` varchar(128) nullable
- `lastName` varchar(128) nullable
- `trialStartedAt` timestamp nullable

### New File: server/auth-local.ts
Express routes for local email/password auth:
- POST /api/auth/register: validate email+password, bcrypt hash, create user with openId=`local_${uuid}`, create JWT session, return token+user
- POST /api/auth/login: find user by email, bcrypt compare, create JWT session, return token+user
- POST /api/auth/reset-password: verify resetToken from DB, update passwordHash
- GET /api/auth/me: already exists in oauth.ts – reuse

### Key Technical Details
- sdk.ts `createSessionToken(openId, {name, expiresInMs})` creates JWT signed with ENV.cookieSecret
- sdk.ts `verifySession(token)` verifies JWT and returns {openId, appId, name}
- sdk.ts `authenticateRequest(req)` extracts token from Bearer or cookie, verifies, looks up user by openId
- For local auth users, openId will be `local_${crypto.randomUUID()}`
- Session token format is same JWT regardless of login method
- protectedProcedure checks ctx.user (set by createContext → sdk.authenticateRequest)

### DB Helper Extensions (server/db.ts)
- `getUserByEmail(email)`: SELECT from users WHERE email = ?
- `createLocalUser(data)`: INSERT with passwordHash, emailVerified etc.
- `updateUserPassword(userId, hash)`: UPDATE passwordHash
- `updateEmailVerified(userId)`: UPDATE emailVerified = true
- `updateResetToken(userId, token, expiry)`: UPDATE resetToken, resetExpiry

### Client Changes
- app/login.tsx: Replace AsyncStorage lookup with POST /api/auth/login, store token via Auth.setSessionToken
- app/register.tsx: Replace AsyncStorage write with POST /api/auth/register, store token
- hooks/use-auth.ts: On native, also call /api/auth/me to validate token (not just trust cached)

## Phase 4: Protect Endpoints
Change `publicProcedure` to `protectedProcedure` for:
- voice.transcribe
- protocol.generate, protocol.extractTodos
- upload.audio
- speaker.identify
- email.sendActionItems
- notification.sendTaskNotification
- streaming.transcribeChunk
- translate.translateProtocol
- agenda.generateSuggestions
- detectDocumentType
- support.chat
- matterport.* (all endpoints)
- analysis.* (all endpoints)
- assistant.analyzeProtocol

Keep as publicProcedure:
- health

## Phase 5: Stripe Security
- Move webhook route BEFORE express.json() with express.raw() for signature verification
- Add auth to checkout/portal routes (require valid session)
- Remove demo fallback (lines 184-191 in stripe.ts that return active:true when no key)
- Persist subscription status to DB (users.subscriptionStatus + users.stripeCustomerId)

## Phase 6: Matterport
- Remove client-side credential storage from lib/matterport-service.ts
- Matterport credentials only on server (ENV.matterportTokenId/Secret)
- Client calls server endpoints which use server-side credentials

## Phase 7: Legal Texts
- Update /datenschutz route in server/_core/index.ts with immobau-ka GmbH data
- Add /impressum route
- Add /agb route
- Update any in-app legal screens

## Existing Infrastructure to Reuse
- `sdk.createSessionToken(openId, {name})` → creates JWT
- `sdk.verifySession(token)` → verifies JWT
- `sdk.authenticateRequest(req)` → full auth flow (Bearer or cookie)
- `createContext` in context.ts → sets ctx.user for tRPC
- `protectedProcedure` in trpc.ts → throws UNAUTHORIZED if !ctx.user
- `Auth.setSessionToken(token)` / `Auth.getSessionToken()` → SecureStore on native
- `Auth.setUserInfo(user)` / `Auth.getUserInfo()` → cached user data
- `apiCall(endpoint, options)` → auto-adds Bearer token on native, credentials:include on web
