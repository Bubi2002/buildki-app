/**
 * protoKI – Einheitliches Source-System & KI-Typen
 * 
 * Zentrale Typdefinitionen für alle KI-Analyse-Features.
 * Verwendet von: AI Service, Photo-Analyse, Matterport, AI Site Assistant, Smart Timeline
 */

// ─── Analysis Sources ────────────────────────────────────────────────────────

/** Einheitliches Source-System für alle KI-Ergebnisse */
export type AnalysisSource = 
  | "photo"       // Foto-Analyse (Baustellenfotos)
  | "speech"      // Sprach-/Audio-Analyse (Transkription → Erkennung)
  | "matterport"  // Matterport 3D-Scan Analyse
  | "document"    // Dokument-Analyse (PDFs, Pläne, Zeichnungen)
  | "manual";     // Manuell erfasst (Checklisten, manuelle Eingabe)

/** Metadaten zur Quelle einer Analyse */
export interface AnalysisSourceMeta {
  source: AnalysisSource;
  /** Optionale Sub-Quelle (z.B. "camera", "gallery", "batch") */
  subSource?: string;
  /** Anzahl der analysierten Medien */
  mediaCount: number;
  /** URIs der analysierten Medien */
  mediaUris?: string[];
  /** Raum/Bereich (falls bekannt) */
  roomName?: string;
  /** Etage/Geschoss (falls bekannt) */
  floor?: string;
  /** Zusätzlicher Kontext vom Benutzer */
  userContext?: string;
}

// ─── Severity & Priority ─────────────────────────────────────────────────────

export type SeverityLevel = "critical" | "major" | "minor" | "cosmetic";
export type TaskPriority = "high" | "medium" | "low";

// ─── Detected Items ──────────────────────────────────────────────────────────

export interface DetectedDefect {
  id: string;
  title: string;
  description: string;
  severity: SeverityLevel;
  trade: string;
  location: string;
  suggestedAction: string;
  confidence: number;
}

export interface DetectedTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  trade: string;
  estimatedDuration: string;
  deadline: string | null;
}

export interface ProgressAssessment {
  overallPercent: number;
  phase: string;
  completedTrades: string[];
  activeTrades: string[];
  pendingTrades: string[];
}

// ─── Analysis Result ─────────────────────────────────────────────────────────

export interface AnalysisResult {
  id: string;
  source: AnalysisSource;
  sourceMeta: AnalysisSourceMeta;
  timestamp: string;
  projectId: string;
  projectName?: string;
  summary: string;
  progress: ProgressAssessment;
  defects: DetectedDefect[];
  tasks: DetectedTask[];
  observations: string[];
  /** Batch-Gruppen-ID (falls Teil einer Batch-Analyse) */
  batchId?: string;
  /** Gruppen-Label (z.B. Raum-Name oder Zeitfenster) */
  groupLabel?: string;
}

// ─── Batch Analysis ──────────────────────────────────────────────────────────

export type BatchGroupStrategy = "room" | "time" | "manual" | "auto";

export interface BatchGroup {
  id: string;
  label: string;
  strategy: BatchGroupStrategy;
  photoUris: string[];
  roomName?: string;
  timeRange?: { start: string; end: string };
}

export interface BatchAnalysisRequest {
  projectId: string;
  projectName?: string;
  groups: BatchGroup[];
  additionalContext?: string;
}

export interface BatchAnalysisResult {
  batchId: string;
  timestamp: string;
  projectId: string;
  groups: {
    groupId: string;
    label: string;
    result: AnalysisResult;
  }[];
  /** Aggregierte Zusammenfassung über alle Gruppen */
  aggregatedSummary: string;
  totalDefects: number;
  totalTasks: number;
  averageProgress: number;
}

// ─── Knowledge Layer Types ───────────────────────────────────────────────────

export interface ProjectKnowledgeEntry {
  id: string;
  projectId: string;
  source: AnalysisSource;
  sourceId: string; // Reference to the original analysis/protocol/scan
  timestamp: string;
  type: "defect" | "task" | "observation" | "progress" | "trade_status";
  content: string;
  metadata: Record<string, unknown>;
  /** Embedding-Vector für semantische Suche (optional, für zukünftige Nutzung) */
  embedding?: number[];
}

export interface ProjectKnowledgeSummary {
  projectId: string;
  lastUpdated: string;
  totalEntries: number;
  defectCount: number;
  taskCount: number;
  observationCount: number;
  tradeStatuses: Record<string, string>;
  latestProgress: ProgressAssessment | null;
}

// ─── Source Display Helpers ──────────────────────────────────────────────────

export function getSourceIcon(source: AnalysisSource): string {
  switch (source) {
    case "photo": return "photo-camera";
    case "speech": return "mic";
    case "matterport": return "view-in-ar";
    case "document": return "description";
    case "manual": return "edit";
    default: return "auto-awesome";
  }
}

export function getSourceLabel(source: AnalysisSource): string {
  switch (source) {
    case "photo": return "Foto-Analyse";
    case "speech": return "Sprach-Analyse";
    case "matterport": return "Matterport";
    case "document": return "Dokument-Analyse";
    case "manual": return "Manuell";
    default: return "KI-Analyse";
  }
}

export function getSourceColor(source: AnalysisSource): string {
  switch (source) {
    case "photo": return "#7C3AED";    // Purple
    case "speech": return "#0EA5E9";   // Sky blue
    case "matterport": return "#F97316"; // Orange
    case "document": return "#10B981";  // Emerald
    case "manual": return "#6B7280";    // Gray
    default: return "#7C3AED";
  }
}
