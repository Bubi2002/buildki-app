import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";

const projectRoot = resolve(__dirname, "..");
const fixturePath = resolve(__dirname, "fixtures/AuthKey_TESTKEY001.p8");

describe("App Store Connect credential contract", () => {
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

  it("keeps EAS submit profiles free of repository credential paths", () => {
    const easPath = resolve(projectRoot, "eas.json");
    const eas = JSON.parse(readFileSync(easPath, "utf-8"));

    for (const profile of ["testflight", "production"] as const) {
      const iosSubmit = eas.submit?.[profile]?.ios;
      expect(iosSubmit).toBeDefined();
      expect(iosSubmit.ascAppId).toMatch(/^\d+$/);
      expect(iosSubmit.ascApiKeyPath).toBeUndefined();
      expect(iosSubmit.ascApiKeyId).toBeUndefined();
      expect(iosSubmit.ascApiKeyIssuerId).toBeUndefined();
    }
  });

  it("ignores production p8 files while allowing test fixtures", () => {
    const rootP8Files = readdirSync(projectRoot).filter((name) => name.endsWith(".p8"));
    expect(rootP8Files).toEqual([]);

    const gitignore = readFileSync(resolve(projectRoot, ".gitignore"), "utf-8");
    expect(gitignore).toMatch(/^\*\.p8$/m);
    expect(gitignore).toMatch(/^!tests\/fixtures\/\*\.p8$/m);
  });
});
