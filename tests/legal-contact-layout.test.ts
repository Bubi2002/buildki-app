import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const legal = readFileSync(resolve(process.cwd(), "app/legal.tsx"), "utf8");

describe("kompakte Rechtsansicht", () => {
  it("begrenzt die horizontale Reiterleiste auf eine kompakte Höhe", () => {
    expect(legal).toContain("flexGrow: 0, maxHeight: 54");
    expect(legal).toContain("minHeight: 53");
    expect(legal).toContain("height: 42");
    expect(legal).toContain('accessibilityRole="tab"');
    expect(legal).toContain("accessibilityState={{ selected: isActive }}");
  });

  it("lässt ausschließlich den Rechtstext vertikal scrollen", () => {
    expect(legal).toContain("Only the legal text scrolls vertically");
    expect(legal).toContain("style={{ flex: 1 }}");
    expect(legal).toContain("paddingBottom: 40");
  });
});

describe("konsistente Rechtskontaktadresse", () => {
  it("verwendet ausschließlich info@iserloh.net", () => {
    expect(legal.match(/info@iserloh\.net/g)?.length).toBe(4);
    expect(legal).not.toContain("@immobau-ka.de");
  });
});
