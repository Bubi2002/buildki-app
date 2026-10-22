/**
 * Normalise the Mängel part of a "Mängelliste" protocol into Markdown tables.
 *
 * The in-app Mangel cards ("Kästen") and the PDF Mangel table are rendered ONLY
 * from Markdown table rows. The AI, however, sometimes returns the Mängel as a
 * bullet list (one "- **Mangelbeschreibung:** …" group per defect), especially
 * when the transcript is split into room chapters — then the cards disappear.
 *
 * This converts such bullet groups into a Markdown table (one row per defect),
 * grouped per room heading, with the house columns. It is LOSSLESS and
 * IDEMPOTENT: text that already uses tables (or has no Mängel bullets) passes
 * through unchanged, so it is safe to run on generation, on regeneration and as
 * a one-time heal when an existing protocol is opened.
 */

const COLUMNS = ["Nr.", "Ort / Raum", "Mangelbeschreibung", "Gewerk / Verantwortlich", "Priorität", "Frist zur Beseitigung"];

type Row = { ort: string; desc: string; gewerk: string; prio: string; frist: string };

export function isMaengelTemplate(templateId?: string): boolean {
  return templateId === "maengelliste";
}

const cleanCell = (s: string) => (s || "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();

const stripHeading = (s: string) =>
  s.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/^\d+[.)]\s*/, "").trim();

// Parse a bullet line into a known Mangel field, or null if it is not one.
function matchField(line: string): { field: "desc" | "ort" | "gewerk" | "prio" | "frist"; value: string } | null {
  let s = line.replace(/^\s*[-*•]\s+/, "");
  if (s === line) return null; // not a bullet line
  s = s.replace(/^\*\*/, "");
  const colon = s.indexOf(":");
  if (colon < 0) return null;
  const label = s.slice(0, colon).replace(/\*\*/g, "").trim().toLowerCase();
  const value = s.slice(colon + 1).replace(/^\*\*/, "").trim();
  if (/^(mangelbeschreibung|mangel|beschreibung|feststellung|schaden)$/.test(label)) return { field: "desc", value };
  if (/^(ort|raum|ort\s*\/\s*raum|lage)$/.test(label)) return { field: "ort", value };
  if (/^(gewerk|verantwortlich|gewerk\s*\/\s*verantwortlich|zust(ä|ae)ndig|verantwortung)$/.test(label)) return { field: "gewerk", value };
  if (/^(priorit(ä|ae)t|priority|dringlichkeit)$/.test(label)) return { field: "prio", value };
  if (/^(frist|frist zur beseitigung|termin|f(ä|ae)llig|deadline)$/.test(label)) return { field: "frist", value };
  return null;
}

const isFotoLine = (s: string) => /^\*?\s*\[?\s*foto\s*\d+/i.test(s.trim());

export function normalizeMaengelTables(text: string): string {
  if (!text || !text.includes("-")) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let rows: Row[] = [];
  let cur: Row | null = null;
  let currentRoom = "";
  let nr = 0;

  const flush = () => {
    if (cur) { rows.push(cur); cur = null; }
    const usable = rows.filter((r) => r.desc.trim());
    rows = [];
    if (!usable.length) return;
    if (out.length && out[out.length - 1].trim() !== "") out.push("");
    const header = `| ${COLUMNS.join(" | ")} |`;
    const sep = `| ${COLUMNS.map(() => "---").join(" | ")} |`;
    const body = usable
      .map((r) => `| ${++nr} | ${cleanCell(r.ort)} | ${cleanCell(r.desc)} | ${cleanCell(r.gewerk)} | ${cleanCell(r.prio)} | ${cleanCell(r.frist)} |`)
      .join("\n");
    out.push(`${header}\n${sep}\n${body}`, "");
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^#{1,6}\s+/.test(trimmed)) { flush(); currentRoom = stripHeading(trimmed); out.push(raw); continue; }
    if (trimmed === "") {
      if (cur) { rows.push(cur); cur = null; }
      else if (rows.length === 0) out.push(raw);
      continue;
    }
    const field = matchField(raw);
    if (field) {
      if (field.field === "desc") {
        if (cur) rows.push(cur);
        cur = { ort: currentRoom, desc: field.value, gewerk: "", prio: "", frist: "" };
        continue;
      }
      if (cur) {
        if (field.field === "ort") cur.ort = field.value || cur.ort;
        else cur[field.field] = field.value;
        continue;
      }
      // Field without an active Mangel → leave as-is.
      flush();
      out.push(raw);
      continue;
    }
    if (isFotoLine(trimmed) && (cur || rows.length)) {
      const target = cur || rows[rows.length - 1];
      const tag = trimmed.replace(/^\*+\s*/, "").replace(/\*+$/, "").trim();
      const norm = tag.startsWith("[") ? tag : `[${tag.replace(/[\[\]]/g, "")}]`;
      target.desc = `${target.desc} ${norm}`.trim();
      continue;
    }
    // Any other content ends the current Mangel run.
    flush();
    out.push(raw);
  }
  flush();
  // Collapse the trailing blank flush() may have added.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
