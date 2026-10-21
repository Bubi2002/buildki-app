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
  /** One or more photos per position. Legacy entries store a single string; new
   *  entries store a string[] (a long wall can need several shots). Always read
   *  via `raumbuchPhotosFor()` to normalise both shapes. */
  photos: Partial<Record<RaumbuchPosition, string | string[]>>;
  notes?: Partial<Record<RaumbuchPosition, string>>;
  /** Filled-in Fragenkatalog answers for this room (second export template). */
  survey?: RaumbuchSurvey;
  /** Previously completed documentation rounds (archived via "Speichern & Neu").
   *  The live entry keeps the plan + walls; each archive is a snapshot of one
   *  round's photos/notes/survey (plus the plan context at that time). */
  archives?: RaumbuchArchive[];
  updatedAt: string;
};

/** One archived documentation round of a room. */
export type RaumbuchArchive = {
  id: string;
  archivedAt: string;
  photos: Partial<Record<RaumbuchPosition, string | string[]>>;
  notes?: Partial<Record<RaumbuchPosition, string>>;
  survey?: RaumbuchSurvey;
  planId?: string;
  planName?: string;
  planX?: number;
  planY?: number;
  planCrop?: { x: number; y: number; w: number; h: number };
  walls?: RaumbuchEntry["walls"];
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

/** Normalise a position's photo(s) to an array (handles legacy single-string). */
export function raumbuchPhotosFor(
  photos: Partial<Record<RaumbuchPosition, string | string[]>> | null | undefined,
  pos: RaumbuchPosition,
): string[] {
  const v = photos?.[pos];
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter(Boolean);
}

/** Total number of photos across all positions (not positions documented). */
export function raumbuchPhotoCount(entry: RaumbuchEntry | null | undefined): number {
  if (!entry) return 0;
  return RAUMBUCH_POSITIONS.reduce((n, p) => n + raumbuchPhotosFor(entry.photos, p).length, 0);
}

/** Total number of photos in an archived round. */
export function raumbuchArchivePhotoCount(a: RaumbuchArchive | null | undefined): number {
  if (!a) return 0;
  return RAUMBUCH_POSITIONS.reduce((n, p) => n + raumbuchPhotosFor(a.photos, p).length, 0);
}

/**
 * Archive the current round (photos/notes/survey + plan context) into the
 * entry's archive list, then clear the photo slots for a fresh round. The plan
 * marker, crop and walls are KEPT on the live entry so the next round reuses the
 * same setup. Returns the updated live entry (or null if none exists).
 */
export async function archiveAndResetRaumbuchEntry(projectId: string, roomId: string): Promise<RaumbuchEntry | null> {
  const all = await getRaumbuch(projectId);
  const idx = all.findIndex((e) => e.roomId === roomId);
  if (idx < 0) return null;
  const entry = all[idx];
  const snapshot: RaumbuchArchive = {
    id: `rba_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    archivedAt: new Date().toISOString(),
    photos: { ...(entry.photos || {}) },
    notes: entry.notes ? { ...entry.notes } : undefined,
    survey: entry.survey,
    planId: entry.planId,
    planName: entry.planName,
    planX: entry.planX,
    planY: entry.planY,
    planCrop: entry.planCrop,
    walls: entry.walls,
  };
  const next: RaumbuchEntry = {
    ...entry,
    photos: {},
    notes: {},
    survey: undefined,
    archives: [snapshot, ...(entry.archives || [])],
    updatedAt: new Date().toISOString(),
  };
  all[idx] = next;
  await AsyncStorage.setItem(KEY(projectId), JSON.stringify(all));
  return next;
}

/**
 * Archive + reset EVERY documented room of the project in one go (one button for
 * the whole Raumbuch). Each room keeps its plan/marker/crop/walls; only rooms
 * that have at least one photo are archived. Returns how many rooms were reset.
 */
export async function archiveAndResetAllRaumbuch(projectId: string): Promise<number> {
  const all = await getRaumbuch(projectId);
  const now = new Date().toISOString();
  let count = 0;
  const next = all.map((entry) => {
    const hasPhotos = RAUMBUCH_POSITIONS.some((p) => raumbuchPhotosFor(entry.photos, p).length > 0);
    if (!hasPhotos) return entry;
    count += 1;
    const snapshot: RaumbuchArchive = {
      id: `rba_${Date.now()}_${count}_${Math.random().toString(36).slice(2, 6)}`,
      archivedAt: now,
      photos: { ...(entry.photos || {}) },
      notes: entry.notes ? { ...entry.notes } : undefined,
      survey: entry.survey,
      planId: entry.planId,
      planName: entry.planName,
      planX: entry.planX,
      planY: entry.planY,
      planCrop: entry.planCrop,
      walls: entry.walls,
    };
    return {
      ...entry,
      photos: {},
      notes: {},
      survey: undefined,
      archives: [snapshot, ...(entry.archives || [])],
      updatedAt: now,
    };
  });
  if (count > 0) await AsyncStorage.setItem(KEY(projectId), JSON.stringify(next));
  return count;
}
