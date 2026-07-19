import { describe, it, expect } from "vitest";

/**
 * Test: Validate MATTERPORT_SDK_KEY is set and has valid format.
 * SDK keys are client-side keys used in the Showcase embed URL.
 * They cannot be validated via API call - they are validated when the viewer loads.
 * We verify the key exists and has a reasonable format.
 */
describe("Matterport SDK Key", () => {
  it("should have MATTERPORT_SDK_KEY configured", () => {
    const sdkKey = process.env.MATTERPORT_SDK_KEY;
    expect(sdkKey).toBeDefined();
    expect(sdkKey!.length).toBeGreaterThan(0);
    // SDK keys are typically alphanumeric strings
    expect(sdkKey!.trim()).toBe(sdkKey);
    console.log("[Matterport] SDK Key configured, length:", sdkKey!.length);
  });

  it("should have all three Matterport credentials configured", () => {
    const tokenId = process.env.MATTERPORT_TOKEN_ID;
    const tokenSecret = process.env.MATTERPORT_TOKEN_SECRET;
    const sdkKey = process.env.MATTERPORT_SDK_KEY;

    expect(tokenId).toBeDefined();
    expect(tokenSecret).toBeDefined();
    expect(sdkKey).toBeDefined();

    expect(tokenId!.length).toBeGreaterThan(0);
    expect(tokenSecret!.length).toBeGreaterThan(0);
    expect(sdkKey!.length).toBeGreaterThan(0);

    console.log("[Matterport] All 3 credentials present:");
    console.log("  - TOKEN_ID:", tokenId!.substring(0, 4) + "...");
    console.log("  - TOKEN_SECRET: ****");
    console.log("  - SDK_KEY:", sdkKey!.substring(0, 4) + "...");
  });
});
