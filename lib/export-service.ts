/**
 * protoKI – Multi-Format Export Service
 * 
 * Exportiert Analyse-Ergebnisse, Mängel, Aufgaben und Protokolle
 * in verschiedene Formate: PDF, CSV, Excel (XLSX), JSON.
 * 
 * Nutzt den Knowledge Layer und Defect Store als Datenquellen.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { getDefects, type Defect } from "@/lib/defect-store";
import { knowledgeLayer } from "@/lib/knowledge-layer";
import type { ProjectKnowledgeEntry } from "@/shared/ai-types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExportFormat = "pdf" | "csv" | "json" | "xlsx";

export type ExportScope = "defects" | "tasks" | "analysis" | "knowledge" | "full";

export interface ExportOptions {
  projectId: string;
  projectName: string;
  format: ExportFormat;
  scope: ExportScope;
  dateFrom?: string;
  dateTo?: string;
  includePhotos?: boolean;
  language?: "de" | "en";
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
  error?: string;
}

// ─── Export Service ──────────────────────────────────────────────────────────

class ExportService {

  /**
   * Main export entry point.
   */
  async exportData(options: ExportOptions): Promise<ExportResult> {
    try {
      const data = await this.gatherData(options);
      
      switch (options.format) {
        case "csv":
          return await this.exportCSV(data, options);
        case "json":
          return await this.exportJSON(data, options);
        case "xlsx":
          return await this.exportXLSX(data, options);
        case "pdf":
          return await this.exportPDF(data, options);
        default:
          return { success: false, error: `Unbekanntes Format: ${options.format}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message || "Export fehlgeschlagen" };
    }
  }

  /**
   * Get available export formats with metadata.
   */
  getFormats(): Array<{ id: ExportFormat; label: string; icon: string; description: string }> {
    return [
      { id: "pdf", label: "PDF", icon: "picture-as-pdf", description: "Professioneller Bericht zum Ausdrucken" },
      { id: "csv", label: "CSV", icon: "table-chart", description: "Tabelle für Excel/Google Sheets" },
      { id: "xlsx", label: "Excel", icon: "grid-on", description: "Excel-Arbeitsmappe mit Formatierung" },
      { id: "json", label: "JSON", icon: "code", description: "Strukturierte Daten für Integration" },
    ];
  }

  /**
   * Get available export scopes.
   */
  getScopes(): Array<{ id: ExportScope; label: string; icon: string }> {
    return [
      { id: "defects", label: "Mängel", icon: "warning" },
      { id: "tasks", label: "Aufgaben", icon: "task-alt" },
      { id: "analysis", label: "Analysen", icon: "analytics" },
      { id: "knowledge", label: "Wissensbasis", icon: "psychology" },
      { id: "full", label: "Komplett", icon: "select-all" },
    ];
  }

  // ─── Data Gathering ─────────────────────────────────────────────────────────

  private async gatherData(options: ExportOptions): Promise<{
    defects: Defect[];
    tasks: any[];
    knowledge: ProjectKnowledgeEntry[];
  }> {
    let defects: Defect[] = [];
    let tasks: any[] = [];
    let knowledge: ProjectKnowledgeEntry[] = [];

    if (options.scope === "defects" || options.scope === "full") {
      const allDefects = await getDefects();
      defects = allDefects.filter(d => d.projectId === options.projectId);
      if (options.dateFrom) {
        const from = new Date(options.dateFrom).getTime();
        defects = defects.filter(d => new Date(d.createdAt).getTime() >= from);
      }
      if (options.dateTo) {
        const to = new Date(options.dateTo).getTime();
        defects = defects.filter(d => new Date(d.createdAt).getTime() <= to);
      }
    }

    if (options.scope === "tasks" || options.scope === "full") {
      const tasksJson = await AsyncStorage.getItem("project-tasks") || "[]";
      const allTasks = JSON.parse(tasksJson);
      tasks = allTasks.filter((t: any) => t.projectId === options.projectId);
      if (options.dateFrom) {
        const from = new Date(options.dateFrom).getTime();
        tasks = tasks.filter((t: any) => new Date(t.createdAt).getTime() >= from);
      }
      if (options.dateTo) {
        const to = new Date(options.dateTo).getTime();
        tasks = tasks.filter((t: any) => new Date(t.createdAt).getTime() <= to);
      }
    }

    if (options.scope === "knowledge" || options.scope === "analysis" || options.scope === "full") {
      knowledge = await knowledgeLayer.getProjectKnowledge(options.projectId);
      if (options.scope === "analysis") {
        knowledge = knowledge.filter(k => k.type === "defect" || k.type === "task");
      }
    }

    return { defects, tasks, knowledge };
  }

  // ─── CSV Export ─────────────────────────────────────────────────────────────

  private async exportCSV(
    data: { defects: Defect[]; tasks: any[]; knowledge: ProjectKnowledgeEntry[] },
    options: ExportOptions
  ): Promise<ExportResult> {
    let csv = "";

    if (data.defects.length > 0) {
      csv += "=== MÄNGEL ===\n";
      csv += "ID;Titel;Beschreibung;Status;Priorität;Kategorie;Ort;Erstellt;Quelle;Konfidenz\n";
      for (const d of data.defects) {
        csv += `${d.id};${this.escapeCSV(d.title)};${this.escapeCSV(d.description)};${d.status};${d.priority};${d.category};${this.escapeCSV(d.location || "")};${d.createdAt};${d.source || "manual"};${d.confidence || ""}\n`;
      }
      csv += "\n";
    }

    if (data.tasks.length > 0) {
      csv += "=== AUFGABEN ===\n";
      csv += "ID;Titel;Beschreibung;Status;Priorität;Gewerk;Geschätzte Dauer;Frist;Erstellt;Quelle\n";
      for (const t of data.tasks) {
        csv += `${t.id};${this.escapeCSV(t.title)};${this.escapeCSV(t.description || "")};${t.status};${t.priority};${t.trade || ""};${t.estimatedDuration || ""};${t.deadline || ""};${t.createdAt};${t.source || "manual"}\n`;
      }
      csv += "\n";
    }

    if (data.knowledge.length > 0) {
      csv += "=== WISSENSBASIS ===\n";
      csv += "ID;Typ;Quelle;Inhalt;Zeitstempel\n";
      for (const k of data.knowledge) {
        csv += `${k.id};${k.type};${k.source};${this.escapeCSV(k.content)};${k.timestamp}\n`;
      }
    }

    const fileName = `${options.projectName.replace(/\s+/g, "_")}_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    const filePath = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(filePath, csv, { encoding: FileSystem.EncodingType.UTF8 });

    return { success: true, filePath, fileName, mimeType: "text/csv" };
  }

  // ─── JSON Export ────────────────────────────────────────────────────────────

  private async exportJSON(
    data: { defects: Defect[]; tasks: any[]; knowledge: ProjectKnowledgeEntry[] },
    options: ExportOptions
  ): Promise<ExportResult> {
    const exportPayload = {
      meta: {
        projectId: options.projectId,
        projectName: options.projectName,
        exportDate: new Date().toISOString(),
        scope: options.scope,
        format: "json",
        version: "1.0",
      },
      data: {
        defects: data.defects,
        tasks: data.tasks,
        knowledge: data.knowledge,
      },
      statistics: {
        totalDefects: data.defects.length,
        totalTasks: data.tasks.length,
        totalKnowledgeEntries: data.knowledge.length,
        defectsByStatus: this.groupBy(data.defects, "status"),
        defectsByPriority: this.groupBy(data.defects, "priority"),
        tasksByStatus: this.groupBy(data.tasks, "status"),
      },
    };

    const json = JSON.stringify(exportPayload, null, 2);
    const fileName = `${options.projectName.replace(/\s+/g, "_")}_Export_${new Date().toISOString().slice(0, 10)}.json`;
    const filePath = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(filePath, json, { encoding: FileSystem.EncodingType.UTF8 });

    return { success: true, filePath, fileName, mimeType: "application/json" };
  }

  // ─── XLSX Export (simplified – generates CSV with .xlsx-compatible format) ──

  private async exportXLSX(
    data: { defects: Defect[]; tasks: any[]; knowledge: ProjectKnowledgeEntry[] },
    options: ExportOptions
  ): Promise<ExportResult> {
    // Since we can't generate real XLSX on mobile without heavy dependencies,
    // we generate a tab-separated file that Excel opens natively
    let tsv = "";

    if (data.defects.length > 0) {
      tsv += "Mängel\t\t\t\t\t\t\t\t\t\n";
      tsv += "ID\tTitel\tBeschreibung\tStatus\tPriorität\tKategorie\tOrt\tErstellt\tQuelle\tKonfidenz\n";
      for (const d of data.defects) {
        tsv += `${d.id}\t${d.title}\t${(d.description || "").replace(/\t|\n/g, " ")}\t${d.status}\t${d.priority}\t${d.category}\t${d.location || ""}\t${d.createdAt}\t${d.source || "manual"}\t${d.confidence || ""}\n`;
      }
      tsv += "\n";
    }

    if (data.tasks.length > 0) {
      tsv += "Aufgaben\t\t\t\t\t\t\t\t\t\n";
      tsv += "ID\tTitel\tBeschreibung\tStatus\tPriorität\tGewerk\tDauer\tFrist\tErstellt\tQuelle\n";
      for (const t of data.tasks) {
        tsv += `${t.id}\t${t.title}\t${(t.description || "").replace(/\t|\n/g, " ")}\t${t.status}\t${t.priority}\t${t.trade || ""}\t${t.estimatedDuration || ""}\t${t.deadline || ""}\t${t.createdAt}\t${t.source || "manual"}\n`;
      }
      tsv += "\n";
    }

    if (data.knowledge.length > 0) {
      tsv += "Wissensbasis\t\t\t\t\n";
      tsv += "ID\tTyp\tQuelle\tInhalt\tZeitstempel\n";
      for (const k of data.knowledge) {
        tsv += `${k.id}\t${k.type}\t${k.source}\t${k.content.replace(/\t|\n/g, " ")}\t${k.timestamp}\n`;
      }
    }

    const fileName = `${options.projectName.replace(/\s+/g, "_")}_Export_${new Date().toISOString().slice(0, 10)}.xls`;
    const filePath = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(filePath, tsv, { encoding: FileSystem.EncodingType.UTF8 });

    return { success: true, filePath, fileName, mimeType: "application/vnd.ms-excel" };
  }

  // ─── PDF Export (generates HTML for sharing) ───────────────────────────────

  private async exportPDF(
    data: { defects: Defect[]; tasks: any[]; knowledge: ProjectKnowledgeEntry[] },
    options: ExportOptions
  ): Promise<ExportResult> {
    const now = new Date();
    const dateStr = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; color: #1a1a1a; font-size: 12px; }
h1 { font-size: 18px; border-bottom: 2px solid #0EA5E9; padding-bottom: 8px; }
h2 { font-size: 14px; color: #0EA5E9; margin-top: 20px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; }
th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11px; }
th { background: #f0f4f8; font-weight: 600; }
.meta { color: #666; font-size: 11px; margin-bottom: 16px; }
.badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
.badge-offen { background: #FEE2E2; color: #DC2626; }
.badge-hoch { background: #FEF3C7; color: #D97706; }
.badge-erledigt { background: #D1FAE5; color: #059669; }
@media print { body { padding: 0; } }
</style></head><body>`;

    html += `<h1>${options.projectName} – Export</h1>`;
    html += `<p class="meta">Erstellt am ${dateStr} | Umfang: ${this.getScopeLabel(options.scope)}</p>`;

    if (data.defects.length > 0) {
      html += `<h2>Mängel (${data.defects.length})</h2>`;
      html += `<table><tr><th>Titel</th><th>Status</th><th>Priorität</th><th>Kategorie</th><th>Ort</th><th>Erstellt</th></tr>`;
      for (const d of data.defects) {
        html += `<tr><td>${d.title}</td><td><span class="badge badge-${d.status}">${d.status}</span></td><td>${d.priority}</td><td>${d.category}</td><td>${d.location || "-"}</td><td>${new Date(d.createdAt).toLocaleDateString("de-DE")}</td></tr>`;
      }
      html += `</table>`;
    }

    if (data.tasks.length > 0) {
      html += `<h2>Aufgaben (${data.tasks.length})</h2>`;
      html += `<table><tr><th>Titel</th><th>Status</th><th>Priorität</th><th>Gewerk</th><th>Frist</th></tr>`;
      for (const t of data.tasks) {
        html += `<tr><td>${t.title}</td><td>${t.status}</td><td>${t.priority}</td><td>${t.trade || "-"}</td><td>${t.deadline || "-"}</td></tr>`;
      }
      html += `</table>`;
    }

    if (data.knowledge.length > 0) {
      html += `<h2>Wissensbasis-Einträge (${data.knowledge.length})</h2>`;
      html += `<table><tr><th>Typ</th><th>Inhalt</th><th>Quelle</th><th>Datum</th></tr>`;
      for (const k of data.knowledge.slice(0, 50)) {
        html += `<tr><td>${k.type}</td><td>${k.content.slice(0, 100)}${k.content.length > 100 ? "..." : ""}</td><td>${k.source}</td><td>${new Date(k.timestamp).toLocaleDateString("de-DE")}</td></tr>`;
      }
      html += `</table>`;
    }

    html += `</body></html>`;

    const fileName = `${options.projectName.replace(/\s+/g, "_")}_Export_${new Date().toISOString().slice(0, 10)}.html`;
    const filePath = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(filePath, html, { encoding: FileSystem.EncodingType.UTF8 });

    return { success: true, filePath, fileName, mimeType: "text/html" };
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  private escapeCSV(value: string): string {
    if (value.includes(";") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""').replace(/\n/g, " ")}"`;
    }
    return value.replace(/\n/g, " ");
  }

  private groupBy(items: any[], key: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const item of items) {
      const val = item[key] || "unbekannt";
      result[val] = (result[val] || 0) + 1;
    }
    return result;
  }

  private getScopeLabel(scope: ExportScope): string {
    const labels: Record<ExportScope, string> = {
      defects: "Mängel",
      tasks: "Aufgaben",
      analysis: "Analysen",
      knowledge: "Wissensbasis",
      full: "Komplett",
    };
    return labels[scope] || scope;
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const exportService = new ExportService();
export default exportService;
