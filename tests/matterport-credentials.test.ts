import { describe, expect, it } from "vitest";

import {
  MATTERPORT_RELEASE_ALLOWED,
  MATTERPORT_RELEASE_HOLD_CODE,
  MATTERPORT_RELEASE_HOLD_MESSAGE,
} from "../shared/matterport-compliance";

describe("Matterport credential and release policy", () => {
  it("uses non-empty test credentials without exposing them", () => {
    const tokenId = process.env.MATTERPORT_TOKEN_ID;
    const tokenSecret = process.env.MATTERPORT_TOKEN_SECRET;

    expect(tokenId).toBeDefined();
    expect(tokenSecret).toBeDefined();
    expect(tokenId).not.toBe("");
    expect(tokenSecret).not.toBe("");

    const credentials = Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64");
    expect(credentials).not.toContain(tokenId!);
    expect(credentials).not.toContain(tokenSecret!);
  });

  it("keeps all live Matterport access fail-closed until commercial clearance", () => {
    expect(MATTERPORT_RELEASE_ALLOWED).toBe(false);
    expect(MATTERPORT_RELEASE_HOLD_CODE).toBe(
      "MATTERPORT_LICENSE_CLEARANCE_REQUIRED",
    );
    expect(MATTERPORT_RELEASE_HOLD_MESSAGE).toContain(
      "OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN",
    );
  });
});
