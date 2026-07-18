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
   * Clear all knowledge for a project.
   */
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
