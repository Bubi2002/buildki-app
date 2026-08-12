/**
 * Design: source-bound document analysis.
 * Every extracted item must be traceable to literal source text.
 */
import type {
  DocumentAnalysisResult,
  DocumentFileType,
  ExtractedAppointment,
  ExtractedDefect,
  ExtractedTask,
} from "@/lib/document-ai";
import type { DocumentExtractionResult } from "@/lib/document-text-extractor";
import type { DocumentCategory } from "@/shared/entities";

const TRADE_TERMS = [
  "Abbruch",
  "Elektro",
  "Estrich",
  "Fassade",
  "Fenster",
  "Fliesen",
  "Heizung",
  "Lüftung",
  "Maler",
  "Maurer",
  "Rohbau",
  "Sanitär",
  "Schreiner",
  "Trockenbau",
  "Türen",
  "Verglasung",
];

// Building-type words (specific → generic where compounds overlap).
const BUILDING_TYPE_TERMS = [
  "Einfamilienhaus",
  "Mehrfamilienhaus",
  "Doppelhaus",
  "Reihenhaus",
  "Wohnhaus",
  "Wohngebäude",
  "Bürogebäude",
  "Gewerbehalle",
  "Lagerhalle",
  "Kindergarten",
  "Büro",
  "Gewerbe",
  "Industrie",
  "Garage",
  "Carport",
  "Schule",
  "Halle",
  "Anbau",
  "Aufstockung",
  "Umbau",
  "Sanierung",
];

// Document-nature words describing what the plan sheet is.
const DOCUMENT_NATURE_TERMS = [
  "Plansatz",
  "Grundriss",
  "Ansicht",
  "Schnitt",
  "Lageplan",
  "Detail",
  "Statik",
  "Leistungsverzeichnis",
];

const ROOM_TERMS = [
  "Wohnen",
  "Wohnzimmer",
  "Wohnküche",
  "Küche",
  "Kochen",
  "Essen",
  "Bad",
  "WC",
  "Gäste-WC",
  "Diele",
  "Flur",
  "Windfang",
  "Schlafen",
  "Schlafzimmer",
  "Kind",
  "Kinderzimmer",
  "Zimmer",
  "Arbeiten",
  "Büro",
  "Abstellraum",
  "Abstell",
  "HWR",
  "Hauswirtschaftsraum",
  "Technik",
  "Heizraum",
  "Keller",
  "Speis",
  "Speisekammer",
  "Vorratsraum",
  "Ankleide",
  "Garderobe",
  "Waschküche",
  "Terrasse",
  "Balkon",
  "Loggia",
  "Galerie",
  "Treppenhaus",
  "Garage",
  "Gast",
];

const MATERIAL_TERMS = [
  "Stahlbeton",
  "WU-Beton",
  "Beton",
  "Kalksandstein",
  "Ziegel",
  "Mauerwerk",
  "Porenbeton",
  "Ytong",
  "Estrich",
  "Wärmedämmung",
  "Dämmung",
  "WDVS",
  "Mineralwolle",
  "Gipskarton",
  "Rigips",
  "Brettschichtholz",
  "KVH",
  "Holz",
  "Stahl",
  "Fliesen",
  "Naturstein",
  "Putz",
  "Kalkputz",
  "Gipsputz",
  "Glas",
  "Bitumen",
  "Abdichtung",
  "Trapezblech",
  "Dachziegel",
  "Bewehrung",
  "Betonstahl",
];

export interface AnalyzeExtractedDocumentInput {
  documentId: string;
  fileName: string;
  fileUri: string;
  fileType: DocumentFileType;
  category: DocumentCategory;
  extraction: DocumentExtractionResult;
  startedAt: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cleanLine(value: string): string {
  return value.replace(/^[-–—•*\d.)\s]+/, "").replace(/\s+/g, " ").trim();
}

function sourceLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3);
}

function summarize(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const sentences = compact.match(/[^.!?]+[.!?]+/g) ?? [];
  if (sentences.length > 0) return sentences.slice(0, 2).join(" ").slice(0, 700).trim();
  return compact.slice(0, 700).trim();
}

function extractRooms(lines: string[]): string[] {
  const values: string[] = [];
  const roomPattern = /\b(?:Raum|Zimmer|Bereich|Geschoss|Etage)\s*[:#-]?\s*([^,;|]{1,70})/i;
  for (const line of lines) {
    const match = line.match(roomPattern);
    if (match) values.push(cleanLine(match[1]));
    const levelMatch = line.match(/\b(?:UG|EG|DG|\d+\.\s*OG)\b/gi);
    if (levelMatch) values.push(...levelMatch.map((value) => value.toUpperCase().replace(/\s+/g, " ")));
  }
  return unique(values).slice(0, 30);
}

function extractTrades(text: string): string[] {
  return TRADE_TERMS.filter((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

function findLabeledLines(lines: string[], labels: string[]): string[] {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`^(?:${escaped})\\s*[:\\-]\\s*(.+)$`, "i");
  return unique(lines.map((line) => line.match(pattern)?.[1] ?? "").filter(Boolean));
}

function extractTasks(lines: string[], trades: string[]): ExtractedTask[] {
  return findLabeledLines(lines, ["Aufgabe", "Maßnahme", "To-do", "Todo"]).slice(0, 40).map((title) => ({
    title: cleanLine(title),
    trade: trades.find((trade) => title.toLowerCase().includes(trade.toLowerCase())),
  }));
}

function extractDefects(lines: string[], trades: string[]): ExtractedDefect[] {
  return findLabeledLines(lines, ["Mangel", "Mängel", "Beanstandung", "Schaden"]).slice(0, 40).map((title) => ({
    title: cleanLine(title),
    trade: trades.find((trade) => title.toLowerCase().includes(trade.toLowerCase())),
  }));
}

function normalizeDate(value: string): string {
  const german = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) return `${german[3]}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
  return value;
}

function extractAppointments(lines: string[]): ExtractedAppointment[] {
  const appointments: ExtractedAppointment[] = [];
  const datePattern = /\b(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/;
  for (const line of lines) {
    const date = line.match(datePattern)?.[1];
    if (!date) continue;
    const title = cleanLine(line.replace(date, "")) || "Datum im Dokument";
    appointments.push({ title: title.slice(0, 140), date: normalizeDate(date) });
  }
  return appointments.slice(0, 30);
}

function extractReferences(lines: string[]): { title: string; type: string; number?: string }[] {
  const references: { title: string; type: string; number?: string }[] = [];
  const pattern = /\b(DIN(?:\s+EN)?\s+[A-Z0-9-]+|Plan(?:-?Nr\.?|nummer)?\s*[:#-]?\s*[A-Z0-9._/-]+)\b/i;
  for (const line of lines) {
    const match = line.match(pattern)?.[1];
    if (match) references.push({ title: cleanLine(line).slice(0, 180), type: /^DIN/i.test(match) ? "norm" : "plan", number: match });
  }
  return references.slice(0, 30);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// German decimal ("12,34") → number.
function parseGermanNumber(raw: string): number {
  const cleaned = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

const AREA_TOKEN = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:m²|m2|qm)/gi;

function extractBuildingType(fileName: string, text: string): string | undefined {
  const haystack = `${fileName}\n${text}`.toLowerCase();
  const typeLabel = BUILDING_TYPE_TERMS.find((term) => haystack.includes(term.toLowerCase()));
  const natureLabel = DOCUMENT_NATURE_TERMS.find((term) => haystack.includes(term.toLowerCase()));
  if (typeLabel && natureLabel) return `${typeLabel} · ${natureLabel}`;
  if (typeLabel) return typeLabel;
  if (natureLabel) return "Bauplan/Grundriss";
  return undefined;
}

function floorRank(label: string): number {
  if (label === "KG") return 0;
  if (label === "UG") return 1;
  if (label === "EG") return 2;
  if (label === "OG") return 10;
  const numbered = label.match(/^(\d+)\. OG$/);
  if (numbered) return 10 + parseInt(numbered[1], 10);
  if (label === "DG") return 100;
  if (label === "Staffelgeschoss") return 101;
  if (label === "Spitzboden") return 102;
  return 50;
}

function extractFloors(text: string): string[] {
  const found = new Set<string>();

  // Numbered upper floors: "2. Obergeschoss" / "2. OG".
  const numbered = /(\d{1,2})\.\s*(?:OG|Obergeschoss)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = numbered.exec(text)) !== null) {
    found.add(`${parseInt(match[1], 10)}. OG`);
  }
  // Strip numbered occurrences so a bare "OG" check does not re-match them.
  const withoutNumbered = text.replace(numbered, " ");

  if (/\bKellergeschoss\b|\bKG\b/i.test(text)) found.add("KG");
  if (/\bUntergeschoss\b|\bUG\b/i.test(text)) found.add("UG");
  if (/\bErdgeschoss\b|\bEG\b/i.test(text)) found.add("EG");
  if (/\bObergeschoss\b|\bOG\b/i.test(withoutNumbered)) found.add("OG");
  if (/\bDachgeschoss\b|\bDG\b/i.test(text)) found.add("DG");
  if (/\bStaffelgeschoss\b/i.test(text)) found.add("Staffelgeschoss");
  if (/\bSpitzboden\b/i.test(text)) found.add("Spitzboden");

  return [...found].sort((a, b) => floorRank(a) - floorRank(b));
}

// Match the most specific room term present in a line (longest first).
const ROOM_TERMS_BY_LENGTH = [...ROOM_TERMS].sort((a, b) => b.length - a.length);

function extractRoomAreas(text: string): { name: string; area: number }[] {
  const result: { name: string; area: number }[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (line.length < 3) continue;
    const areaMatch = line.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:m²|m2|qm)/i);
    if (!areaMatch) continue;
    const name = ROOM_TERMS_BY_LENGTH.find((term) =>
      new RegExp(`\\b${escapeRegExp(term)}`, "i").test(line),
    );
    if (!name) continue;
    const area = Math.round(parseGermanNumber(areaMatch[1]) * 100) / 100;
    if (!(area > 0)) continue;
    const key = `${name.toLowerCase()}|${area}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name, area });
    if (result.length >= 40) break;
  }
  return result;
}

function extractMaterials(text: string): string[] {
  const found = new Set<string>();
  let haystack = text;
  // Longest first so "Stahlbeton" consumes before "Beton"/"Stahl" can match it.
  for (const term of [...MATERIAL_TERMS].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(escapeRegExp(term), "gi");
    if (pattern.test(haystack)) {
      found.add(term);
      haystack = haystack.replace(new RegExp(escapeRegExp(term), "gi"), " ");
    }
  }
  return MATERIAL_TERMS.filter((term) => found.has(term)).slice(0, 20);
}

function computeTotalArea(roomAreas: { name: string; area: number }[], text: string): number | undefined {
  let sum = roomAreas.reduce((total, room) => total + room.area, 0);
  if (sum <= 0) {
    const distinct = new Set<number>();
    let match: RegExpExecArray | null;
    AREA_TOKEN.lastIndex = 0;
    while ((match = AREA_TOKEN.exec(text)) !== null) {
      const value = parseGermanNumber(match[1]);
      if (value > 0) distinct.add(value);
    }
    sum = [...distinct].reduce((total, value) => total + value, 0);
  }
  const rounded = Math.round(sum * 10) / 10;
  return rounded > 0 ? rounded : undefined;
}

function formatAreaDe(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(".", ",");
}

function letterRatio(value: string): number {
  const letters = (value.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length;
  return value.length > 0 ? letters / value.length : 0;
}

// Fallback summary that skips lines dominated by digits/punctuation (e.g. "12. 00 2.").
function fallbackSummary(lines: string[], rawText: string): string {
  const readable = lines.filter((line) => line.length >= 12 && letterRatio(line) >= 0.5);
  if (readable.length > 0) return summarize(readable.slice(0, 4).join(" "));
  return summarize(rawText);
}

function composePlanSummary(
  buildingType: string | undefined,
  floors: string[],
  roomAreas: { name: string; area: number }[],
  totalAreaSqm: number | undefined,
): string | null {
  if (!buildingType && floors.length === 0 && roomAreas.length === 0) return null;
  let summary = buildingType ?? "Bauplan";
  if (roomAreas.length > 0) {
    summary += ` mit ${roomAreas.length} ${roomAreas.length === 1 ? "Raum" : "Räumen"}`;
  }
  if (floors.length > 0) {
    summary += ` auf ${floors.length} ${floors.length === 1 ? "Geschoss" : "Geschossen"}`;
  }
  if (totalAreaSqm && totalAreaSqm > 0) {
    summary += `, ca. ${formatAreaDe(totalAreaSqm)} m²`;
  }
  return `${summary}.`;
}

function computeConfidence(extraction: DocumentExtractionResult, structuredCount: number): number {
  const lengthBase = extraction.textLength >= 4_000 ? 78 : extraction.textLength >= 1_000 ? 72 : extraction.textLength >= 250 ? 64 : 56;
  const structureBonus = Math.min(16, structuredCount * 2);
  const warningPenalty = extraction.warnings.length * 4 + (extraction.truncated ? 5 : 0);
  return Math.max(35, Math.min(95, lengthBase + structureBonus - warningPenalty));
}

export function analyzeExtractedDocument(input: AnalyzeExtractedDocumentInput): DocumentAnalysisResult {
  const text = input.extraction.text;
  const lines = sourceLines(text);
  const rooms = extractRooms(lines);
  const trades = extractTrades(text);
  const tasks = extractTasks(lines, trades);
  const defects = extractDefects(lines, trades);
  const appointments = extractAppointments(lines);
  const references = extractReferences(lines);

  // Plan-relevant extraction.
  const buildingType = extractBuildingType(input.fileName, text);
  const floors = extractFloors(text);
  const roomAreas = extractRoomAreas(text);
  const materials = extractMaterials(text);
  const totalAreaSqm = computeTotalArea(roomAreas, text);

  const structuredCount = rooms.length + trades.length + tasks.length + defects.length
    + appointments.length + references.length + floors.length + roomAreas.length + materials.length;
  const summary = composePlanSummary(buildingType, floors, roomAreas, totalAreaSqm)
    ?? fallbackSummary(lines, text);

  return {
    documentId: input.documentId,
    fileName: input.fileName,
    fileUri: input.fileUri,
    fileType: input.fileType,
    category: input.category,
    analyzedAt: new Date().toISOString(),
    analysisStatus: "completed",
    summary,
    rooms,
    trades,
    persons: [],
    companies: [],
    appointments,
    tasks,
    defects,
    quantities: [],
    references,
    buildingType,
    floors,
    roomAreas,
    totalAreaSqm,
    materials,
    entities: [],
    overallConfidence: computeConfidence(input.extraction, structuredCount),
    processingTime: Date.now() - input.startedAt,
    extraction: {
      method: input.extraction.method,
      pageCount: input.extraction.pageCount,
      textLength: input.extraction.textLength,
      truncated: input.extraction.truncated,
    },
    warnings: input.extraction.warnings,
    sourceExcerpts: lines.slice(0, 8).map((line) => line.slice(0, 240)),
  };
}
