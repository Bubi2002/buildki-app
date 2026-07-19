/**
 * ProtoKI – Auth E-Mail Routes
 * Server-Endpunkte für Passwort-Reset und E-Mail-Bestätigung
 */
import { Router, Request, Response } from "express";
import { sendEmail, getPasswordResetEmail, getEmailConfirmationEmail, getWelcomeEmail } from "./email";

const router = Router();

// In-Memory Store für Codes (in Produktion: Redis oder DB)
const resetCodes = new Map<string, { code: string; expires: number; name?: string }>();
const confirmCodes = new Map<string, { code: string; expires: number; name?: string }>();

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Passwort-Reset anfordern ────────────────────────────────────────────────
router.post("/api/auth/request-reset", async (req: Request, res: Response) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: "E-Mail-Adresse ist erforderlich" });
  }

  const code = generateCode();
  resetCodes.set(email.toLowerCase(), {
    code,
    expires: Date.now() + 10 * 60 * 1000, // 10 Minuten
    name,
  });

  const template = getPasswordResetEmail(code, name);
  const sent = await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });

  if (sent) {
    return res.json({ success: true, message: "Reset-Code gesendet" });
  } else {
    // Fallback: Code trotzdem speichern, aber Fehler melden
    return res.status(500).json({ 
      error: "E-Mail konnte nicht gesendet werden",
      // Im Dev-Modus den Code zurückgeben (für Tests)
      ...(process.env.NODE_ENV !== "production" && { devCode: code }),
    });
  }
});

// ─── Reset-Code verifizieren ─────────────────────────────────────────────────
router.post("/api/auth/verify-reset-code", async (req: Request, res: Response) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: "E-Mail und Code sind erforderlich" });
  }

  const stored = resetCodes.get(email.toLowerCase());
  if (!stored) {
    return res.status(404).json({ error: "Kein Reset-Code für diese E-Mail" });
  }

  if (Date.now() > stored.expires) {
    resetCodes.delete(email.toLowerCase());
    return res.status(410).json({ error: "Code abgelaufen. Bitte fordere einen neuen an." });
  }

  if (stored.code !== code) {
    return res.status(401).json({ error: "Ungültiger Code" });
  }

  // Code ist gültig – löschen und Erfolg melden
  resetCodes.delete(email.toLowerCase());
  return res.json({ success: true, message: "Code verifiziert" });
});

// ─── E-Mail-Bestätigung anfordern ────────────────────────────────────────────
router.post("/api/auth/request-confirmation", async (req: Request, res: Response) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: "E-Mail-Adresse ist erforderlich" });
  }

  const code = generateCode();
  confirmCodes.set(email.toLowerCase(), {
    code,
    expires: Date.now() + 30 * 60 * 1000, // 30 Minuten
    name,
  });

  const template = getEmailConfirmationEmail(code, name);
  const sent = await sendEmail({
    to: email,
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
});

// ─── E-Mail-Bestätigung verifizieren ─────────────────────────────────────────
router.post("/api/auth/verify-email", async (req: Request, res: Response) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: "E-Mail und Code sind erforderlich" });
  }

  const stored = confirmCodes.get(email.toLowerCase());
  if (!stored) {
    return res.status(404).json({ error: "Kein Bestätigungs-Code für diese E-Mail" });
  }

  if (Date.now() > stored.expires) {
    confirmCodes.delete(email.toLowerCase());
    return res.status(410).json({ error: "Code abgelaufen. Bitte fordere einen neuen an." });
  }

  if (stored.code !== code) {
    return res.status(401).json({ error: "Ungültiger Code" });
  }

  // Code ist gültig
  confirmCodes.delete(email.toLowerCase());

  // Willkommens-E-Mail senden
  const welcome = getWelcomeEmail(stored.name);
  await sendEmail({
    to: email,
    subject: welcome.subject,
    html: welcome.html,
  });

  return res.json({ success: true, message: "E-Mail bestätigt" });
});

export const authEmailRouter = router;
