/**
 * protoKI – Timeline Engine
 * 
 * Zentraler Event-Bus für alle Module. Jedes Modul (Fotos, Sprache,
 * Dokumente, Matterport, Berichte, Aufgaben) sendet Ereignisse an
 * diese Engine. Daraus entsteht automatisch eine vollständige Projektchronik.
 * 
 * Die Timeline Engine ist die Grundlage für:
 * - Smart Timeline (Visualisierung)
 * - Baufortschritt (Progress Engine)
 * - AI Site Assistant (Kontextabfragen)
 * - Construction Brain (Zusammenhänge erkennen)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EntityType, AnalysisSource } from "@/shared/entities";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | "defect_created"
  | "defect_resolved"
  | "defect_updated"
  | "task_created"
  | "task_completed"
  | "task_updated"
  | "photo_captured"
  | "photo_analyzed"
  | "analysis_started"
  | "analysis_completed"
  | "document_uploaded"
  | "document_analyzed"
  | "report_generated"
  | "recording_started"
  | "recording_completed"
  | "protocol_generated"
  | "scan_imported"
  | "scan_analyzed"
  | "milestone_reached"
  | "appointment_created"
  | "person_assigned"
  | "progress_updated"
  | "scan_synced"
  | "tag_created"
  | "progress_compared"
  | "custom";

export interface TimelineEvent {
  id: string;
  projectId: string;
  timestamp: string;
  eventType: TimelineEventType;
  source: AnalysisSource | "user" | "system" | "timer";
  title: string;
  description?: string;
  
  // Spatial context
  roomId?: string;
  roomName?: string;
  floorId?: string;
  floorName?: string;
  buildingId?: string;
  
  // Trade context
  tradeId?: string;
  tradeName?: string;
  
  // Entity references
  entityId?: string;
  entityType?: EntityType;
  relatedEntityIds?: string[];
  
  // User context
  userId?: string;
  userName?: string;
  
  // AI context
  confidence?: number;
  analysisId?: string;
  
  // Categorization
  tags?: string[];
  priority?: "low" | "medium" | "high" | "critical";
  
  // Metadata
  metadata?: Record<string, unknown>;
}

export interface TimelineFilter {
  projectId?: string;
  eventTypes?: TimelineEventType[];
  sources?: (AnalysisSource | "user" | "system" | "timer")[];
  roomId?: string;
  floorId?: string;
  tradeId?: string;
  dateFrom?: string;
  dateTo?: string;
  priority?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export interface TimelineStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySource: Record<string, number>;
  eventsByTrade: Record<string, number>;
  eventsByRoom: Record<string, number>;
  eventsPerDay: { date: string; count: number }[];
  recentActivity: TimelineEvent[];
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

type EventListener = (event: TimelineEvent) => void;

// ─── Timeline Engine ─────────────────────────────────────────────────────────

const STORAGE_KEY = "timeline-events";
const MAX_EVENTS = 5000;

class TimelineEngineImpl {
  private events: TimelineEvent[] = [];
  private listeners: EventListener[] = [];
  private loaded = false;

  /**
   * Emit a new timeline event. All modules call this.
   */
  async emit(event: Omit<TimelineEvent, "id" | "timestamp">): Promise<TimelineEvent> {
    const fullEvent: TimelineEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };

    await this.ensureLoaded();
    this.events.unshift(fullEvent);

    // Trim to max
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(0, MAX_EVENTS);
    }

    // Persist
    await this.save();

    // Notify listeners
    for (const listener of this.listeners) {
      try { listener(fullEvent); } catch {}
    }

    return fullEvent;
  }

  /**
   * Query timeline events with filters.
   */
  async query(filter: TimelineFilter): Promise<TimelineEvent[]> {
    await this.ensureLoaded();

    let results = [...this.events];

    if (filter.projectId) {
      results = results.filter(e => e.projectId === filter.projectId);
    }
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      results = results.filter(e => filter.eventTypes!.includes(e.eventType));
    }
    if (filter.sources && filter.sources.length > 0) {
      results = results.filter(e => filter.sources!.includes(e.source));
    }
    if (filter.roomId) {
      results = results.filter(e => e.roomId === filter.roomId);
    }
    if (filter.floorId) {
      results = results.filter(e => e.floorId === filter.floorId);
    }
    if (filter.tradeId) {
      results = results.filter(e => e.tradeId === filter.tradeId);
    }
    if (filter.dateFrom) {
      const from = new Date(filter.dateFrom).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= from);
    }
    if (filter.dateTo) {
      const to = new Date(filter.dateTo).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() <= to);
    }
    if (filter.priority) {
      results = results.filter(e => e.priority === filter.priority);
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      results = results.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q) ||
        (e.tradeName || "").toLowerCase().includes(q) ||
        (e.roomName || "").toLowerCase().includes(q)
      );
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get timeline statistics for a project.
   */
  async getStats(projectId: string): Promise<TimelineStats> {
    await this.ensureLoaded();
    const projectEvents = this.events.filter(e => e.projectId === projectId);

    const eventsByType: Record<string, number> = {};
    const eventsBySource: Record<string, number> = {};
    const eventsByTrade: Record<string, number> = {};
    const eventsByRoom: Record<string, number> = {};
    const dayMap: Record<string, number> = {};

    for (const event of projectEvents) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
      if (event.tradeName) {
        eventsByTrade[event.tradeName] = (eventsByTrade[event.tradeName] || 0) + 1;
      }
      if (event.roomName) {
        eventsByRoom[event.roomName] = (eventsByRoom[event.roomName] || 0) + 1;
      }
      const day = event.timestamp.slice(0, 10);
      dayMap[day] = (dayMap[day] || 0) + 1;
    }

    const eventsPerDay = Object.entries(dayMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    return {
      totalEvents: projectEvents.length,
      eventsByType,
      eventsBySource,
      eventsByTrade,
      eventsByRoom,
      eventsPerDay,
      recentActivity: projectEvents.slice(0, 10),
    };
  }

  /**
   * Get events grouped by day.
   */
  async getGroupedByDay(projectId: string, limit = 30): Promise<Map<string, TimelineEvent[]>> {
    await this.ensureLoaded();
    const projectEvents = this.events
      .filter(e => e.projectId === projectId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const grouped = new Map<string, TimelineEvent[]>();
    for (const event of projectEvents) {
      const day = event.timestamp.slice(0, 10);
      if (!grouped.has(day)) {
        if (grouped.size >= limit) break;
        grouped.set(day, []);
      }
      grouped.get(day)!.push(event);
    }

    return grouped;
  }

  /**
   * Subscribe to new events.
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Delete events for a project.
   */
  async clearProject(projectId: string): Promise<void> {
    await this.ensureLoaded();
    this.events = this.events.filter(e => e.projectId !== projectId);
    await this.save();
  }

  /**
   * Get total event count for a project.
   */
  async getCount(projectId: string): Promise<number> {
    await this.ensureLoaded();
    return this.events.filter(e => e.projectId === projectId).length;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.events = JSON.parse(stored);
      }
    } catch {}
    this.loaded = true;
  }

  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch {}
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const timelineEngine = new TimelineEngineImpl();
export default timelineEngine;

// ─── Helper: Event Type Labels ───────────────────────────────────────────────

export function getEventTypeLabel(type: TimelineEventType): string {
  const labels: Record<TimelineEventType, string> = {
    defect_created: "Mangel erkannt",
    defect_resolved: "Mangel behoben",
    defect_updated: "Mangel aktualisiert",
    task_created: "Aufgabe erstellt",
    task_completed: "Aufgabe erledigt",
    task_updated: "Aufgabe aktualisiert",
    photo_captured: "Foto aufgenommen",
    photo_analyzed: "Foto analysiert",
    analysis_started: "Analyse gestartet",
    analysis_completed: "Analyse abgeschlossen",
    document_uploaded: "Dokument hochgeladen",
    document_analyzed: "Dokument analysiert",
    report_generated: "Bericht erstellt",
    recording_started: "Aufnahme gestartet",
    recording_completed: "Aufnahme beendet",
    protocol_generated: "Protokoll generiert",
    scan_imported: "3D-Scan importiert",
    scan_analyzed: "3D-Scan analysiert",
    milestone_reached: "Meilenstein erreicht",
    appointment_created: "Termin erstellt",
    person_assigned: "Person zugewiesen",
    progress_updated: "Fortschritt aktualisiert",
    scan_synced: "Scan synchronisiert",
    tag_created: "Tag erstellt",
    progress_compared: "Fortschritt verglichen",
    custom: "Ereignis",
  };
  return labels[type] || type;
}

export function getEventTypeIcon(type: TimelineEventType): string {
  const icons: Record<TimelineEventType, string> = {
    defect_created: "warning",
    defect_resolved: "check-circle",
    defect_updated: "edit",
    task_created: "add-task",
    task_completed: "task-alt",
    task_updated: "edit",
    photo_captured: "photo-camera",
    photo_analyzed: "image-search",
    analysis_started: "play-circle",
    analysis_completed: "analytics",
    document_uploaded: "upload-file",
    document_analyzed: "find-in-page",
    report_generated: "summarize",
    recording_started: "mic",
    recording_completed: "mic-off",
    protocol_generated: "description",
    scan_imported: "view-in-ar",
    scan_analyzed: "3d-rotation",
    milestone_reached: "flag",
    appointment_created: "event",
    person_assigned: "person-add",
    progress_updated: "trending-up",
    scan_synced: "sync",
    tag_created: "label",
    progress_compared: "compare-arrows",
    custom: "circle",
  };
  return icons[type] || "circle";
}

export function getEventTypeColor(type: TimelineEventType): string {
  if (type.startsWith("defect")) return "#EF4444";
  if (type.startsWith("task")) return "#3B82F6";
  if (type.startsWith("photo")) return "#EC4899";
  if (type.startsWith("analysis")) return "#10B981";
  if (type.startsWith("document")) return "#F97316";
  if (type.startsWith("report") || type.startsWith("protocol")) return "#6366F1";
  if (type.startsWith("recording")) return "#0EA5E9";
  if (type.startsWith("scan")) return "#7C3AED";
  if (type === "milestone_reached") return "#F59E0B";
  if (type === "appointment_created") return "#8B5CF6";
  if (type === "progress_updated" || type === "progress_compared") return "#14B8A6";
  if (type === "scan_synced" || type === "tag_created") return "#7C3AED";
  return "#6B7280";
}
