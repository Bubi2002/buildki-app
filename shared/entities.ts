/**
 * protoKI – Unified Entity System
 * 
 * Alle Module arbeiten ausschließlich mit diesen Entitäten.
 * Das Entity-System bildet die Grundlage für Knowledge Layer,
 * Timeline Engine, Smart Timeline, Document AI und Matterport.
 * 
 * Entitäten: Projekt, Gebäude, Geschoss, Raum, Gewerk, Foto,
 * Analyse, Aufgabe, Mangel, Bericht, Dokument, Termin, Person, Firma
 */

// ─── Base Entity ─────────────────────────────────────────────────────────────

export interface BaseEntity {
  id: string;
  entityType: EntityType;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export type EntityType =
  | "project"
  | "building"
  | "floor"
  | "room"
  | "trade"
  | "photo"
  | "analysis"
  | "task"
  | "defect"
  | "report"
  | "document"
  | "appointment"
  | "person"
  | "company";

// ─── Entity Relation ─────────────────────────────────────────────────────────

export type RelationType =
  | "belongs_to"
  | "contains"
  | "references"
  | "depends_on"
  | "assigned_to"
  | "created_by"
  | "located_in"
  | "documented_by"
  | "detected_in"
  | "responsible_for";

export interface EntityRelation {
  id: string;
  sourceId: string;
  sourceType: EntityType;
  targetId: string;
  targetType: EntityType;
  relationType: RelationType;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── Concrete Entities ───────────────────────────────────────────────────────

export interface ProjectEntity extends BaseEntity {
  entityType: "project";
  name: string;
  number?: string;
  address?: string;
  client?: string;
  startDate?: string;
  endDate?: string;
  status: "active" | "completed" | "paused" | "archived";
  color?: string;
  prefix?: string;
}

export interface BuildingEntity extends BaseEntity {
  entityType: "building";
  name: string;
  address?: string;
  buildingType?: string;
  floors?: number;
  area?: number;
}

export interface FloorEntity extends BaseEntity {
  entityType: "floor";
  buildingId: string;
  name: string;
  number: number;
  level?: string; // e.g. "EG", "1.OG", "UG"
  area?: number;
}

export interface RoomEntity extends BaseEntity {
  entityType: "room";
  floorId?: string;
  buildingId?: string;
  name: string;
  number?: string;
  roomType?: string;
  area?: number;
}

export interface TradeEntity extends BaseEntity {
  entityType: "trade";
  name: string;
  number?: number;
  category?: string;
  companyId?: string;
  contactPersonId?: string;
  color?: string;
}

export interface PhotoEntity extends BaseEntity {
  entityType: "photo";
  uri: string;
  thumbnailUri?: string;
  roomId?: string;
  floorId?: string;
  location?: string;
  capturedAt: string;
  width?: number;
  height?: number;
  analysisId?: string;
  tags?: string[];
}

export interface AnalysisEntity extends BaseEntity {
  entityType: "analysis";
  source: AnalysisSource;
  status: "pending" | "running" | "completed" | "failed";
  inputType: "photo" | "document" | "speech" | "scan" | "batch";
  inputIds: string[];
  resultSummary?: string;
  defectsFound: number;
  tasksFound: number;
  confidence?: number;
  duration?: number;
}

export type AnalysisSource = "photo" | "speech" | "document" | "matterport" | "batch" | "manual";

export interface TaskEntity extends BaseEntity {
  entityType: "task";
  title: string;
  description?: string;
  status: "offen" | "in_bearbeitung" | "erledigt" | "abgebrochen";
  priority: "niedrig" | "mittel" | "hoch" | "kritisch";
  tradeId?: string;
  roomId?: string;
  floorId?: string;
  assignedTo?: string;
  deadline?: string;
  estimatedDuration?: string;
  source: AnalysisSource;
  confidence?: number;
  analysisId?: string;
}

export interface DefectEntity extends BaseEntity {
  entityType: "defect";
  title: string;
  description?: string;
  status: "offen" | "in_bearbeitung" | "erledigt" | "abgelehnt";
  priority: "niedrig" | "mittel" | "hoch" | "kritisch";
  severity: "minor" | "major" | "critical";
  tradeId?: string;
  roomId?: string;
  floorId?: string;
  location?: string;
  photos: string[];
  assignedTo?: string;
  deadline?: string;
  source: AnalysisSource;
  confidence?: number;
  analysisId?: string;
  suggestedAction?: string;
}

export interface ReportEntity extends BaseEntity {
  entityType: "report";
  title: string;
  reportType: "baustellenbericht" | "besprechungsnotiz" | "maengelliste" | "tagesbericht" | "abnahmeprotokoll" | "wochenbericht";
  date: string;
  content?: string;
  pdfUri?: string;
  recordingId?: string;
  participants?: string[];
}

export interface DocumentEntity extends BaseEntity {
  entityType: "document";
  title: string;
  fileName: string;
  fileUri: string;
  fileType: "pdf" | "docx" | "xlsx" | "image" | "dwg" | "ifc" | "other";
  fileSize?: number;
  category?: DocumentCategory;
  analyzed: boolean;
  analysisId?: string;
  extractedEntities?: string[];
  pageCount?: number;
}

export type DocumentCategory =
  | "plan"
  | "contract"
  | "specification"
  | "protocol"
  | "invoice"
  | "correspondence"
  | "permit"
  | "certificate"
  | "photo_documentation"
  | "other";

export interface AppointmentEntity extends BaseEntity {
  entityType: "appointment";
  title: string;
  date: string;
  time?: string;
  endDate?: string;
  endTime?: string;
  location?: string;
  participants?: string[];
  tradeId?: string;
  appointmentType?: "meeting" | "inspection" | "deadline" | "milestone" | "delivery";
  notes?: string;
}

export interface PersonEntity extends BaseEntity {
  entityType: "person";
  firstName: string;
  lastName: string;
  role?: string;
  companyId?: string;
  email?: string;
  phone?: string;
  tradeId?: string;
}

export interface CompanyEntity extends BaseEntity {
  entityType: "company";
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  tradeIds?: string[];
  contactPersonId?: string;
  role?: "contractor" | "subcontractor" | "client" | "architect" | "engineer" | "supplier" | "authority";
}

// ─── Union Type ──────────────────────────────────────────────────────────────

export type Entity =
  | ProjectEntity
  | BuildingEntity
  | FloorEntity
  | RoomEntity
  | TradeEntity
  | PhotoEntity
  | AnalysisEntity
  | TaskEntity
  | DefectEntity
  | ReportEntity
  | DocumentEntity
  | AppointmentEntity
  | PersonEntity
  | CompanyEntity;

// ─── Entity Helpers ──────────────────────────────────────────────────────────

export function createEntityId(type: EntityType): string {
  return `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getEntityLabel(type: EntityType): string {
  const labels: Record<EntityType, string> = {
    project: "Projekt",
    building: "Gebäude",
    floor: "Geschoss",
    room: "Raum",
    trade: "Gewerk",
    photo: "Foto",
    analysis: "Analyse",
    task: "Aufgabe",
    defect: "Mangel",
    report: "Bericht",
    document: "Dokument",
    appointment: "Termin",
    person: "Person",
    company: "Firma",
  };
  return labels[type] || type;
}

export function getEntityIcon(type: EntityType): string {
  const icons: Record<EntityType, string> = {
    project: "business",
    building: "apartment",
    floor: "layers",
    room: "meeting-room",
    trade: "construction",
    photo: "photo-camera",
    analysis: "analytics",
    task: "task-alt",
    defect: "warning",
    report: "description",
    document: "insert-drive-file",
    appointment: "event",
    person: "person",
    company: "domain",
  };
  return icons[type] || "help";
}

export function getEntityColor(type: EntityType): string {
  const colors: Record<EntityType, string> = {
    project: "#0EA5E9",
    building: "#6366F1",
    floor: "#8B5CF6",
    room: "#14B8A6",
    trade: "#F59E0B",
    photo: "#EC4899",
    analysis: "#10B981",
    task: "#3B82F6",
    defect: "#EF4444",
    report: "#6366F1",
    document: "#F97316",
    appointment: "#8B5CF6",
    person: "#06B6D4",
    company: "#7C3AED",
  };
  return colors[type] || "#6B7280";
}
