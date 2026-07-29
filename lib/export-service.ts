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

type SavedReportExport = {
  id: string;
  type?: string;
  content: string;
  projectId?: string;
  projectName?: string;
  datum?: string;
  createdAt: string;
};

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
  getFormats(): { id: ExportFormat; label: string; icon: string; description: string }[] {
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
  getScopes(): { id: ExportScope; label: string; icon: string }[] {
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
    reports: SavedReportExport[];
  }> {
    let defects: Defect[] = [];
    let tasks: any[] = [];
    let knowledge: ProjectKnowledgeEntry[] = [];
    let reports: SavedReportExport[] = [];

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

    if (options.scope === "analysis" || options.scope === "full") {
      try {
        const reportsJson = await AsyncStorage.getItem("saved_reports") || "[]";
        const savedReports = JSON.parse(reportsJson);
        reports = Array.isArray(savedReports)
          ? savedReports
              .filter((report: SavedReportExport) => report.projectId === options.projectId && typeof report.content === "string" && report.content.trim())
              .sort((left: SavedReportExport, right: SavedReportExport) => right.createdAt.localeCompare(left.createdAt))
          : [];
      } catch {
        reports = [];
      }
    }

    return { defects, tasks, knowledge, reports };
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

  // ─── PDF Export ─────────────────────────────────────────────────────────────

  private async exportPDF(
    data: { defects: Defect[]; tasks: any[]; knowledge: ProjectKnowledgeEntry[]; reports: SavedReportExport[] },
    options: ExportOptions
  ): Promise<ExportResult> {
    const now = new Date();
    const dateStr = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const value = (input: unknown): string => {
      const text = typeof input === "string" || typeof input === "number" ? String(input).trim() : "";
      return (text || "nicht angegeben").replace(/\|/g, "–").replace(/\r?\n+/g, " ");
    };
    const sections: string[] = [];

    if (data.reports.length > 0) {
      sections.push("# Gespeicherte KI-Berichte");
      data.reports.forEach((report, index) => {
        sections.push(
          `## ${value(report.type || "Bericht")} · ${value(report.datum || new Date(report.createdAt).toLocaleDateString("de-DE"))}`,
          report.content.trim(),
        );
        if (index < data.reports.length - 1) sections.push("---");
      });
    }

    if (data.defects.length > 0) {
      sections.push(`# Mängel (${data.defects.length})`);
      data.defects.forEach((defect, index) => {
        sections.push(
          `## ${index + 1}. ${value(defect.title)}`,
          "| Feld | Angabe |",
          "|---|---|",
          `| Status | ${value(defect.status)} |`,
          `| Priorität | ${value(defect.priority)} |`,
          `| Kategorie / Gewerk | ${value(defect.gewerk || defect.category)} |`,
          `| Ort | ${value(defect.location || defect.room)} |`,
          `| Frist | ${value(defect.dueDate)} |`,
          `| Verantwortlich | ${value(defect.assigneeFirma || defect.assignee)} |`,
          `| Erstellt | ${new Date(defect.createdAt).toLocaleDateString("de-DE")} |`,
        );
        if (defect.description?.trim()) sections.push(`**Beschreibung:** ${defect.description.trim()}`);
      });
    }

    if (data.tasks.length > 0) {
      sections.push(`# Aufgaben (${data.tasks.length})`);
      data.tasks.forEach((task, index) => {
        sections.push(
          `## ${index + 1}. ${value(task.title)}`,
          "| Feld | Angabe |",
          "|---|---|",
          `| Status | ${value(task.status)} |`,
          `| Priorität | ${value(task.priority)} |`,
          `| Gewerk | ${value(task.trade)} |`,
          `| Verantwortlich | ${value(task.assignee)} |`,
          `| Frist | ${value(task.deadline)} |`,
        );
        if (task.description?.trim()) sections.push(`**Beschreibung:** ${task.description.trim()}`);
      });
    }

    if (data.knowledge.length > 0) {
      sections.push(`# Wissensbasis (${data.knowledge.length})`);
      data.knowledge.forEach((entry, index) => {
        sections.push(
          `## ${index + 1}. ${value(entry.type)}`,
          "| Feld | Angabe |",
          "|---|---|",
          `| Quelle | ${value(entry.source)} |`,
          `| Datum | ${new Date(entry.timestamp).toLocaleDateString("de-DE")} |`,
          "",
          entry.content.trim(),
        );
      });
    }

    if (sections.length === 0) {
      sections.push("# Projektbericht", "", "Für den gewählten Zeitraum und Umfang liegen keine exportierbaren Daten vor.");
    }

    sections.push(
      "# Exportinformationen",
      "",
      "| Feld | Angabe |",
      "|---|---|",
      `| Projekt | ${value(options.projectName)} |`,
      `| Exportdatum | ${dateStr} |`,
      `| Umfang | ${this.getScopeLabel(options.scope)} |`,
      "| Dateiformat | PDF |",
    );

    const { generateProtocolPdf } = await import("@/lib/pdf-generator");
    const filePath = await generateProtocolPdf({
      title: options.projectName,
      projectName: options.projectName,
      protocol: sections.join("\n\n"),
      templateId: "project-export",
      templateName: `${this.getScopeLabel(options.scope)} Export`,
      duration: 0,
      createdAt: now.toISOString(),
    });
    const fileName = decodeURIComponent(filePath.split("/").pop() || `${options.projectName}_Export_${now.toISOString().slice(0, 10)}.pdf`);

    return { success: true, filePath, fileName, mimeType: "application/pdf" };
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
