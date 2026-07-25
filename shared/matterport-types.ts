/**
 * protoKI – Matterport Integration Types
 * 
 * Schnittstellen-Vorbereitung für Matterport 3D-Scan Integration.
 * Keine vollständige Implementierung, aber die Architektur ist vorbereitet,
 * damit Matterport später ohne größere Umbauten integriert werden kann.
 * 
 * Matterport liefert:
 * - 3D-Raummodelle (Mesh, Point Cloud)
 * - 360°-Panoramen pro Standpunkt
 * - Raumvermessung (Flächen, Volumen)
 * - Annotationen (Tags, Mattertags)
 * - Floor Plans (automatisch generiert)
 */

import type { EntityType } from "./entities";

// ─── Matterport Space ────────────────────────────────────────────────────────

export interface MatterportSpace {
  id: string;
  modelId: string; // Matterport Model SID
  projectId: string;
  name: string;
  address?: string;
  createdAt: string;
  lastSyncAt: string;
  status: "pending" | "syncing" | "ready" | "error";
  
  // Space metadata
  totalArea?: number; // m²
  totalRooms?: number;
  totalFloors?: number;
  scanDate?: string;
  
  // URLs
  embedUrl?: string;
  thumbnailUrl?: string;
  bundleUrl?: string;
}

// ─── Matterport Room ─────────────────────────────────────────────────────────

export interface MatterportRoom {
  id: string;
  spaceId: string;
  name: string;
  floorIndex: number;
  area?: number;
  volume?: number;
  center?: MatterportPosition;
  boundary?: MatterportPosition[];
  
  // Mapping to protoKI entities
  entityRoomId?: string;
  entityFloorId?: string;
}

export interface MatterportPosition {
  x: number;
  y: number;
  z: number;
}

export interface MatterportRotation {
  x: number;
  y: number;
  z: number;
}

// ─── Matterport Sweep (Scan Point) ──────────────────────────────────────────

export interface MatterportSweep {
  id: string;
  spaceId: string;
  position: MatterportPosition;
  rotation: MatterportRotation;
  roomId?: string;
  floorIndex: number;
  panoramaUrl?: string;
  capturedAt?: string;
}

// ─── Matterport Tag (Annotation) ─────────────────────────────────────────────

export interface MatterportTag {
  id: string;
  spaceId: string;
  label: string;
  description?: string;
  position: MatterportPosition;
  normal?: MatterportPosition;
  roomId?: string;
  floorIndex?: number;
  
  // protoKI integration
  linkedEntityId?: string;
  linkedEntityType?: EntityType;
  tagType: "defect" | "task" | "info" | "measurement" | "photo" | "custom";
  color?: string;
  icon?: string;
  
  createdAt: string;
  createdBy?: string;
}

// ─── Matterport Floor Plan ───────────────────────────────────────────────────

export interface MatterportFloorPlan {
  id: string;
  spaceId: string;
  floorIndex: number;
  name: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  resolution?: number; // px per meter
  rooms: MatterportRoom[];
}

// ─── Matterport Analysis Request ─────────────────────────────────────────────

export interface MatterportAnalysisRequest {
  spaceId: string;
  projectId: string;
  projectName?: string;
  analysisType: MatterportAnalysisType;
  targetRoomIds?: string[];
  targetFloorIndex?: number;
  additionalContext?: string;
}

export type MatterportAnalysisType =
  | "defect_detection"     // Erkennung von Mängeln in 360°-Bildern
  | "progress_tracking"    // Baufortschritt durch Vergleich von Scans
  | "room_classification"  // Automatische Raumklassifizierung
  | "measurement"          // Flächen- und Volumenmessung
  | "comparison"           // Vergleich mit Plänen/BIM
  | "full_scan";           // Vollständige Analyse

// ─── Matterport Analysis Result ──────────────────────────────────────────────

export interface MatterportAnalysisResult {
  id: string;
  spaceId: string;
  projectId: string;
  analysisType: MatterportAnalysisType;
  timestamp: string;
  
  // Results
  defectsFound: number;
  tasksFound: number;
  tags: MatterportTag[];
  observations: string[];
  
  // Progress (for progress_tracking)
  progressPercent?: number;
  changesDetected?: string[];
  
  // Confidence
  overallConfidence: number;
  processingTime: number;
}

// ─── Matterport Service Interface ────────────────────────────────────────────

/**
 * Interface für den zukünftigen Matterport Service.
 * Alle Module können gegen dieses Interface programmieren.
 */
export interface IMatterportService {
  // Space Management
  importSpace(modelId: string, projectId: string): Promise<MatterportSpace>;
  getSpace(spaceId: string): Promise<MatterportSpace | null>;
  getProjectSpaces(projectId: string): Promise<MatterportSpace[]>;
  syncSpace(spaceId: string): Promise<void>;
  
  // Room & Floor
  getRooms(spaceId: string): Promise<MatterportRoom[]>;
  getFloorPlans(spaceId: string): Promise<MatterportFloorPlan[]>;
  
  // Tags & Annotations
  getTags(spaceId: string): Promise<MatterportTag[]>;
  createTag(tag: Omit<MatterportTag, "id" | "createdAt">): Promise<MatterportTag>;
  updateTag(tagId: string, updates: Partial<MatterportTag>): Promise<void>;
  deleteTag(tagId: string): Promise<void>;
  
  // Analysis
  analyzeSpace(request: MatterportAnalysisRequest): Promise<MatterportAnalysisResult>;
  
  // Navigation
  getSweeps(spaceId: string): Promise<MatterportSweep[]>;
  getPanorama(sweepId: string): Promise<string>; // URL
}

// ─── Matterport Event Types (for Timeline Engine) ────────────────────────────

export type MatterportEventType =
  | "scan_imported"
  | "scan_synced"
  | "scan_analyzed"
  | "tag_created"
  | "tag_updated"
  | "progress_compared"
  | "defect_detected_3d";

// ─── Matterport Config ───────────────────────────────────────────────────────

export interface MatterportConfig {
  apiKey?: string;
  applicationKey?: string;
  sdkVersion?: string;
  autoSync: boolean;
  syncInterval: number; // minutes
  defaultAnalysisType: MatterportAnalysisType;
}

export const DEFAULT_MATTERPORT_CONFIG: MatterportConfig = {
  autoSync: false,
  syncInterval: 60,
  defaultAnalysisType: "full_scan",
};
