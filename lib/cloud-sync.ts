/**
 * Cloud Sync Service - Client-side
 * Handles offline-first sync for defects, projects, protocols, and attachments.
 * Uses the unified Defect Store as Single Source of Truth.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDefects, type Defect } from "@/lib/defect-store";
import { clearDeletedProjectIds, getDeletedProjectIds } from "@/lib/project-context";

const SYNC_KEY = "cloud-sync-enabled";
const LAST_SYNC_KEY = "last-sync-timestamp";
const SYNC_QUEUE_KEY = "cloud-sync-queue";
const SYNC_STATUS_KEY = "cloud-sync-status";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export type SyncQueueItem = {
  id: string;
  entityType: "defect" | "project" | "protocol" | "attachment";
  action: "push" | "delete";
  entityLocalId: string;
  timestamp: string;
  retries: number;
};

export type SyncResult = {
  pushed: { defects: number; projects: number };
  conflicts: { defects: number; projects: number };
  pulled: { defects: number; projects: number };
  syncedAt: string;
  errors: string[];
};

export interface LocalProtocol {
  id: string;
  title: string;
  transcription: string;
  protocol: string;
  templateName: string;
  templateId: string;
  photos: string[];
  todos: { task: string; assignee: string; priority: string; deadline: string; done: boolean }[];
  markers?: { time: number; label: string }[];
  duration: number;
  recordingMode: string;
  createdAt: string;
  calendarEventId?: string | null;
  status: string;
  synced?: boolean;
}

// ─── Sync Preferences ─────────────────────────────────────────────────────────

export async function isSyncEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(SYNC_KEY);
  return val === "true";
}

export async function setSyncEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SYNC_KEY, enabled ? "true" : "false");
}

export async function getLastSyncTime(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

export async function setLastSyncTime(time: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, time);
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const val = await AsyncStorage.getItem(SYNC_STATUS_KEY);
  return (val as SyncStatus) || "idle";
}

export async function setSyncStatus(status: SyncStatus): Promise<void> {
  await AsyncStorage.setItem(SYNC_STATUS_KEY, status);
}

// ─── Sync Queue ───────────────────────────────────────────────────────────────

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const data = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
  return data ? JSON.parse(data) : [];
}

export async function addToSyncQueue(item: Omit<SyncQueueItem, "id" | "timestamp" | "retries">): Promise<void> {
  const queue = await getSyncQueue();
  // Avoid duplicates for same entity
  const existing = queue.findIndex(
    (q) => q.entityType === item.entityType && q.entityLocalId === item.entityLocalId && q.action === item.action
  );
  if (existing >= 0) {
    queue[existing].timestamp = new Date().toISOString();
    queue[existing].retries = 0;
  } else {
    queue.push({
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      retries: 0,
    });
  }
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export async function removeFromSyncQueue(id: string): Promise<void> {
  const queue = await getSyncQueue();
  const filtered = queue.filter((q) => q.id !== id);
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
}

export async function clearSyncQueue(): Promise<void> {
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, "[]");
}

// ─── Data Preparation ─────────────────────────────────────────────────────────

function defectToSyncPayload(d: Defect) {
  return {
    localId: d.id,
    projectId: d.projectId,
    title: d.title,
    description: d.description || null,
    status: d.status,
    priority: d.priority,
    category: d.category || null,
    gewerk: d.gewerk || null,
    photos: d.photos?.length ? JSON.stringify(d.photos) : null,
    beforePhotos: d.beforePhotos?.length ? JSON.stringify(d.beforePhotos) : null,
    afterPhotos: d.afterPhotos?.length ? JSON.stringify(d.afterPhotos) : null,
    assignee: d.assignee || null,
    assigneeFirma: d.assigneeFirma || null,
    dueDate: d.dueDate || null,
    location: d.location || null,
    floor: d.floor || null,
    room: d.room || null,
    positionCode: d.positionCode || null,
    followUpDate: d.followUpDate || null,
    followUpResult: d.followUpResult || null,
    source: d.source || null,
    confidence: d.confidence ? Math.round(d.confidence * 100) : null,
    protocolId: d.protocolId || null,
    analysisId: d.analysisId || null,
    matterportModelId: d.matterportModelId || null,
    matterportPosition: d.matterportPosition ? JSON.stringify(d.matterportPosition) : null,
    matterportNormal: d.matterportNormal ? JSON.stringify(d.matterportNormal) : null,
    matterportSweepId: d.matterportSweepId || null,
    matterportFloorIndex: d.matterportFloorIndex ?? null,
    matterportFloorName: d.matterportFloorName || null,
    matterportRoomId: d.matterportRoomId || null,
    matterportRoomName: d.matterportRoomName || null,
    aiSummary: d.aiSummary || null,
    voiceNoteUri: d.voiceNoteUri || null,
    signatures: d.signatures?.length ? JSON.stringify(d.signatures) : null,
    comments: d.comments?.length ? JSON.stringify(d.comments) : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    resolvedAt: d.resolvedAt || null,
  };
}

// ─── Full Sync Execution ──────────────────────────────────────────────────────

export async function executeFullSync(trpcClient: any): Promise<SyncResult> {
  const errors: string[] = [];

  try {
    await setSyncStatus("syncing");

    // 1. Apply project tombstones before pushing the remaining local projects.
    const deletedProjectIds = await getDeletedProjectIds();
    if (deletedProjectIds.length > 0) {
      const deletionResults = await Promise.allSettled(
        deletedProjectIds.map((localId) => trpcClient.sync.deleteProject.mutate({ localId })),
      );
      const deletedSuccessfully = deletedProjectIds.filter((_, index) => deletionResults[index].status === "fulfilled");
      const failedDeletions = deletionResults.filter((result) => result.status === "rejected");
      await clearDeletedProjectIds(deletedSuccessfully);
      failedDeletions.forEach((result) => {
        if (result.status === "rejected") errors.push(`Projektlöschung: ${result.reason?.message || String(result.reason)}`);
      });
    }

    // 2. Get local data
    const localDefects = await getDefects();
    const localProjectsRaw = await AsyncStorage.getItem("projects");
    const localProjects: any[] = localProjectsRaw ? JSON.parse(localProjectsRaw) : [];

    // 3. Prepare payloads
    const defectPayloads = localDefects.map(defectToSyncPayload);
    const projectPayloads = localProjects.map((p: any) => ({
      localId: p.id || p.localId,
      name: p.name || "Unbenannt",
      description: p.description || null,
      prefix: p.prefix || null,
      color: p.color || null,
      address: p.address || null,
      client: p.client || null,
      status: p.status || "active",
      createdAt: p.createdAt || new Date().toISOString(),
      updatedAt: p.updatedAt || new Date().toISOString(),
    }));

    // 4. Get last sync time
    const lastSyncAt = await getLastSyncTime();

    // 5. Execute full sync via tRPC
    const result = await trpcClient.sync.fullSync.mutate({
      defects: defectPayloads,
      projects: projectPayloads,
      lastSyncAt: lastSyncAt || undefined,
    });

    // 6. Merge pulled data into local stores
    if (result.pulled.defects.length > 0) {
      await mergeRemoteDefects(result.pulled.defects);
    }
    if (result.pulled.projects.length > 0) {
      await mergeRemoteProjects(result.pulled.projects);
    }

    // 7. Update sync timestamp
    await setLastSyncTime(result.syncedAt);
    await setSyncStatus("synced");
    await clearSyncQueue();

    return {
      pushed: result.pushed,
      conflicts: result.conflicts,
      pulled: {
        defects: result.pulled.defects.length,
        projects: result.pulled.projects.length,
      },
      syncedAt: result.syncedAt,
      errors,
    };
  } catch (error: any) {
    errors.push(error.message || "Sync fehlgeschlagen");
    await setSyncStatus("error");
    return {
      pushed: { defects: 0, projects: 0 },
      conflicts: { defects: 0, projects: 0 },
      pulled: { defects: 0, projects: 0 },
      syncedAt: "",
      errors,
    };
  }
}

// ─── Merge Remote Data ────────────────────────────────────────────────────────

async function mergeRemoteDefects(remoteDefects: any[]): Promise<void> {
  const localDefects = await getDefects();
  const localMap = new Map(localDefects.map((d) => [d.id, d]));

  for (const remote of remoteDefects) {
    const local = localMap.get(remote.localId);
    if (!local || new Date(remote.updatedAt) > new Date(local.updatedAt)) {
      // Remote is newer or doesn't exist locally - merge.
      // Spread the local record first so local-only fields not tracked by the
      // sync payload (planId, pinId, voice-note metadata, …) survive the pull.
      localMap.set(remote.localId, {
        ...(local || {}),
        id: remote.localId,
        projectId: remote.projectId,
        title: remote.title,
        description: remote.description || "",
        status: remote.status,
        priority: remote.priority,
        category: remote.category || "",
        gewerk: remote.gewerk || undefined,
        photos: remote.photos ? JSON.parse(remote.photos) : [],
        beforePhotos: remote.beforePhotos ? JSON.parse(remote.beforePhotos) : undefined,
        afterPhotos: remote.afterPhotos ? JSON.parse(remote.afterPhotos) : undefined,
        assignee: remote.assignee || undefined,
        assigneeFirma: remote.assigneeFirma || undefined,
        dueDate: remote.dueDate || undefined,
        location: remote.location || undefined,
        floor: remote.floor || undefined,
        room: remote.room || undefined,
        positionCode: remote.positionCode || undefined,
        followUpDate: remote.followUpDate || undefined,
        followUpResult: remote.followUpResult || undefined,
        source: remote.source || undefined,
        confidence: remote.confidence ? remote.confidence / 100 : undefined,
        protocolId: remote.protocolId || undefined,
        analysisId: remote.analysisId || undefined,
        matterportModelId: remote.matterportModelId || undefined,
        matterportPosition: remote.matterportPosition ? JSON.parse(remote.matterportPosition) : undefined,
        matterportNormal: remote.matterportNormal ? JSON.parse(remote.matterportNormal) : undefined,
        matterportSweepId: remote.matterportSweepId || undefined,
        matterportFloorIndex: remote.matterportFloorIndex ?? undefined,
        matterportFloorName: remote.matterportFloorName || undefined,
        matterportRoomId: remote.matterportRoomId || undefined,
        matterportRoomName: remote.matterportRoomName || undefined,
        aiSummary: remote.aiSummary || undefined,
        voiceNoteUri: remote.voiceNoteUri || undefined,
        signatures: remote.signatures ? JSON.parse(remote.signatures) : undefined,
        comments: remote.comments ? JSON.parse(remote.comments) : undefined,
        createdAt: remote.createdAt,
        updatedAt: remote.updatedAt,
        resolvedAt: remote.resolvedAt || undefined,
      } as Defect);
    }
  }

  // Save merged defects
  const merged = Array.from(localMap.values());
  await AsyncStorage.setItem("defects", JSON.stringify(merged));
}

async function mergeRemoteProjects(remoteProjects: any[]): Promise<void> {
  const [localRaw, deletedProjectIds] = await Promise.all([
    AsyncStorage.getItem("projects"),
    getDeletedProjectIds(),
  ]);
  const localProjects: any[] = localRaw ? JSON.parse(localRaw) : [];
  const localMap = new Map(localProjects.map((p) => [p.id || p.localId, p]));
  const deletedProjectIdSet = new Set(deletedProjectIds);

  for (const remote of remoteProjects) {
    if (deletedProjectIdSet.has(remote.localId)) continue;
    const local = localMap.get(remote.localId);
    if (!local || new Date(remote.updatedAt) > new Date(local.updatedAt || "2000-01-01")) {
      localMap.set(remote.localId, {
        ...(local || {}),
        id: remote.localId,
        name: remote.name,
        description: remote.description || "",
        prefix: remote.prefix || "",
        color: remote.color || "#0a7ea4",
        address: remote.address || "",
        client: remote.client || "",
        status: remote.status || "active",
        createdAt: remote.createdAt,
        updatedAt: remote.updatedAt,
      });
    }
  }

  const merged = Array.from(localMap.values());
  await AsyncStorage.setItem("projects", JSON.stringify(merged));
}

// ─── Legacy Protocol Sync (kept for backward compatibility) ───────────────────

export async function getLocalProtocols(): Promise<LocalProtocol[]> {
  const data = await AsyncStorage.getItem("protocols");
  return data ? JSON.parse(data) : [];
}

export async function saveLocalProtocols(protocols: LocalProtocol[]): Promise<void> {
  await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
}

export async function markProtocolSynced(localId: string): Promise<void> {
  const protocols = await getLocalProtocols();
  const updated = protocols.map((p) =>
    p.id === localId ? { ...p, synced: true } : p
  );
  await saveLocalProtocols(updated);
}

// ─── Auto-Sync Hook Helper ───────────────────────────────────────────────────

export async function shouldAutoSync(): Promise<boolean> {
  const enabled = await isSyncEnabled();
  if (!enabled) return false;

  const lastSync = await getLastSyncTime();
  if (!lastSync) return true;

  // Auto-sync if last sync was more than 5 minutes ago
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() - new Date(lastSync).getTime() > fiveMinutes;
}
