/**
 * BuildKI – E-Mail Service
 * Sendet E-Mails über Strato SMTP (info@iserloh.net)
 * Verwendet für: Passwort-Reset, E-Mail-Bestätigung, Benachrichtigungen
 */
import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

// SMTP Transporter (Strato)
const createTransporter = () => {
  return nodemailer.createTransport({
    host: ENV.smtpHost,
    port: Number(ENV.smtpPort),
    secure: true, // SSL
    auth: {
      user: ENV.smtpUser,
      pass: ENV.smtpPass,
    },
  });
};

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const transporter = createTransporter();
    
    await transporter.sendMail({
      from: `"BuildKI" <${ENV.smtpUser || "info@iserloh.net"}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ""),
    });
    
    return true;
  } catch (error) {
    console.error("[Email] Fehler beim Senden:", error);
    return false;
  }
}

// ─── E-Mail Templates ───────────────────────────────────────────────────────

export function getPasswordResetEmail(code: string, name?: string): { subject: string; html: string } {
  return {
    subject: "BuildKI – Passwort zurücksetzen",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #0B1622; color: #F0F4F8;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #5DADE2; font-size: 28px; margin: 0;">BuildKI</h1>
        </div>
        <div style="background: #132238; padding: 32px; border: 1px solid #1E3A5F;">
          <h2 style="color: #F0F4F8; margin-top: 0;">Passwort zurücksetzen</h2>
          <p style="color: #A0AEC0; line-height: 1.6;">
            ${name ? `Hallo ${name},` : "Hallo,"}
          </p>
          <p style="color: #A0AEC0; line-height: 1.6;">
            Du hast angefordert, dein Passwort zurückzusetzen. Verwende den folgenden Code:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #5DADE2; background: #0B1622; padding: 16px 32px; border: 2px solid #5DADE2;">
              ${code}
            </span>
          </div>
          <p style="color: #A0AEC0; line-height: 1.6;">
            Dieser Code ist <strong style="color: #F0F4F8;">10 Minuten</strong> gültig.
          </p>
          <p style="color: #718096; font-size: 13px; margin-top: 24px;">
            Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.
          </p>
        </div>
        <p style="color: #4A5568; font-size: 12px; text-align: center; margin-top: 24px;">
          © ${new Date().getFullYear()} BuildKI – Digitale Bauprotokolle
        </p>
      </div>
    `,
  };
}

export function getEmailConfirmationEmail(code: string, name?: string): { subject: string; html: string } {
  return {
    subject: "BuildKI – E-Mail-Adresse bestätigen",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #0B1622; color: #F0F4F8;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #5DADE2; font-size: 28px; margin: 0;">BuildKI</h1>
        </div>
        <div style="background: #132238; padding: 32px; border: 1px solid #1E3A5F;">
          <h2 style="color: #F0F4F8; margin-top: 0;">E-Mail bestätigen</h2>
          <p style="color: #A0AEC0; line-height: 1.6;">
            ${name ? `Hallo ${name},` : "Willkommen bei BuildKI!"}
          </p>
          <p style="color: #A0AEC0; line-height: 1.6;">
            Bitte bestätige deine E-Mail-Adresse mit dem folgenden Code:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #5DADE2; background: #0B1622; padding: 16px 32px; border: 2px solid #5DADE2;">
              ${code}
            </span>
          </div>
          <p style="color: #A0AEC0; line-height: 1.6;">
            Dieser Code ist <strong style="color: #F0F4F8;">30 Minuten</strong> gültig.
          </p>
          <p style="color: #A0AEC0; line-height: 1.6; margin-top: 24px;">
            Nach der Bestätigung steht dir dein <strong style="color: #5DADE2;">nicht veröffentlichungsfähiges BuildKI-Prüfkonto</strong> zur Verfügung.
          </p>
        </div>
        <p style="color: #4A5568; font-size: 12px; text-align: center; margin-top: 24px;">
          © ${new Date().getFullYear()} BuildKI – Digitale Bauprotokolle
        </p>
      </div>
    `,
  };
}

export function getWelcomeEmail(name?: string): { subject: string; html: string } {
  return {
    subject: "Willkommen bei BuildKI – Prüfkonto bestätigt",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #0B1622; color: #F0F4F8;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #5DADE2; font-size: 28px; margin: 0;">BuildKI</h1>
        </div>
        <div style="background: #132238; padding: 32px; border: 1px solid #1E3A5F;">
          <h2 style="color: #F0F4F8; margin-top: 0;">Willkommen bei BuildKI! 🎉</h2>
          <p style="color: #A0AEC0; line-height: 1.6;">
            ${name ? `Hallo ${name},` : "Hallo,"}
          </p>
          <p style="color: #A0AEC0; line-height: 1.6;">
            Dein BuildKI-Prüfkonto wurde bestätigt. Dieser Compliance-Entwurf ist nicht für eine Veröffentlichung oder einen produktiven Vertragsabschluss bestimmt.
          </p>
          <ul style="color: #A0AEC0; line-height: 2;">
            <li>KI-gestützte Video-Protokolle</li>
            <li>Automatische Mängelerkennung</li>
            <li>PDF-Export mit Firmenstempel</li>
            <li>Unbegrenzte Projekte</li>
          </ul>
          <p style="color: #A0AEC0; line-height: 1.6; margin-top: 16px;">
            <strong style="color: #F0F4F8;">Kein Kauf und kein Abonnement.</strong> Tarife und Zahlungsarchitektur sind vor Veröffentlichung verbindlich festzulegen.
          </p>
        </div>
        <p style="color: #4A5568; font-size: 12px; text-align: center; margin-top: 24px;">
          © ${new Date().getFullYear()} BuildKI – Digitale Bauprotokolle
        </p>
      </div>
    `,
  };
}
