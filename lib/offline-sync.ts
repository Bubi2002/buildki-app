/**
 * Offline Sync with Conflict Resolution
 * Handles offline editing and smart merge on reconnect
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isOnline } from "./offline-queue";

const SYNC_QUEUE_KEY = "offline-sync-queue";
const CONFLICT_LOG_KEY = "sync-conflict-log";

export type SyncAction = {
  id: string;
  protocolId: string;
  field: string;
  oldValue: string;
  newValue: string;
  timestamp: number;
  synced: boolean;
};

export type ConflictEntry = {
  id: string;
  protocolId: string;
  protocolTitle: string;
  field: string;
  localValue: string;
  remoteValue: string;
  resolvedBy?: "local" | "remote" | "merged";
  resolvedAt?: number;
  createdAt: number;
};

export type SyncStatus = {
  isOnline: boolean;
  pendingChanges: number;
  lastSyncAt: string | null;
  conflicts: number;
};

/**
 * Queue a local change for sync
 */
export async function queueChange(change: Omit<SyncAction, "id" | "synced">): Promise<void> {
  const queue = await getSyncQueue();
  queue.push({
    ...change,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    synced: false,
  });
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Get all pending sync actions
 */
export async function getSyncQueue(): Promise<SyncAction[]> {
  try {
    const data = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Get pending (unsynced) changes count
 */
export async function getPendingChangesCount(): Promise<number> {
  const queue = await getSyncQueue();
  return queue.filter(a => !a.synced).length;
}

/**
 * Mark actions as synced
 */
export async function markSynced(ids: string[]): Promise<void> {
  const queue = await getSyncQueue();
  const updated = queue.map(a => ids.includes(a.id) ? { ...a, synced: true } : a);
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updated));
}

/**
 * Log a conflict
 */
export async function logConflict(conflict: Omit<ConflictEntry, "id" | "createdAt">): Promise<void> {
  const conflicts = await getConflicts();
  conflicts.push({
    ...conflict,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: Date.now(),
  });
  await AsyncStorage.setItem(CONFLICT_LOG_KEY, JSON.stringify(conflicts));
}

/**
 * Get all unresolved conflicts
 */
export async function getConflicts(): Promise<ConflictEntry[]> {
  try {
    const data = await AsyncStorage.getItem(CONFLICT_LOG_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Get unresolved conflicts
 */
export async function getUnresolvedConflicts(): Promise<ConflictEntry[]> {
  const conflicts = await getConflicts();
  return conflicts.filter(c => !c.resolvedBy);
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(id: string, resolution: "local" | "remote" | "merged"): Promise<void> {
  const conflicts = await getConflicts();
  const updated = conflicts.map(c => 
    c.id === id ? { ...c, resolvedBy: resolution, resolvedAt: Date.now() } : c
  );
  await AsyncStorage.setItem(CONFLICT_LOG_KEY, JSON.stringify(updated));
}

/**
 * Smart merge: attempt to merge local and remote text changes
 * Uses a simple line-based merge strategy
 */
export function smartMerge(localText: string, remoteText: string, baseText: string): { merged: string; hasConflict: boolean } {
  const localLines = localText.split("\n");
  const remoteLines = remoteText.split("\n");
  const baseLines = baseText.split("\n");
  
  const merged: string[] = [];
  let hasConflict = false;
  const maxLen = Math.max(localLines.length, remoteLines.length, baseLines.length);
  
  for (let i = 0; i < maxLen; i++) {
    const baseLine = baseLines[i] || "";
    const localLine = localLines[i] || "";
    const remoteLine = remoteLines[i] || "";
    
    if (localLine === remoteLine) {
      // Both same - no conflict
      merged.push(localLine);
    } else if (localLine === baseLine) {
      // Only remote changed
      merged.push(remoteLine);
    } else if (remoteLine === baseLine) {
      // Only local changed
      merged.push(localLine);
    } else {
      // Both changed differently - conflict
      hasConflict = true;
      merged.push(`<<<< LOKAL\n${localLine}\n====\n${remoteLine}\n>>>> REMOTE`);
    }
  }
  
  return { merged: merged.join("\n"), hasConflict };
}

/**
 * Get overall sync status
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const online = await isOnline();
  const pendingChanges = await getPendingChangesCount();
  const lastSync = await AsyncStorage.getItem("last-sync-timestamp");
  const unresolvedConflicts = await getUnresolvedConflicts();
  
  return {
    isOnline: online,
    pendingChanges,
    lastSyncAt: lastSync,
    conflicts: unresolvedConflicts.length,
  };
}

/**
 * Clear synced actions older than 7 days
 */
export async function cleanupSyncQueue(): Promise<void> {
  const queue = await getSyncQueue();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const filtered = queue.filter(a => !a.synced || a.timestamp > weekAgo);
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
}
