import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSourceBoundReport, buildStrictSourceContract, findUnsupportedReportClaims, type ReportSourceSnapshot } from "@/lib/report-source-guard";
import { parseReportMarkdown } from "@/lib/report-markdown-parser";
import { exportService } from "@/lib/export-service";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  getDefects: vi.fn(),
  getProjectKnowledge: vi.fn(),
  generateProtocolPdf: vi.fn(),
  writeAsStringAsync: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mocks.storage.set(key, value);
    }),
  },
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  EncodingType: { UTF8: "utf8" },
  writeAsStringAsync: mocks.writeAsStringAsync,
}));

vi.mock("@/lib/defect-store", () => ({
  getDefects: mocks.getDefects,
}));

vi.mock("@/lib/knowledge-layer", () => ({
  knowledgeLayer: {
    getProjectKnowledge: mocks.getProjectKnowledge,
  },
}));

vi.mock("@/lib/pdf-generator", () => ({
  generateProtocolPdf: mocks.generateProtocolPdf,
}));

const SNAPSHOT: ReportSourceSnapshot = {
  reportLabel: "Bautagesbericht",
  transcription: "Fenster und Türen fehlen.",
  projectName: "Projekt Test",
  datum: "29.07.2026",
  floor: "UG",
  room: "Test",
  selectedDefects: [],
  attendees: [],
  evidence: [],
};

describe("quellengebundene KI-Berichte", () => {
  it("erkennt die im Nutzerscreenshot unbelegt ergänzten Boden- und Fliesenangaben", () => {
    const reasons = findUnsupportedReportClaims(
      "Fenster und Türen fehlen. Zusätzlich ist der Boden mangelhaft und das Gewerk Fliesen/Naturstein muss nacharbeiten.",
      SNAPSHOT,
    );

    expect(reasons.some((reason) => reason.includes("boden"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("fliesen"))).toBe(true);
  });

  it("akzeptiert belegte Fenster- und Türenaussagen ohne freie Ergänzungen", () => {
    const reasons = findUnsupportedReportClaims(
      "Im Raum Test fehlen Fenster und Türen. Weitere Gewerke und Fristen sind nicht angegeben.",
      SNAPSHOT,
    );

    expect(reasons).toEqual([]);
  });

  it("akzeptiert ausgewählte Firmen, erkennt aber eine frei erfundene Firma", () => {
    const snapshotWithCompany: ReportSourceSnapshot = {
      ...SNAPSHOT,
      attendees: [{ name: "Max Muster", company: "Musterbau GmbH", role: "Bauleitung" }],
    };

    expect(findUnsupportedReportClaims("Fa. Musterbau GmbH wird informiert.", snapshotWithCompany)).toEqual([]);
    expect(findUnsupportedReportClaims("Fa. Fremdbau GmbH wird beauftragt.", snapshotWithCompany))
      .toContain("Nicht belegte Firma: Fremdbau GmbH");
  });

  it("baut den sicheren Ersatzbericht ausschließlich aus bestätigten Quellen", () => {
    const report = buildSourceBoundReport(SNAPSHOT);

    expect(report).toContain("Fenster und Türen fehlen.");
    expect(report).toContain("Projekt Test");
    expect(report).not.toMatch(/Boden|Fliesen|Naturstein/i);
    expect(buildStrictSourceContract(SNAPSHOT)).toContain("Erfinde keine Gewerke");
  });
});

describe("strukturierte Berichtsvorschau", () => {
  it("wandelt die sichtbaren Markdown-Trennstriche in eine Schlüssel-Wert-Tabelle um", () => {
    const blocks = parseReportMarkdown([
      "# Bautagesbericht – Projekt Test",
      "",
      "| | |",
      "|---|---|",
      "| Projekt | Test |",
      "| Datum | 29.07.2026 |",
    ].join("\n"));

    const table = blocks.find((block) => block.type === "table");
    expect(table).toMatchObject({
      type: "table",
      keyValue: true,
      headers: ["Feld", "Angabe"],
      rows: [["Projekt", "Test"], ["Datum", "29.07.2026"]],
    });
    expect(JSON.stringify(blocks)).not.toContain("---");
  });

  it("modelliert breite Mängeltabellen als strukturierte Datensätze statt als Textzeilen", () => {
    const blocks = parseReportMarkdown([
      "| Nr. | Mangel | Gewerk | Ort | Schwere | Status |",
      "|---|---|---|---|---|---|",
      "| 1 | Fenster fehlen | Fenster/Türen | UG | hoch | offen |",
    ].join("\n"));
    const table = blocks[0];

    expect(table).toMatchObject({
      type: "table",
      keyValue: false,
      headers: ["Nr.", "Mangel", "Gewerk", "Ort", "Schwere", "Status"],
      rows: [["1", "Fenster fehlen", "Fenster/Türen", "UG", "hoch", "offen"]],
    });
  });
});

describe("echter vollständiger PDF-Export", () => {
  beforeEach(() => {
    mocks.storage.clear();
    mocks.getDefects.mockReset();
    mocks.getProjectKnowledge.mockReset();
    mocks.generateProtocolPdf.mockReset();
    mocks.writeAsStringAsync.mockReset();
    mocks.storage.set("project-tasks", "[]");
    mocks.storage.set("saved_reports", JSON.stringify([{
      id: "report-1",
      type: "Bautagesbericht",
      content: "# Bautagesbericht\n\nFenster und Türen fehlen.",
      projectId: "project-test",
      projectName: "Projekt Test",
      datum: "29.07.2026",
      createdAt: "2026-07-29T17:48:00.000Z",
    }]));
    mocks.getDefects.mockResolvedValue([{
      id: "defect-1",
      projectId: "project-test",
      title: "Fenster und Türen fehlen",
      description: "Gebäudehülle ist nicht geschlossen.",
      status: "offen",
      priority: "hoch",
      category: "Sicherheit",
      gewerk: "Fenster/Türen",
      location: "UG, Raum Test",
      dueDate: "05.08.2026",
      createdAt: "2026-07-29T13:58:00.000Z",
    }]);
    mocks.getProjectKnowledge.mockResolvedValue([]);
    mocks.generateProtocolPdf.mockResolvedValue("file:///documents/Projekt_Test_Export_2026-07-29.pdf");
  });

  it("übergibt den vollständigen gespeicherten Bericht an die native PDF-Pipeline", async () => {
    const result = await exportService.exportData({
      projectId: "project-test",
      projectName: "Projekt Test",
      format: "pdf",
      scope: "full",
    });

    expect(result).toEqual({
      success: true,
      filePath: "file:///documents/Projekt_Test_Export_2026-07-29.pdf",
      fileName: "Projekt_Test_Export_2026-07-29.pdf",
      mimeType: "application/pdf",
    });
    expect(mocks.writeAsStringAsync).not.toHaveBeenCalled();
    expect(mocks.generateProtocolPdf).toHaveBeenCalledTimes(1);
    const protocol = mocks.generateProtocolPdf.mock.calls[0][0];
    expect(protocol.title).toBe("Projekt Test");
    expect(protocol.projectName).toBe("Projekt Test");
    expect(protocol.protocol).toContain("Gespeicherte KI-Berichte");
    expect(protocol.protocol).toContain("Fenster und Türen fehlen.");
    expect(protocol.protocol).toContain("Gebäudehülle ist nicht geschlossen.");
    expect(protocol.protocol).toContain("Dateiformat | PDF");
    expect(protocol.protocol).not.toContain("<!DOCTYPE html>");
  });
});
