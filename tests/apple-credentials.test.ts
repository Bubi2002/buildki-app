import { describe, it, expect } from "vitest";

describe("Apple Developer Credentials", () => {
  it("should have EXPO_APPLE_ID set", () => {
    const appleId = process.env.EXPO_APPLE_ID;
    expect(appleId).toBeDefined();
    expect(appleId).toContain("@");
    expect(appleId).toBe("info@iserloh.net");
  });

  it("should have EXPO_APPLE_APP_SPECIFIC_PASSWORD set", () => {
    const password = process.env.EXPO_APPLE_APP_SPECIFIC_PASSWORD;
    expect(password).toBeDefined();
    expect(password!.length).toBeGreaterThan(10);
    // App-specific passwords have format xxxx-xxxx-xxxx-xxxx
    expect(password).toMatch(/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/);
  });

  it("should have EXPO_APPLE_TEAM_ID set", () => {
    const teamId = process.env.EXPO_APPLE_TEAM_ID;
    expect(teamId).toBeDefined();
    expect(teamId).toBe("TLHL2MRJB4");
  });
});
