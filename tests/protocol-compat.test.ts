import { describe, expect, it } from "vitest";

import {
  ensureProtocolTextFields,
  getProtocolPreview,
  getProtocolSearchText,
  getProtocolText,
} from "../lib/protocol-compat";

describe("Protocol compatibility", () => {
  it("uses the generated protocol text when it exists", () => {
    expect(
      getProtocolText({ protocol: "  Fertiges Protokoll  ", transcription: "Rohtext" }),
    ).toBe("Fertiges Protokoll");
  });

  it("falls back to the transcription for legacy video protocols", () => {
    const legacyVideoProtocol = {
      id: "video-1",
      title: "Baustellenrundgang",
      transcription: "Die Fassade wird am Montag geprüft.",
      protocolNumber: undefined,
    };

    expect(getProtocolText(legacyVideoProtocol)).toBe(
      "Die Fassade wird am Montag geprüft.",
    );
    expect(getProtocolPreview(legacyVideoProtocol, 18)).toBe("Die Fassade wird a");
  });

  it("returns a readable empty-state text instead of calling substring on undefined", () => {
    expect(getProtocolPreview({}, 120)).toBe(
      "Noch kein Protokollinhalt vorhanden.",
    );
  });

  it("normalizes missing text fields before records reach the UI", () => {
    expect(
      ensureProtocolTextFields({ id: "legacy", title: "Altprotokoll" }),
    ).toEqual({
      id: "legacy",
      title: "Altprotokoll",
      transcription: "",
      protocol: "Noch kein Protokollinhalt vorhanden.",
    });
  });

  it("keeps protocol text, transcription and number searchable when present", () => {
    const searchText = getProtocolSearchText({
      title: "Jour fixe",
      protocolNumber: "JF-0042",
      protocol: "Beschluss zur Fassade",
      transcription: "Termin mit Rohbauer",
    });

    expect(searchText).toContain("jour fixe");
    expect(searchText).toContain("jf-0042");
    expect(searchText).toContain("fassade");
    expect(searchText).toContain("rohbau");
  });
});
