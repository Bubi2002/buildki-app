import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Security compliance hardening", () => {
  it("does not collect or persist Matterport API tokens on the client", () => {
    const screen = read("app/matterport.tsx");
    const viewer = read("app/matterport-viewer.tsx");
    expect(screen).not.toContain("setTokenSecret");
    expect(screen).not.toContain("setTokenId");
    expect(screen).not.toContain("secureTextEntry");
    expect(screen).toContain('AsyncStorage.removeItem("matterport_credentials")');
    expect(screen).toContain("ausschließlich als serverseitige Secrets");
    expect(viewer).not.toContain("setCredentials");
    expect(viewer).not.toContain("const MATTERPORT_CREDENTIALS_KEY");
    expect(viewer).toContain('AsyncStorage.removeItem("matterport_credentials")');
    expect(fs.existsSync(path.join(root, "lib/matterport-service.ts"))).toBe(false);
  });

  it("protects every Matterport endpoint with cloud consent and a contractual release hold", () => {
    const source = read("server/routers.ts");
    const policy = read("shared/matterport-compliance.ts");
    const screen = read("app/matterport.tsx");
    const viewer = read("app/matterport-viewer.tsx");
    const block = source.slice(source.indexOf("matterport: router({"), source.indexOf("// ─── KI-Analyse"));

    expect(source).toContain("const matterportProcedure = cloudProcedure.use");
    expect(source).toContain("if (!MATTERPORT_RELEASE_ALLOWED)");
    expect(policy).toContain("MATTERPORT_RELEASE_ALLOWED = false");
    expect(policy).toContain("MATTERPORT_LICENSE_CLEARANCE_REQUIRED");
    expect(policy).toContain("OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN");
    expect(screen).toContain("if (!MATTERPORT_RELEASE_ALLOWED)");
    expect(viewer).toContain("enabled: MATTERPORT_RELEASE_ALLOWED");
    expect(viewer).toContain("if (!MATTERPORT_RELEASE_ALLOWED)");
    expect(block).not.toContain("protectedProcedure");
    expect(block).not.toContain(": cloudProcedure");
    for (const endpoint of [
      "connect",
      "listModels",
      "getModel",
      "getModelBasic",
      "getFloors",
      "getRooms",
      "getSweeps",
      "getMatterTags",
      "getSdkKey",
    ]) {
      expect(block).toContain(`${endpoint}: matterportProcedure`);
    }
  });

  it("uses cryptographically secure six-digit codes and limits guessing", () => {
    const source = read("server/auth-local.ts");
    expect(source).toContain('import { randomInt, randomUUID } from "crypto"');
    expect(source).toContain("randomInt(100000, 1_000_000)");
    expect(source).not.toContain("Math.random() * 900000");
    expect(source).toContain("MAX_CODE_ATTEMPTS = 5");
    expect(source).toContain("stored.attempts += 1");
    expect(source).toContain("verificationCodes.delete(normalizedEmail)");
    expect(source).toContain("resetCodes.delete(normalizedEmail)");
  });

  it("limits password-login guessing and avoids year-long web sessions", () => {
    const source = read("server/auth-local.ts");
    expect(source).toContain("MAX_LOGIN_ATTEMPTS = 10");
    expect(source).toContain("LOGIN_WINDOW_MS = 15 * 60 * 1000");
    expect(source).toContain("recordFailedLogin(attemptKey)");
    expect(source).toContain("SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(source).not.toContain("ONE_YEAR_MS");
  });

  it("enforces and communicates twelve-character passwords consistently", () => {
    const server = read("server/auth-local.ts");
    const register = read("app/register.tsx");
    const reset = read("app/forgot-password.tsx");
    expect(server).toContain("MIN_PASSWORD_LENGTH = 12");
    expect(server).toContain("MAX_PASSWORD_LENGTH = 128");
    expect(register).toContain("password.length < 12");
    expect(register).toContain("Mindestens 12 Zeichen");
    expect(reset).toContain("newPassword.length < 12");
    expect(reset).toContain("mindestens 12 Zeichen");
  });

  it("removes legacy sensitive stores during account deletion", () => {
    const source = read("lib/data-rights.ts");
    expect(source).toContain('SecureStore.deleteItemAsync("dropbox_tokens")');
    expect(source).toContain('SecureStore.deleteItemAsync("matterport_credentials")');
    expect(source).toContain("removeSessionToken()");
    expect(source).toContain("clearSession()");
  });
});
