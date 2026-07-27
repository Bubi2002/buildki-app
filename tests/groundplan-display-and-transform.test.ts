import { describe, expect, it } from "vitest";

import { decodeUnicodeEscapes } from "../lib/display-text";
import {
  clampTranslation,
  fitWithinBounds,
  screenPointToNormalized,
} from "../lib/zoom-transform";

describe("groundplan display text", () => {
  it("decodes legacy unicode escapes without changing valid umlauts", () => {
    expect(decodeUnicodeEscapes("Foto \\u2022 27. Juli 2026")).toBe("Foto • 27. Juli 2026");
    expect(decodeUnicodeEscapes("Fotos hinzuf\\u00fcgen")).toBe("Fotos hinzufügen");
    expect(decodeUnicodeEscapes("Markierung l\\u00f6schen")).toBe("Markierung löschen");
    expect(decodeUnicodeEscapes("Grundriss für Außenwände")).toBe("Grundriss für Außenwände");
  });
});

describe("groundplan transforms", () => {
  it("preserves aspect ratio while fitting large plans into a bounded texture", () => {
    expect(fitWithinBounds(6000, 3000, 3072, 3072)).toEqual({ width: 3072, height: 1536 });
    expect(fitWithinBounds(1200, 800, 3072, 3072)).toEqual({ width: 1200, height: 800 });
  });

  it("clamps pan translations to the visible transformed image bounds", () => {
    expect(clampTranslation(500, 300, 2)).toBe(150);
    expect(clampTranslation(-500, 300, 2)).toBe(-150);
    expect(clampTranslation(50, 300, 1)).toBe(0);
  });

  it("maps taps back to normalized plan coordinates after zoom and pan", () => {
    expect(screenPointToNormalized(
      { x: 150, y: 100 },
      { width: 300, height: 200 },
      1,
      { x: 0, y: 0 },
    )).toEqual({ x: 0.5, y: 0.5 });

    expect(screenPointToNormalized(
      { x: 200, y: 100 },
      { width: 300, height: 200 },
      2,
      { x: 50, y: 0 },
    )).toEqual({ x: 0.5, y: 0.5 });
  });
});
