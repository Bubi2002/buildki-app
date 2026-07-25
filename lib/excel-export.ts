import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { getDefects } from "./defect-store";

type TodoItem = {
  text: string;
  done: boolean;
  status?: "offen" | "in_arbeit" | "erledigt";
  assignee?: string;
  dueDate?: string;
  priority?: "hoch" | "mittel" | "niedrig";
};

type Protocol = {
  id: string;
  title: string;
  todos?: TodoItem[];
  createdAt: string;
  projectId?: string;
  templateName?: string;
  photos?: string[];
};

type Project = {
  id: string;
  name: string;
};

/**
 * Export all tasks/defects from a project as a CSV file (Excel-compatible)
 */
export async function exportTasksAsExcel(projectId?: string): Promise<string | null> {
  try {
    const [protocolsData, projectsData] = await Promise.all([
      AsyncStorage.getItem("protocols"),
      AsyncStorage.getItem("projects"),
    ]);

    const allProtocols: Protocol[] = protocolsData ? JSON.parse(protocolsData) : [];
    const allProjects: Project[] = projectsData ? JSON.parse(projectsData) : [];

    // Filter by project if specified
    const protocols = projectId
      ? allProtocols.filter(p => p.projectId === projectId)
      : allProtocols;

    const projectName = projectId
      ? allProjects.find(p => p.id === projectId)?.name || "Unbekannt"
      : "Alle Projekte";

    // Collect all tasks
    const rows: string[][] = [];
    rows.push([
      "Nr.",
      "Aufgabe",
      "Status",
      "Priorität",
      "Zuständig",
      "Fällig",
      "Protokoll",
      "Vorlage",
      "Erstellt am",
      "Projekt",
    ]);

    let counter = 1;
    for (const protocol of protocols) {
      if (!protocol.todos || protocol.todos.length === 0) continue;
      const project = allProjects.find(p => p.id === protocol.projectId);

      for (const todo of protocol.todos) {
        const status = todo.status || (todo.done ? "erledigt" : "offen");
        const statusText = status === "offen" ? "Offen" : status === "in_arbeit" ? "In Arbeit" : "Erledigt";
        const priorityText = todo.priority === "hoch" ? "Hoch" : todo.priority === "niedrig" ? "Niedrig" : "Mittel";

        rows.push([
          counter.toString(),
          escapeCsv(todo.text),
          statusText,
          priorityText,
          escapeCsv(todo.assignee || "-"),
          todo.dueDate || "-",
          escapeCsv(protocol.title),
          protocol.templateName || "-",
          new Date(protocol.createdAt).toLocaleDateString("de-DE"),
          escapeCsv(project?.name || "-"),
        ]);
        counter++;
      }
    }

    if (rows.length <= 1) {
      return null; // No tasks found
    }

    // Generate CSV with BOM for Excel compatibility
    const BOM = "\uFEFF";
    const csv = BOM + rows.map(row => row.join(";")).join("\n");

    // Save to file
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = projectId
      ? `${sanitizeFilename(projectName)}_Aufgaben_${dateStr}.csv`
      : `Alle_Aufgaben_${dateStr}.csv`;

    const filePath = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(filePath, csv, { encoding: FileSystem.EncodingType.UTF8 });

    return filePath;
  } catch (e) {
    console.error("Excel export error:", e);
    return null;
  }
}

/**
 * Export defects/Mängel with photos as an HTML table (Excel-compatible with embedded images)
 */
export async function exportDefectsWithPhotos(projectId?: string): Promise<string | null> {
  try {
    const defects = await getDefects(projectId);
    if (defects.length === 0) return null;

    const projectsData = await AsyncStorage.getItem("projects");
    const allProjects: Project[] = projectsData ? JSON.parse(projectsData) : [];
    const projectName = projectId
      ? allProjects.find(p => p.id === projectId)?.name || "Unbekannt"
      : "Alle Projekte";

    // Build HTML table that Excel can open with embedded images
    let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  th { background-color: #2563EB; color: white; padding: 8px; text-align: left; font-weight: bold; }
  td { border: 1px solid #E5E7EB; padding: 6px; vertical-align: top; }
  tr:nth-child(even) { background-color: #F9FAFB; }
  .status-offen { color: #DC2626; font-weight: bold; }
  .status-in_bearbeitung { color: #F59E0B; font-weight: bold; }
  .status-erledigt { color: #22C55E; font-weight: bold; }
  .priority-hoch { color: #DC2626; }
  .priority-mittel { color: #F59E0B; }
  .priority-niedrig { color: #6B7280; }
  .photo-cell img { width: 120px; height: 90px; object-fit: cover; margin: 2px; border-radius: 4px; }
  h1 { color: #1F2937; font-size: 18px; }
  h2 { color: #374151; font-size: 14px; margin-top: 4px; }
  .summary { margin-bottom: 16px; padding: 8px; background: #F3F4F6; border-radius: 4px; }
</style>
</head>
<body>
<h1>Mängelliste – ${escapeHtml(projectName)}</h1>
<h2>Exportiert am ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</h2>
<div class="summary">
  <strong>Gesamt:</strong> ${defects.length} Mängel | 
  <strong>Offen:</strong> ${defects.filter(d => d.status === "offen").length} | 
  <strong>In Bearbeitung:</strong> ${defects.filter(d => d.status === "in_bearbeitung").length} | 
  <strong>Erledigt:</strong> ${defects.filter(d => d.status === "erledigt").length}
</div>
<table>
<thead>
<tr>
  <th>Nr.</th>
  <th>Titel</th>
  <th>Beschreibung</th>
  <th>Status</th>
  <th>Priorität</th>
  <th>Kategorie</th>
  <th>Zuständig</th>
  <th>Fällig</th>
  <th>Ort</th>
  <th>Erstellt</th>
  <th>Fotos</th>
</tr>
</thead>
<tbody>`;

    for (let i = 0; i < defects.length; i++) {
      const d = defects[i];
      const statusClass = `status-${d.status}`;
      const statusText = d.status === "offen" ? "Offen" : d.status === "in_bearbeitung" ? "In Bearbeitung" : "Erledigt";
      const priorityClass = `priority-${d.priority}`;
      const priorityText = d.priority === "hoch" ? "Hoch" : d.priority === "niedrig" ? "Niedrig" : "Mittel";

      // Convert photos to base64 thumbnails
      let photosHtml = "-";
      if (d.photos && d.photos.length > 0) {
        const photoTags: string[] = [];
        for (const photoUri of d.photos.slice(0, 4)) { // Max 4 photos per defect
          try {
            const base64 = await FileSystem.readAsStringAsync(photoUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const ext = photoUri.toLowerCase().includes(".png") ? "png" : "jpeg";
            photoTags.push(`<img src="data:image/${ext};base64,${base64}" />`);
          } catch {
            photoTags.push(`<span style="color:#999">[Foto nicht verfügbar]</span>`);
          }
        }
        if (d.photos.length > 4) {
          photoTags.push(`<span>+${d.photos.length - 4} weitere</span>`);
        }
        photosHtml = `<div class="photo-cell">${photoTags.join("")}</div>`;
      }

      html += `
<tr>
  <td>${i + 1}</td>
  <td><strong>${escapeHtml(d.title)}</strong></td>
  <td>${escapeHtml(d.description || "-")}</td>
  <td class="${statusClass}">${statusText}</td>
  <td class="${priorityClass}">${priorityText}</td>
  <td>${escapeHtml(d.category || "-")}</td>
  <td>${escapeHtml(d.assignee || "-")}</td>
  <td>${d.dueDate || "-"}</td>
  <td>${escapeHtml(d.location || "-")}</td>
  <td>${new Date(d.createdAt).toLocaleDateString("de-DE")}</td>
  <td>${photosHtml}</td>
</tr>`;
    }

    html += `
</tbody>
</table>
</body>
</html>`;

    // Save as .xls (HTML format that Excel opens natively)
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = projectId
      ? `${sanitizeFilename(projectName)}_Maengelliste_${dateStr}.xls`
      : `Alle_Maengel_${dateStr}.xls`;

    const filePath = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(filePath, html, { encoding: FileSystem.EncodingType.UTF8 });

    return filePath;
  } catch (e) {
    console.error("Defect Excel export error:", e);
    return null;
  }
}

/**
 * Export and share the tasks CSV file
 */
export async function exportAndShareTasks(projectId?: string): Promise<boolean> {
  const filePath = await exportTasksAsExcel(projectId);
  if (!filePath) return false;

  try {
    await Sharing.shareAsync(filePath, {
      mimeType: "text/csv",
      dialogTitle: "Aufgabenliste exportieren",
      UTI: "public.comma-separated-values-text",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Export and share defects with photos
 */
export async function exportAndShareDefects(projectId?: string): Promise<boolean> {
  const filePath = await exportDefectsWithPhotos(projectId);
  if (!filePath) {
    return false;
  }

  try {
    await Sharing.shareAsync(filePath, {
      mimeType: "application/vnd.ms-excel",
      dialogTitle: "Mängelliste exportieren",
      UTI: "com.microsoft.excel.xls",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get task statistics for a project
 */
export async function getTaskStats(projectId?: string): Promise<{
  total: number;
  offen: number;
  inArbeit: number;
  erledigt: number;
}> {
  try {
    const protocolsData = await AsyncStorage.getItem("protocols");
    const allProtocols: Protocol[] = protocolsData ? JSON.parse(protocolsData) : [];

    const protocols = projectId
      ? allProtocols.filter(p => p.projectId === projectId)
      : allProtocols;

    let total = 0, offen = 0, inArbeit = 0, erledigt = 0;

    for (const protocol of protocols) {
      if (!protocol.todos) continue;
      for (const todo of protocol.todos) {
        total++;
        const status = todo.status || (todo.done ? "erledigt" : "offen");
        if (status === "offen") offen++;
        else if (status === "in_arbeit") inArbeit++;
        else erledigt++;
      }
    }

    return { total, offen, inArbeit, erledigt };
  } catch {
    return { total: 0, offen: 0, inArbeit: 0, erledigt: 0 };
  }
}

function escapeCsv(text: string): string {
  if (text.includes(";") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_").replace(/_+/g, "_");
}
