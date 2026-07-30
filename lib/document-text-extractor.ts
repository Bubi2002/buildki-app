/**
 * Design: deterministic document extraction with explicit failure states.
 * No upload may be marked successful until real source text was extracted.
 */
import * as FileSystem from "expo-file-system";
import JSZip from "jszip";
import { Platform } from "react-native";

import type { DocumentFileType } from "@/lib/document-ai";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 150_000;
const MIN_MEANINGFUL_CHARS = 20;

export type DocumentExtractionMethod =
  | "native_pdf_text"
  | "docx_xml"
  | "xlsx_xml"
  | "plain_text";

export type DocumentExtractionErrorCode =
  | "FILE_TOO_LARGE"
  | "PDF_MODULE_UNAVAILABLE"
  | "PASSWORD_REQUIRED"
  | "INCORRECT_PASSWORD"
  | "CORRUPT_DOCUMENT"
  | "EMPTY_TEXT"
  | "UNSUPPORTED_FORMAT"
  | "READ_FAILED";

export interface DocumentExtractionResult {
  text: string;
  method: DocumentExtractionMethod;
  pageCount?: number;
  textLength: number;
  truncated: boolean;
  warnings: string[];
}

export interface DocumentExtractionRequest {
  fileUri: string;
  fileName: string;
  fileType: DocumentFileType;
  fileSize?: number;
  password?: string;
}

export class DocumentExtractionError extends Error {
  constructor(
    public readonly code: DocumentExtractionErrorCode,
    public readonly userMessage: string,
    message = userMessage,
  ) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

function decodeXmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function finalizeText(
  rawText: string,
  method: DocumentExtractionMethod,
  options: { pageCount?: number; warnings?: string[] } = {},
): DocumentExtractionResult {
  const normalized = normalizeText(rawText);
  if (normalized.length < MIN_MEANINGFUL_CHARS) {
    throw new DocumentExtractionError(
      "EMPTY_TEXT",
      method === "native_pdf_text"
        ? "Das PDF enthält keine auswertbare Textebene. Bei einem Scan bitte die Seiten als Bilder hochladen."
        : "Das Dokument enthält keinen auswertbaren Text.",
    );
  }

  const truncated = normalized.length > MAX_EXTRACTED_CHARS;
  const text = truncated ? normalized.slice(0, MAX_EXTRACTED_CHARS) : normalized;
  const warnings = [...(options.warnings ?? [])];
  if (truncated) {
    warnings.push("Das Dokument war sehr umfangreich; für die Analyse wurden die ersten 150.000 Zeichen verwendet.");
  }

  return {
    text,
    method,
    pageCount: options.pageCount,
    textLength: normalized.length,
    truncated,
    warnings,
  };
}

async function readBase64(fileUri: string): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (error) {
    throw new DocumentExtractionError(
      "READ_FAILED",
      "Die ausgewählte Datei konnte nicht gelesen werden.",
      error instanceof Error ? error.message : undefined,
    );
  }
}

async function readUtf8(fileUri: string): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (error) {
    throw new DocumentExtractionError(
      "READ_FAILED",
      "Die ausgewählte Datei konnte nicht gelesen werden.",
      error instanceof Error ? error.message : undefined,
    );
  }
}

async function extractPdf(request: DocumentExtractionRequest): Promise<DocumentExtractionResult> {
  if (Platform.OS === "web") {
    throw new DocumentExtractionError(
      "PDF_MODULE_UNAVAILABLE",
      "Die PDF-Textextraktion ist in der Webvorschau nicht verfügbar. Bitte die installierte iOS- oder Android-App verwenden.",
    );
  }

  const module = await import("expo-pdf-text-extract");
  if (!module.isAvailable()) {
    throw new DocumentExtractionError(
      "PDF_MODULE_UNAVAILABLE",
      "Diese App-Version enthält die PDF-Textextraktion noch nicht. Bitte nach dem nächsten App-Update erneut versuchen.",
    );
  }

  const info = await module.extractTextWithInfo(request.fileUri, request.password);
  if (!info.success) {
    if (info.errorCode === "PASSWORD_REQUIRED") {
      throw new DocumentExtractionError("PASSWORD_REQUIRED", "Das PDF ist passwortgeschützt. Bitte eine ungeschützte Kopie hochladen.");
    }
    if (info.errorCode === "INCORRECT_PASSWORD") {
      throw new DocumentExtractionError("INCORRECT_PASSWORD", "Das eingegebene PDF-Passwort ist nicht korrekt.");
    }
    if (info.errorCode === "CORRUPT_PDF") {
      throw new DocumentExtractionError("CORRUPT_DOCUMENT", "Das PDF ist beschädigt oder kann nicht gelesen werden.");
    }
    throw new DocumentExtractionError("READ_FAILED", info.error || "Das PDF konnte nicht ausgelesen werden.");
  }

  return finalizeText(info.text, "native_pdf_text", { pageCount: info.pageCount });
}

async function loadZip(fileUri: string): Promise<JSZip> {
  try {
    const base64 = await readBase64(fileUri);
    return await JSZip.loadAsync(base64, { base64: true, checkCRC32: true });
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError(
      "CORRUPT_DOCUMENT",
      "Das Office-Dokument ist beschädigt oder hat ein nicht unterstütztes Format.",
      error instanceof Error ? error.message : undefined,
    );
  }
}

function xmlToText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/gi, "\t")
      .replace(/<w:br\b[^>]*\/>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<\/w:tr>/gi, "\n")
      .replace(/<\/w:tc>/gi, "\t")
      .replace(/<[^>]+>/g, ""),
  );
}

async function extractDocx(fileUri: string): Promise<DocumentExtractionResult> {
  const zip = await loadZip(fileUri);
  const candidates = Object.keys(zip.files)
    .filter((name) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(name))
    .sort((a, b) => (a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)));

  if (!candidates.includes("word/document.xml")) {
    throw new DocumentExtractionError("CORRUPT_DOCUMENT", "Die DOCX-Hauptdatei konnte nicht gefunden werden.");
  }

  const parts: string[] = [];
  for (const name of candidates) {
    const file = zip.file(name);
    if (!file) continue;
    parts.push(xmlToText(await file.async("string")));
    if (parts.join("\n").length > MAX_EXTRACTED_CHARS * 2) break;
  }

  return finalizeText(parts.join("\n"), "docx_xml");
}

function extractTagText(xml: string, tagName: string): string[] {
  const values: string[] = [];
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    values.push(decodeXmlEntities(match[1].replace(/<[^>]+>/g, "")));
  }
  return values;
}

async function extractXlsx(fileUri: string): Promise<DocumentExtractionResult> {
  const zip = await loadZip(fileUri);
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings: string[] = [];
  if (sharedStringsFile) {
    const xml = await sharedStringsFile.async("string");
    const items = xml.match(/<si\b[\s\S]*?<\/si>/gi) ?? [];
    for (const item of items) {
      sharedStrings.push(extractTagText(item, "t").join(""));
    }
  }

  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, 25);

  if (sheetNames.length === 0) {
    throw new DocumentExtractionError("CORRUPT_DOCUMENT", "Im XLSX-Dokument wurden keine Tabellenblätter gefunden.");
  }

  const rows: string[] = [];
  for (const sheetName of sheetNames) {
    const file = zip.file(sheetName);
    if (!file) continue;
    const xml = await file.async("string");
    const rowXml = xml.match(/<row\b[\s\S]*?<\/row>/gi) ?? [];
    for (const row of rowXml) {
      const cells = row.match(/<c\b[\s\S]*?<\/c>/gi) ?? [];
      const values = cells.map((cell) => {
        const type = cell.match(/\bt="([^"]+)"/i)?.[1];
        if (type === "inlineStr") return extractTagText(cell, "t").join("");
        const rawValue = extractTagText(cell, "v")[0] ?? "";
        if (type === "s") return sharedStrings[Number(rawValue)] ?? rawValue;
        if (type === "b") return rawValue === "1" ? "WAHR" : "FALSCH";
        return rawValue;
      });
      if (values.some((value) => value.trim())) rows.push(values.join("\t"));
      if (rows.join("\n").length > MAX_EXTRACTED_CHARS * 2) break;
    }
  }

  return finalizeText(rows.join("\n"), "xlsx_xml");
}

export async function extractDocumentText(request: DocumentExtractionRequest): Promise<DocumentExtractionResult> {
  if (request.fileSize && request.fileSize > MAX_FILE_BYTES) {
    throw new DocumentExtractionError(
      "FILE_TOO_LARGE",
      `Die Datei ist größer als 20 MB (${(request.fileSize / 1024 / 1024).toFixed(1)} MB).`,
    );
  }

  if (request.fileType === "pdf") return extractPdf(request);
  if (request.fileType === "docx") return extractDocx(request.fileUri);
  if (request.fileType === "xlsx") {
    if (/\.csv$/i.test(request.fileName)) return finalizeText(await readUtf8(request.fileUri), "plain_text");
    if (/\.xls$/i.test(request.fileName)) {
      throw new DocumentExtractionError("UNSUPPORTED_FORMAT", "Alte XLS-Dateien werden nicht unterstützt. Bitte als XLSX oder CSV speichern.");
    }
    return extractXlsx(request.fileUri);
  }

  throw new DocumentExtractionError(
    "UNSUPPORTED_FORMAT",
    "Dieses Dateiformat kann nicht als Textdokument analysiert werden.",
  );
}
