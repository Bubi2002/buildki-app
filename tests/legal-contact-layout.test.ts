import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const legal = read("app/legal.tsx");

describe("kompakte Rechtsansicht", () => {
  it("begrenzt die horizontale Reiterleiste auf eine kompakte Höhe", () => {
    expect(legal).toMatch(/flexGrow:\s*0,\s*maxHeight:\s*54/);
    expect(legal).toContain("minHeight: 53");
    expect(legal).toContain("height: 42");
    expect(legal).toContain('accessibilityRole="tab"');
    expect(legal).toContain("accessibilityState={{ selected: isActive }}");
  });

  it("trennt die horizontale Reiterleiste vom vertikal scrollenden Rechtstext", () => {
    expect(legal.match(/<ScrollView/g)).toHaveLength(2);
    expect(legal).toContain("horizontal");
    expect(legal).toMatch(/<ScrollView\s+style=\{\{ flex: 1 \}\}/);
    expect(legal).toContain("paddingBottom: 40");
  });
});

describe("konsistente Rechtskontaktadresse", () => {
  it("zentralisiert ausschließlich info@iserloh.net", () => {
    const combined = [
      legal,
      read("lib/legal-draft.ts"),
      read("components/data-rights-section.tsx"),
      read("server/legal-pages.ts"),
    ].join("\n");
    const addresses = [...combined.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu)]
      .map((match) => match[0].toLowerCase());

    expect([...new Set(addresses)]).toEqual(["info@iserloh.net"]);
    expect(read("lib/legal-draft.ts")).toContain(
      'LEGAL_CONTACT_EMAIL = "info@iserloh.net"',
    );
    expect(combined).not.toContain("@immobau-ka.de");
    expect(combined).not.toContain("@ciconcepts.net");
  });
});
