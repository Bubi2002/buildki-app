/**
 * protoKI – Zentraler AI Service
 * 
 * Einziger Anlaufpunkt für alle KI-Analyse-Aufrufe in der App.
 * UI-Komponenten rufen DIESEN Service auf – keine eigene KI-Logik in UI.
 * 
 * Verantwortlichkeiten:
 * - Foto-Upload & Analyse (Einzel + Batch)
 * - Automatische Gruppierung (Raum/Zeit)
 * - Ergebnis-Normalisierung auf einheitliche Typen
 * - Analyse-Historie-Verwaltung
 * - Knowledge-Layer-Integration
 * 
 * ARCHITEKTUR: Mutations werden von React-Hooks injiziert (Dependency Injection).
 * Dadurch bleibt der Service UI-agnostisch und testbar.
 */

import { saveAnalysisToHistory } from "@/lib/analysis-history-store";
import type {
  AnalysisSource,
  AnalysisSourceMeta,
  AnalysisResult,
  BatchGroup,
  BatchAnalysisResult,
  BatchGroupStrategy,
} from "@/shared/ai-types";

// Knowledge layer is lazily imported to avoid circular deps
let _knowledgeLayerMod: any = null;
async function getKnowledgeLayer() {
  if (!_knowledgeLayerMod) {
    try {
      _knowledgeLayerMod = await import("@/lib/knowledge-layer");
    } catch {
      _knowledgeLayerMod = { knowledgeLayer: { ingestAnalysis: async () => {} } };
    }
  }
  return _knowledgeLayerMod.knowledgeLayer;
}

// ─── Mutation Interface (Dependency Injection) ───────────────────────────────

/**
 * Mutation-Funktionen die von React-Hooks (useMutation) kommen.
 * Der AI Service ist UI-agnostisch und bekommt diese injiziert.
 */
export interface AIServiceMutations {
  uploadPhoto: (input: { base64: string; mimeType: string; filename: string }) => Promise<{ url: string }>;
  analyzePhoto: (input: {
    imageUrls: string[];
    projectId: string;
    projectName?: string;
    roomName?: string;
    additionalContext?: string;
  }) => Promise<{
    id: string;
    source: string;
    timestamp: string;
    projectId: string;
    summary: string;
    progress: { overallPercent: number; phase: string; completedTrades: string[]; activeTrades: string[]; pendingTrades: string[] };
    defects: Array<{ id: string; title: string; description: string; severity: string; trade: string; location: string; suggestedAction: string; confidence: number }>;
    tasks: Array<{ id: string; title: string; description: string; priority: string; trade: string; estimatedDuration: string; deadline: string | null }>;
    observations: string[];
  }>;
}

// ─── Single Photo Analysis ───────────────────────────────────────────────────

export interface AnalyzePhotosInput {
  /** Base64-encoded photos to upload first */
  photos?: Array<{ base64: string; mimeType: string; filename: string }>;
  /** Already-uploaded image URLs */
  imageUrls?: string[];
  projectId: string;
  projectName?: string;
  roomName?: string;
  additionalContext?: string;
  source?: AnalysisSource;
  /** Injected mutation functions from React hooks */
  mutations: AIServiceMutations;
}

export interface AnalyzePhotosOutput {
  result: AnalysisResult;
  historyId: string;
}

/**
 * Analysiert ein oder mehrere Fotos über den Server.
 * Kümmert sich um Upload, Analyse, Historie-Speicherung und Knowledge-Layer.
 */
export async function analyzePhotos(input: AnalyzePhotosInput): Promise<AnalyzePhotosOutput> {
  const { photos, imageUrls: existingUrls, projectId, projectName, roomName, additionalContext, source = "photo", mutations } = input;
  
  // Step 1: Upload photos if base64 provided
  let imageUrls: string[] = existingUrls ? [...existingUrls] : [];
  
  if (photos && photos.length > 0) {
    for (const photo of photos) {
      const uploadResult = await mutations.uploadPhoto({
        base64: photo.base64,
        mimeType: photo.mimeType,
        filename: photo.filename,
      });
      imageUrls.push(uploadResult.url);
    }
  }

  if (imageUrls.length === 0) {
    throw new Error("Keine Bilder zum Analysieren vorhanden");
  }

  // Step 2: Call server analysis
  const serverResult = await mutations.analyzePhoto({
    imageUrls,
    projectId,
    projectName,
    roomName,
    additionalContext,
  });

  // Step 3: Normalize to unified AnalysisResult
  const sourceMeta: AnalysisSourceMeta = {
    source,
    subSource: photos ? "camera" : "gallery",
    mediaCount: imageUrls.length,
    mediaUris: imageUrls,
    roomName,
  };

  const result: AnalysisResult = {
    id: serverResult.id,
    source,
    sourceMeta,
    timestamp: serverResult.timestamp,
    projectId,
    projectName,
    summary: serverResult.summary,
    progress: serverResult.progress as AnalysisResult["progress"],
    defects: serverResult.defects as AnalysisResult["defects"],
    tasks: serverResult.tasks as AnalysisResult["tasks"],
    observations: serverResult.observations,
  };

  // Step 4: Save to analysis history
  await saveAnalysisToHistory({
    timestamp: result.timestamp,
    source: result.source,
    projectId,
    projectName,
    summary: result.summary,
    defectCount: result.defects.length,
    taskCount: result.tasks.length,
    progressPercent: result.progress.overallPercent,
    adoptedDefects: 0,
    adoptedTasks: 0,
    photoCount: imageUrls.length,
  });

  // Step 5: Feed knowledge layer
  try {
    const kl = await getKnowledgeLayer();
    await kl.ingestAnalysis(result);
  } catch (err) {
    console.warn("[AIService] Knowledge layer ingestion failed:", err);
  }

  return { result, historyId: result.id };
}

// ─── Batch Analysis ──────────────────────────────────────────────────────────

export interface BatchAnalyzeInput {
  projectId: string;
  projectName?: string;
  /** All photo URIs (local or remote) */
  photoUris: string[];
  /** Photo metadata for grouping */
  photoMeta?: Array<{
    uri: string;
    timestamp?: string;
    roomName?: string;
    location?: { lat: number; lng: number };
  }>;
  /** Preferred grouping strategy */
  groupStrategy?: BatchGroupStrategy;
  additionalContext?: string;
  /** Injected mutation functions from React hooks */
  mutations: AIServiceMutations;
}

/**
 * Batch-Analyse: Gruppiert Fotos automatisch und analysiert jede Gruppe separat.
 * Unterstützt Gruppierung nach Raum, Aufnahmezeit oder automatisch.
 */
export async function batchAnalyze(input: BatchAnalyzeInput): Promise<BatchAnalysisResult> {
  const { projectId, projectName, photoUris, photoMeta, groupStrategy = "auto", additionalContext, mutations } = input;
  
  // Step 1: Group photos
  const groups = groupPhotos(photoUris, photoMeta, groupStrategy);
  
  // Step 2: Analyze each group
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const groupResults: BatchAnalysisResult["groups"] = [];
  
  for (const group of groups) {
    try {
      const { result } = await analyzePhotos({
        imageUrls: group.photoUris,
        projectId,
        projectName,
        roomName: group.roomName || group.label,
        additionalContext: additionalContext ? `${additionalContext}\nGruppe: ${group.label}` : `Gruppe: ${group.label}`,
        source: "photo",
        mutations,
      });
      
      // Tag with batch info
      result.batchId = batchId;
      result.groupLabel = group.label;
      
      groupResults.push({
        groupId: group.id,
        label: group.label,
        result,
      });
    } catch (err) {
      console.warn(`[AIService] Batch group "${group.label}" failed:`, err);
      // Continue with other groups
    }
  }

  // Step 3: Aggregate results
  const totalDefects = groupResults.reduce((sum, g) => sum + g.result.defects.length, 0);
  const totalTasks = groupResults.reduce((sum, g) => sum + g.result.tasks.length, 0);
  const avgProgress = groupResults.length > 0
    ? Math.round(groupResults.reduce((sum, g) => sum + g.result.progress.overallPercent, 0) / groupResults.length)
    : 0;

  const aggregatedSummary = groupResults.length > 0
    ? `Batch-Analyse: ${groupResults.length} Gruppen analysiert. ${totalDefects} Mängel, ${totalTasks} Aufgaben erkannt. Durchschnittlicher Fortschritt: ${avgProgress}%.`
    : "Keine Ergebnisse verfügbar.";

  return {
    batchId,
    timestamp: new Date().toISOString(),
    projectId,
    groups: groupResults,
    aggregatedSummary,
    totalDefects,
    totalTasks,
    averageProgress: avgProgress,
  };
}

// ─── Photo Grouping Logic ────────────────────────────────────────────────────

function groupPhotos(
  photoUris: string[],
  photoMeta?: BatchAnalyzeInput["photoMeta"],
  strategy?: BatchGroupStrategy,
): BatchGroup[] {
  if (!photoMeta || photoMeta.length === 0 || strategy === "manual") {
    return [{
      id: "group_all",
      label: "Alle Fotos",
      strategy: "manual",
      photoUris,
    }];
  }

  const effectiveStrategy = strategy === "auto" ? detectBestStrategy(photoMeta) : strategy;

  if (effectiveStrategy === "room") {
    return groupByRoom(photoUris, photoMeta);
  } else if (effectiveStrategy === "time") {
    return groupByTime(photoUris, photoMeta);
  }

  return [{
    id: "group_all",
    label: "Alle Fotos",
    strategy: "manual",
    photoUris,
  }];
}

function detectBestStrategy(meta: NonNullable<BatchAnalyzeInput["photoMeta"]>): BatchGroupStrategy {
  const hasRooms = meta.some(m => m.roomName && m.roomName.trim() !== "");
  if (hasRooms) return "room";

  const hasTimestamps = meta.filter(m => m.timestamp).length > 1;
  if (hasTimestamps) return "time";

  return "manual";
}

function groupByRoom(
  photoUris: string[],
  meta: NonNullable<BatchAnalyzeInput["photoMeta"]>,
): BatchGroup[] {
  const roomMap = new Map<string, string[]>();
  const unassigned: string[] = [];

  for (const item of meta) {
    const room = item.roomName?.trim() || "";
    if (room) {
      if (!roomMap.has(room)) roomMap.set(room, []);
      roomMap.get(room)!.push(item.uri);
    } else {
      unassigned.push(item.uri);
    }
  }

  const groups: BatchGroup[] = [];
  let idx = 0;
  for (const [room, uris] of roomMap.entries()) {
    groups.push({
      id: `group_room_${idx++}`,
      label: room,
      strategy: "room",
      photoUris: uris,
      roomName: room,
    });
  }

  if (unassigned.length > 0) {
    groups.push({
      id: "group_unassigned",
      label: "Ohne Raumzuordnung",
      strategy: "room",
      photoUris: unassigned,
    });
  }

  return groups.length > 0 ? groups : [{ id: "group_all", label: "Alle Fotos", strategy: "manual", photoUris }];
}

function groupByTime(
  photoUris: string[],
  meta: NonNullable<BatchAnalyzeInput["photoMeta"]>,
): BatchGroup[] {
  const withTime = meta
    .filter(m => m.timestamp)
    .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());

  if (withTime.length < 2) {
    return [{ id: "group_all", label: "Alle Fotos", strategy: "manual", photoUris }];
  }

  const GAP_MS = 10 * 60 * 1000; // 10 minutes
  const groups: BatchGroup[] = [];
  let currentGroup: string[] = [withTime[0].uri];
  let groupStart = new Date(withTime[0].timestamp!);

  for (let i = 1; i < withTime.length; i++) {
    const currentTime = new Date(withTime[i].timestamp!);
    const prevTime = new Date(withTime[i - 1].timestamp!);
    
    if (currentTime.getTime() - prevTime.getTime() > GAP_MS) {
      const startStr = groupStart.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      const endStr = prevTime.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      groups.push({
        id: `group_time_${groups.length}`,
        label: `${startStr} – ${endStr}`,
        strategy: "time",
        photoUris: [...currentGroup],
        timeRange: { start: groupStart.toISOString(), end: prevTime.toISOString() },
      });
      currentGroup = [withTime[i].uri];
      groupStart = currentTime;
    } else {
      currentGroup.push(withTime[i].uri);
    }
  }

  if (currentGroup.length > 0) {
    const startStr = groupStart.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const lastTime = new Date(withTime[withTime.length - 1].timestamp!);
    const endStr = lastTime.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    groups.push({
      id: `group_time_${groups.length}`,
      label: `${startStr} – ${endStr}`,
      strategy: "time",
      photoUris: [...currentGroup],
      timeRange: { start: groupStart.toISOString(), end: lastTime.toISOString() },
    });
  }

  return groups.length > 0 ? groups : [{ id: "group_all", label: "Alle Fotos", strategy: "manual", photoUris }];
}

// ─── Export singleton-like interface ─────────────────────────────────────────

export const aiService = {
  analyzePhotos,
  batchAnalyze,
};

export default aiService;
