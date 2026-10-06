import AsyncStorage from "@react-native-async-storage/async-storage";

// Positions documented per room: four walls + floor + ceiling.
export type RaumbuchPosition = "A" | "B" | "C" | "D" | "boden" | "decke";
export const RAUMBUCH_POSITIONS: RaumbuchPosition[] = ["A", "B", "C", "D", "boden", "decke"];

/** i18n keys for each position's label. */
export const RAUMBUCH_POSITION_LABEL_KEY: Record<RaumbuchPosition, string> = {
  A: "raumbuch_wand_a",
  B: "raumbuch_wand_b",
  C: "raumbuch_wand_c",
  D: "raumbuch_wand_d",
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
  photos: Partial<Record<RaumbuchPosition, string>>;
  notes?: Partial<Record<RaumbuchPosition, string>>;
  updatedAt: string;
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
