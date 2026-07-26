import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

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

import {
  formatMeasurementForDocument,
  type DocumentEvidenceSnapshot,
} from "@/lib/document-evidence";
import { generatePdfHtml } from "@/lib/pdf-generator";

const IMAGE_A = "data:image/png;base64,AAA-A";
const IMAGE_C = "data:image/png;base64,CCC-C";

function createSvgDataUri(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="100%" height="100%" fill="${color}"/><path d="M170 360 L790 180" stroke="#fff" stroke-width="10"/><circle cx="170" cy="360" r="16" fill="#fff"/><circle cx="790" cy="180" r="16" fill="#fff"/><text x="480" y="90" text-anchor="middle" font-family="Arial" font-size="44" font-weight="700" fill="#fff">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const BASE_PROTOCOL: Parameters<typeof generatePdfHtml>[0] = {
  title: "Erste gesprochene Wörter",
  projectName: "Projekt Musterbau",
  protocol: "# Einleitung\n\nDokumentierter Inhalt.",
  templateId: "meetingMinutes",
  templateName: "Besprechungsprotokoll",
  duration: 75,
  createdAt: "2026-07-26T08:00:00.000Z",
};

function createSnapshot(
  evidenceId: string,
  findingText: string,
  overrides: Partial<DocumentEvidenceSnapshot> = {},
): DocumentEvidenceSnapshot {
  return {
    evidenceId,
    sourceType: "photo",
    mediaUri: `file:///${evidenceId}.jpg`,
    findingText,
    sourceLabel: "Originalfoto",
    sourceFilename: `${evidenceId}.jpg`,
    measurements: [],
    capturedForDocumentAt: "2026-07-26T08:05:00.000Z",
    ...overrides,
  };
}

describe("allgemeine PDF-Belegintegration", () => {
  it("hält Befund, Bildslot, Abbildungsnummer und Quelle indexstabil zusammen", () => {
    const snapshots = [
      createSnapshot("evidence-door", "Türklinke abgenutzt."),
      createSnapshot("evidence-shaft", "Lichtschacht in falscher Farbe."),
      createSnapshot("evidence-cable", "Heizkabel muss gestrichen werden.", {
        sourceType: "video_frame",
        sourceLabel: "Videostandbild aus Rundgang.mp4",
        sourceFilename: "Rundgang.mp4",
        videoTimeSeconds: 83,
        videoTimecode: "01:23",
      }),
    ];

    const html = generatePdfHtml(
      { ...BASE_PROTOCOL, evidenceSnapshots: snapshots },
      {},
      [],
      [IMAGE_A, "", IMAGE_C],
    );

    const firstFinding = html.indexOf("Türklinke abgenutzt.");
    const missingSecond = html.indexOf("Abbildung 2: Visueller Nachweis konnte nicht geladen werden.");
    const thirdFinding = html.indexOf("Heizkabel muss gestrichen werden.");
    const thirdImage = html.indexOf(IMAGE_C);
    const thirdNumber = html.indexOf("Abbildung 3", thirdFinding);
    const thirdTimecode = html.indexOf("Zeitcode 01:23", thirdFinding);

    expect(firstFinding).toBeGreaterThan(-1);
    expect(missingSecond).toBeGreaterThan(firstFinding);
    expect(thirdFinding).toBeGreaterThan(missingSecond);
    expect(thirdImage).toBeGreaterThan(thirdFinding);
    expect(thirdNumber).toBeGreaterThan(thirdImage);
    expect(thirdTimecode).toBeGreaterThan(thirdNumber);
    expect(html).not.toContain("Abbildung 2</strong></p>\n                <p class=\"evidence-source\"><strong>Videostandbild");
  });

  it("verwendet den Projektnamen als PDF-Überschrift und beginnt Haupttitel auf neuen Seiten", () => {
    const html = generatePdfHtml(BASE_PROTOCOL, {}, [], []);

    expect(html).toContain('<h1 class="doc-title">Projekt Musterbau</h1>');
    expect(html).toContain("<strong>Besprechungsprotokoll</strong>");
    expect(html).not.toContain('<h1 class="doc-title">Erste gesprochene Wörter</h1>');
    expect(html).toContain(".document-chapter {");
    expect(html).toContain("page-break-before: always;");
  });

  it("hält auch nach einem fehlgeschlagenen Legacy-Bild den dritten Marker bei Foto 3", () => {
    const html = generatePdfHtml(
      {
        ...BASE_PROTOCOL,
        protocol: "**Türklinke abgenutzt.** [FOTO 1]\n**Lichtschacht in falscher Farbe.** [FOTO 2]\n**Heizkabel muss gestrichen werden.** [FOTO 3]",
        photoCaptions: [
          "Türklinke abgenutzt.",
          "Lichtschacht in falscher Farbe.",
          "Heizkabel muss gestrichen werden.",
        ],
      },
      {},
      [IMAGE_A, "", IMAGE_C],
      [],
    );

    const thirdImage = html.indexOf(IMAGE_C);
    const thirdNumber = html.indexOf("Foto 3", thirdImage);
    const thirdCaption = html.indexOf("Heizkabel muss gestrichen werden.", thirdImage);

    expect(thirdImage).toBeGreaterThan(-1);
    expect(thirdNumber).toBeGreaterThan(thirdImage);
    expect(thirdCaption).toBeGreaterThan(thirdImage);
    expect(html).not.toContain("Foto 2 (0:00)</div>\n              <div style=\"font-size: 10px; color: #666; margin-top: 4px;\">Heizkabel");
  });

  it("kennzeichnet Messqualität und Toleranz eindeutig", () => {
    expect(formatMeasurementForDocument({
      id: "measurement-1",
      kind: "distance",
      value: 1.25,
      unit: "m",
      method: "reference_scale",
      accuracy: "calibrated",
      tolerance: 1,
      toleranceUnit: "cm",
      measuredAt: "2026-07-26T08:10:00.000Z",
    })).toBe("1.25 m ± 1 cm (kalibriert)");

    expect(formatMeasurementForDocument({
      id: "measurement-2",
      kind: "distance",
      value: 2,
      unit: "m",
      method: "image_estimate",
      accuracy: "estimated",
      measuredAt: "2026-07-26T08:11:00.000Z",
    })).toBe("2 m (Schätzung)");
  });

  it("schreibt auf Anforderung eine visuelle PDF-Prüfvorlage mit demselben produktiven Renderer", () => {
    if (process.env.BUILDKI_PDF_FIXTURE_PATH) {
      const snapshots = [
        createSnapshot("visual-door", "Türklinke abgenutzt; Austausch erforderlich.", {
          measurements: [{
            id: "visual-measurement",
            kind: "distance",
            value: 1.02,
            unit: "m",
            method: "reference_scale",
            accuracy: "calibrated",
            tolerance: 1,
            toleranceUnit: "cm",
            measuredAt: "2026-07-26T08:10:00.000Z",
          }],
        }),
        createSnapshot("visual-shaft", "Lichtschacht in abweichender Farbe ausgeführt.", {
          sourceType: "video_frame",
          sourceLabel: "Videostandbild aus Baustellenrundgang.mp4",
          sourceFilename: "Baustellenrundgang.mp4",
          videoTimeSeconds: 83,
          videoTimecode: "01:23",
        }),
        createSnapshot("visual-cable", "Heizkabel ist entsprechend der Vorgabe zu beschichten."),
      ];
      const html = generatePdfHtml(
        {
          ...BASE_PROTOCOL,
          protocol: "# Einleitung und Aufgabenstellung\n\n## Befundübersicht\n\nDie ausgewählten Belege werden nachfolgend unverändert dokumentiert.",
          evidenceSnapshots: snapshots,
        },
        { companyName: "BuildKI Qualitätsprüfung" },
        [],
        [
          createSvgDataUri("BELEG 1 – TÜR", "#0f4c5c"),
          createSvgDataUri("BELEG 2 – VIDEO 01:23", "#5f0f40"),
          createSvgDataUri("BELEG 3 – HEIZKABEL", "#9a3412"),
        ],
      );
      writeFileSync(process.env.BUILDKI_PDF_FIXTURE_PATH, html, "utf8");
    }
    expect(true).toBe(true);
  });

  it("hält jeden visuellen Belegblock über Seitenumbrüche zusammen und druckt Bildtexte fett", () => {
    const html = generatePdfHtml(
      {
        ...BASE_PROTOCOL,
        evidenceSnapshots: [createSnapshot("evidence-one", "Dokumentierter Befund.")],
      },
      {},
      [],
      [IMAGE_A],
    );

    expect(html).toContain(".evidence-block {");
    expect(html).toContain("break-inside: avoid;");
    expect(html).toContain("page-break-inside: avoid;");
    expect(html).toContain('<p class="evidence-finding"><strong>Dokumentierter Befund.</strong></p>');
    expect(html).toContain('<p class="evidence-number"><strong>Abbildung 1</strong></p>');
    expect(html).toContain('<p class="evidence-source"><strong>Originalfoto · evidence-one.jpg</strong></p>');
  });
});
