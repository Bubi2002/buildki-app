import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { buildSourceBoundReport, type ReportSourceSnapshot } from "@/lib/report-source-guard";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-print", () => ({ printToFileAsync: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  documentDirectory: "file:///documents/",
  EncodingType: { Base64: "base64" },
}));
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: vi.fn(),
}));
vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000000"),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

const REPORT_SNAPSHOT: ReportSourceSnapshot = {
  reportLabel: "Bautagesbericht",
  transcription: "Fenster und Türen fehlen. Weitere Angaben wurden nicht gemacht.",
  projectName: "Projekt Test",
  datum: "29.07.2026",
  floor: "UG",
  room: "Test",
  selectedDefects: [],
  attendees: [],
  evidence: [],
};

describe("KI-Bericht als druckbares PDF-Artefakt", () => {
  it("rendert den vollständigen quellengebundenen Inhalt ohne sichtbare Markdown-Trennzeilen", () => {
    const report = [
      buildSourceBoundReport(REPORT_SNAPSHOT),
      "# Prüf- und Exportworkflow",
      "",
      "## Quellenprüfung",
      "",
      "Der Bericht wurde gegen die bestätigte Eingabe geprüft. Nicht belegte Angaben wurden nicht übernommen.",
      "",
      "## PDF-Erzeugung",
      "",
      "Die Vorschau wird in ein druckbares Dokument mit Seitenumbrüchen, Kopfbereich und vollständigem Berichtstext überführt.",
    ].join("\n");
    const html = generatePdfHtml({
      title: "Nicht als Überschrift verwenden",
      projectName: "Projekt Test",
      protocol: report,
      templateId: "project-export",
      templateName: "Bautagesbericht",
      duration: 0,
      createdAt: "2026-07-29T17:48:00.000Z",
    }, {}, [], []);

    expect(html).toContain('<h1 class="doc-title">Projekt Test</h1>');
    expect(html).toContain("Fenster und Türen fehlen.");
    expect(html).toContain("Quellenprüfung");
    expect(html).toContain("PDF-Erzeugung");
    expect(html).toContain("<table");
    expect(html).not.toContain("|---|---|");
    expect(html).not.toMatch(/Boden|Fliesen|Naturstein/i);
    expect(html).toContain("@page");
    expect(html).toContain("page-break-before: always");

    if (process.env.BUILDKI_REPORT_PDF_HTML_PATH) {
      writeFileSync(process.env.BUILDKI_REPORT_PDF_HTML_PATH, html, "utf8");
    }
  });
});
