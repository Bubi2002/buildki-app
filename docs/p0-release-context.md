# P0 Release-Blocker – Kontext & Architektur-Notizen

## Rechtsträger (DEFINITIV)
- **Firma:** immobau-ka GmbH
- **Adresse:** Ringstr. 6, 76228 Karlsruhe
- **Steuernummer:** 34413/61771
- **Finanzamt:** Karlsruhe-Durlach
- Ersetze alle Vorkommen von "Iserloh Projektmanagement GmbH", "Iserloh Bau GmbH", "CI Concepts"

## Aktuelle Auth-Architektur (Befunde)
- `server/_core/sdk.ts`: JWT-basierte Sessions existieren (createSessionToken, signSession, verifySession, authenticateRequest)
- `server/_core/context.ts`: TrpcContext hat user: User | null, authenticateRequest wird aufgerufen
- `server/_core/trpc.ts`: publicProcedure + protectedProcedure + adminProcedure existieren bereits
- `server/routers.ts`: Die meisten Endpunkte nutzen publicProcedure (voice.transcribe, protocol.generate, upload.audio etc.)
- Nur sync-Endpunkte nutzen protectedProcedure
- `lib/_core/auth.ts`: SecureStore für Token, getUserInfo/setUserInfo
- `app/login.tsx`: Fake-Auth – liest @buildki_registered aus AsyncStorage, prüft Passwort NICHT
- `app/register.tsx`: Speichert nur lokal in AsyncStorage, kein Server-User
- `app/verify-email.tsx`: Bei Fehler + "Später bestätigen" wird trotzdem als verifiziert markiert
- `app/forgot-password.tsx`: Speichert neues Passwort in AsyncStorage (Klartext!)

## Server-Auth Existierende Infrastruktur
- JWT signing/verification in sdk.ts (lines 148-209)
- authenticateRequest in sdk.ts (lines 234-291) – resolves Bearer/cookie tokens
- User-Schema in drizzle/schema.ts mit openId
- Manus OAuth als primärer Login-Weg

## Plan: Echte Email/Password Auth
1. bcrypt für Passwort-Hashing (server/auth-local.ts)
2. Neuer tRPC-Router: auth.register, auth.login, auth.logout, auth.refreshToken
3. DB-Schema erweitern: passwordHash, emailVerified, emailVerifyToken, resetToken, resetExpiry
4. JWT-Sessions mit Refresh-Token
5. Auth-Gate in app/_layout.tsx – prüft Session bevor Tabs geladen werden
6. login.tsx/register.tsx komplett auf Server-Calls umstellen

## Preise (DEFINITIV)
- 12,99 € netto/Monat
- 140,00 € netto/Jahr
- zzgl. MwSt.
- 14 Tage kostenloser Test

## API-URL Produktions-Domain
- protokollapp-c7amcxpp.manus.space (deployed)
