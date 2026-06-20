/**
 * Offline Sync Manager
 * 
 * Monitors network connectivity and automatically processes queued recordings
 * when the device comes back online. Provides UI hooks for sync status.
 */
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getQueue, updateQueueItem, removeFromQueue, isOnline, type QueuedRecording } from "./offline-queue";
import { startBackgroundProcessing, type PendingJob } from "./background-processor";
import { getApiBaseUrl } from "@/constants/oauth";

const SYNC_STATUS_KEY = "offline-sync-status";
const MAX_QUEUE_RETRIES = 5;

// Sync state
export type SyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  currentItem: string | null; // ID of currently syncing item
};

type SyncListener = (status: SyncStatus) => void;
const syncListeners: Set<SyncListener> = new Set();
let currentSyncStatus: SyncStatus = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
  currentItem: null,
};

let networkSubscription: any = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let isSyncRunning = false;

/**
 * Subscribe to sync status changes
 */
export function onSyncStatusChange(listener: SyncListener): () => void {
  syncListeners.add(listener);
  // Immediately emit current status
  listener(currentSyncStatus);
  return () => { syncListeners.delete(listener); };
}

/**
 * Get current sync status
 */
export function getSyncStatus(): SyncStatus {
  return { ...currentSyncStatus };
}

function updateStatus(updates: Partial<SyncStatus>) {
  currentSyncStatus = { ...currentSyncStatus, ...updates };
  syncListeners.forEach(fn => fn(currentSyncStatus));
  // Persist status
  AsyncStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(currentSyncStatus)).catch(() => {});
}

/**
 * Initialize the sync manager - call this once at app startup
 */
export async function initSyncManager(): Promise<void> {
  // Load persisted status
  try {
    const stored = await AsyncStorage.getItem(SYNC_STATUS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      currentSyncStatus = { ...currentSyncStatus, ...parsed, isSyncing: false, currentItem: null };
    }
  } catch {}

  // Check initial network state
  const online = await isOnline();
  const queue = await getQueue();
  updateStatus({
    isOnline: online,
    pendingCount: queue.filter(q => q.status === "pending" || q.status === "failed").length,
  });

  // Start network monitoring
  startNetworkMonitoring();

  // If online and there are pending items, start syncing
  if (online && currentSyncStatus.pendingCount > 0) {
    processQueue();
  }

  // Periodic check every 30 seconds
  syncInterval = setInterval(async () => {
    const nowOnline = await isOnline();
    const nowQueue = await getQueue();
    const pendingCount = nowQueue.filter(q => q.status === "pending" || q.status === "failed").length;
    
    if (nowOnline !== currentSyncStatus.isOnline || pendingCount !== currentSyncStatus.pendingCount) {
      updateStatus({ isOnline: nowOnline, pendingCount });
    }

    if (nowOnline && pendingCount > 0 && !isSyncRunning) {
      processQueue();
    }
  }, 30000);
}

/**
 * Stop the sync manager
 */
export function stopSyncManager(): void {
  if (networkSubscription) {
    networkSubscription.remove?.();
    networkSubscription = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Monitor network state changes
 */
function startNetworkMonitoring(): void {
  // expo-network doesn't have addEventListener, so we rely on periodic checks
  // The 30s interval in initSyncManager handles this
}

/**
 * Process all pending items in the queue
 */
async function processQueue(): Promise<void> {
  if (isSyncRunning) return;
  isSyncRunning = true;
  updateStatus({ isSyncing: true, lastError: null });

  try {
    const queue = await getQueue();
    const pending = queue.filter(q => q.status === "pending" || (q.status === "failed" && q.retryCount < MAX_QUEUE_RETRIES));

    if (pending.length === 0) {
      updateStatus({ isSyncing: false, pendingCount: 0 });
      isSyncRunning = false;
      return;
    }

    console.log(`[SyncManager] Processing ${pending.length} queued recordings...`);

    for (const item of pending) {
      // Check if still online before each item
      const stillOnline = await isOnline();
      if (!stillOnline) {
        console.log("[SyncManager] Lost connectivity, pausing sync");
        updateStatus({ isOnline: false, isSyncing: false });
        isSyncRunning = false;
        return;
      }

      updateStatus({ currentItem: item.id });
      await updateQueueItem(item.id, { status: "processing" });

      try {
        await processQueuedRecording(item);
        await removeFromQueue(item.id);
        console.log(`[SyncManager] Successfully processed queued recording ${item.id}`);
      } catch (error: any) {
        const errMsg = error?.message || String(error);
        console.error(`[SyncManager] Failed to process ${item.id}:`, errMsg);
        await updateQueueItem(item.id, {
          status: "failed",
          retryCount: item.retryCount + 1,
        });
        updateStatus({ lastError: errMsg });
      }
    }

    // Update final status
    const updatedQueue = await getQueue();
    const remainingPending = updatedQueue.filter(q => q.status === "pending" || q.status === "failed").length;
    updateStatus({
      isSyncing: false,
      pendingCount: remainingPending,
      lastSyncAt: new Date().toISOString(),
      currentItem: null,
    });
  } catch (error: any) {
    updateStatus({ isSyncing: false, lastError: error?.message || String(error), currentItem: null });
  }

  isSyncRunning = false;
}

/**
 * Process a single queued recording - creates a background job
 */
async function processQueuedRecording(item: QueuedRecording): Promise<void> {
  const apiBaseUrl = getApiBaseUrl();
  
  // Create the API client for the background processor
  const apiClient = {
    upload: async (base64: string, mimeType: string, filename: string) => {
      const response = await fetch(`${apiBaseUrl}/api/trpc/upload.audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { base64, mimeType, filename } }),
      });
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      const data = await response.json();
      return data.result?.data?.json || data.result?.data || data;
    },
    transcribe: async (audioUrl: string, language: string) => {
      const response = await fetch(`${apiBaseUrl}/api/trpc/voice.transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { audioUrl, language } }),
      });
      if (!response.ok) throw new Error(`Transcription failed: ${response.status}`);
      const data = await response.json();
      return data.result?.data?.json || data.result?.data || data;
    },
    generateProtocol: async (transcription: string, templateId: string, style: string, format: string, recordingDate?: string, markers?: Array<{ time: number; label: string }>, photoCount?: number, photoTimestamps?: number[]) => {
      const response = await fetch(`${apiBaseUrl}/api/trpc/voice.generateProtocol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { transcription, templateId, style, format, recordingDate, markers, photoCount, photoTimestamps } }),
      });
      if (!response.ok) throw new Error(`Protocol generation failed: ${response.status}`);
      const data = await response.json();
      return data.result?.data?.json || data.result?.data || data;
    },
    extractTodos: async (transcription: string, protocolText: string) => {
      const response = await fetch(`${apiBaseUrl}/api/trpc/voice.extractTodos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { transcription, protocolText } }),
      });
      if (!response.ok) throw new Error(`Todo extraction failed: ${response.status}`);
      const data = await response.json();
      return data.result?.data?.json || data.result?.data || data;
    },
  };

  // Create a PendingJob from the queued recording
  const job: PendingJob = {
    protocolId: item.id,
    fileUri: item.fileUri,
    mimeType: item.mimeType,
    templateId: item.templateId,
    style: "professional",
    format: "detailed",
    createdAt: item.createdAt,
    markers: item.markers,
    photos: item.photos,
    status: "queued",
  };

  // Start the background processing
  await startBackgroundProcessing(job, apiClient);
}

/**
 * Manually trigger sync (e.g., from a "Retry" button)
 */
export async function triggerSync(): Promise<void> {
  const online = await isOnline();
  if (!online) {
    updateStatus({ lastError: "Keine Internetverbindung" });
    return;
  }
  processQueue();
}

/**
 * Get human-readable sync status text
 */
export function getSyncStatusText(): string {
  if (currentSyncStatus.isSyncing) {
    return "Synchronisiere...";
  }
  if (!currentSyncStatus.isOnline) {
    return "Offline – Aufnahmen werden bei Verbindung automatisch verarbeitet";
  }
  if (currentSyncStatus.pendingCount > 0) {
    return `${currentSyncStatus.pendingCount} Aufnahme${currentSyncStatus.pendingCount > 1 ? "n" : ""} warten auf Verarbeitung`;
  }
  if (currentSyncStatus.lastSyncAt) {
    const lastSync = new Date(currentSyncStatus.lastSyncAt);
    const now = new Date();
    const diffMin = Math.round((now.getTime() - lastSync.getTime()) / 60000);
    if (diffMin < 1) return "Gerade synchronisiert";
    if (diffMin < 60) return `Zuletzt synchronisiert vor ${diffMin} Min.`;
    return `Zuletzt synchronisiert um ${lastSync.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return "Bereit";
}
