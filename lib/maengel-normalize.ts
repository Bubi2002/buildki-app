/**
 * Normalise the Mängel part of a "Mängelliste" protocol into Markdown tables.
 *
 * The in-app Mangel cards ("Kästen") and the PDF Mangel table are rendered ONLY
 * from Markdown table rows. The AI, however, sometimes returns the Mängel as a
 * bullet list (one "- **Mangelbeschreibung:** …" group per defect), especially
 * when the transcript is split into room chapters — then the cards disappear.
 *
 * This converts such bullet groups into a Markdown table (one row per defect),
 * grouped per room heading, with the house columns. It ALSO rebuilds existing
 * Mängel tables into the same shape — which is how the "Priorität" column is
 * dropped everywhere (the AI kept inventing priorities). It is IDEMPOTENT:
 * running it again produces the same output, so it is safe on generation, on
 * regeneration and as a one-time heal when an existing protocol is opened.
 */

// Priorität is intentionally NOT a column anymore (removed on user request).
const COLUMNS = ["Nr.", "Ort / Raum", "Mangelbeschreibung", "Gewerk / Verantwortlich", "Frist zur Beseitigung"];

type Row = { ort: string; desc: string; gewerk: string; frist: string };

export function isMaengelTemplate(templateId?: string): boolean {
  return templateId === "maengelliste";
}

const cleanCell = (s: string) => (s || "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();

const stripHeading = (s: string) =>
  s.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/^\d+[.)]\s*/, "").trim();

// Parse a bullet line into a known Mangel field, or null if it is not one.
// "prio" is recognised so it can be SKIPPED (not emitted), not kept.
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
  if (/^(priorit(ä|ae)t|priority|dringlichkeit|schweregrad)$/.test(label)) return { field: "prio", value };
  if (/^(frist|frist zur beseitigung|termin|f(ä|ae)llig|deadline)$/.test(label)) return { field: "frist", value };
  return null;
}

const isFotoLine = (s: string) => /^\*?\s*\[?\s*foto\s*\d+/i.test(s.trim());
const isTableLine = (s: string) => { const t = s.trim(); return t.startsWith("|") && t.endsWith("|"); };
const splitCells = (s: string) => s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isSeparator = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));

export function normalizeMaengelTables(text: string): string {
  if (!text) return text;
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
      .map((r) => `| ${++nr} | ${cleanCell(r.ort)} | ${cleanCell(r.desc)} | ${cleanCell(r.gewerk)} | ${cleanCell(r.frist)} |`)
      .join("\n");
    out.push(`${header}\n${sep}\n${body}`, "");
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (/^#{1,6}\s+/.test(trimmed)) { flush(); currentRoom = stripHeading(trimmed); out.push(raw); continue; }

    // Existing Markdown table block → rebuild without the Priorität column (or
    // pass through unchanged if it is not a Mängel table).
    if (isTableLine(raw)) {
      const block: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) { block.push(lines[i]); i++; }
      i--; // step back; the for-loop will advance
      const header = splitCells(block[0]);
      const isMangel = header.some((h) => /mangelbeschreibung|beschreibung|mangel/.test(h.toLowerCase()));
      if (!isMangel) { flush(); out.push(...block); continue; }
      const find = (re: RegExp) => header.findIndex((h) => re.test(h.toLowerCase()));
      const iOrt = find(/ort|raum|lage/);
      const iDesc = find(/mangelbeschreibung|beschreibung|mangel/);
      const iGewerk = find(/gewerk|verantwort|firma/);
      const iFrist = find(/frist|beseitig|termin|datum|f(ä|ae)llig/);
      for (let r = 1; r < block.length; r++) {
        const cells = splitCells(block[r]);
        if (isSeparator(cells)) continue;
        const get = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx] : "");
        const desc = get(iDesc);
        if (!desc.trim()) continue;
        rows.push({ ort: get(iOrt) || currentRoom, desc, gewerk: get(iGewerk), frist: get(iFrist) });
      }
      continue;
    }

    if (trimmed === "") {
      if (cur) { rows.push(cur); cur = null; }
      else if (rows.length === 0) out.push(raw);
      continue;
    }

    const field = matchField(raw);
    if (field) {
      if (field.field === "desc") {
        if (cur) rows.push(cur);
        cur = { ort: currentRoom, desc: field.value, gewerk: "", frist: "" };
        continue;
      }
      if (field.field === "prio") continue; // drop priority entirely
      if (cur) {
        if (field.field === "ort") cur.ort = field.value || cur.ort;
        else if (field.field === "gewerk") cur.gewerk = field.value;
        else if (field.field === "frist") cur.frist = field.value;
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

    flush();
    out.push(raw);
  }
  flush();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
