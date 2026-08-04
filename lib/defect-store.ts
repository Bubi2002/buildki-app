import AsyncStorage from "@react-native-async-storage/async-storage";
import { timelineEngine } from "@/lib/timeline-engine";
const DEFECTS_KEY = "defects";
const DEFECT_HISTORY_KEY = "defect_history";

export type DefectStatus = "offen" | "zugewiesen" | "in_bearbeitung" | "nachbesserung" | "pruefung" | "erledigt" | "abgelehnt" | "geschlossen";
export type DefectPriority = "hoch" | "mittel" | "niedrig";

export type DefectHistoryAction = 
  | "created"
  | "status_changed"
  | "priority_changed"
  | "assignee_changed"
  | "photo_added"
  | "photo_removed"
  | "edited"
  | "resolved"
  | "reopened";

export type DefectHistoryEntry = {
  id: string;
  defectId: string;
  action: DefectHistoryAction;
  timestamp: string;
  oldValue?: string;
  newValue?: string;
  note?: string;
};

export type DefectSource = "manual" | "ki_analysis" | "speech" | "matterport" | "checklist";

export type DefectComment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

export type DefectSignature = {
  role: string;
  paths: string[];
  signedAt: string;
};

export type DefectVoiceNote = {
  uri: string;
  durationMillis: number;
  recordedAt: string;
};

export type MatterportPosition = {
  x: number;
  y: number;
  z: number;
};

export type Defect = {
  id: string;
  projectId: string;
  planId?: string;
  pinId?: string;
  title: string;
  description: string;
  status: DefectStatus;
  priority: DefectPriority;
  category: string;
  gewerk?: string;
  photos: string[];
  /** Photos taken before repair (Vorher) */
  beforePhotos?: string[];
  /** Photos taken after repair (Nachher) */
  afterPhotos?: string[];
  assignee?: string;
  assigneeFirma?: string;
  dueDate?: string;
  location?: string;
  /** Floor/Geschoss */
  floor?: string;
  /** Room/Raum */
  room?: string;
  comments?: DefectComment[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  /** Position code (Schema: Gewerk.Geschoss.Position, e.g. "1.2.3") */
  positionCode?: string;
  /** Date of follow-up inspection */
  followUpDate?: string;
  /** Optional note for the follow-up inspection */
  followUpNote?: string;
  /** Result of follow-up inspection */
  followUpResult?: "behoben" | "nachbesserung" | null;
  protocolId?: string;
  /** Source of the defect (manual entry, KI analysis, Matterport, checklist) */
  source?: DefectSource;
  /** Confidence score from KI analysis (0.0 - 1.0) */
  confidence?: number;
  /** Reference to the analysis that created this defect */
  analysisId?: string;
  // ─── Matterport 3D Integration (Single Source of Truth) ─────────────────────
  /** Matterport model ID this defect is pinned to */
  matterportModelId?: string;
  /** 3D position in Matterport space */
  matterportPosition?: MatterportPosition;
  /** Normal vector for pin orientation */
  matterportNormal?: MatterportPosition;
  /** Sweep ID for camera navigation */
  matterportSweepId?: string;
  /** Floor index in Matterport model */
  matterportFloorIndex?: number;
  /** Floor name in Matterport model */
  matterportFloorName?: string;
  /** Room ID in Matterport model */
  matterportRoomId?: string;
  /** Room name in Matterport model */
  matterportRoomName?: string;
  // ─── KI Integration ─────────────────────────────────────────────────────────
  /** AI-generated summary of the defect */
  aiSummary?: string;
  /** Voice note URI (audio recording describing the defect) */
  voiceNoteUri?: string;
  /** Voice note duration for display and playback controls */
  voiceNoteDurationMillis?: number;
  /** Creation timestamp of the current voice note */
  voiceNoteRecordedAt?: string;
  // ─── Signatures (directly on defect for Abnahme/Übergabe) ──────────────────
  /** Digital signatures attached to this defect (AG/AN/Zeuge/Prüfer) */
  signatures?: DefectSignature[];
};

export const DEFECT_CATEGORIES = [
  "Riss/Bruch",
  "Feuchtigkeit",
  "Elektrik",
  "Sanitär",
  "Oberfläche",
  "Maßabweichung",
  "Brandschutz",
  "Sicherheit",
  "Sonstiges",
];

export async function getDefects(projectId?: string): Promise<Defect[]> {
  try {
    const raw = await AsyncStorage.getItem(DEFECTS_KEY);
    const defects: Defect[] = raw ? JSON.parse(raw) : [];
    if (projectId) return defects.filter((d) => d.projectId === projectId);
    return defects;
  } catch {
    return [];
  }
}

let defectWriteQueue: Promise<void> = Promise.resolve();

async function withDefectWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = defectWriteQueue.then(operation, operation);
  defectWriteQueue = next.then(() => undefined, () => undefined);
  return next;
}

export async function saveDefect(defect: Defect): Promise<void> {
  let isNew = false;
  const storedDefect = await withDefectWriteLock(async () => {
    const raw = await AsyncStorage.getItem(DEFECTS_KEY);
    const defects: Defect[] = raw ? JSON.parse(raw) : [];
    const idx = defects.findIndex((d) => d.id === defect.id);
    isNew = idx < 0;
    const stored = idx >= 0 ? { ...defect, updatedAt: new Date().toISOString() } : defect;
    if (idx >= 0) defects[idx] = stored;
    else defects.push(stored);
    await AsyncStorage.setItem(DEFECTS_KEY, JSON.stringify(defects));
    return stored;
  });

  // Timeline event
  try {
    await timelineEngine.emit({
      projectId: storedDefect.projectId || "default",
      eventType: isNew ? "defect_created" : "defect_updated",
      source: (storedDefect.source === "ki_analysis" ? "photo" : storedDefect.source === "speech" ? "speech" : "user") as any,
      title: isNew ? "Mangel erstellt" : "Mangel aktualisiert",
      description: storedDefect.title,
      entityId: storedDefect.id,
      entityType: "defect",
      roomName: storedDefect.location,
      confidence: storedDefect.confidence,
      tags: ["defect", storedDefect.priority],
      priority: storedDefect.priority === "hoch" ? "high" : storedDefect.priority === "mittel" ? "medium" : "low",
    });
  } catch {}
}

export async function deleteDefect(defectId: string): Promise<void> {
  await withDefectWriteLock(async () => {
    const raw = await AsyncStorage.getItem(DEFECTS_KEY);
    const defects: Defect[] = raw ? JSON.parse(raw) : [];
    const filtered = defects.filter((d) => d.id !== defectId);
    await AsyncStorage.setItem(DEFECTS_KEY, JSON.stringify(filtered));
  });
}

export async function updateDefectStatus(defectId: string, status: DefectStatus): Promise<void> {
  let oldStatus: DefectStatus | undefined;
  let updatedDefect: Defect | undefined;

  await withDefectWriteLock(async () => {
    const raw = await AsyncStorage.getItem(DEFECTS_KEY);
    const defects: Defect[] = raw ? JSON.parse(raw) : [];
    const idx = defects.findIndex((d) => d.id === defectId);
    if (idx < 0) return;
    oldStatus = defects[idx].status;
    defects[idx].status = status;
    defects[idx].updatedAt = new Date().toISOString();
    if (status === "erledigt") {
      defects[idx].resolvedAt = new Date().toISOString();
    } else if (oldStatus === "erledigt") {
      // Reopened: clear the stale resolved timestamp
      defects[idx].resolvedAt = undefined;
    }
    await AsyncStorage.setItem(DEFECTS_KEY, JSON.stringify(defects));
    updatedDefect = defects[idx];
  });

  if (!updatedDefect || oldStatus === undefined) return;

  // Record history
  const action: DefectHistoryAction = status === "erledigt" ? "resolved" : oldStatus === "erledigt" ? "reopened" : "status_changed";
  await addHistoryEntry(defectId, action, oldStatus, status);

  // Timeline event
  try {
    await timelineEngine.emit({
      projectId: updatedDefect.projectId || "default",
      eventType: status === "erledigt" ? "defect_resolved" : "defect_updated",
      source: "user",
      title: status === "erledigt" ? "Mangel behoben" : `Mangel: ${oldStatus} → ${status}`,
      description: updatedDefect.title,
      entityId: defectId,
      entityType: "defect",
      roomName: updatedDefect.location,
      tags: ["defect", status],
      priority: updatedDefect.priority === "hoch" ? "high" : updatedDefect.priority === "mittel" ? "medium" : "low",
    });
  } catch {}
}

export function getDefectStats(defects: Defect[]) {
  return {
    total: defects.length,
    offen: defects.filter((d) => d.status === "offen").length,
    inBearbeitung: defects.filter((d) => d.status === "in_bearbeitung").length,
    erledigt: defects.filter((d) => d.status === "erledigt").length,
    hoch: defects.filter((d) => d.priority === "hoch" && d.status !== "erledigt").length,
  };
}

// ============ Defect History ============

/**
 * Add a history entry for a defect change
 */
export async function addHistoryEntry(
  defectId: string,
  action: DefectHistoryAction,
  oldValue?: string,
  newValue?: string,
  note?: string
): Promise<void> {
  try {
    const history = await getDefectHistory(defectId);
    history.push({
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      defectId,
      action,
      timestamp: new Date().toISOString(),
      oldValue,
      newValue,
      note,
    });
    
    // Store all history
    const allHistory = await getAllHistory();
    const otherHistory = allHistory.filter(h => h.defectId !== defectId);
    const combined = [...otherHistory, ...history];
    await AsyncStorage.setItem(DEFECT_HISTORY_KEY, JSON.stringify(combined));
  } catch {
    // Silently fail - history is non-critical
  }
}

/**
 * Get history entries for a specific defect
 */
export async function getDefectHistory(defectId: string): Promise<DefectHistoryEntry[]> {
  try {
    const allHistory = await getAllHistory();
    return allHistory
      .filter(h => h.defectId === defectId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch {
    return [];
  }
}

/**
 * Get all history entries
 */
async function getAllHistory(): Promise<DefectHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(DEFECT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Record defect creation in history
 */
export async function recordDefectCreated(defectId: string): Promise<void> {
  await addHistoryEntry(defectId, "created", undefined, undefined, "Mangel angelegt");
}

/**
 * Record defect edit (title, description, category, etc.)
 */
export async function recordDefectEdited(defectId: string, field: string, oldValue: string, newValue: string): Promise<void> {
  await addHistoryEntry(defectId, "edited", `${field}: ${oldValue}`, `${field}: ${newValue}`);
}

/**
 * Record priority change
 */
export async function recordPriorityChanged(defectId: string, oldPriority: string, newPriority: string): Promise<void> {
  await addHistoryEntry(defectId, "priority_changed", oldPriority, newPriority);
}

/**
 * Record assignee change
 */
export async function recordAssigneeChanged(defectId: string, oldAssignee: string | undefined, newAssignee: string): Promise<void> {
  await addHistoryEntry(defectId, "assignee_changed", oldAssignee || "(niemand)", newAssignee);
}

/**
 * Record photo added
 */
export async function recordPhotoAdded(defectId: string): Promise<void> {
  await addHistoryEntry(defectId, "photo_added", undefined, undefined, "Foto hinzugefügt");
}

/**
 * Record photo removed
 */
export async function recordPhotoRemoved(defectId: string): Promise<void> {
  await addHistoryEntry(defectId, "photo_removed", undefined, undefined, "Foto entfernt");
}

// ============ Matterport Integration ============

/**
 * Attach Matterport 3D position data to a defect (Single Source of Truth).
 * The Matterport viewer reads this data directly from the defect.
 */
export async function attachMatterportData(
  defectId: string,
  data: {
    modelId: string;
    position?: { x: number; y: number; z: number };
    normal?: { x: number; y: number; z: number };
    sweepId?: string;
    floorIndex?: number;
    floorName?: string;
    roomId?: string;
    roomName?: string;
  }
): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect) return null;

  const updated: Defect = {
    ...defect,
    matterportModelId: data.modelId,
    matterportPosition: data.position,
    matterportNormal: data.normal,
    matterportSweepId: data.sweepId,
    matterportFloorIndex: data.floorIndex,
    matterportFloorName: data.floorName,
    matterportRoomId: data.roomId,
    matterportRoomName: data.roomName,
    source: defect.source || "matterport",
  };
  await saveDefect(updated);
  return updated;
}

/**
 * Get all defects that have Matterport 3D positions (for rendering pins in viewer).
 * This replaces the separate matterport_pins AsyncStorage key.
 */
export async function getMatterportDefects(modelId: string): Promise<Defect[]> {
  const defects = await getDefects();
  return defects.filter((d) => d.matterportModelId === modelId && d.matterportPosition);
}

// ============ KI Summary ============

/**
 * Set AI-generated summary on a defect
 */
export async function setAiSummary(defectId: string, summary: string): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect) return null;

  const updated: Defect = { ...defect, aiSummary: summary };
  await saveDefect(updated);
  return updated;
}

// ============ Voice Notes ============

/**
 * Attach a voice note URI to a defect
 */
export async function setVoiceNote(defectId: string, voiceNote: DefectVoiceNote | null): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect) return null;

  const updated: Defect = {
    ...defect,
    voiceNoteUri: voiceNote?.uri,
    voiceNoteDurationMillis: voiceNote?.durationMillis,
    voiceNoteRecordedAt: voiceNote?.recordedAt,
  };
  await saveDefect(updated);
  await addHistoryEntry(
    defectId,
    "edited",
    voiceNote ? undefined : "Sprachnotiz vorhanden",
    voiceNote ? "Sprachnotiz aufgenommen" : "Sprachnotiz entfernt",
  );
  return updated;
}

// ============ Defect-Level Signatures ============

/**
 * Add a signature to a defect (for Abnahme/Übergabe workflows).
 * Roles: Auftraggeber, Auftragnehmer, Zeuge, Prüfer
 */
export async function addDefectSignature(
  defectId: string,
  signature: DefectSignature
): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect) return null;

  const updated: Defect = {
    ...defect,
    signatures: [...(defect.signatures || []), signature],
  };
  await saveDefect(updated);
  return updated;
}

/**
 * Remove a signature from a defect by index
 */
export async function removeDefectSignature(defectId: string, index: number): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect || !defect.signatures) return null;

  const updated: Defect = {
    ...defect,
    signatures: defect.signatures.filter((_, i) => i !== index),
  };
  await saveDefect(updated);
  return updated;
}

/**
 * Get all defects with follow-up dates (for calendar/notifications)
 */
export async function getDefectsWithFollowUp(projectId?: string): Promise<Defect[]> {
  const defects = await getDefects(projectId);
  return defects.filter((d) => d.followUpDate && d.status !== "erledigt" && d.status !== "geschlossen");
}

/**
 * Get defects grouped by Gewerk (for KI-Bericht)
 */
export function groupByGewerk(defects: Defect[]): Record<string, Defect[]> {
  const groups: Record<string, Defect[]> = {};
  for (const d of defects) {
    const gewerk = d.gewerk || d.category || "Sonstiges";
    if (!groups[gewerk]) groups[gewerk] = [];
    groups[gewerk].push(d);
  }
  return groups;
}

/**
 * Get defects grouped by Room (for KI-Bericht)
 */
export function groupByRoom(defects: Defect[]): Record<string, Defect[]> {
  const groups: Record<string, Defect[]> = {};
  for (const d of defects) {
    const room = d.room || d.location || "Unbekannt";
    if (!groups[room]) groups[room] = [];
    groups[room].push(d);
  }
  return groups;
}

/**
 * Format a history entry for display
 */
export function formatHistoryEntry(entry: DefectHistoryEntry): string {
  const statusLabels: Record<string, string> = {
    offen: "Offen",
    zugewiesen: "Zugewiesen",
    in_bearbeitung: "In Bearbeitung",
    nachbesserung: "Nachbesserung",
    pruefung: "Pr\u00fcfung",
    erledigt: "Erledigt",
    abgelehnt: "Abgelehnt",
    geschlossen: "Geschlossen",
  };
  const priorityLabels: Record<string, string> = {
    hoch: "Hoch",
    mittel: "Mittel",
    niedrig: "Niedrig",
  };

  switch (entry.action) {
    case "created":
      return "Mangel angelegt";
    case "status_changed":
      return `Status: ${statusLabels[entry.oldValue || ""] || entry.oldValue} → ${statusLabels[entry.newValue || ""] || entry.newValue}`;
    case "resolved":
      return "Als erledigt markiert ✓";
    case "reopened":
      return "Wieder geöffnet";
    case "priority_changed":
      return `Priorität: ${priorityLabels[entry.oldValue || ""] || entry.oldValue} → ${priorityLabels[entry.newValue || ""] || entry.newValue}`;
    case "assignee_changed":
      return `Zuständig: ${entry.oldValue || "(niemand)"} → ${entry.newValue}`;
    case "photo_added":
      return "Foto hinzugefügt";
    case "photo_removed":
      return "Foto entfernt";
    case "edited":
      return `Bearbeitet: ${entry.newValue || ""}`;
    default:
      return entry.note || "Änderung";
  }
}
