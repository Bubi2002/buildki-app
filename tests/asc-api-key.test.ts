import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

describe("App Store Connect API Key Configuration", () => {
  it("should have ASC_API_KEY_ISSUER_ID set", () => {
    const issuerId = process.env.ASC_API_KEY_ISSUER_ID;
    expect(issuerId).toBeDefined();
    expect(issuerId).toBe("399f93d6-934a-4c82-bc2f-3b2e7ccb3da8");
  });

  it("should have ASC_API_KEY_ID set", () => {
    const keyId = process.env.ASC_API_KEY_ID;
    expect(keyId).toBeDefined();
    expect(keyId).toBe("3K2KU8YZXY");
  });

  it("should have the .p8 key file present", () => {
    const p8Path = resolve(__dirname, "../AuthKey_3K2KU8YZXY.p8");
    expect(existsSync(p8Path)).toBe(true);
    const content = readFileSync(p8Path, "utf-8");
    expect(content).toContain("-----BEGIN PRIVATE KEY-----");
    expect(content).toContain("-----END PRIVATE KEY-----");
  });

  it("eas.json should reference the API key for testflight submit", () => {
    const easPath = resolve(__dirname, "../eas.json");
    const eas = JSON.parse(readFileSync(easPath, "utf-8"));
    expect(eas.submit.testflight.ios.ascApiKeyId).toBe("3K2KU8YZXY");
    expect(eas.submit.testflight.ios.ascApiKeyIssuerId).toBe("399f93d6-934a-4c82-bc2f-3b2e7ccb3da8");
    expect(eas.submit.testflight.ios.ascApiKeyPath).toBe("./AuthKey_3K2KU8YZXY.p8");
  });
});
