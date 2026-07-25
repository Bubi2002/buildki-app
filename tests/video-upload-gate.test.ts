import { describe, expect, it } from "vitest";

import { getVideoUploadGate } from "../lib/video-upload-gate";

describe("Video upload gate", () => {
  it("blocks while authentication is still loading", () => {
    expect(
      getVideoUploadGate({
        authLoading: true,
        isAuthenticated: false,
        isConnected: false,
      }),
    ).toEqual({
      allowed: false,
      reason: "checking-auth",
      title: "Anmeldung wird geprüft",
      message: "Bitte einen Moment warten.",
    });
  });

  it("requires login before evaluating the offline state", () => {
    const gate = getVideoUploadGate({
      authLoading: false,
      isAuthenticated: false,
      isConnected: false,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("auth-required");
    expect(gate.title).toBe("Anmeldung erforderlich");
    expect(gate.actionLabel).toBe("Anmelden");
  });

  it("blocks authenticated users offline and describes the screen-lifetime selection honestly", () => {
    const gate = getVideoUploadGate({
      authLoading: false,
      isAuthenticated: true,
      isConnected: false,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("offline");
    expect(gate.message).toContain("nur geöffnet");
    expect(gate.message).toContain("auf diesem Bildschirm");
    expect(gate.message).not.toContain("bleiben auf diesem Gerät");
    expect(gate.actionLabel).toBeUndefined();
  });

  it("allows the upload only for authenticated online users", () => {
    expect(
      getVideoUploadGate({
        authLoading: false,
        isAuthenticated: true,
        isConnected: true,
      }),
    ).toEqual({
      allowed: true,
      reason: "ready",
    });
  });
});
