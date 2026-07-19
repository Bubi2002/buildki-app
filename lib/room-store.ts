/**
 * protoKI – Room & Floor Store
 * 
 * Manages rooms and floors (Geschosse) per project.
 * Used by: Recording, Photo Analysis, Defects, Tasks, Timeline, Reports.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const ROOMS_KEY = "project_rooms";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Floor = {
  id: string;
  projectId: string;
  name: string;       // e.g. "EG", "1. OG", "2. OG", "UG", "DG"
  number: number;     // Numeric order for sorting
  createdAt: string;
};

export type Room = {
  id: string;
  projectId: string;
  floorId: string;
  name: string;       // e.g. "Bad", "Küche", "Wohnzimmer", "Flur"
  number?: string;    // e.g. "EG 03", "1.OG 01"
  trade?: string;     // Primary trade (Gewerk) for this room
  status?: "nicht_begonnen" | "in_arbeit" | "fertig" | "abgenommen";
  createdAt: string;
};

export type ProjectStructure = {
  projectId: string;
  floors: Floor[];
  rooms: Room[];
};

// ─── Default Floors ──────────────────────────────────────────────────────────

export const DEFAULT_FLOORS: Omit<Floor, "id" | "projectId" | "createdAt">[] = [
  { name: "UG", number: -1 },
  { name: "EG", number: 0 },
  { name: "1. OG", number: 1 },
  { name: "2. OG", number: 2 },
  { name: "DG", number: 3 },
];

// ─── Store Functions ─────────────────────────────────────────────────────────

export async function getProjectStructure(projectId: string): Promise<ProjectStructure> {
  try {
    const raw = await AsyncStorage.getItem(`${ROOMS_KEY}_${projectId}`);
    if (raw) return JSON.parse(raw);
    return { projectId, floors: [], rooms: [] };
  } catch {
    return { projectId, floors: [], rooms: [] };
  }
}

export async function saveProjectStructure(structure: ProjectStructure): Promise<void> {
  await AsyncStorage.setItem(`${ROOMS_KEY}_${structure.projectId}`, JSON.stringify(structure));
}

export async function addFloor(projectId: string, name: string, number: number): Promise<Floor> {
  const structure = await getProjectStructure(projectId);
  const floor: Floor = {
    id: `floor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    projectId,
    name,
    number,
    createdAt: new Date().toISOString(),
  };
  structure.floors.push(floor);
  structure.floors.sort((a, b) => a.number - b.number);
  await saveProjectStructure(structure);
  return floor;
}

export async function addRoom(
  projectId: string,
  floorId: string,
  name: string,
  number?: string,
  trade?: string,
): Promise<Room> {
  const structure = await getProjectStructure(projectId);
  const room: Room = {
    id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    projectId,
    floorId,
    name,
    number,
    trade,
    status: "nicht_begonnen",
    createdAt: new Date().toISOString(),
  };
  structure.rooms.push(room);
  await saveProjectStructure(structure);
  return room;
}

export async function updateRoom(projectId: string, roomId: string, updates: Partial<Room>): Promise<void> {
  const structure = await getProjectStructure(projectId);
  const idx = structure.rooms.findIndex(r => r.id === roomId);
  if (idx >= 0) {
    structure.rooms[idx] = { ...structure.rooms[idx], ...updates };
    await saveProjectStructure(structure);
  }
}

export async function deleteRoom(projectId: string, roomId: string): Promise<void> {
  const structure = await getProjectStructure(projectId);
  structure.rooms = structure.rooms.filter(r => r.id !== roomId);
  await saveProjectStructure(structure);
}

export async function deleteFloor(projectId: string, floorId: string): Promise<void> {
  const structure = await getProjectStructure(projectId);
  structure.floors = structure.floors.filter(f => f.id !== floorId);
  structure.rooms = structure.rooms.filter(r => r.floorId !== floorId);
  await saveProjectStructure(structure);
}

export async function initializeDefaultFloors(projectId: string): Promise<void> {
  const structure = await getProjectStructure(projectId);
  if (structure.floors.length > 0) return; // Already initialized
  
  for (const def of DEFAULT_FLOORS) {
    structure.floors.push({
      id: `floor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      name: def.name,
      number: def.number,
      createdAt: new Date().toISOString(),
    });
    // Small delay to ensure unique IDs
    await new Promise(r => setTimeout(r, 1));
  }
  await saveProjectStructure(structure);
}

/**
 * Get all rooms for a specific floor.
 */
export async function getRoomsByFloor(projectId: string, floorId: string): Promise<Room[]> {
  const structure = await getProjectStructure(projectId);
  return structure.rooms.filter(r => r.floorId === floorId);
}

/**
 * Get all rooms for a project (flat list).
 */
export async function getAllRooms(projectId: string): Promise<Room[]> {
  const structure = await getProjectStructure(projectId);
  return structure.rooms;
}

/**
 * Get all floors for a project.
 */
export async function getFloors(projectId: string): Promise<Floor[]> {
  const structure = await getProjectStructure(projectId);
  return structure.floors.sort((a, b) => a.number - b.number);
}
