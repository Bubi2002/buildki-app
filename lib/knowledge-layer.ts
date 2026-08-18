/**
 * protoKI – Project Knowledge Layer
 * 
 * Gemeinsame Wissensbasis für alle KI-Features.
 * Speichert Erkenntnisse aus Analysen, Protokollen und Scans in einer
 * durchsuchbaren, projektbezogenen Datenstruktur.
 * 
 * Zukünftige Features wie AI Site Assistant, Smart Timeline und Matterport
 * nutzen dieselbe Wissensbasis.
 * 
 * Aktuell: AsyncStorage-basiert (lokal).
 * Zukünftig: Cloud-Sync über Server-DB möglich.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  AnalysisSource,
  AnalysisResult,
  ProjectKnowledgeEntry,
  ProjectKnowledgeSummary,
  ProgressAssessment,
} from "@/shared/ai-types";

import { getDefects } from "@/lib/defect-store";

const KNOWLEDGE_KEY_PREFIX = "knowledge_";
const KNOWLEDGE_INDEX_KEY = "knowledge_index";
const MAX_ENTRIES_PER_PROJECT = 200;

// ─── Types ───────────────────────────────────────────────────────────────────

interface KnowledgeIndex {
  projects: Record<string, {
    entryCount: number;
    lastUpdated: string;
  }>;
}

// ─── Core Knowledge Layer ────────────────────────────────────────────────────

class ProjectKnowledgeLayer {
  
  /**
   * Ingests an analysis result into the knowledge layer.
   * Extracts defects, tasks, observations, and progress as individual entries.
   */
  async ingestAnalysis(result: AnalysisResult): Promise<void> {
    const entries: Omit<ProjectKnowledgeEntry, "id">[] = [];
    const now = result.timestamp || new Date().toISOString();

    // Extract defects
    for (const defect of result.defects) {
      entries.push({
        projectId: result.projectId,
        source: result.source,
        sourceId: result.id,
        timestamp: now,
        type: "defect",
        content: `${defect.title}: ${defect.description} (${defect.severity}, Gewerk: ${defect.trade}, Ort: ${defect.location})`,
        metadata: {
          severity: defect.severity,
          trade: defect.trade,
          location: defect.location,
          confidence: defect.confidence,
          suggestedAction: defect.suggestedAction,
        },
      });
    }

    // Extract tasks
    for (const task of result.tasks) {
      entries.push({
        projectId: result.projectId,
        source: result.source,
        sourceId: result.id,
        timestamp: now,
        type: "task",
        content: `${task.title}: ${task.description} (Priorität: ${task.priority}, Gewerk: ${task.trade})`,
        metadata: {
          priority: task.priority,
          trade: task.trade,
          estimatedDuration: task.estimatedDuration,
          deadline: task.deadline,
        },
      });
    }

    // Extract observations
    for (const obs of result.observations) {
      entries.push({
        projectId: result.projectId,
        source: result.source,
        sourceId: result.id,
        timestamp: now,
        type: "observation",
        content: obs,
        metadata: {},
      });
    }

    // Extract progress
    if (result.progress) {
      entries.push({
        projectId: result.projectId,
        source: result.source,
        sourceId: result.id,
        timestamp: now,
        type: "progress",
        content: `Fortschritt: ${result.progress.overallPercent}% – Phase: ${result.progress.phase}`,
        metadata: {
          overallPercent: result.progress.overallPercent,
          phase: result.progress.phase,
          completedTrades: result.progress.completedTrades,
          activeTrades: result.progress.activeTrades,
          pendingTrades: result.progress.pendingTrades,
        },
      });
    }

    // Save entries
    await this.addEntries(result.projectId, entries);
  }

  /**
   * Get all knowledge entries for a project.
   */
  async getProjectKnowledge(projectId: string): Promise<ProjectKnowledgeEntry[]> {
    try {
      const key = `${KNOWLEDGE_KEY_PREFIX}${projectId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch (err) {
      console.warn("[KnowledgeLayer] Failed to load:", err);
      return [];
    }
  }

  /**
   * Search knowledge entries by text content.
   */
  async searchKnowledge(
    projectId: string,
    query: string,
    filters?: {
      type?: ProjectKnowledgeEntry["type"];
      source?: AnalysisSource;
      since?: string;
    },
  ): Promise<ProjectKnowledgeEntry[]> {
    let entries = await this.getProjectKnowledge(projectId);
    
    const queryLower = query.toLowerCase();
    entries = entries.filter(e => e.content.toLowerCase().includes(queryLower));

    if (filters?.type) {
      entries = entries.filter(e => e.type === filters.type);
    }
    if (filters?.source) {
      entries = entries.filter(e => e.source === filters.source);
    }
    if (filters?.since) {
      const sinceDate = new Date(filters.since).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceDate);
    }

    return entries;
  }

  /**
   * Get a summary of project knowledge.
   */
  async getProjectSummary(projectId: string): Promise<ProjectKnowledgeSummary> {
    const entries = await this.getProjectKnowledge(projectId);
    
    const defects = entries.filter(e => e.type === "defect");
    const tasks = entries.filter(e => e.type === "task");
    const observations = entries.filter(e => e.type === "observation");
    const progressEntries = entries.filter(e => e.type === "progress");

    // Get latest progress
    let latestProgress: ProgressAssessment | null = null;
    if (progressEntries.length > 0) {
      const latest = progressEntries.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];
      latestProgress = {
        overallPercent: (latest.metadata.overallPercent as number) || 0,
        phase: (latest.metadata.phase as string) || "Unbekannt",
        completedTrades: (latest.metadata.completedTrades as string[]) || [],
        activeTrades: (latest.metadata.activeTrades as string[]) || [],
        pendingTrades: (latest.metadata.pendingTrades as string[]) || [],
      };
    }

    // Aggregate trade statuses
    const tradeStatuses: Record<string, string> = {};
    for (const entry of [...defects, ...tasks]) {
      const trade = entry.metadata.trade as string;
      if (trade && !tradeStatuses[trade]) {
        tradeStatuses[trade] = entry.type === "defect" ? "Mangel erkannt" : "Aufgabe offen";
      }
    }

    return {
      projectId,
      lastUpdated: entries.length > 0 
        ? entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].timestamp
        : new Date().toISOString(),
      totalEntries: entries.length,
      defectCount: defects.length,
      taskCount: tasks.length,
      observationCount: observations.length,
      tradeStatuses,
      latestProgress,
    };
  }

  /**
   * Get context string for AI prompts (used by AI Site Assistant, Smart Timeline etc.)
   */
  async getContextForAI(projectId: string, maxTokens: number = 2000): Promise<string> {
    const entries = await this.getProjectKnowledge(projectId);
    if (entries.length === 0) return "";

    // Sort by recency, take most recent
    const sorted = entries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    let context = "## Projekt-Wissensbasis\n\n";
    let charCount = context.length;
    const maxChars = maxTokens * 4; // rough estimate

    // Add progress first
    const progressEntry = sorted.find(e => e.type === "progress");
    if (progressEntry) {
      const line = `- Fortschritt: ${progressEntry.content}\n`;
      context += line;
      charCount += line.length;
    }

    // Add recent defects
    const recentDefects = sorted.filter(e => e.type === "defect").slice(0, 10);
    if (recentDefects.length > 0) {
      context += "\n### Aktuelle Mängel:\n";
      for (const d of recentDefects) {
        const line = `- ${d.content}\n`;
        if (charCount + line.length > maxChars) break;
        context += line;
        charCount += line.length;
      }
    }

    // Add recent tasks
    const recentTasks = sorted.filter(e => e.type === "task").slice(0, 10);
    if (recentTasks.length > 0) {
      context += "\n### Offene Aufgaben:\n";
      for (const t of recentTasks) {
        const line = `- ${t.content}\n`;
        if (charCount + line.length > maxChars) break;
        context += line;
        charCount += line.length;
      }
    }

    // Add recent observations
    const recentObs = sorted.filter(e => e.type === "observation").slice(0, 5);
    if (recentObs.length > 0) {
      context += "\n### Beobachtungen:\n";
      for (const o of recentObs) {
        const line = `- ${o.content}\n`;
        if (charCount + line.length > maxChars) break;
        context += line;
        charCount += line.length;
      }
    }

    return context;
  }

  /**
   * Query knowledge layer for AI Site Assistant.
   * Returns a formatted context string optimized for assistant responses.
   */
  async queryForAssistant(projectId: string, query: string): Promise<string> {
    // Get general context
    const generalContext = await this.getContextForAI(projectId, 1500);

    // Also search specifically for the query
    const searchResults = await this.searchKnowledge(projectId, query);
    
    let specificContext = "";
    if (searchResults.length > 0) {
      specificContext = "\n### Relevante Einträge zur Frage:\n";
      for (const entry of searchResults.slice(0, 5)) {
        specificContext += `- [${entry.type}] ${entry.content} (${new Date(entry.timestamp).toLocaleDateString("de-DE")})\n`;
      }
    }

    // Get summary stats
    const summary = await this.getProjectSummary(projectId);
    const statsContext = `\n### Projekt-Statistik:\n- Gesamt-Einträge: ${summary.totalEntries}\n- Mängel: ${summary.defectCount}\n- Aufgaben: ${summary.taskCount}\n- Beobachtungen: ${summary.observationCount}\n`;
    if (summary.latestProgress) {
      const p = summary.latestProgress;
      return `${statsContext}- Fortschritt: ${p.overallPercent}% (Phase: ${p.phase})\n${generalContext}${specificContext}`;
    }

    return `${statsContext}${generalContext}${specificContext}`;
  }

  // ─── Construction Brain Query Methods ─────────────────────────────────────

  /**
   * Get all open defects for a project, optionally filtered by room/trade.
   */
  async getOpenDefects(projectId: string, filters?: {
    room?: string;
    trade?: string;
    severity?: string;
    since?: string;
  }): Promise<ProjectKnowledgeEntry[]> {
    let entries = await this.getProjectKnowledge(projectId);
    entries = entries.filter(e => e.type === "defect");

    // Include the real, user-created defects from the defect store (not just
    // AI-ingested ones), so the assistant reflects the actual Mängel list.
    try {
      const OPEN_STATUSES = new Set(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
      const realDefects = await getDefects(projectId);
      const prioToSeverity: Record<string, string> = { hoch: "hoch", mittel: "mittel", niedrig: "niedrig" };
      const mapped: ProjectKnowledgeEntry[] = realDefects
        .filter(d => OPEN_STATUSES.has(d.status))
        .map(d => ({
          id: `defect-${d.id}`,
          projectId,
          source: "manual" as const,
          sourceId: d.id,
          timestamp: d.createdAt,
          type: "defect" as const,
          content: d.description ? `${d.title}: ${d.description}` : d.title,
          metadata: {
            location: d.location || d.room || d.floor || "",
            trade: d.gewerk || "",
            severity: prioToSeverity[d.priority as string] || (d.priority as string) || "",
          },
        }));
      // De-dupe: knowledge entries that reference the same defect id win nothing
      // here; simply append the real defects (ids are prefixed, so no clash).
      entries = [...mapped, ...entries];
    } catch {
      // If the defect store can't be read, fall back to knowledge entries only.
    }

    if (filters?.room) {
      const room = filters.room.toLowerCase();
      entries = entries.filter(e => (e.metadata.location as string || "").toLowerCase().includes(room) || e.content.toLowerCase().includes(room));
    }
    if (filters?.trade) {
      const trade = filters.trade.toLowerCase();
      entries = entries.filter(e => (e.metadata.trade as string || "").toLowerCase().includes(trade));
    }
    if (filters?.severity) {
      entries = entries.filter(e => e.metadata.severity === filters.severity);
    }
    if (filters?.since) {
      const sinceDate = new Date(filters.since).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceDate);
    }
    return entries;
  }

  /**
   * Get all open tasks for a project, optionally filtered.
   */
  async getOpenTasks(projectId: string, filters?: {
    trade?: string;
    priority?: string;
    overdue?: boolean;
  }): Promise<ProjectKnowledgeEntry[]> {
    let entries = await this.getProjectKnowledge(projectId);
    entries = entries.filter(e => e.type === "task");

    // Include the real standalone tasks (project-tasks), not just AI-ingested ones.
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      const all: any[] = raw ? JSON.parse(raw) : [];
      const mapped: ProjectKnowledgeEntry[] = all
        .filter((tk) => (!tk.projectId || tk.projectId === projectId) && tk.status !== "erledigt" && tk.done !== true)
        .map((tk) => ({
          id: `task-${tk.id}`,
          projectId,
          source: "manual" as const,
          sourceId: tk.id,
          timestamp: tk.createdAt || new Date().toISOString(),
          type: "task" as const,
          content: tk.title || tk.task || "",
          metadata: { trade: tk.trade || "", priority: tk.priority || "", deadline: tk.deadline || null, room: tk.room || "" },
        }));
      entries = [...mapped, ...entries];
    } catch {
      // fall back to knowledge entries only
    }

    if (filters?.trade) {
      const trade = filters.trade.toLowerCase();
      entries = entries.filter(e => (e.metadata.trade as string || "").toLowerCase().includes(trade));
    }
    if (filters?.priority) {
      entries = entries.filter(e => e.metadata.priority === filters.priority);
    }
    if (filters?.overdue) {
      const now = Date.now();
      entries = entries.filter(e => {
        const deadline = e.metadata.deadline as string | null;
        return deadline && new Date(deadline).getTime() < now;
      });
    }
    return entries;
  }

  /**
   * Get entries related to a specific room.
   */
  async getByRoom(projectId: string, roomName: string): Promise<ProjectKnowledgeEntry[]> {
    const entries = await this.getProjectKnowledge(projectId);
    const room = roomName.toLowerCase();
    return entries.filter(e =>
      e.content.toLowerCase().includes(room) ||
      (e.metadata.location as string || "").toLowerCase().includes(room)
    );
  }

  /**
   * Get entries related to a specific trade (Gewerk).
   */
  async getByTrade(projectId: string, tradeName: string): Promise<ProjectKnowledgeEntry[]> {
    const entries = await this.getProjectKnowledge(projectId);
    const trade = tradeName.toLowerCase();
    return entries.filter(e =>
      (e.metadata.trade as string || "").toLowerCase().includes(trade) ||
      e.content.toLowerCase().includes(trade)
    );
  }

  /**
   * Get entries from a specific time period.
   */
  async getByTimeRange(projectId: string, since: string, until?: string): Promise<ProjectKnowledgeEntry[]> {
    const entries = await this.getProjectKnowledge(projectId);
    const sinceTime = new Date(since).getTime();
    const untilTime = until ? new Date(until).getTime() : Date.now();
    return entries.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t >= sinceTime && t <= untilTime;
    });
  }

  /**
   * Get entries by source type.
   */
  async getBySource(projectId: string, source: string): Promise<ProjectKnowledgeEntry[]> {
    const entries = await this.getProjectKnowledge(projectId);
    return entries.filter(e => e.source === source);
  }

  /**
   * Get critical trades (trades with critical/major defects or overdue tasks).
   */
  async getCriticalTrades(projectId: string): Promise<{ trade: string; defects: number; overdueTasks: number; severity: string }[]> {
    const entries = await this.getProjectKnowledge(projectId);
    const tradeMap: Record<string, { defects: number; overdueTasks: number; maxSeverity: string }> = {};
    const now = Date.now();
    const severityOrder = ["cosmetic", "minor", "major", "critical"];

    for (const e of entries) {
      const trade = e.metadata.trade as string;
      if (!trade) continue;
      if (!tradeMap[trade]) tradeMap[trade] = { defects: 0, overdueTasks: 0, maxSeverity: "cosmetic" };

      if (e.type === "defect") {
        tradeMap[trade].defects++;
        const sev = e.metadata.severity as string || "cosmetic";
        if (severityOrder.indexOf(sev) > severityOrder.indexOf(tradeMap[trade].maxSeverity)) {
          tradeMap[trade].maxSeverity = sev;
        }
      }
      if (e.type === "task") {
        const deadline = e.metadata.deadline as string | null;
        if (deadline && new Date(deadline).getTime() < now) {
          tradeMap[trade].overdueTasks++;
        }
      }
    }

    return Object.entries(tradeMap)
      .filter(([_, v]) => v.maxSeverity === "critical" || v.maxSeverity === "major" || v.overdueTasks > 0)
      .map(([trade, v]) => ({ trade, defects: v.defects, overdueTasks: v.overdueTasks, severity: v.maxSeverity }))
      .sort((a, b) => severityOrder.indexOf(b.severity) - severityOrder.indexOf(a.severity));
  }

  /**
   * Get weekly changes summary.
   */
  async getWeeklyChanges(projectId: string): Promise<{
    newDefects: number;
    newTasks: number;
    newObservations: number;
    entries: ProjectKnowledgeEntry[];
  }> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const entries = await this.getByTimeRange(projectId, oneWeekAgo);
    return {
      newDefects: entries.filter(e => e.type === "defect").length,
      newTasks: entries.filter(e => e.type === "task").length,
      newObservations: entries.filter(e => e.type === "observation").length,
      entries,
    };
  }

  /**
   * Get all unique rooms mentioned in the project.
   */
  async getProjectRooms(projectId: string): Promise<string[]> {
    const entries = await this.getProjectKnowledge(projectId);
    const rooms = new Set<string>();
    for (const e of entries) {
      const loc = e.metadata.location as string;
      if (loc) rooms.add(loc);
    }
    // Also include rooms from room-store for completeness
    try {
      const { getProjectStructure } = require("./room-store");
      const structure = await getProjectStructure(projectId);
      for (const r of structure.rooms) {
        rooms.add(r.name);
      }
    } catch {}
    return Array.from(rooms).sort();
  }

  /**
   * Get all unique trades mentioned in the project.
   */
  async getProjectTrades(projectId: string): Promise<string[]> {
    const entries = await this.getProjectKnowledge(projectId);
    const trades = new Set<string>();
    for (const e of entries) {
      const trade = e.metadata.trade as string;
      if (trade) trades.add(trade);
    }
    return Array.from(trades).sort();
  }

  /**
   * Clear all knowledge for a project.
   */
  /**
   * Ingest a single knowledge entry directly (used by Document AI, etc.).
   */
  async ingest(entry: {
    projectId: string;
    type: "defect" | "task" | "observation" | "progress" | "trade_status";
    source: string;
    content: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.addEntries(entry.projectId, [{
      projectId: entry.projectId,
      source: entry.source as any,
      sourceId: `direct_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: entry.type,
      content: entry.content,
      metadata: { ...entry.metadata, confidence: entry.confidence },
    }]);
  }

  async clearProject(projectId: string): Promise<void> {
    const key = `${KNOWLEDGE_KEY_PREFIX}${projectId}`;
    await AsyncStorage.removeItem(key);
    await this.updateIndex(projectId, 0);
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  private async addEntries(
    projectId: string,
    entries: Omit<ProjectKnowledgeEntry, "id">[],
  ): Promise<void> {
    try {
      const key = `${KNOWLEDGE_KEY_PREFIX}${projectId}`;
      const existing = await this.getProjectKnowledge(projectId);
      
      const newEntries: ProjectKnowledgeEntry[] = entries.map(e => ({
        ...e,
        id: `ke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      }));

      const combined = [...newEntries, ...existing].slice(0, MAX_ENTRIES_PER_PROJECT);
      await AsyncStorage.setItem(key, JSON.stringify(combined));
      await this.updateIndex(projectId, combined.length);
    } catch (err) {
      console.warn("[KnowledgeLayer] Failed to save entries:", err);
    }
  }

  private async updateIndex(projectId: string, entryCount: number): Promise<void> {
    try {
      const indexStr = await AsyncStorage.getItem(KNOWLEDGE_INDEX_KEY);
      const index: KnowledgeIndex = indexStr ? JSON.parse(indexStr) : { projects: {} };
      
      if (entryCount === 0) {
        delete index.projects[projectId];
      } else {
        index.projects[projectId] = {
          entryCount,
          lastUpdated: new Date().toISOString(),
        };
      }
      
      await AsyncStorage.setItem(KNOWLEDGE_INDEX_KEY, JSON.stringify(index));
    } catch (err) {
      console.warn("[KnowledgeLayer] Failed to update index:", err);
    }
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const knowledgeLayer = new ProjectKnowledgeLayer();
export default knowledgeLayer;
