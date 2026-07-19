import AsyncStorage from "@react-native-async-storage/async-storage";
import { timelineEngine } from "@/lib/timeline-engine";
const DEFECTS_KEY = "defects";
const DEFECT_HISTORY_KEY = "defect_history";

export type DefectStatus = "offen" | "in_bearbeitung" | "erledigt";
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

export type DefectSource = "manual" | "ki_analysis" | "matterport" | "checklist";

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
  photos: string[];
  assignee?: string;
  dueDate?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  protocolId?: string;
  /** Source of the defect (manual entry, KI analysis, Matterport, checklist) */
  source?: DefectSource;
  /** Confidence score from KI analysis (0.0 - 1.0) */
  confidence?: number;
  /** Reference to the analysis that created this defect */
  analysisId?: string;
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

export async function saveDefect(defect: Defect): Promise<void> {
  const defects = await getDefects();
  const idx = defects.findIndex((d) => d.id === defect.id);
  const isNew = idx < 0;
  if (idx >= 0) defects[idx] = { ...defect, updatedAt: new Date().toISOString() };
  else defects.push(defect);
  await AsyncStorage.setItem(DEFECTS_KEY, JSON.stringify(defects));

  // Timeline event
  try {
    await timelineEngine.emit({
      projectId: defect.projectId || "default",
      eventType: isNew ? "defect_created" : "defect_updated",
      source: (defect.source === "ki_analysis" ? "photo" : "user") as any,
      title: isNew ? "Mangel erstellt" : "Mangel aktualisiert",
      description: defect.title,
      entityId: defect.id,
      entityType: "defect",
      roomName: defect.location,
      confidence: defect.confidence,
      tags: ["defect", defect.priority],
      priority: defect.priority === "hoch" ? "high" : defect.priority === "mittel" ? "medium" : "low",
    });
  } catch {}
}

export async function deleteDefect(defectId: string): Promise<void> {
  const defects = await getDefects();
  const filtered = defects.filter((d) => d.id !== defectId);
  await AsyncStorage.setItem(DEFECTS_KEY, JSON.stringify(filtered));
}

export async function updateDefectStatus(defectId: string, status: DefectStatus): Promise<void> {
  const defects = await getDefects();
  const idx = defects.findIndex((d) => d.id === defectId);
  if (idx >= 0) {
    const oldStatus = defects[idx].status;
    defects[idx].status = status;
    defects[idx].updatedAt = new Date().toISOString();
    if (status === "erledigt") defects[idx].resolvedAt = new Date().toISOString();
    await AsyncStorage.setItem(DEFECTS_KEY, JSON.stringify(defects));
    
    // Record history
    const action: DefectHistoryAction = status === "erledigt" ? "resolved" : oldStatus === "erledigt" ? "reopened" : "status_changed";
    await addHistoryEntry(defectId, action, oldStatus, status);

    // Timeline event
    try {
      const defect = defects[idx];
      await timelineEngine.emit({
        projectId: defect.projectId || "default",
        eventType: status === "erledigt" ? "defect_resolved" : "defect_updated",
        source: "user",
        title: status === "erledigt" ? "Mangel behoben" : `Mangel: ${oldStatus} → ${status}`,
        description: defect.title,
        entityId: defectId,
        entityType: "defect",
        roomName: defect.location,
        tags: ["defect", status],
        priority: defect.priority === "hoch" ? "high" : defect.priority === "mittel" ? "medium" : "low",
      });
    } catch {}
  }
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

/**
 * Format a history entry for display
 */
export function formatHistoryEntry(entry: DefectHistoryEntry): string {
  const statusLabels: Record<string, string> = {
    offen: "Offen",
    in_bearbeitung: "In Bearbeitung",
    erledigt: "Erledigt",
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
