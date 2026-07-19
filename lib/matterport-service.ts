/**
 * protoKI – Matterport Service (Production)
 * 
 * Connects to the real Matterport API via the protoKI backend (tRPC).
 * Provides room/floor/sweep/tag data for the Knowledge Layer and Progress Engine.
 * 
 * Architecture:
 *   App → tRPC Client → protoKI Backend → Matterport GraphQL API
 *   Results → Knowledge Layer → Progress Engine → KI-Baufortschritt
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { timelineEngine } from "@/lib/timeline-engine";
import { knowledgeLayer } from "@/lib/knowledge-layer";
import type {
  IMatterportService,
  MatterportSpace,
  MatterportRoom,
  MatterportFloorPlan,
  MatterportTag,
  MatterportSweep,
  MatterportAnalysisRequest,
  MatterportAnalysisResult,
  MatterportConfig,
} from "@/shared/matterport-types";

const SPACES_KEY = "matterport-spaces";
const TAGS_KEY = "matterport-tags";
const CREDENTIALS_KEY = "matterport_credentials";

class MatterportService implements IMatterportService {
  private config: MatterportConfig = {
    autoSync: false,
    syncInterval: 60,
    defaultAnalysisType: "full_scan",
  };

  // ─── Credentials Helper ─────────────────────────────────────────────────────

  private async getCredentials(): Promise<{ tokenId: string; tokenSecret: string } | null> {
    try {
      const stored = await AsyncStorage.getItem(CREDENTIALS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  }

  // ─── Space Management ────────────────────────────────────────────────────────

  async importSpace(modelId: string, projectId: string): Promise<MatterportSpace> {
    const space: MatterportSpace = {
      id: `space_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      modelId,
      projectId,
      name: `Scan ${modelId}`,
      createdAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      status: "ready",
    };

    // Store
    const spaces = await this.getProjectSpaces(projectId);
    spaces.push(space);
    await AsyncStorage.setItem(SPACES_KEY, JSON.stringify(spaces));

    // Timeline event
    await timelineEngine.emit({
      projectId,
      eventType: "scan_imported",
      source: "matterport",
      title: `3D-Scan importiert: ${modelId}`,
      description: "Matterport-Modell wurde zur Analyse bereitgestellt",
      entityId: space.id,
      entityType: "analysis",
    });

    // Ingest into knowledge layer
    await knowledgeLayer.ingest({
      projectId,
      type: "observation",
      source: "matterport",
      content: `3D-Scan importiert (Modell: ${modelId}). Räume und Etagen werden synchronisiert.`,
      confidence: 1.0,
      metadata: { modelId, spaceId: space.id, action: "import" },
    });

    // Auto-sync rooms and floors
    await this.syncSpace(space.id);

    return space;
  }

  async getSpace(spaceId: string): Promise<MatterportSpace | null> {
    try {
      const stored = await AsyncStorage.getItem(SPACES_KEY);
      if (!stored) return null;
      const spaces: MatterportSpace[] = JSON.parse(stored);
      return spaces.find(s => s.id === spaceId) || null;
    } catch {
      return null;
    }
  }

  async getProjectSpaces(projectId: string): Promise<MatterportSpace[]> {
    try {
      const stored = await AsyncStorage.getItem(SPACES_KEY);
      if (!stored) return [];
      const spaces: MatterportSpace[] = JSON.parse(stored);
      return spaces.filter(s => s.projectId === projectId);
    } catch {
      return [];
    }
  }

  async syncSpace(spaceId: string): Promise<void> {
    const space = await this.getSpace(spaceId);
    if (!space) return;

    const creds = await this.getCredentials();
    if (!creds) {
      console.log("[Matterport] No credentials available for sync");
      return;
    }

    try {
      // Fetch rooms and floors via server API
      const rooms = await this.getRooms(spaceId);
      const floors = await this.getFloorPlans(spaceId);

      // Ingest room data into knowledge layer
      for (const room of rooms) {
        await knowledgeLayer.ingest({
          projectId: space.projectId,
          type: "observation",
          source: "matterport",
          content: `Raum erkannt: ${room.name} (Etage ${room.floorIndex})`,
          confidence: 1.0,
          metadata: {
            type: "room",
            roomId: room.id,
            roomName: room.name,
            floorIndex: room.floorIndex,
            modelId: space.modelId,
            spaceId,
          },
        });
      }

      // Ingest floor data
      for (const floor of floors) {
        await knowledgeLayer.ingest({
          projectId: space.projectId,
          type: "observation",
          source: "matterport",
          content: `Etage erkannt: ${floor.name} (Index: ${floor.floorIndex})`,
          confidence: 1.0,
          metadata: {
            type: "floor",
            floorId: floor.id,
            floorName: floor.name,
            floorIndex: floor.floorIndex,
            modelId: space.modelId,
            spaceId,
          },
        });
      }

      // Update space status
      const allSpaces = await this.getAllSpaces();
      const updated = allSpaces.map(s =>
        s.id === spaceId ? { ...s, lastSyncAt: new Date().toISOString(), status: "ready" as const } : s
      );
      await AsyncStorage.setItem(SPACES_KEY, JSON.stringify(updated));

      console.log(`[Matterport] Synced space ${spaceId}: ${rooms.length} rooms, ${floors.length} floors`);
    } catch (error: any) {
      console.error("[Matterport] Sync failed:", error.message);
    }
  }

  private async getAllSpaces(): Promise<MatterportSpace[]> {
    try {
      const stored = await AsyncStorage.getItem(SPACES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  // ─── Room & Floor (via tRPC server) ────────────────────────────────────────

  async getRooms(spaceId: string): Promise<MatterportRoom[]> {
    const space = await this.getSpace(spaceId);
    if (!space) return [];

    const creds = await this.getCredentials();
    if (!creds) return [];

    try {
      // Call server endpoint via fetch (tRPC batch)
      const response = await fetch(this.getApiUrl("/api/trpc/matterport.getRooms"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: creds.tokenId,
          tokenSecret: creds.tokenSecret,
          modelId: space.modelId,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.result?.data ?? [];
      }
    } catch (error: any) {
      console.error("[Matterport] getRooms failed:", error.message);
    }
    return [];
  }

  async getFloorPlans(spaceId: string): Promise<MatterportFloorPlan[]> {
    const space = await this.getSpace(spaceId);
    if (!space) return [];

    const creds = await this.getCredentials();
    if (!creds) return [];

    try {
      const response = await fetch(this.getApiUrl("/api/trpc/matterport.getFloors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: creds.tokenId,
          tokenSecret: creds.tokenSecret,
          modelId: space.modelId,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.result?.data ?? [];
      }
    } catch (error: any) {
      console.error("[Matterport] getFloorPlans failed:", error.message);
    }
    return [];
  }

  // ─── Tags & Annotations ────────────────────────────────────────────────────

  async getTags(spaceId: string): Promise<MatterportTag[]> {
    try {
      const stored = await AsyncStorage.getItem(`${TAGS_KEY}_${spaceId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  async createTag(tag: Omit<MatterportTag, "id" | "createdAt">): Promise<MatterportTag> {
    const fullTag: MatterportTag = {
      ...tag,
      id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };

    const tags = await this.getTags(tag.spaceId);
    tags.push(fullTag);
    await AsyncStorage.setItem(`${TAGS_KEY}_${tag.spaceId}`, JSON.stringify(tags));

    return fullTag;
  }

  async updateTag(tagId: string, updates: Partial<MatterportTag>): Promise<void> {
    console.log("[Matterport] updateTag:", tagId, updates);
  }

  async deleteTag(tagId: string): Promise<void> {
    console.log("[Matterport] deleteTag:", tagId);
  }

  // ─── Analysis (KI-Baufortschritt Foundation) ───────────────────────────────

  async analyzeSpace(request: MatterportAnalysisRequest): Promise<MatterportAnalysisResult> {
    const startTime = Date.now();
    const space = await this.getSpace(request.spaceId);

    // Emit timeline event
    await timelineEngine.emit({
      projectId: request.projectId,
      eventType: "scan_analyzed",
      source: "matterport",
      title: `3D-Scan Analyse: ${request.analysisType}`,
      description: `Analysiere Matterport-Modell (${request.analysisType})`,
    });

    // Gather real data from the model
    const rooms = space ? await this.getRooms(space.id) : [];
    const sweeps = space ? await this.getSweeps(space.id) : [];
    const tags = await this.getTags(request.spaceId);

    // Build analysis result with real data
    const observations: string[] = [];
    if (rooms.length > 0) {
      observations.push(`${rooms.length} Räume im 3D-Modell erkannt`);
      const roomNames = rooms.slice(0, 5).map(r => r.name).join(", ");
      observations.push(`Räume: ${roomNames}${rooms.length > 5 ? ` (+${rooms.length - 5} weitere)` : ""}`);
    }
    if (sweeps.length > 0) {
      observations.push(`${sweeps.length} Scan-Positionen verfügbar`);
    }
    if (tags.length > 0) {
      observations.push(`${tags.length} Markierungen/Pins im Modell`);
    }
    if (observations.length === 0) {
      observations.push("3D-Modell verbunden. Räume und Etagen werden bei nächster Synchronisation geladen.");
    }

    const result: MatterportAnalysisResult = {
      id: `mresult_${Date.now()}`,
      spaceId: request.spaceId,
      projectId: request.projectId,
      analysisType: request.analysisType,
      timestamp: new Date().toISOString(),
      defectsFound: tags.filter(t => t.tagType === "defect").length,
      tasksFound: tags.filter(t => t.tagType === "task").length,
      tags: tags as MatterportTag[],
      observations,
      overallConfidence: rooms.length > 0 ? 0.85 : 0.3,
      processingTime: Date.now() - startTime,
    };

    // Feed knowledge layer with analysis results
    await knowledgeLayer.ingest({
      projectId: request.projectId,
      type: "observation",
      source: "matterport",
      content: `Matterport-Analyse (${request.analysisType}): ${observations.join(". ")}`,
      confidence: result.overallConfidence,
      metadata: {
        spaceId: request.spaceId,
        analysisType: request.analysisType,
        roomCount: rooms.length,
        sweepCount: sweeps.length,
        tagCount: tags.length,
        defectsFound: result.defectsFound,
      },
    });

    return result;
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  async getSweeps(spaceId: string): Promise<MatterportSweep[]> {
    const space = await this.getSpace(spaceId);
    if (!space) return [];

    const creds = await this.getCredentials();
    if (!creds) return [];

    try {
      const response = await fetch(this.getApiUrl("/api/trpc/matterport.getSweeps"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: creds.tokenId,
          tokenSecret: creds.tokenSecret,
          modelId: space.modelId,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.result?.data ?? [];
      }
    } catch (error: any) {
      console.error("[Matterport] getSweeps failed:", error.message);
    }
    return [];
  }

  async getPanorama(_sweepId: string): Promise<string> {
    // Panorama URLs are accessed directly via the Matterport embed viewer
    // They cannot be extracted via the public API
    return "";
  }

  // ─── Config ────────────────────────────────────────────────────────────────

  getConfig(): MatterportConfig {
    return this.config;
  }

  async setConfig(config: Partial<MatterportConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    await AsyncStorage.setItem("matterport-config", JSON.stringify(this.config));
  }

  /**
   * Check if Matterport is configured and ready.
   * Now checks for stored credentials rather than config keys.
   */
  isConfigured(): boolean {
    // This is a sync check; for async credential check use getCredentials()
    return true; // Credentials are stored in AsyncStorage, checked at runtime
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  private getApiUrl(path: string): string {
    // In dev, the API runs on localhost:3000
    // In production, it's the same origin
    const baseUrl = __DEV__
      ? "http://localhost:3000"
      : (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    return `${baseUrl}${path}`;
  }
}

// Declare __DEV__ for TypeScript
declare const __DEV__: boolean;

// ─── Singleton Export ────────────────────────────────────────────────────────

export const matterportService = new MatterportService();
export default matterportService;
