/**
 * Protocol Merge Service
 * 
 * Combines multiple protocols from the same project/day into a single
 * comprehensive report (Gesamtbericht) as PDF.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { getPdfBranding } from "./pdf-branding-store";
import { getProtocolText, hasProtocolText } from "./protocol-compat";

type Protocol = {
  id: string;
  title: string;
  protocol?: string;
  content?: string;
  transcription?: string;
  summary?: string;
  createdAt: string;
  projectId?: string;
  templateName?: string;
  photos?: string[];
  todos?: { text: string; done: boolean; assignee?: string; priority?: string; dueDate?: string }[];
  location?: string;
  weather?: { temperature?: number; temp?: number; description?: string; condition?: string };
  markers?: { time: number; label: string }[];
  recordingMode?: string;
  duration?: number;
  protocolNumber?: string;
};

type Project = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  protocolPrefix?: string;
};

export type MergeOptions = {
  projectId: string;
  protocolIds: string[];
  title?: string;
  includePhotos?: boolean;
  includeTodos?: boolean;
  includeWeather?: boolean;
  groupByDate?: boolean;
};

export type MergeResult = {
  success: boolean;
  filePath?: string;
  error?: string;
  protocolCount: number;
};

/**
 * Get protocols for a project, optionally filtered by date range
 */
export async function getProtocolsForMerge(projectId: string, dateRange?: { from: string; to: string }): Promise<Protocol[]> {
  try {
    const raw = await AsyncStorage.getItem("protocols");
    const all: Protocol[] = raw ? JSON.parse(raw) : [];
    let filtered = all.filter(p => p.projectId === projectId && hasProtocolText(p));
    
    if (dateRange) {
      const fromDate = new Date(dateRange.from).getTime();
      const toDate = new Date(dateRange.to).getTime() + 86400000; // Include end day
      filtered = filtered.filter(p => {
        const t = new Date(p.createdAt).getTime();
        return t >= fromDate && t < toDate;
      });
    }
    
    return filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch {
    return [];
  }
}

/**
 * Get protocols for today (for daily merge)
 */
export async function getTodayProtocols(projectId: string): Promise<Protocol[]> {
  const today = new Date().toISOString().split("T")[0];
  return getProtocolsForMerge(projectId, { from: today, to: today });
}

/**
 * Merge multiple protocols into a single PDF report
 */
export async function mergeProtocols(options: MergeOptions): Promise<MergeResult> {
  try {
    const [protocolsRaw, projectsRaw] = await Promise.all([
      AsyncStorage.getItem("protocols"),
      AsyncStorage.getItem("projects"),
    ]);
    
    const allProtocols: Protocol[] = protocolsRaw ? JSON.parse(protocolsRaw) : [];
    const allProjects: Project[] = projectsRaw ? JSON.parse(projectsRaw) : [];
    const project = allProjects.find(p => p.id === options.projectId);
    
    if (!project) {
      return { success: false, error: "Projekt nicht gefunden", protocolCount: 0 };
    }
    
    // Get selected protocols in chronological order
    const protocols = allProtocols
      .filter(p => options.protocolIds.includes(p.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    if (protocols.length === 0) {
      return { success: false, error: "Keine Protokolle ausgewählt", protocolCount: 0 };
    }
    
    // Load branding
    const branding = await getPdfBranding();
    
    // Build merged HTML
    const html = await buildMergedHtml(protocols, project, options, branding);
    
    // Generate PDF
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    
    // Move to cache with meaningful name
    const dateStr = new Date().toISOString().split("T")[0];
    const projectSlug = (project.name || "Projekt").replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "_").replace(/_+/g, "_");
    // Unique suffix so re-running on the same day doesn't clash with an existing file.
    const fileName = `${projectSlug}_Gesamtbericht_${dateStr}_${Date.now()}.pdf`;
    const destPath = `${FileSystem.cacheDirectory}${fileName}`;

    try {
      const existing = await FileSystem.getInfoAsync(destPath);
      if (existing.exists) await FileSystem.deleteAsync(destPath, { idempotent: true });
    } catch {}
    await FileSystem.moveAsync({ from: uri, to: destPath });
    
    return { success: true, filePath: destPath, protocolCount: protocols.length };
  } catch (e: any) {
    console.error("Protocol merge error:", e);
    return { success: false, error: e.message || "Zusammenführung fehlgeschlagen", protocolCount: 0 };
  }
}

/**
 * Merge and immediately share the result
 */
export async function mergeAndShare(options: MergeOptions): Promise<boolean> {
  const result = await mergeProtocols(options);
  if (!result.success || !result.filePath) return false;
  
  try {
    await Sharing.shareAsync(result.filePath, {
      mimeType: "application/pdf",
      dialogTitle: "Gesamtbericht teilen",
      UTI: "com.adobe.pdf",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the merged HTML for PDF generation
 */
async function buildMergedHtml(
  protocols: Protocol[],
  project: Project,
  options: MergeOptions,
  branding: any
): Promise<string> {
  const title = options.title || `Gesamtbericht – ${project.name}`;
  const dateRange = getDateRange(protocols);
  const logoHtml = branding?.logoBase64
    ? `<img src="data:image/png;base64,${branding.logoBase64}" style="height: 40px; object-fit: contain;" />`
    : "";
  
  // Collect all todos across protocols
  const allTodos: { task: string; done: boolean; assignee?: string; priority?: string; protocol: string }[] = [];
  if (options.includeTodos !== false) {
    for (const p of protocols) {
      if (p.todos) {
        for (const todo of p.todos) {
          allTodos.push({ ...todo, protocol: p.title });
        }
      }
    }
  }
  
  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 20mm 15mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; line-height: 1.5; color: #1F2937; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${project.color || '#2563EB'}; padding-bottom: 12px; margin-bottom: 20px; }
  .header-left h1 { font-size: 18px; margin: 0; color: ${project.color || '#2563EB'}; }
  .header-left p { margin: 4px 0 0; font-size: 10px; color: #6B7280; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
  .meta-table td { padding: 4px 8px; border: 1px solid #E5E7EB; }
  .meta-table td:first-child { font-weight: 600; width: 140px; background: #F9FAFB; }
  .section { margin-bottom: 24px; page-break-inside: avoid; }
  .section-title { font-size: 14px; font-weight: 700; color: ${project.color || '#2563EB'}; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; margin-bottom: 12px; }
  .protocol-block { margin-bottom: 20px; padding: 12px; background: #F9FAFB; border-radius: 6px; border-left: 3px solid ${project.color || '#2563EB'}; page-break-inside: avoid; }
  .protocol-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .protocol-title { font-size: 12px; font-weight: 700; color: #1F2937; }
  .protocol-meta { font-size: 9px; color: #6B7280; }
  .protocol-content { font-size: 10px; white-space: pre-wrap; line-height: 1.6; }
  .todo-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 8px; }
  .todo-table th { background: ${project.color || '#2563EB'}; color: white; padding: 6px; text-align: left; }
  .todo-table td { padding: 5px 6px; border: 1px solid #E5E7EB; }
  .todo-done { text-decoration: line-through; color: #9CA3AF; }
  .todo-offen { color: #DC2626; font-weight: 600; }
  .photo-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .photo-grid img { width: 120px; height: 90px; object-fit: cover; border-radius: 4px; border: 1px solid #E5E7EB; }
  .summary-box { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
  .summary-box h3 { margin: 0 0 6px; font-size: 11px; color: #1E40AF; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #E5E7EB; font-size: 9px; color: #9CA3AF; text-align: center; }
  .toc { margin-bottom: 20px; }
  .toc-item { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #E5E7EB; font-size: 10px; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-left">
    <h1>${escapeHtml(title)}</h1>
    <p>${dateRange} | ${protocols.length} Protokolle zusammengeführt</p>
  </div>
  ${logoHtml}
</div>

<!-- Meta Info -->
<table class="meta-table">
  <tr><td>Projekt</td><td>${escapeHtml(project.name)}</td></tr>
  ${project.description ? `<tr><td>Beschreibung</td><td>${escapeHtml(project.description)}</td></tr>` : ""}
  <tr><td>Zeitraum</td><td>${dateRange}</td></tr>
  <tr><td>Anzahl Protokolle</td><td>${protocols.length}</td></tr>
  <tr><td>Erstellt am</td><td>${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>
  ${allTodos.length > 0 ? `<tr><td>Offene Aufgaben</td><td>${allTodos.filter(t => !t.done).length} von ${allTodos.length}</td></tr>` : ""}
</table>

<!-- Table of Contents -->
<div class="section toc">
  <div class="section-title">Inhaltsverzeichnis</div>
  ${protocols.map((p, i) => `
    <div class="toc-item">
      <span>${i + 1}. ${escapeHtml(p.title)}${p.protocolNumber ? ` (${p.protocolNumber})` : ""}</span>
      <span>${new Date(p.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
    </div>
  `).join("")}
</div>

<!-- Protocol Sections -->
<div class="section">
  <div class="section-title">Protokolle</div>
  ${protocols.map((p, i) => buildProtocolBlock(p, i, options)).join("")}
</div>`;

  // Combined Todos section
  if (options.includeTodos !== false && allTodos.length > 0) {
    html += `
<div class="section">
  <div class="section-title">Gesamtübersicht Aufgaben (${allTodos.length})</div>
  <table class="todo-table">
    <thead><tr><th>Nr.</th><th>Aufgabe</th><th>Status</th><th>Zuständig</th><th>Priorität</th><th>Protokoll</th></tr></thead>
    <tbody>
      ${allTodos.map((t, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="${t.done ? 'todo-done' : ''}">${escapeHtml(t.task)}</td>
          <td class="${t.done ? 'todo-done' : 'todo-offen'}">${t.done ? "Erledigt" : "Offen"}</td>
          <td>${escapeHtml(t.assignee || "-")}</td>
          <td>${t.priority === "hoch" ? "Hoch" : t.priority === "niedrig" ? "Niedrig" : "Mittel"}</td>
          <td style="font-size:9px">${escapeHtml(t.protocol)}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>`;
  }

  html += `
<div class="footer">
  Generiert mit BuildKI | ${new Date().toLocaleDateString("de-DE")} | ${project.name}
</div>
</body>
</html>`;

  return html;
}

function buildProtocolBlock(protocol: Protocol, index: number, options: MergeOptions): string {
  const date = new Date(protocol.createdAt).toLocaleDateString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
  
  let weatherStr = "";
  if (options.includeWeather !== false && protocol.weather) {
    const temp = protocol.weather.temperature || protocol.weather.temp;
    const desc = protocol.weather.description || protocol.weather.condition;
    if (temp || desc) weatherStr = ` | Wetter: ${temp ? temp + "°C" : ""} ${desc || ""}`;
  }
  
  let photosHtml = "";
  if (options.includePhotos !== false && protocol.photos && protocol.photos.length > 0) {
    photosHtml = `<div style="font-size:9px;color:#6B7280;margin-top:6px;">📷 ${protocol.photos.length} Fotos (siehe Einzelprotokoll-PDF)</div>`;
  }
  
  return `
  <div class="protocol-block">
    <div class="protocol-header">
      <span class="protocol-title">${index + 1}. ${escapeHtml(protocol.title)}${protocol.protocolNumber ? ` (${protocol.protocolNumber})` : ""}</span>
      <span class="protocol-meta">${date}${weatherStr}</span>
    </div>
    ${protocol.location ? `<div class="protocol-meta" style="margin-bottom:6px">📍 ${escapeHtml(protocol.location)}</div>` : ""}
    <div class="protocol-content">${escapeHtml(getProtocolText(protocol) || protocol.summary || "Kein Inhalt")}</div>
    ${photosHtml}
  </div>`;
}

function getDateRange(protocols: Protocol[]): string {
  if (protocols.length === 0) return "-";
  const dates = protocols.map(p => new Date(p.createdAt));
  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  const max = new Date(Math.max(...dates.map(d => d.getTime())));
  
  const fmt = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  
  if (fmt(min) === fmt(max)) return fmt(min);
  return `${fmt(min)} – ${fmt(max)}`;
}

function escapeHtml(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
