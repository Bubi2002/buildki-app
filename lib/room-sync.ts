import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getProjectStructure,
  saveProjectStructure,
  initializeDefaultFloors,
  type Floor,
  type Room,
} from "@/lib/room-store";

// Maps the German floor abbreviations used in the recording room markers to a
// sort order. Unknown floors are appended after the highest existing one.
const FLOOR_NUMBER: Record<string, number> = {
  "UG": -1,
  "EG": 0,
  "1. OG": 1,
  "2. OG": 2,
  "3. OG": 3,
  "4. OG": 4,
  "DG": 10,
};

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * Takes the "Geschoss · Raum" room markers recorded during a Begehung
 * (stored as "KAPITEL: EG · Schlafzimmer") and makes sure every room exists in
 * the project's room structure (Rundgang). Floors are created on demand.
 * Returns the number of newly created rooms. Idempotent — existing rooms are
 * matched by name per floor and never duplicated.
 */
export async function syncRoomsFromProtocols(projectId: string): Promise<number> {
  if (!projectId) return 0;

  let protocols: any[] = [];
  try {
    protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
  } catch {
    return 0;
  }

  const pairs: { floor: string; room: string }[] = [];
  for (const p of protocols) {
    if (p.projectId !== projectId) continue;
    for (const m of (p.markers || [])) {
      const label = typeof m?.label === "string" ? m.label : "";
      if (!label.startsWith("KAPITEL:")) continue;
      const text = label.replace(/^KAPITEL:\s*/, "").trim();
      if (!text) continue;
      const parts = text.split("·").map((s: string) => s.trim()).filter(Boolean);
      if (parts.length >= 2) pairs.push({ floor: parts[0], room: parts.slice(1).join(" · ") });
      else pairs.push({ floor: "EG", room: parts[0] }); // no floor spoken → default EG
    }
  }
  if (pairs.length === 0) return 0;

  await initializeDefaultFloors(projectId);
  const structure = await getProjectStructure(projectId);
  const findFloor = (name: string) =>
    structure.floors.find((f) => f.name.trim().toLowerCase() === name.trim().toLowerCase());

  let created = 0;
  let changed = false;
  for (const { floor, room } of pairs) {
    if (!room) continue;
    let fl = findFloor(floor);
    if (!fl) {
      const maxNum = structure.floors.reduce((mx, f) => Math.max(mx, f.number), 0);
      const num = FLOOR_NUMBER[floor] ?? maxNum + 1;
      fl = { id: uid("floor"), projectId, name: floor, number: num, createdAt: new Date().toISOString() } as Floor;
      structure.floors.push(fl);
      changed = true;
    }
    const exists = structure.rooms.some(
      (r) => r.floorId === fl!.id && r.name.trim().toLowerCase() === room.trim().toLowerCase(),
    );
    if (!exists) {
      structure.rooms.push({
        id: uid("room"),
        projectId,
        floorId: fl.id,
        name: room,
        status: "nicht_begonnen",
        createdAt: new Date().toISOString(),
      } as Room);
      created++;
      changed = true;
    }
  }

  if (changed) {
    structure.floors.sort((a, b) => a.number - b.number);
    await saveProjectStructure(structure);
  }
  return created;
}
