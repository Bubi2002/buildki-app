import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

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
 * Export and share the CSV file
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

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_").replace(/_+/g, "_");
}
