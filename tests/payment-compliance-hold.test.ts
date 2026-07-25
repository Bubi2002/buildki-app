import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Payment compliance hold", () => {
  it("offers no local demo subscription, price, or checkout in the app", () => {
    const source = read("app/subscription.tsx");
    expect(source).toContain("Kaufabschluss gesperrt");
    expect(source).toContain("keinen Demo-Kauf");
    expect(source).toContain("StoreKit/In-App Purchase");
    expect(source).not.toContain("createCheckoutSession");
    expect(source).not.toContain("AsyncStorage");
    expect(source).not.toMatch(/12,99|140,00|10,00|100,00/);
  });

  it("fails closed before creating a Stripe checkout session", () => {
    const source = read("server/stripe.ts");
    expect(source).toContain("PAYMENT_PURCHASES_ENABLED = false");
    expect(source).toContain('error: "PAYMENTS_COMPLIANCE_HOLD"');
    expect(source).toContain("if (!PAYMENT_PURCHASES_ENABLED)");
    expect(source.indexOf("if (!PAYMENT_PURCHASES_ENABLED)")).toBeLessThan(
      source.indexOf("const stripe = getStripe();", source.indexOf("create-checkout-session")),
    );
  });

  it("binds Stripe account lookups to the authenticated account email", () => {
    const source = read("server/stripe.ts");
    expect(source).toContain("function authenticatedEmail(req: Request)");
    expect(source).toContain("const email = authenticatedEmail(req)");
    expect(source).not.toContain("const { email } = req.body");
    expect(source).not.toContain("const email = req.query.email as string");
  });

  it("creates new accounts without a silent trial activation", () => {
    const auth = read("server/auth-local.ts");
    const db = read("server/db.ts");
    const register = read("app/register.tsx");
    expect(auth).toContain("trialStartedAt: null");
    expect(db).toContain("trialStartedAt: data.trialStartedAt ?? null");
    expect(register).toContain("Prüfkonto erstellen");
    expect(register).not.toContain("14 Tage kostenlos testen");
    expect(register).not.toContain("Keine Kreditkarte erforderlich");
  });

  it("contains no unsupported price or trial claim in user-facing guidance", () => {
    const combined = [
      read("app/tutorial.tsx"),
      read("app/support-chat.tsx"),
      read("app/verify-email.tsx"),
      read("server/email.ts"),
      read("server/stripe.ts"),
    ].join("\n");
    expect(combined).not.toMatch(/12,99|140,00|10,00 €|100,00 €|14[- ]?(Tage|täg)|trial_period_days/);
    expect(combined).toContain("kein Kauf- oder Demo-Abonnement");
    expect(combined).toContain("Kein Kauf und kein Abonnement");
  });

  it("requires successful email verification before onboarding continues", () => {
    const verifyEmail = read("app/verify-email.tsx");
    expect(verifyEmail).toContain("Ihre E-Mail-Adresse wurde bestätigt");
    expect(verifyEmail).not.toContain("Später bestätigen");
    expect(verifyEmail).not.toContain("handleSkip");
    expect(verifyEmail).not.toContain("Skip (MVP)");
  });
});
