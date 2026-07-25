/**
 * BuildKI – Local Auth Routes (Email/Password)
 *
 * Secure server-side authentication with:
 * - bcrypt password hashing
 * - JWT session tokens (same format as OAuth flow)
 * - Email verification codes
 * - Password reset codes
 */
import { Router, Request, Response } from "express";
import { hashSync, compareSync } from "bcryptjs";
import { randomInt, randomUUID } from "crypto";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { COOKIE_NAME } from "../shared/const";
import * as cookieModule from "cookie";
import * as db from "./db";
import {
  sendEmail,
  getPasswordResetEmail,
  getEmailConfirmationEmail,
  getWelcomeEmail,
} from "./email";
const serializeCookie = (cookieModule as any).serialize || (cookieModule as any).stringifySetCookie;

const router = Router();

const BCRYPT_ROUNDS = 12;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_CODE_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// In-memory stores are process-local. A shared, rate-limited production store remains
// OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN.
const verificationCodes = new Map<string, { code: string; expires: number; name?: string; attempts: number }>();
const resetCodes = new Map<string, { code: string; expires: number; attempts: number }>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function generateCode(): string {
  return randomInt(100000, 1_000_000).toString();
}

function passwordValidationError(password: unknown): string | null {
  if (typeof password !== "string") return "Passwort ist erforderlich";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen lang sein`;
  }
  return null;
}

function getLoginAttemptKey(req: Request, email: string): string {
  return `${req.ip || "unknown"}:${email}`;
}

function isLoginRateLimited(key: string): boolean {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() >= entry.resetAt) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(key: string): void {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now >= current.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  current.count += 1;
  loginAttempts.set(key, current);
}

function setSessionCookie(res: Response, token: string) {
  const cookie = serializeCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
  res.setHeader("Set-Cookie", cookie);
}

export function serializeClearedSessionCookie(isProduction = ENV.isProduction): string {
  return serializeCookie(COOKIE_NAME, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, firstName, lastName, company, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "E-Mail und Passwort sind erforderlich" });
    }

    const passwordError = passwordValidationError(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await db.getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "Ein Konto mit dieser E-Mail existiert bereits" });
    }

    // Hash password
    const passwordHash = hashSync(password, BCRYPT_ROUNDS);

    // Create user with local openId
    const openId = `local_${randomUUID()}`;
    const displayName = name || [firstName, lastName].filter(Boolean).join(" ") || normalizedEmail.split("@")[0];

    await db.createLocalUser({
      openId,
      email: normalizedEmail,
      name: displayName,
      firstName: firstName || null,
      lastName: lastName || null,
      company: company || null,
      phone: phone || null,
      passwordHash,
      loginMethod: "email",
      trialStartedAt: null,
    });

    // Get created user
    const user = await db.getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(500).json({ error: "Benutzer konnte nicht erstellt werden" });
    }

    // Create session token
    const sessionToken = await sdk.createSessionToken(openId, { name: displayName });

    // Set cookie for web
    setSessionCookie(res, sessionToken);

    // Send verification code
    const code = generateCode();
    verificationCodes.set(normalizedEmail, {
      code,
      expires: Date.now() + 30 * 60 * 1000,
      name: displayName,
      attempts: 0,
    });

    const template = getEmailConfirmationEmail(code, displayName);
    await sendEmail({
      to: normalizedEmail,
      subject: template.subject,
      html: template.html,
    }).catch((err) => console.error("[Auth] Failed to send verification email:", err));

    return res.json({
      success: true,
      sessionToken,
      user: {
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        role: user.role,
        emailVerified: user.emailVerified,
        lastSignedIn: user.lastSignedIn?.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Auth] Register error:", error);
    return res.status(500).json({ error: "Registrierung fehlgeschlagen" });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "E-Mail und Passwort sind erforderlich" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const attemptKey = getLoginAttemptKey(req, normalizedEmail);
    if (isLoginRateLimited(attemptKey)) {
      return res.status(429).json({ error: "Zu viele fehlgeschlagene Anmeldeversuche. Bitte später erneut versuchen." });
    }

    const user = await db.getUserByEmail(normalizedEmail);
    if (!user || !user.passwordHash) {
      recordFailedLogin(attemptKey);
      return res.status(401).json({ error: "Ungültige E-Mail oder Passwort" });
    }

    // Verify password
    const valid = compareSync(password, user.passwordHash);
    if (!valid) {
      recordFailedLogin(attemptKey);
      return res.status(401).json({ error: "Ungültige E-Mail oder Passwort" });
    }
    loginAttempts.delete(attemptKey);

    // Update last sign in
    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

    // Create session token
    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || "",
    });

    // Set cookie for web
    setSessionCookie(res, sessionToken);

    return res.json({
      success: true,
      sessionToken,
      user: {
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        role: user.role,
        emailVerified: user.emailVerified,
        lastSignedIn: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Auth] Login error:", error);
    return res.status(500).json({ error: "Anmeldung fehlgeschlagen" });
  }
});

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────
router.post("/api/auth/verify-email", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "E-Mail und Code sind erforderlich" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const stored = verificationCodes.get(normalizedEmail);

    if (!stored) {
      return res.status(404).json({ error: "Kein Bestätigungs-Code für diese E-Mail" });
    }

    if (Date.now() > stored.expires) {
      verificationCodes.delete(normalizedEmail);
      return res.status(410).json({ error: "Code abgelaufen. Bitte fordere einen neuen an." });
    }

    if (stored.code !== code) {
      stored.attempts += 1;
      if (stored.attempts >= MAX_CODE_ATTEMPTS) {
        verificationCodes.delete(normalizedEmail);
        return res.status(429).json({ error: "Zu viele Fehlversuche. Bitte einen neuen Code anfordern." });
      }
      verificationCodes.set(normalizedEmail, stored);
      return res.status(401).json({ error: "Ungültiger Code" });
    }

    // Mark email as verified
    verificationCodes.delete(normalizedEmail);
    await db.updateEmailVerified(normalizedEmail);

    // Send welcome email
    const welcome = getWelcomeEmail(stored.name);
    await sendEmail({
      to: normalizedEmail,
      subject: welcome.subject,
      html: welcome.html,
    }).catch(() => {});

    return res.json({ success: true, message: "E-Mail bestätigt" });
  } catch (error: any) {
    console.error("[Auth] Verify email error:", error);
    return res.status(500).json({ error: "Verifizierung fehlgeschlagen" });
  }
});

// ─── POST /api/auth/request-confirmation ─────────────────────────────────────
router.post("/api/auth/request-confirmation", async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ error: "E-Mail-Adresse ist erforderlich" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const code = generateCode();
    verificationCodes.set(normalizedEmail, {
      code,
      expires: Date.now() + 30 * 60 * 1000,
      name,
      attempts: 0,
    });

    const template = getEmailConfirmationEmail(code, name);
    const sent = await sendEmail({
      to: normalizedEmail,
      subject: template.subject,
      html: template.html,
    });

    if (sent) {
      return res.json({ success: true, message: "Bestätigungs-Code gesendet" });
    } else {
      return res.status(500).json({
        error: "E-Mail konnte nicht gesendet werden",
        ...(process.env.NODE_ENV !== "production" && { devCode: code }),
      });
    }
  } catch (error: any) {
    return res.status(500).json({ error: "Fehler beim Senden" });
  }
});

// ─── POST /api/auth/request-reset ────────────────────────────────────────────
router.post("/api/auth/request-reset", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "E-Mail-Adresse ist erforderlich" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Always return success to prevent email enumeration
    const user = await db.getUserByEmail(normalizedEmail);

    if (user) {
      const code = generateCode();
      resetCodes.set(normalizedEmail, {
        code,
        expires: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      });

      const template = getPasswordResetEmail(code, user.name || undefined);
      await sendEmail({
        to: normalizedEmail,
        subject: template.subject,
        html: template.html,
      }).catch(() => {});
    }

    return res.json({ success: true, message: "Falls ein Konto existiert, wurde ein Reset-Code gesendet" });
  } catch (error: any) {
    return res.status(500).json({ error: "Fehler beim Senden" });
  }
});

// ─── POST /api/auth/verify-reset-code ────────────────────────────────────────
router.post("/api/auth/verify-reset-code", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "E-Mail und Code sind erforderlich" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const stored = resetCodes.get(normalizedEmail);

    if (!stored) {
      return res.status(404).json({ error: "Kein Reset-Code für diese E-Mail" });
    }

    if (Date.now() > stored.expires) {
      resetCodes.delete(normalizedEmail);
      return res.status(410).json({ error: "Code abgelaufen. Bitte fordere einen neuen an." });
    }

    if (stored.code !== code) {
      stored.attempts += 1;
      if (stored.attempts >= MAX_CODE_ATTEMPTS) {
        resetCodes.delete(normalizedEmail);
        return res.status(429).json({ error: "Zu viele Fehlversuche. Bitte einen neuen Reset-Code anfordern." });
      }
      resetCodes.set(normalizedEmail, stored);
      return res.status(401).json({ error: "Ungültiger Code" });
    }

    // Code valid – don't delete yet (needed for reset-password step)
    return res.json({ success: true, message: "Code verifiziert" });
  } catch (error: any) {
    return res.status(500).json({ error: "Verifizierung fehlgeschlagen" });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post("/api/auth/reset-password", async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "E-Mail, Code und neues Passwort sind erforderlich" });
    }

    const passwordError = passwordValidationError(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const stored = resetCodes.get(normalizedEmail);

    if (!stored || stored.code !== code || Date.now() > stored.expires) {
      return res.status(401).json({ error: "Ungültiger oder abgelaufener Reset-Code" });
    }

    // Hash new password and update
    const passwordHash = hashSync(newPassword, BCRYPT_ROUNDS);
    await db.updateUserPassword(normalizedEmail, passwordHash);
    resetCodes.delete(normalizedEmail);

    return res.json({ success: true, message: "Passwort erfolgreich geändert" });
  } catch (error: any) {
    console.error("[Auth] Reset password error:", error);
    return res.status(500).json({ error: "Passwort-Reset fehlgeschlagen" });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get("/api/auth/me", async (req: Request, res: Response) => {
  try {
    const user = await sdk.authenticateRequest(req);
    return res.json({
      user: {
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        role: user.role,
        emailVerified: (user as any).emailVerified ?? false,
        lastSignedIn: user.lastSignedIn?.toISOString(),
        company: (user as any).company,
        phone: (user as any).phone,
        firstName: (user as any).firstName,
        lastName: (user as any).lastName,
        subscriptionStatus: (user as any).subscriptionStatus,
      },
    });
  } catch {
    return res.json({ user: null });
  }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
router.post("/api/auth/logout", (_req: Request, res: Response) => {
  res.setHeader("Set-Cookie", serializeClearedSessionCookie());
  return res.json({ success: true });
});

// ─── POST /api/auth/session (establish cookie from Bearer token) ─────────────
router.post("/api/auth/session", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token = authHeader.slice(7);
    const session = await sdk.verifySession(token);
    if (!session) {
      return res.status(401).json({ error: "Invalid token" });
    }
    setSessionCookie(res, token);
    return res.json({ success: true });
  } catch {
    return res.status(401).json({ error: "Session establishment failed" });
  }
});

export const authLocalRouter = router;
