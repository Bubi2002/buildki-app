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

function extractQuantities(lines: string[]): { item: string; amount: string; unit: string }[] {
  const quantities: { item: string; amount: string; unit: string }[] = [];
  const pattern = /\b(\d+(?:[.,]\d+)?)\s*(m²|m2|m³|m3|m|cm|mm|kg|t|Stk\.?|Stück|Std\.?|h)\b/i;
  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;
    quantities.push({ item: cleanLine(line).slice(0, 160), amount: match[1], unit: match[2] });
  }
  return quantities.slice(0, 40);
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

function computeConfidence(extraction: DocumentExtractionResult, structuredCount: number): number {
  const lengthBase = extraction.textLength >= 4_000 ? 78 : extraction.textLength >= 1_000 ? 72 : extraction.textLength >= 250 ? 64 : 56;
  const structureBonus = Math.min(16, structuredCount * 2);
  const warningPenalty = extraction.warnings.length * 4 + (extraction.truncated ? 5 : 0);
  return Math.max(35, Math.min(95, lengthBase + structureBonus - warningPenalty));
}

export function analyzeExtractedDocument(input: AnalyzeExtractedDocumentInput): DocumentAnalysisResult {
  const lines = sourceLines(input.extraction.text);
  const rooms = extractRooms(lines);
  const trades = extractTrades(input.extraction.text);
  const tasks = extractTasks(lines, trades);
  const defects = extractDefects(lines, trades);
  const appointments = extractAppointments(lines);
  const quantities = extractQuantities(lines);
  const references = extractReferences(lines);
  const structuredCount = rooms.length + trades.length + tasks.length + defects.length + appointments.length + quantities.length + references.length;

  return {
    documentId: input.documentId,
    fileName: input.fileName,
    fileUri: input.fileUri,
    fileType: input.fileType,
    category: input.category,
    analyzedAt: new Date().toISOString(),
    analysisStatus: "completed",
    summary: summarize(input.extraction.text),
    rooms,
    trades,
    persons: [],
    companies: [],
    appointments,
    tasks,
    defects,
    quantities,
    references,
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
