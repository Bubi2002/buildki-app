import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeExtractedDocument } from "@/lib/document-analysis-parser";
import {
  DocumentAIService,
  DocumentAnalysisError,
} from "@/lib/document-ai";
import {
  DocumentExtractionError,
  extractDocumentText,
} from "@/lib/document-text-extractor";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  files: new Map<string, string>(),
  pdfResult: {
    success: true,
    text: "Mangel: Fenster und Türen fehlen.\nMaßnahme: Fenster und Türen montieren.\nFrist: 17.09.2026",
    pageCount: 2,
    metadata: { title: "Baustellenbegehung" },
  } as any,
  timelineEmit: vi.fn().mockResolvedValue(undefined),
  upsertEntity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("expo-file-system", () => ({
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  readAsStringAsync: vi.fn(async (uri: string) => {
    const value = mocks.files.get(uri);
    if (value === undefined) throw new Error(`Datei nicht vorhanden: ${uri}`);
    return value;
  }),
}));

vi.mock("expo-pdf-text-extract", () => ({
  isAvailable: vi.fn(() => true),
  extractTextWithInfo: vi.fn(async () => mocks.pdfResult),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mocks.storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      mocks.storage.delete(key);
    }),
  },
}));

vi.mock("@/lib/knowledge-layer", () => ({
  knowledgeLayer: { upsertEntity: mocks.upsertEntity },
}));

vi.mock("@/lib/timeline-engine", () => ({
  timelineEngine: { emit: mocks.timelineEmit },
}));

const PROJECT = { projectId: "project-document-ai", projectName: "Projekt Document AI" };

beforeEach(() => {
  mocks.storage.clear();
  mocks.files.clear();
  mocks.timelineEmit.mockClear();
  mocks.upsertEntity.mockClear();
  mocks.pdfResult = {
    success: true,
    text: "Mangel: Fenster und Türen fehlen.\nMaßnahme: Fenster und Türen montieren.\nFrist: 17.09.2026",
    pageCount: 2,
    metadata: { title: "Baustellenbegehung" },
  };
});

describe("Document AI mit realen Quelldaten", () => {
  it("extrahiert digitale PDFs und leitet Confidence aus Inhalt statt aus einem festen 50-%-Wert ab", async () => {
    const extraction = await extractDocumentText({
      fileUri: "file:///Habermelstrasse_20_24072026.pdf",
      fileName: "Habermelstraße 20_24072026.pdf",
      fileType: "pdf",
      fileSize: 18_000,
    });

    const result = analyzeExtractedDocument({
      documentId: "doc-pdf",
      fileName: "Habermelstraße 20_24072026.pdf",
      fileUri: "file:///Habermelstrasse_20_24072026.pdf",
      fileType: "pdf",
      category: "other",
      extraction,
      startedAt: Date.now() - 800,
    });

    expect(extraction.method).toBe("native_pdf_text");
    expect(extraction.pageCount).toBe(2);
    expect(result.fileName).toBe("Habermelstraße 20_24072026.pdf");
    expect(result.summary).toContain("Fenster und Türen fehlen");
    expect(result.defects[0]?.title).toBe("Fenster und Türen fehlen.");
    expect(result.tasks[0]?.title).toBe("Fenster und Türen montieren.");
    expect(result.appointments[0]?.date).toBe("2026-09-17");
    expect(result.overallConfidence).toBeGreaterThan(50);
    expect(result.overallConfidence).not.toBe(50);
    expect(result.sourceExcerpts).toContain("Mangel: Fenster und Türen fehlen.");
  });

  it("extrahiert DOCX-Inhalt aus der echten Office-XML-Struktur", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Raum: 1. OG Besprechung</w:t></w:r></w:p><w:p><w:r><w:t>Mangel: Brandschutztür fehlt</w:t></w:r></w:p></w:body></w:document>`);
    mocks.files.set("file:///Baubesprechung.docx", await zip.generateAsync({ type: "base64" }));

    const result = await extractDocumentText({
      fileUri: "file:///Baubesprechung.docx",
      fileName: "Baubesprechung.docx",
      fileType: "docx",
    });

    expect(result.method).toBe("docx_xml");
    expect(result.text).toContain("Raum: 1. OG Besprechung");
    expect(result.text).toContain("Mangel: Brandschutztür fehlt");
  });

  it("extrahiert XLSX-Zellen ohne die unsichere SheetJS-Abhängigkeit", async () => {
    const zip = new JSZip();
    zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><sst><si><t>Gewerk</t></si><si><t>Fenster</t></si><si><t>Maßnahme: Türen montieren</t></si></sst>`);
    zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c><c><v>12</v></c></row></sheetData></worksheet>`);
    mocks.files.set("file:///Leistungen.xlsx", await zip.generateAsync({ type: "base64" }));

    const result = await extractDocumentText({
      fileUri: "file:///Leistungen.xlsx",
      fileName: "Leistungen.xlsx",
      fileType: "xlsx",
    });

    expect(result.method).toBe("xlsx_xml");
    expect(result.text).toContain("Gewerk\tFenster");
    expect(result.text).toContain("Maßnahme: Türen montieren\t12");
  });

  it("meldet leere oder bildbasierte PDFs eindeutig und speichert keinen falschen Erfolg", async () => {
    mocks.pdfResult = { success: true, text: "  ", pageCount: 3, metadata: {} };
    const service = new DocumentAIService();

    await expect(service.analyzeDocument({
      ...PROJECT,
      fileUri: "file:///Scan-ohne-Text.pdf",
      fileName: "Scan-ohne-Text.pdf",
      fileType: "pdf",
    })).rejects.toMatchObject({
      code: "EMPTY_TEXT",
      userMessage: expect.stringContaining("keine auswertbare Textebene"),
    });

    expect(mocks.storage.has("document-ai-store")).toBe(false);
    expect([...mocks.storage.keys()].some((key) => key.startsWith("doc-result-"))).toBe(false);
    expect(mocks.timelineEmit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "custom",
      metadata: { analysisStatus: "failed" },
    }));
  });

  it("persistiert nur vollständige Ergebnisse und öffnet sie nach erneutem Laden unverändert", async () => {
    const service = new DocumentAIService();
    const result = await service.analyzeDocument({
      ...PROJECT,
      fileUri: "file:///Habermelstrasse_20_24072026.pdf",
      fileName: "Habermelstraße 20_24072026.pdf",
      fileType: "pdf",
      fileSize: 18_000,
    });

    const reopened = await service.getAnalysisResult(result.documentId);
    const documents = await service.getDocuments(PROJECT.projectId);

    expect(reopened).toEqual(result);
    expect(reopened?.fileUri).toBe("file:///Habermelstrasse_20_24072026.pdf");
    expect(documents).toHaveLength(1);
    expect(documents[0].fileName).toBe("Habermelstraße 20_24072026.pdf");
    expect(documents[0].metadata).toMatchObject({
      analysisStatus: "completed",
      extractionMethod: "native_pdf_text",
    });
  });

  it("weist historische Platzhalter mit pauschalen 50 % beim Öffnen zurück", async () => {
    mocks.storage.set("doc-result-doc-fake", JSON.stringify({
      documentId: "doc-fake",
      fileName: "Habermelstraße 20_24072026.pdf",
      fileType: "pdf",
      category: "other",
      analyzedAt: "2026-07-29T19:51:00.000Z",
      summary: "Analyse abgeschlossen",
      rooms: [],
      trades: [],
      persons: [],
      companies: [],
      appointments: [],
      tasks: [],
      defects: [],
      quantities: [],
      references: [],
      entities: [],
      overallConfidence: 50,
      processingTime: 3800,
    }));

    expect(await new DocumentAIService().getAnalysisResult("doc-fake")).toBeNull();
  });

  it("verdrahtet Upload, Dateigröße, Ergebnisdetail und Originaldatei sichtbar im UI", () => {
    const screenSource = readFileSync("app/document-ai.tsx", "utf8");
    const detailSource = readFileSync("components/document-analysis-detail.tsx", "utf8");
    const serviceSource = readFileSync("lib/document-ai.ts", "utf8");

    expect(screenSource).toContain("uploadPhotoMutation.mutateAsync");
    expect(screenSource).toContain("fileSize: file.size");
    expect(screenSource).toContain("DocumentAnalysisDetail");
    expect(screenSource).toContain("Analyse nicht abgeschlossen");
    expect(detailSource).toContain("Analyse tatsächlich abgeschlossen");
    expect(detailSource).toContain("Quellenstellen aus dem Dokument");
    expect(detailSource).toContain("onOpenFile(result)");
    expect(serviceSource).not.toContain("overallConfidence: 50");
    expect(serviceSource).not.toContain("summary: \"Analyse abgeschlossen\"");
  });

  it("liefert für nicht unterstützte Alt-XLS-Dateien einen handlungsorientierten Fehler", async () => {
    await expect(extractDocumentText({
      fileUri: "file:///Altformat.xls",
      fileName: "Altformat.xls",
      fileType: "xlsx",
    })).rejects.toBeInstanceOf(DocumentExtractionError);
  });

  it("kapselt Extraktionsfehler als nutzerlesbare Document-AI-Fehler", async () => {
    mocks.pdfResult = { success: false, text: "", pageCount: 0, error: "Password required", errorCode: "PASSWORD_REQUIRED" };
    const service = new DocumentAIService();
    await expect(service.analyzeDocument({
      ...PROJECT,
      fileUri: "file:///Geschuetzt.pdf",
      fileName: "Geschützt.pdf",
      fileType: "pdf",
    })).rejects.toBeInstanceOf(DocumentAnalysisError);
  });
});
