import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDefects, saveDefect, type Defect, type DefectPriority } from "@/lib/defect-store";
import { decodeUnicodeEscapes } from "@/lib/display-text";
import { parseReportMarkdown } from "@/lib/report-markdown-parser";

export type StoredProtocolForDefectSync = {
  id: string;
  projectId?: string;
  protocol?: string;
  transcription?: string;
  createdAt?: string;
  photos?: string[];
};

export type ProtocolDefectCandidate = {
  title: string;
  description: string;
  location?: string;
  trade?: string;
  priority: DefectPriority;
  dueDate?: string;
  confidence: number;
};

export type ProtocolDefectSyncResult = {
  candidates: number;
  added: number;
  migrated: number;
  skipped: number;
};

const DEFECT_SECTION_PATTERN = /mängel|maengel|beanstand|schäden|schaeden|probleme|hindernisse/i;
const NO_DEFECT_PATTERN = /keine\s+(mängel|maengel|beanstandungen|schäden|schaeden)|mängelfrei|maengelfrei/i;
const DEFECT_SIGNAL_PATTERN = /\b(mangel|mängel|maengel|fehlt|fehlen|fehlend|beschädigt|beschaedigt|defekt|undicht|riss|gerissen|locker|gebrochen|kratzer|abplatzung|fehlstelle|schimmel|feuchtigkeit|rost|leck|hohlstelle|uneben|verschmutzt|nicht\s+(montiert|eingebaut|fertig|funktionsfähig|funktionsfaehig)|funktioniert\s+nicht)\b/i;

function cleanText(value: unknown): string {
  return decodeUnicodeEscapes(String(value || ""))
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFingerprintPart(value: unknown): string {
  return cleanText(value)
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const SEMANTIC_STOP_WORDS = new Set([
  "aber", "das", "der", "die", "ein", "eine", "einer", "eines", "im", "in", "ist", "mit", "noch", "und", "von", "zu",
]);

function significantTokens(value: string): Set<string> {
  return new Set(
    normalizeFingerprintPart(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !SEMANTIC_STOP_WORDS.has(token)),
  );
}

function descriptionsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeFingerprintPart(left);
  const normalizedRight = normalizeFingerprintPart(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }
  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  const smallerSize = Math.min(leftTokens.size, rightTokens.size);
  if (smallerSize < 2) return false;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / smallerSize >= 0.75;
}

function parsePriority(value: string): DefectPriority {
  if (/hoch|kritisch|critical|major|dringend/i.test(value)) return "hoch";
  if (/niedrig|gering|minor|cosmetic/i.test(value)) return "niedrig";
  return "mittel";
}

function parseDueDate(value: string): string | undefined {
  const isoMatch = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const germanMatch = value.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (!germanMatch) return undefined;
  return `${germanMatch[3]}-${germanMatch[2].padStart(2, "0")}-${germanMatch[1].padStart(2, "0")}`;
}

function findHeader(headers: string[], pattern: RegExp): number {
  return headers.findIndex((header) => pattern.test(normalizeFingerprintPart(header)));
}

function createCandidateFromText(rawText: string, confidence: number): ProtocolDefectCandidate | null {
  const text = cleanText(rawText);
  if (!text || NO_DEFECT_PATTERN.test(text)) return null;

  const locationMatch = text.match(/(?:ort|raum|bereich|geschoss)\s*:\s*([^;|,]+)(?:[;|,]|$)/i);
  const tradeMatch = text.match(/(?:gewerk|verantwortlich|firma)\s*:\s*([^;|,]+)(?:[;|,]|$)/i);
  const priorityMatch = text.match(/(?:priorität|prioritaet|schwere(?:grad)?|dringlichkeit)\s*:\s*([^;|,]+)(?:[;|,]|$)/i);
  const descriptionMatch = text.match(/(?:mangel(?:beschreibung)?|beschreibung|befund|problem)\s*:\s*(.+?)(?=(?:[;|,]\s*(?:ort|raum|bereich|geschoss|gewerk|verantwortlich|firma|priorität|prioritaet|schwere(?:grad)?|dringlichkeit|frist|termin)\s*:)|$)/i);
  const description = cleanText(descriptionMatch?.[1] || text);
  if (!description || !DEFECT_SIGNAL_PATTERN.test(description)) return null;

  return {
    title: description.length > 110 ? `${description.slice(0, 107).trim()}…` : description,
    description,
    location: cleanText(locationMatch?.[1]) || undefined,
    trade: cleanText(tradeMatch?.[1]) || undefined,
    priority: parsePriority(priorityMatch?.[1] || text),
    dueDate: parseDueDate(text),
    confidence,
  };
}

export function extractProtocolDefectCandidates(protocolText: string, transcription = ""): ProtocolDefectCandidate[] {
  const blocks = parseReportMarkdown(decodeUnicodeEscapes(protocolText || ""));
  const candidates: ProtocolDefectCandidate[] = [];
  let insideDefectSection = false;

  for (const block of blocks) {
    if (block.type === "heading") {
      insideDefectSection = DEFECT_SECTION_PATTERN.test(block.text);
      continue;
    }

    if (block.type === "table") {
      const descriptionIndex = findHeader(block.headers, /mangel|beschreibung|befund|problem|schaden/);
      if (descriptionIndex < 0) continue;
      const locationIndex = findHeader(block.headers, /ort|raum|bereich|geschoss|location/);
      const tradeIndex = findHeader(block.headers, /gewerk|verantwortlich|firma|trade/);
      const priorityIndex = findHeader(block.headers, /prioritat|schwere|dringlichkeit|priority/);
      const dueDateIndex = findHeader(block.headers, /frist|termin|datum|deadline/);

      for (const row of block.rows) {
        const description = cleanText(row[descriptionIndex]);
        if (!description || NO_DEFECT_PATTERN.test(description)) continue;
        candidates.push({
          title: description.length > 110 ? `${description.slice(0, 107).trim()}…` : description,
          description,
          location: locationIndex >= 0 ? cleanText(row[locationIndex]) || undefined : undefined,
          trade: tradeIndex >= 0 ? cleanText(row[tradeIndex]) || undefined : undefined,
          priority: parsePriority(priorityIndex >= 0 ? row[priorityIndex] : description),
          dueDate: dueDateIndex >= 0 ? parseDueDate(row[dueDateIndex]) : undefined,
          confidence: 0.92,
        });
      }
      continue;
    }

    if (block.type === "list") {
      const sectionIndex = block.items.findIndex((item) => DEFECT_SECTION_PATTERN.test(item));
      if (sectionIndex >= 0) insideDefectSection = true;
      if (!insideDefectSection) continue;
      const items = sectionIndex >= 0 ? block.items.slice(sectionIndex + 1) : block.items;
      for (const item of items) {
        const candidate = createCandidateFromText(item, 0.88);
        if (candidate) candidates.push(candidate);
      }
      continue;
    }

    if (insideDefectSection && block.type === "paragraph") {
      if (DEFECT_SECTION_PATTERN.test(block.text) && block.text.length < 80) {
        insideDefectSection = true;
        continue;
      }
      const candidate = createCandidateFromText(block.text, 0.86);
      if (candidate) candidates.push(candidate);
    }
  }

  if (transcription.trim()) {
    const sentences = decodeUnicodeEscapes(transcription)
      .split(/[.!?;]\s+|\n+/)
      .map(cleanText)
      .filter(Boolean);
    for (const sentence of sentences) {
      if (!DEFECT_SIGNAL_PATTERN.test(sentence) || NO_DEFECT_PATTERN.test(sentence)) continue;
      const candidate = createCandidateFromText(sentence, 0.76);
      if (!candidate) continue;
      const alreadyCovered = candidates.some((existing) => descriptionsOverlap(existing.title, candidate.title));
      if (!alreadyCovered) candidates.push(candidate);
    }
  }

  const unique = new Map<string, ProtocolDefectCandidate>();
  for (const candidate of candidates) {
    const fingerprint = [candidate.title, candidate.location, candidate.trade, candidate.dueDate]
      .map(normalizeFingerprintPart)
      .join("|");
    if (!unique.has(fingerprint)) unique.set(fingerprint, candidate);
  }
  return [...unique.values()];
}

function categoryFromTrade(trade?: string): string {
  const normalized = normalizeFingerprintPart(trade);
  if (normalized.includes("elektr")) return "Elektrik";
  if (normalized.includes("sanitar")) return "Sanitär";
  if (normalized.includes("brand")) return "Brandschutz";
  if (normalized.includes("dach") || normalized.includes("fassad")) return "Feuchtigkeit";
  if (normalized.includes("rohbau")) return "Riss/Bruch";
  if (normalized.includes("maler") || normalized.includes("trockenbau")) return "Oberfläche";
  return "Sonstiges";
}

function defectFingerprint(protocolId: string, candidate: ProtocolDefectCandidate): string {
  return [protocolId, candidate.title, candidate.location, candidate.trade, candidate.dueDate]
    .map(normalizeFingerprintPart)
    .join("|");
}

function isLegacySemanticMatch(defect: Defect, candidate: ProtocolDefectCandidate): boolean {
  if (defect.protocolId) return false;
  const defectTitle = normalizeFingerprintPart(defect.title);
  const candidateTitle = normalizeFingerprintPart(candidate.title);
  if (!defectTitle || !candidateTitle) return false;
  const defectLocation = normalizeFingerprintPart(defect.location);
  const candidateLocation = normalizeFingerprintPart(candidate.location);
  if (defectLocation && candidateLocation && defectLocation !== candidateLocation) return false;
  return defectTitle === candidateTitle || defectTitle.includes(candidateTitle) || candidateTitle.includes(defectTitle);
}

export async function syncProtocolDefects(protocol: StoredProtocolForDefectSync): Promise<ProtocolDefectSyncResult> {
  if (!protocol.id || !protocol.projectId) return { candidates: 0, added: 0, migrated: 0, skipped: 0 };
  const candidates = extractProtocolDefectCandidates(protocol.protocol || "", protocol.transcription || "");
  if (candidates.length === 0) return { candidates: 0, added: 0, migrated: 0, skipped: 0 };

  const existing = await getDefects();
  let added = 0;
  let migrated = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const fingerprint = defectFingerprint(protocol.id, candidate);
    const id = `protocol-defect-${stableHash(fingerprint)}`;
    if (existing.some((defect) => defect.id === id)) {
      skipped += 1;
      continue;
    }

    const legacy = existing.find((defect) => defect.projectId === protocol.projectId && isLegacySemanticMatch(defect, candidate));
    if (legacy) {
      const migratedDefect: Defect = {
        ...legacy,
        protocolId: protocol.id,
        source: legacy.source || "speech",
        analysisId: legacy.analysisId || `protocol:${protocol.id}`,
        confidence: legacy.confidence ?? candidate.confidence,
      };
      await saveDefect(migratedDefect);
      existing.splice(existing.indexOf(legacy), 1, migratedDefect);
      migrated += 1;
      continue;
    }

    const timestamp = protocol.createdAt || new Date().toISOString();
    const newDefect: Defect = {
      id,
      projectId: protocol.projectId,
      protocolId: protocol.id,
      title: candidate.title,
      description: candidate.description,
      status: "offen",
      priority: candidate.priority,
      category: categoryFromTrade(candidate.trade),
      gewerk: candidate.trade,
      photos: protocol.photos || [],
      dueDate: candidate.dueDate,
      location: candidate.location,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "speech",
      confidence: candidate.confidence,
      analysisId: `protocol:${protocol.id}`,
    };
    await saveDefect(newDefect);
    existing.push(newDefect);
    added += 1;
  }

  return { candidates: candidates.length, added, migrated, skipped };
}

export async function syncStoredProtocolDefects(projectId: string): Promise<ProtocolDefectSyncResult> {
  const raw = await AsyncStorage.getItem("protocols");
  const protocols: StoredProtocolForDefectSync[] = raw ? JSON.parse(raw) : [];
  const matching = protocols.filter((protocol) => protocol.projectId === projectId && (protocol.protocol || protocol.transcription));
  const total: ProtocolDefectSyncResult = { candidates: 0, added: 0, migrated: 0, skipped: 0 };
  for (const protocol of matching) {
    const result = await syncProtocolDefects(protocol);
    total.candidates += result.candidates;
    total.added += result.added;
    total.migrated += result.migrated;
    total.skipped += result.skipped;
  }
  return total;
}
