import AsyncStorage from "@react-native-async-storage/async-storage";

// Positions documented per room: up to eight walls (A–H, for rooms with corners
// or pillars) + floor + ceiling.
export type RaumbuchPosition = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "boden" | "decke";
export const RAUMBUCH_POSITIONS: RaumbuchPosition[] = ["A", "B", "C", "D", "E", "F", "G", "H", "boden", "decke"];

/** i18n keys for each position's label. */
export const RAUMBUCH_POSITION_LABEL_KEY: Record<RaumbuchPosition, string> = {
  A: "raumbuch_wand_a",
  B: "raumbuch_wand_b",
  C: "raumbuch_wand_c",
  D: "raumbuch_wand_d",
  E: "raumbuch_wand_e",
  F: "raumbuch_wand_f",
  G: "raumbuch_wand_g",
  H: "raumbuch_wand_h",
  boden: "raumbuch_boden",
  decke: "raumbuch_decke",
};

export type RaumbuchEntry = {
  projectId: string;
  roomId: string;
  floorName: string;
  roomName: string;
  // Optional floor-plan marker shown on the room sheet.
  planId?: string;
  planName?: string;
  planX?: number; // 0..1
  planY?: number; // 0..1
  /** Optional crop of the plan (normalised 0..1) so the sheet shows only the
   *  relevant area around the room instead of the whole plan. */
  planCrop?: { x: number; y: number; w: number; h: number };
  /** Optional drawn wall lines (normalised 0..1 plan coords), labelled A–H. */
  walls?: Partial<Record<"A" | "B" | "C" | "D" | "E" | "F" | "G" | "H", { x1: number; y1: number; x2: number; y2: number }>>;
  photos: Partial<Record<RaumbuchPosition, string>>;
  notes?: Partial<Record<RaumbuchPosition, string>>;
  /** Filled-in Fragenkatalog answers for this room (second export template). */
  survey?: RaumbuchSurvey;
  updatedAt: string;
};

export type RaumbuchWallKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export type RaumbuchWall = { x1: number; y1: number; x2: number; y2: number };

// ── Fragenkatalog (room survey) ──────────────────────────────────────────────
// Shared definition used by both the in-app form and the PDF so they stay in sync.
export type RaumbuchSurveyGroup = { key: string; label: string; options: string[] };
export const RAUMBUCH_SURVEY: RaumbuchSurveyGroup[] = [
  { key: "innenwaende", label: "Innenwände", options: ["GK Q2", "GK Q3", "GK Q4", "Betonoptik", "Vlies", "Anstrich weiß", "Anstrich farbig", "Fliesen", "Sichtbeton", "Holzverkleidung", "Akustikpaneel", "Sonstiges"] },
  { key: "boden", label: "Boden", options: ["Estrich roh", "Fliesen", "Vinyl", "Parkett", "Epoxidharz", "Teppich", "Sockelleiste fehlt", "Fuge nacharbeiten", "Sonstiges"] },
  { key: "decke", label: "Decke", options: ["Beton roh", "GK glatt", "GK-Lochdecke", "Rasterdecke", "Akustikdecke", "Schattenfuge", "Revisionsklappe", "Sonstiges"] },
  { key: "installationen", label: "Installationen", options: ["Kabel vorhanden", "Kabel beschriften", "Steckdosen fehlen", "Schalter fehlt", "Netzwerk fehlt", "Sanitär offen", "Lüftung offen", "Brandschutz offen", "Sonstiges"] },
  { key: "schallschutz", label: "Schallschutz", options: ["Baffel", "Segel", "Paneel", "Akustikdecke", "Wandabsorber", "Sonstiges"] },
];
export type RaumbuchSurvey = {
  /** group key → checked option labels */
  checked?: Record<string, string[]>;
  /** group key → free text after "Sonstiges" */
  other?: Record<string, string>;
  /** group key → user-added custom points (always count as checked/selected) */
  custom?: Record<string, string[]>;
  decision?: "freigabe" | "aenderung";
  decisionNote?: string;
};

const KEY = (projectId: string) => `raumbuch_${projectId}`;

export async function getRaumbuch(projectId: string): Promise<RaumbuchEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY(projectId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getRaumbuchEntry(projectId: string, roomId: string): Promise<RaumbuchEntry | null> {
  const all = await getRaumbuch(projectId);
  return all.find((e) => e.roomId === roomId) || null;
}

export async function saveRaumbuchEntry(entry: RaumbuchEntry): Promise<void> {
  const all = await getRaumbuch(entry.projectId);
  const idx = all.findIndex((e) => e.roomId === entry.roomId);
  const next: RaumbuchEntry = { ...entry, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await AsyncStorage.setItem(KEY(entry.projectId), JSON.stringify(all));
}

export async function deleteRaumbuchEntry(projectId: string, roomId: string): Promise<void> {
  const all = await getRaumbuch(projectId);
  await AsyncStorage.setItem(KEY(projectId), JSON.stringify(all.filter((e) => e.roomId !== roomId)));
}

export function raumbuchPhotoCount(entry: RaumbuchEntry | null | undefined): number {
  if (!entry) return 0;
  return RAUMBUCH_POSITIONS.filter((p) => entry.photos?.[p]).length;
}
