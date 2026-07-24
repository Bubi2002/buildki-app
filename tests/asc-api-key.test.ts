import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const fixturePath = resolve(__dirname, "fixtures/AuthKey_TESTKEY001.p8");

describe("App Store Connect credential contract (test environment)", () => {
  it("provides test-only issuer and key identifiers", () => {
    expect(process.env.ASC_API_KEY_ISSUER_ID).toBe(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(process.env.ASC_API_KEY_ID).toBe("TESTKEY001");
  });

  it("uses a harmless private-key-shaped fixture", () => {
    expect(existsSync(fixturePath)).toBe(true);

    const content = readFileSync(fixturePath, "utf-8");
    expect(content).toContain("-----BEGIN PRIVATE KEY-----");
    expect(content).toContain("TEST-FIXTURE-NOT-A-REAL-PRIVATE-KEY");
    expect(content).toContain("-----END PRIVATE KEY-----");
  });

  it("keeps the TestFlight submit configuration structurally complete", () => {
    const easPath = resolve(__dirname, "../eas.json");
    const eas = JSON.parse(readFileSync(easPath, "utf-8"));
    const iosSubmit = eas.submit?.testflight?.ios;

    expect(iosSubmit).toBeDefined();
    expect(iosSubmit.ascApiKeyId).toMatch(/^[A-Z0-9]+$/);
    expect(iosSubmit.ascApiKeyIssuerId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(iosSubmit.ascApiKeyPath).toMatch(/\.p8$/);
  });
});
