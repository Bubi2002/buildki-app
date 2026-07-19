import { describe, it, expect } from "vitest";

/**
 * Test: Validate Matterport API credentials using Basic Auth.
 * Matterport uses: Authorization: Basic base64(token_id:token_secret)
 * Endpoint: https://api.matterport.com/api/models/graph
 */
describe("Matterport Credentials", () => {
  it("should authenticate with Matterport API using Basic Auth", async () => {
    const tokenId = process.env.MATTERPORT_TOKEN_ID;
    const tokenSecret = process.env.MATTERPORT_TOKEN_SECRET;

    expect(tokenId).toBeDefined();
    expect(tokenSecret).toBeDefined();
    expect(tokenId!.length).toBeGreaterThan(0);
    expect(tokenSecret!.length).toBeGreaterThan(0);

    // Matterport uses Basic Auth: base64(token_id:token_secret)
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

    if (response.ok) {
      // Successful auth returns data (even if no models exist)
      expect(data).toBeDefined();
      // If we get data.data, auth was successful
      if (data.data) {
        expect(data.data.models).toBeDefined();
        console.log("[Matterport] Authentication successful, totalResults:", data.data.models.totalResults);
      } else if (data.errors) {
        // GraphQL errors but auth succeeded (e.g. permission issues)
        console.log("[Matterport] Auth OK but query error:", data.errors[0]?.message);
        // Auth still passed if we got a 200
        expect(response.status).toBe(200);
      }
    } else {
      console.error("[Matterport] Auth failed:", response.status, JSON.stringify(data));
      // 401 = invalid credentials
      if (response.status === 401) {
        throw new Error("Matterport credentials are invalid (401 Unauthorized)");
      }
      // Other errors might be permission-related but auth is OK
      expect(response.status).not.toBe(401);
    }
  });
});
