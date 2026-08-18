/**
 * Extract a floor/room structure from free German text — either a voice
 * transcription ("Erdgeschoss mit Wohnzimmer, Küche und Bad, im Obergeschoss
 * zwei Schlafzimmer …") or the text layer of an uploaded plan.
 *
 * Heuristic + deterministic (no server needed). Rooms are assigned to the most
 * recently mentioned floor; quantities like "zwei Schlafzimmer" expand to
 * numbered rooms.
 */

export type ExtractedRoom = { floorLabel: string; name: string; area?: number; number?: string };
export type ExtractedStructure = { floors: string[]; rooms: ExtractedRoom[] };

// A room designation spoken next to the room, e.g. "Küche UG3" / "EG02 Bad".
// Requires a floor abbreviation (UG/EG/OG/DG/KG or "2. OG") directly followed
// by a number, so plain quantities like "3 Zimmer" are not mistaken for one.
const DESIG_AFTER = /^[\s:.\-–]*((?:UG|OG|EG|DG|KG)|\d{1,2}\.\s?OG)\s?-?\s?(\d{1,3})\b/i;
const DESIG_BEFORE = /((?:UG|OG|EG|DG|KG)|\d{1,2}\.\s?OG)\s?-?\s?(\d{1,3})[\s:.\-–]*$/i;
function normFloorPart(p: string): string {
  const up = p.toUpperCase().replace(/\s+/g, "");
  const og = up.match(/^(\d+)\.OG$/);
  return og ? `${parseInt(og[1], 10)}. OG` : up;
}

const ROOM_TERMS = [
  "Wohnzimmer", "Wohnküche", "Wohnen", "Küche", "Kochen", "Esszimmer", "Essen",
  "Schlafzimmer", "Elternschlafzimmer", "Schlafen", "Kinderzimmer", "Gästezimmer",
  "Arbeitszimmer", "Arbeiten", "Büro", "Badezimmer", "Bad", "Gäste-WC", "Gäste-Bad", "WC",
  "Dusche", "Diele", "Flur", "Windfang", "Garderobe", "Ankleide", "Abstellraum", "Abstell",
  "Hauswirtschaftsraum", "HWR", "Speisekammer", "Speis", "Vorratsraum", "Technikraum",
  "Technik", "Heizraum", "Waschküche", "Kellerraum", "Hobbyraum", "Treppenhaus", "Galerie",
  "Terrasse", "Balkon", "Loggia", "Garage", "Carport", "Zimmer",
];
const ROOM_BY_LEN = [...ROOM_TERMS].sort((a, b) => b.length - a.length);

const NUM_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8,
};

function escapeRe(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function floorRank(label: string): number {
  if (label === "KG") return 0;
  if (label === "UG") return 1;
  if (label === "EG") return 2;
  const og = label.match(/^(\d+)\. OG$/);
  if (og) return 10 + parseInt(og[1], 10);
  if (label === "OG") return 10;
  if (label === "DG") return 100;
  if (label === "Staffelgeschoss") return 101;
  return 50;
}

function findFloorMarkers(text: string): { pos: number; label: string }[] {
  const markers: { pos: number; label: string }[] = [];
  let work = text;

  // Numbered upper floors first ("2. OG" / "2. Obergeschoss").
  const numbered = /(\d{1,2})\.\s*(?:OG|Obergeschoss)/gi;
  let m: RegExpExecArray | null;
  while ((m = numbered.exec(text)) !== null) {
    markers.push({ pos: m.index, label: `${parseInt(m[1], 10)}. OG` });
  }
  // Blank them (same length) so a bare "OG" scan won't re-match them.
  work = text.replace(numbered, (s) => " ".repeat(s.length));

  const scan = (re: RegExp, label: string) => {
    const r = new RegExp(re.source, "gi");
    let mm: RegExpExecArray | null;
    while ((mm = r.exec(work)) !== null) markers.push({ pos: mm.index, label });
  };
  scan(/Kellergeschoss|\bKG\b/, "KG");
  scan(/Untergeschoss|\bUG\b|\bKeller\b/, "UG");
  scan(/Erdgeschoss|\bEG\b|Parterre/, "EG");
  scan(/Dachgeschoss|\bDG\b/, "DG");
  scan(/Staffelgeschoss/, "Staffelgeschoss");
  scan(/Obergeschoss|\bOG\b/, "OG");

  return markers.sort((a, b) => a.pos - b.pos);
}

export function extractStructureFromText(text: string): ExtractedStructure {
  const src = (text || "").replace(/\s+/g, " ").trim();
  if (!src) return { floors: [], rooms: [] };

  const markers = findFloorMarkers(src);
  const floorAt = (pos: number): string => {
    let label = markers.length ? "" : "EG";
    for (const mk of markers) {
      if (mk.pos <= pos) label = mk.label;
      else break;
    }
    return label || (markers[0]?.label ?? "EG");
  };

  const rooms: ExtractedRoom[] = [];
  const seen = new Set<string>();
  const counters: Record<string, number> = {};

  for (const term of ROOM_BY_LEN) {
    const re = new RegExp(`\\b${escapeRe(term)}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const pos = m.index;
      let floorLabel = floorAt(pos);

      // Quantity right before the term ("zwei Schlafzimmer" / "3 Zimmer").
      const before = src.slice(Math.max(0, pos - 14), pos).toLowerCase();
      const digit = before.match(/(\d{1,2})\s*$/);
      const word = before.match(/\b([a-zäöü]+)\s*$/);
      let qty = 1;
      if (digit) qty = Math.min(8, parseInt(digit[1], 10) || 1);
      else if (word && NUM_WORDS[word[1]]) qty = NUM_WORDS[word[1]];

      // Area right after ("… 14,3 m²").
      const after = src.slice(pos, pos + 40);
      const areaMatch = after.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:m²|m2|qm)/i);
      const area = areaMatch ? Math.round(parseFloat(areaMatch[1].replace(",", ".")) * 100) / 100 : undefined;

      // Optional designation directly next to the term ("Küche UG3" / "UG3 Küche").
      // A single specific room only — quantities stay generic.
      let designation: string | undefined;
      if (qty === 1) {
        let dm = src.slice(pos + term.length, pos + term.length + 12).match(DESIG_AFTER);
        if (!dm) dm = src.slice(Math.max(0, pos - 10), pos).match(DESIG_BEFORE);
        if (dm) {
          const fp = normFloorPart(dm[1]);
          designation = `${fp.replace(/\s+/g, "")}${dm[2]}`;
          floorLabel = fp;
        }
      }

      if (qty > 1) {
        for (let i = 1; i <= qty; i++) {
          const name = `${term} ${i}`;
          const key = `${floorLabel}|${name.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rooms.push({ floorLabel, name, area });
        }
      } else {
        const dupKey = `${floorLabel}|${term.toLowerCase()}`;
        let name = term;
        if (seen.has(dupKey)) {
          counters[dupKey] = (counters[dupKey] || 1) + 1;
          name = `${term} ${counters[dupKey]}`;
        }
        const key = `${floorLabel}|${name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rooms.push({ floorLabel, name, area, number: designation });
      }
      if (rooms.length >= 60) break;
    }
    if (rooms.length >= 60) break;
  }

  const floorSet = new Set<string>(markers.map((mk) => mk.label));
  for (const r of rooms) floorSet.add(r.floorLabel);
  if (floorSet.size === 0) floorSet.add("EG");
  const floors = [...floorSet].sort((a, b) => floorRank(a) - floorRank(b));

  return { floors, rooms };
}
