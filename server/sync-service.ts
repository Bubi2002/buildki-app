/**
 * Cloud Sync Service - Server-side sync logic for defects, projects, and attachments.
 * Handles push/pull with last-write-wins conflict resolution.
 */
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "./db";
import { defects, projects, attachments, InsertDefect, InsertProject } from "../drizzle/schema";
import { storagePut } from "./storage";

// ─── Defect Sync ──────────────────────────────────────────────────────────────

export interface SyncDefectInput {
  localId: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  category?: string | null;
  gewerk?: string | null;
  photos?: string | null; // JSON
  beforePhotos?: string | null;
  afterPhotos?: string | null;
  assignee?: string | null;
  assigneeFirma?: string | null;
  dueDate?: string | null;
  location?: string | null;
  floor?: string | null;
  room?: string | null;
  positionCode?: string | null;
  followUpDate?: string | null;
  followUpResult?: string | null;
  source?: string | null;
  confidence?: number | null;
  protocolId?: string | null;
  analysisId?: string | null;
  matterportModelId?: string | null;
  matterportPosition?: string | null;
  matterportNormal?: string | null;
  matterportSweepId?: string | null;
  matterportFloorIndex?: number | null;
  matterportFloorName?: string | null;
  matterportRoomId?: string | null;
  matterportRoomName?: string | null;
  aiSummary?: string | null;
  voiceNoteUri?: string | null;
  signatures?: string | null;
  comments?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export async function pushDefects(userId: number, items: SyncDefectInput[]): Promise<{ pushed: number; conflicts: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let pushed = 0;
  let conflicts = 0;

  for (const item of items) {
    const existing = await db
      .select()
      .from(defects)
      .where(and(eq(defects.localId, item.localId), eq(defects.userId, userId)))
      .limit(1);

    const values: Partial<InsertDefect> = {
      localId: item.localId,
      userId,
      projectId: item.projectId,
      title: item.title,
      description: item.description,
      status: item.status,
      priority: item.priority,
      category: item.category,
      gewerk: item.gewerk,
      photos: item.photos,
      beforePhotos: item.beforePhotos,
      afterPhotos: item.afterPhotos,
      assignee: item.assignee,
      assigneeFirma: item.assigneeFirma,
      dueDate: item.dueDate,
      location: item.location,
      floor: item.floor,
      room: item.room,
      positionCode: item.positionCode,
      followUpDate: item.followUpDate,
      followUpResult: item.followUpResult,
      source: item.source,
      confidence: item.confidence,
      protocolId: item.protocolId,
      analysisId: item.analysisId,
      matterportModelId: item.matterportModelId,
      matterportPosition: item.matterportPosition,
      matterportNormal: item.matterportNormal,
      matterportSweepId: item.matterportSweepId,
      matterportFloorIndex: item.matterportFloorIndex,
      matterportFloorName: item.matterportFloorName,
      matterportRoomId: item.matterportRoomId,
      matterportRoomName: item.matterportRoomName,
      aiSummary: item.aiSummary,
      voiceNoteUri: item.voiceNoteUri,
      signatures: item.signatures,
      comments: item.comments,
      resolvedAt: item.resolvedAt ? new Date(item.resolvedAt) : null,
      createdAt: new Date(item.createdAt),
    };

    if (existing.length > 0) {
      // Conflict resolution: last-write-wins based on updatedAt
      const serverUpdatedAt = existing[0].updatedAt.getTime();
      const clientUpdatedAt = new Date(item.updatedAt).getTime();

      if (clientUpdatedAt >= serverUpdatedAt) {
        // Client wins - update server
        await db.update(defects).set(values).where(eq(defects.id, existing[0].id));
        pushed++;
      } else {
        // Server wins - skip this item
        conflicts++;
      }
    } else {
      // New record - insert
      await db.insert(defects).values(values as InsertDefect);
      pushed++;
    }
  }

  return { pushed, conflicts };
}

export async function pullDefects(userId: number, since?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query;
  if (since) {
    query = db
      .select()
      .from(defects)
      .where(and(eq(defects.userId, userId), gt(defects.updatedAt, new Date(since))));
  } else {
    query = db.select().from(defects).where(eq(defects.userId, userId));
  }

  const results = await query;
  return results.map((d) => ({
    localId: d.localId,
    projectId: d.projectId,
    title: d.title,
    description: d.description,
    status: d.status,
    priority: d.priority,
    category: d.category,
    gewerk: d.gewerk,
    photos: d.photos,
    beforePhotos: d.beforePhotos,
    afterPhotos: d.afterPhotos,
    assignee: d.assignee,
    assigneeFirma: d.assigneeFirma,
    dueDate: d.dueDate,
    location: d.location,
    floor: d.floor,
    room: d.room,
    positionCode: d.positionCode,
    followUpDate: d.followUpDate,
    followUpResult: d.followUpResult,
    source: d.source,
    confidence: d.confidence,
    protocolId: d.protocolId,
    analysisId: d.analysisId,
    matterportModelId: d.matterportModelId,
    matterportPosition: d.matterportPosition,
    matterportNormal: d.matterportNormal,
    matterportSweepId: d.matterportSweepId,
    matterportFloorIndex: d.matterportFloorIndex,
    matterportFloorName: d.matterportFloorName,
    matterportRoomId: d.matterportRoomId,
    matterportRoomName: d.matterportRoomName,
    aiSummary: d.aiSummary,
    voiceNoteUri: d.voiceNoteUri,
    signatures: d.signatures,
    comments: d.comments,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    resolvedAt: d.resolvedAt?.toISOString() || null,
  }));
}

export async function deleteDefect(userId: number, localId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(defects).where(and(eq(defects.localId, localId), eq(defects.userId, userId)));
}

// ─── Project Sync ─────────────────────────────────────────────────────────────

export interface SyncProjectInput {
  localId: string;
  name: string;
  description?: string | null;
  prefix?: string | null;
  color?: string | null;
  address?: string | null;
  client?: string | null;
  status?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function pushProjects(userId: number, items: SyncProjectInput[]): Promise<{ pushed: number; conflicts: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let pushed = 0;
  let conflicts = 0;

  for (const item of items) {
    const existing = await db
      .select()
      .from(projects)
      .where(and(eq(projects.localId, item.localId), eq(projects.userId, userId)))
      .limit(1);

    const values: Partial<InsertProject> = {
      localId: item.localId,
      userId,
      name: item.name,
      description: item.description,
      prefix: item.prefix,
      color: item.color,
      address: item.address,
      client: item.client,
      status: item.status || "active",
      createdAt: new Date(item.createdAt),
    };

    if (existing.length > 0) {
      const serverUpdatedAt = existing[0].updatedAt.getTime();
      const clientUpdatedAt = new Date(item.updatedAt).getTime();

      if (clientUpdatedAt >= serverUpdatedAt) {
        await db.update(projects).set(values).where(eq(projects.id, existing[0].id));
        pushed++;
      } else {
        conflicts++;
      }
    } else {
      await db.insert(projects).values(values as InsertProject);
      pushed++;
    }
  }

  return { pushed, conflicts };
}

export async function pullProjects(userId: number, since?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query;
  if (since) {
    query = db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), gt(projects.updatedAt, new Date(since))));
  } else {
    query = db.select().from(projects).where(eq(projects.userId, userId));
  }

  const results = await query;
  return results.map((p) => ({
    localId: p.localId,
    name: p.name,
    description: p.description,
    prefix: p.prefix,
    color: p.color,
    address: p.address,
    client: p.client,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export async function deleteProject(userId: number, localId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projects).where(and(eq(projects.localId, localId), eq(projects.userId, userId)));
}

// ─── Attachment Sync ──────────────────────────────────────────────────────────

export async function uploadAttachment(
  userId: number,
  entityType: string,
  entityLocalId: string,
  fileData: string, // base64
  fileName: string,
  mimeType: string
): Promise<{ storageKey: string; storageUrl: string }> {
  const buffer = Buffer.from(fileData, "base64");
  const key = `${userId}/${entityType}/${entityLocalId}/${fileName}`;
  const { key: storageKey, url: storageUrl } = await storagePut(key, buffer, mimeType);

  // Record in attachments table
  const db = await getDb();
  if (db) {
    await db.insert(attachments).values({
      userId,
      entityType,
      entityLocalId,
      storageKey,
      storageUrl,
      originalName: fileName,
      mimeType,
      sizeBytes: buffer.length,
    });
  }

  return { storageKey, storageUrl };
}

export async function getAttachments(userId: number, entityType: string, entityLocalId: string) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, userId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityLocalId, entityLocalId)
      )
    );
}

// ─── Full Sync ────────────────────────────────────────────────────────────────

export interface FullSyncInput {
  defects: SyncDefectInput[];
  projects: SyncProjectInput[];
  lastSyncAt?: string;
}

export interface FullSyncResult {
  pushed: { defects: number; projects: number };
  conflicts: { defects: number; projects: number };
  pulled: { defects: any[]; projects: any[] };
  syncedAt: string;
}

export async function fullSync(userId: number, input: FullSyncInput): Promise<FullSyncResult> {
  // 1. Push local changes to server
  const defectResult = await pushDefects(userId, input.defects);
  const projectResult = await pushProjects(userId, input.projects);

  // 2. Pull server changes (since last sync)
  const pulledDefects = await pullDefects(userId, input.lastSyncAt);
  const pulledProjects = await pullProjects(userId, input.lastSyncAt);

  const syncedAt = new Date().toISOString();

  return {
    pushed: { defects: defectResult.pushed, projects: projectResult.pushed },
    conflicts: { defects: defectResult.conflicts, projects: projectResult.conflicts },
    pulled: { defects: pulledDefects, projects: pulledProjects },
    syncedAt,
  };
}
