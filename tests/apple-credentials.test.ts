import { describe, expect, it } from "vitest";

describe("Apple credential contract (test environment)", () => {
  it("provides a non-production Apple ID for tests", () => {
    const appleId = process.env.EXPO_APPLE_ID;

    expect(appleId).toBeDefined();
    expect(appleId).toMatch(/^[^@]+@[^@]+\.invalid$/);
  });

  it("provides an app-specific-password-shaped test value", () => {
    const password = process.env.EXPO_APPLE_APP_SPECIFIC_PASSWORD;

    expect(password).toBeDefined();
    expect(password).toMatch(/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/);
  });

  it("provides a test-only Apple team identifier", () => {
    const teamId = process.env.EXPO_APPLE_TEAM_ID;

    expect(teamId).toBeDefined();
    expect(teamId).toMatch(/^[A-Z0-9]{10}$/);
    expect(teamId).toBe("TESTTEAM01");
  });
});
