import { describe, it, expect } from "vitest";
import { 
  GEWERKE_NUMBERED, 
  getGewerkNummer, 
  getGeschossNummer, 
  parsePositionCode, 
  formatPositionCode,
  getGewerkByNummer 
} from "../lib/position-numbering";

describe("Position Numbering (Schema 1.1.1)", () => {
  it("should have 16 Gewerke with correct numbering", () => {
    expect(GEWERKE_NUMBERED.length).toBe(16);
    expect(GEWERKE_NUMBERED[0]).toEqual({ nr: 1, name: "Trockenbau" });
    expect(GEWERKE_NUMBERED[15]).toEqual({ nr: 16, name: "Sonstiges" });
  });

  it("should map Gewerk names to numbers", () => {
    expect(getGewerkNummer("Trockenbau")).toBe(1);
    expect(getGewerkNummer("Elektro")).toBe(3);
    expect(getGewerkNummer("Sonstiges")).toBe(16);
    expect(getGewerkNummer("Unknown")).toBe(16); // fallback
  });

  it("should map floor numbers to Geschoss numbers", () => {
    expect(getGeschossNummer(-1)).toBe(1); // UG
    expect(getGeschossNummer(0)).toBe(2);  // EG
    expect(getGeschossNummer(1)).toBe(3);  // 1.OG
    expect(getGeschossNummer(2)).toBe(4);  // 2.OG
  });

  it("should parse position codes correctly", () => {
    const parsed = parsePositionCode("3.2.5");
    expect(parsed).toEqual({ gewerk: 3, geschoss: 2, position: 5 });
    
    expect(parsePositionCode("invalid")).toBeNull();
    expect(parsePositionCode("1.2")).toBeNull();
  });

  it("should format position codes with Gewerk name", () => {
    const formatted = formatPositionCode("1.2.3");
    expect(formatted).toContain("Trockenbau");
    expect(formatted).toContain("1.2.3");
  });

  it("should get Gewerk name by number", () => {
    expect(getGewerkByNummer(1)).toBe("Trockenbau");
    expect(getGewerkByNummer(3)).toBe("Elektro");
    expect(getGewerkByNummer(99)).toBe("Sonstiges");
  });
});
