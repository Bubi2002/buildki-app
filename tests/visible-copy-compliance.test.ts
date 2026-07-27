import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Visible compliance copy", () => {
  it("keeps Unicode characters rendered instead of exposing escape syntax", () => {
    const settings = read("app/(tabs)/settings.tsx");
    const floorPlan = read("app/floor-plan.tsx");
    const pdfBranding = read("app/pdf-branding.tsx");
    const projectDetail = read("app/project-detail.tsx");
    const i18n = read("lib/i18n.ts");

    expect(settings).toContain("Datenschutzerklärung");
    expect(settings).toContain("Transparenz zur KI-Nutzung gemäß EU AI Act");
    expect(floorPlan).toContain("decodeUnicodeEscapes(showPinDetail.label)");
    expect(floorPlan).toContain("decodeUnicodeEscapes(showPinDetail.description)");
    expect(floorPlan).toContain("decodeUnicodeEscapes(`${pinTypeOptions.find");
    expect(pdfBranding).toContain("– für Standard leer lassen");
    expect(projectDetail).toContain("Mängel erledigt");
    expect(i18n).toContain("'Empfänger wählen'");
    expect(i18n).toContain("'Foto-Größe'");
    expect(i18n).not.toContain("\\\\u");
  });

  it("passes the repository-wide static copy and URL inventory", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "buildki-copy-audit-"));

    try {
      execFileSync(
        process.execPath,
        [path.join(root, "scripts/compliance-visible-copy-scan.mjs"), outputDir],
        { cwd: root, encoding: "utf8" },
      );

      const report = JSON.parse(
        fs.readFileSync(path.join(outputDir, "visible-copy-scan.json"), "utf8"),
      ) as {
        blockerCount: number;
        invariants: Record<string, boolean>;
        urls: { url: string; category: string }[];
      };

      expect(report.blockerCount).toBe(0);
      expect(Object.values(report.invariants).every(Boolean)).toBe(true);
      expect(report.urls.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
