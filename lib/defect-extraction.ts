/**
 * Turn a spoken defect description into structured fields.
 *
 * The user is guided to speak labelled fields, e.g.:
 *   "Geschoss Erdgeschoss, Raum Küche, Titel Fenster undicht,
 *    Beschreibung das Fenster schließt nicht richtig, Gewerk Fenster/Türen,
 *    Zuständig Max Mustermann, Frist 25. August, Priorität hoch"
 *
 * Deterministic + offline (no server) once the transcript exists. Values are
 * always editable afterwards, so a rough parse is fine.
 */

export type ExtractedDefect = {
  floor?: string;
  room?: string;
  title?: string;
  description?: string;
  gewerk?: string;
  assignee?: string;
  dueDate?: string; // "DD.MM.YYYY" when parseable, otherwise the raw phrase
  priority?: "hoch" | "mittel" | "niedrig";
};

const LABELS: { field: keyof ExtractedDefect; kw: RegExp }[] = [
  { field: "floor", kw: /\b(geschoss|etage|stockwerk)\b/i },
  { field: "room", kw: /\b(raum|zimmer)\b/i },
  { field: "title", kw: /\b(titel|überschrift|ueberschrift|kurztitel)\b/i },
  { field: "description", kw: /\b(beschreibung|mangel|problem|fehler|schaden)\b/i },
  { field: "gewerk", kw: /\b(gewerk)\b/i },
  { field: "assignee", kw: /\b(zuständige?r?|zustaendige?r?|verantwortliche?r?|zugewiesen(?:\san)?)\b/i },
  { field: "dueDate", kw: /\b(frist|fällig(?:keit)?|faellig(?:keit)?|termin|fertig\sbis)\b/i },
  { field: "priority", kw: /\b(priorität|prioritaet|prio)\b/i },
];

const MONTHS: Record<string, number> = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7,
  august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parsePriority(v: string): "hoch" | "mittel" | "niedrig" | undefined {
  const l = v.toLowerCase();
  if (/\b(hoch|hohe|hoher|dringend|kritisch|high|urgent)\b/.test(l)) return "hoch";
  if (/\b(niedrig|gering|niedrige|tief|low)\b/.test(l)) return "niedrig";
  if (/\b(mittel|normal|medium|mittlere)\b/.test(l)) return "mittel";
  return undefined;
}

function parseDueDate(v: string): string | undefined {
  const l = v.toLowerCase().trim();
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (/\bheute\b/.test(l)) return iso(now);
  if (/\bmorgen\b/.test(l) && !/übermorgen/.test(l)) { const d = new Date(now); d.setDate(d.getDate() + 1); return iso(d); }
  if (/\bübermorgen\b/.test(l)) { const d = new Date(now); d.setDate(d.getDate() + 2); return iso(d); }
  if (/\bnächste\swoche|naechste\swoche\b/.test(l)) { const d = new Date(now); d.setDate(d.getDate() + 7); return iso(d); }

  const make = (day: number, month: number, year: number) =>
    day >= 1 && day <= 31 && month >= 1 && month <= 12 ? `${year}-${pad(month)}-${pad(day)}` : undefined;

  // 25.8. / 25.08.2026 / 25.8.26
  const numeric = l.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*(\d{2,4})?/);
  if (numeric) {
    let year = numeric[3] ? parseInt(numeric[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    const r = make(parseInt(numeric[1], 10), parseInt(numeric[2], 10), year);
    if (r) return r;
  }

  // 25. August (2026)
  const named = l.match(/(\d{1,2})\.?\s*(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s*(\d{4})?/);
  if (named) {
    const year = named[3] ? parseInt(named[3], 10) : now.getFullYear();
    const r = make(parseInt(named[1], 10), MONTHS[named[2]], year);
    if (r) return r;
  }
  return undefined;
}

function tidy(v: string): string {
  return v
    .replace(/^[\s:,\-–]*(?:ist|lautet|ist:|:)?\s*/i, "")
    .replace(/[\s.,;]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function shortTitle(desc: string): string {
  const firstSentence = desc.split(/[.!?\n]/)[0].trim();
  const words = firstSentence.split(/\s+/);
  return (words.length > 8 ? words.slice(0, 8).join(" ") + " …" : firstSentence) || desc.slice(0, 60);
}

export function extractDefectFromText(text: string): ExtractedDefect {
  const src = (text || "").replace(/\s+/g, " ").trim();
  if (!src) return {};

  const hits: { field: keyof ExtractedDefect; start: number; end: number }[] = [];
  for (const { field, kw } of LABELS) {
    const m = new RegExp(kw.source, "i").exec(src);
    if (m) hits.push({ field, start: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start);

  const out: ExtractedDefect = {};
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const next = hits[i + 1];
    const raw = src.slice(h.end, next ? next.start : src.length);
    const val = tidy(raw);
    if (!val) continue;
    if (h.field === "priority") { const p = parsePriority(val); if (p) out.priority = p; }
    else if (h.field === "dueDate") out.dueDate = parseDueDate(val) || val;
    else if (!out[h.field]) (out as any)[h.field] = val;
  }

  // Derive a title if only a description was spoken (or nothing was labelled).
  if (!out.title && out.description) out.title = shortTitle(out.description);
  if (!out.title && !out.description) { out.title = shortTitle(src); out.description = src; }
  return out;
}
