/**
 * Offline Sync Manager
 * 
 * Monitors network connectivity and automatically processes queued recordings
 * when the device comes back online. Provides UI hooks for sync status.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getQueue, updateQueueItem, removeFromQueue, isOnline, type QueuedRecording } from "./offline-queue";
import { startBackgroundProcessing, type PendingJob } from "./background-processor";
import { getApiBaseUrl } from "@/constants/oauth";
import { getPrivacyChoices } from "./privacy-consent";

const SYNC_STATUS_KEY = "offline-sync-status";
const MAX_QUEUE_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000; // 2s, 4s, 8s, 16s, 32s exponential Backoff

// Sync state
export type SyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  currentItem: string | null; // ID of currently syncing item
  blockedByConsent: boolean;
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
  blockedByConsent: true,
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
  stopSyncManager();
  const choices = await getPrivacyChoices();
  const transferAllowed = choices.cloudSync && choices.aiProcessing;

  if (!transferAllowed) {
    const queue = await getQueue();
    updateStatus({
      isSyncing: false,
      pendingCount: queue.filter(q => q.status === "pending" || q.status === "failed").length,
      currentItem: null,
      blockedByConsent: true,
      lastError: null,
    });
    return;
  }

  updateStatus({ blockedByConsent: false });

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
  const choices = await getPrivacyChoices();
  if (!choices.cloudSync || !choices.aiProcessing) {
    updateStatus({ isSyncing: false, currentItem: null, blockedByConsent: true });
    return;
  }
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


    for (const item of pending) {
      const currentChoices = await getPrivacyChoices();
      if (!currentChoices.cloudSync || !currentChoices.aiProcessing) {
        updateStatus({ isSyncing: false, currentItem: null, blockedByConsent: true });
        isSyncRunning = false;
        return;
      }

      // Check if still online before each item
      const stillOnline = await isOnline();
      if (!stillOnline) {
        updateStatus({ isOnline: false, isSyncing: false });
        isSyncRunning = false;
        return;
      }

      updateStatus({ currentItem: item.id });
      await updateQueueItem(item.id, { status: "processing" });

      try {
        await processQueuedRecording(item);
        await removeFromQueue(item.id);
      } catch (error: any) {
        const errMsg = error?.message || String(error);
        console.error(`[SyncManager] Failed to process ${item.id}:`, errMsg);
        const newRetryCount = item.retryCount + 1;
        await updateQueueItem(item.id, {
          status: "failed",
          retryCount: newRetryCount,
        });
        updateStatus({ lastError: errMsg });
        
        // Exponential backoff: wait before next item
        if (newRetryCount < MAX_QUEUE_RETRIES) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, newRetryCount - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
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
    generateProtocol: async (transcription: string, templateId: string, style: string, format: string, recordingDate?: string, markers?: { time: number; label: string }[], photoCount?: number, photoTimestamps?: number[], customSystemPrompt?: string, customTemplateName?: string) => {
      const response = await fetch(`${apiBaseUrl}/api/trpc/protocol.generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { transcription, templateId, style, format, recordingDate, markers, photoCount, photoTimestamps, customSystemPrompt, customTemplateName } }),
      });
      if (!response.ok) throw new Error(`Protocol generation failed: ${response.status}`);
      const data = await response.json();
      return data.result?.data?.json || data.result?.data || data;
    },
    extractTodos: async (transcription: string, protocolText: string) => {
      const response = await fetch(`${apiBaseUrl}/api/trpc/protocol.extractTodos`, {
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
    templateSystemPrompt: item.templateSystemPrompt,
    templateName: item.templateName,
    style: "formal",
    format: "bullets",
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
  const choices = await getPrivacyChoices();
  if (!choices.cloudSync || !choices.aiProcessing) {
    updateStatus({
      lastError: "Cloud- und KI-Verarbeitung sind in den Datenschutzoptionen deaktiviert.",
      blockedByConsent: true,
    });
    return;
  }

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
  if (currentSyncStatus.blockedByConsent) {
    return "Lokal gespeichert – Cloud/KI in Datenschutzoptionen deaktiviert";
  }
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
