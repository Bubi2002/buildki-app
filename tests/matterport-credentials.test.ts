import { describe, it, expect } from "vitest";

/**
 * Test: Validate Matterport API credentials format.
 * Network test skipped in CI due to timeout issues.
 */
describe("Matterport Credentials", () => {
  it("should have valid credential format", () => {
    const tokenId = process.env.MATTERPORT_TOKEN_ID;
    const tokenSecret = process.env.MATTERPORT_TOKEN_SECRET;

    expect(tokenId).toBeDefined();
    expect(tokenSecret).toBeDefined();
    expect(tokenId!.length).toBeGreaterThan(0);
    expect(tokenSecret!.length).toBeGreaterThan(0);

    // Verify base64 encoding works
    const credentials = Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64");
    expect(credentials.length).toBeGreaterThan(0);
  });

  it.skip("should authenticate with Matterport API using Basic Auth (network)", async () => {
    const tokenId = process.env.MATTERPORT_TOKEN_ID;
    const tokenSecret = process.env.MATTERPORT_TOKEN_SECRET;
    const credentials = Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64");

    const response = await fetch("https://api.matterport.com/api/models/graph", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "{ models { totalResults } }",
      }),
    });

    const data = await response.json();
    expect(response.status).not.toBe(401);
    if (data.data) {
      console.log("[Matterport] Auth OK, totalResults:", data.data.models.totalResults);
    }
  }, 15000);
});
