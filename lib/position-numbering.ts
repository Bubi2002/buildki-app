/**
 * protoKI – Gewerk-/Positionsnummerierung
 * 
 * Schema: Gewerk.Geschoss.Position (z.B. 1.1.1, 1.1.2, 5.2.3)
 * 
 * - Gewerk-Nummer: Index des Gewerks in der GEWERKE_NUMBERED Liste (1-basiert)
 * - Geschoss-Nummer: Nummer des Geschosses (UG=-1→0, EG=0→1, 1.OG=1→2, etc.)
 * - Position: Fortlaufende Nummer innerhalb Gewerk+Geschoss (auto-generiert)
 * 
 * Nummern werden automatisch erzeugt, sind nachträglich änderbar,
 * und bei neuen Einträgen korrekt fortgeführt.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TRADES, getTradeName, getTradeNumber } from "./trades";

const NUMBERING_KEY = "position_numbering";

// ─── Gewerke mit fester Nummerierung ─────────────────────────────────────────
export const GEWERKE_NUMBERED = TRADES;

// ─── Geschoss-Nummerierung ───────────────────────────────────────────────────
// Geschoss-Nummer wird aus dem Floor.number-Feld berechnet:
// UG (-1) → Geschoss-Nr 0, EG (0) → 1, 1.OG (1) → 2, etc.
export function getGeschossNummer(floorNumber: number): number {
  return floorNumber + 2; // UG=-1→1, EG=0→2, 1.OG=1→3, etc.
}

// ─── Position Counter ────────────────────────────────────────────────────────
export type PositionCounter = {
  projectId: string;
  /** Key: "gewerkNr.geschossNr" → value: next position number */
  counters: Record<string, number>;
  /** All assigned numbers: defectId → positionCode */
  assignments: Record<string, string>;
};

async function getCounterState(projectId: string): Promise<PositionCounter> {
  try {
    const raw = await AsyncStorage.getItem(`${NUMBERING_KEY}_${projectId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { projectId, counters: {}, assignments: {} };
}

async function saveCounterState(state: PositionCounter): Promise<void> {
  await AsyncStorage.setItem(`${NUMBERING_KEY}_${state.projectId}`, JSON.stringify(state));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the Gewerk number for a given Gewerk name.
 * Returns the number (1-16) or 16 (Sonstiges) if not found.
 */
export function getGewerkNummer(gewerkName: string): number {
  return getTradeNumber(gewerkName);
}

/**
 * Get Gewerk name by number.
 */
export function getGewerkByNummer(nr: number): string {
  return getTradeName(nr);
}

/**
 * Generate the next position code for a defect.
 * Format: Gewerk.Geschoss.Position (e.g., "1.2.3")
 * 
 * @param projectId - The project ID
 * @param gewerkName - Name of the Gewerk (e.g., "Trockenbau")
 * @param floorNumber - The floor number from Floor.number (-1=UG, 0=EG, 1=1.OG, etc.)
 * @param defectId - The defect ID to assign the number to
 * @returns The generated position code (e.g., "1.2.3")
 */
export async function generatePositionCode(
  projectId: string,
  gewerkName: string,
  floorNumber: number,
  defectId: string,
): Promise<string> {
  const state = await getCounterState(projectId);
  
  const gewerkNr = getGewerkNummer(gewerkName);
  const geschossNr = getGeschossNummer(floorNumber);
  const counterKey = `${gewerkNr}.${geschossNr}`;
  
  // Get next position number
  const position = state.counters[counterKey] ?? 1;
  state.counters[counterKey] = position + 1;
  
  // Build code
  const code = `${gewerkNr}.${geschossNr}.${position}`;
  state.assignments[defectId] = code;
  
  await saveCounterState(state);
  return code;
}

/**
 * Get the position code for an existing defect.
 * Returns undefined if no code has been assigned.
 */
export async function getPositionCode(projectId: string, defectId: string): Promise<string | undefined> {
  const state = await getCounterState(projectId);
  return state.assignments[defectId];
}

/**
 * Manually update a position code for a defect.
 * Allows the user to change the auto-generated code.
 * 
 * @param projectId - The project ID
 * @param defectId - The defect ID
 * @param newCode - The new position code (e.g., "2.1.5")
 */
export async function updatePositionCode(
  projectId: string,
  defectId: string,
  newCode: string,
): Promise<void> {
  const state = await getCounterState(projectId);
  state.assignments[defectId] = newCode;
  await saveCounterState(state);
}

/**
 * Remove a position code assignment (e.g., when a defect is deleted).
 */
export async function removePositionCode(projectId: string, defectId: string): Promise<void> {
  const state = await getCounterState(projectId);
  delete state.assignments[defectId];
  await saveCounterState(state);
}

/**
 * Get all position codes for a project, sorted.
 * Returns array of { defectId, code } pairs.
 */
export async function getAllPositionCodes(projectId: string): Promise<{ defectId: string; code: string }[]> {
  const state = await getCounterState(projectId);
  return Object.entries(state.assignments)
    .map(([defectId, code]) => ({ defectId, code }))
    .sort((a, b) => {
      const [aG, aF, aP] = a.code.split(".").map(Number);
      const [bG, bF, bP] = b.code.split(".").map(Number);
      if (aG !== bG) return aG - bG;
      if (aF !== bF) return aF - bF;
      return aP - bP;
    });
}

/**
 * Parse a position code into its components.
 */
export function parsePositionCode(code: string): { gewerk: number; geschoss: number; position: number } | null {
  const parts = code.split(".");
  if (parts.length !== 3) return null;
  const [gewerk, geschoss, position] = parts.map(Number);
  if (isNaN(gewerk) || isNaN(geschoss) || isNaN(position)) return null;
  return { gewerk, geschoss, position };
}

/**
 * Format a position code with Gewerk name for display.
 * E.g., "1.2.3" → "1.2.3 (Trockenbau, 1.OG)"
 */
export function formatPositionCode(code: string): string {
  const parsed = parsePositionCode(code);
  if (!parsed) return code;
  const gewerkName = getGewerkByNummer(parsed.gewerk);
  return `${code} (${gewerkName})`;
}

/**
 * Get the next expected position number for a Gewerk+Geschoss combination.
 * Useful for showing the user what number will be assigned next.
 */
export async function getNextPositionNumber(
  projectId: string,
  gewerkName: string,
  floorNumber: number,
): Promise<number> {
  const state = await getCounterState(projectId);
  const gewerkNr = getGewerkNummer(gewerkName);
  const geschossNr = getGeschossNummer(floorNumber);
  const counterKey = `${gewerkNr}.${geschossNr}`;
  return state.counters[counterKey] ?? 1;
}
