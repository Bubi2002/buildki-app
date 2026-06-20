import { describe, it, expect } from "vitest";

describe("Dropbox Credentials", () => {
  it("should have DROPBOX_APP_KEY set", () => {
    const key = process.env.DROPBOX_APP_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(5);
  });

  it("should have DROPBOX_APP_SECRET set", () => {
    const secret = process.env.DROPBOX_APP_SECRET;
    expect(secret).toBeDefined();
    expect(secret!.length).toBeGreaterThan(5);
  });

  it("DROPBOX_APP_KEY should match expected format (alphanumeric)", () => {
    const key = process.env.DROPBOX_APP_KEY!;
    expect(key).toMatch(/^[a-z0-9]+$/);
  });

  it("DROPBOX_APP_SECRET should match expected format (alphanumeric)", () => {
    const secret = process.env.DROPBOX_APP_SECRET!;
    expect(secret).toMatch(/^[a-z0-9]+$/);
  });
});
