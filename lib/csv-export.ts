import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform, Alert } from "react-native";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  dueDate?: string;
  priority?: string;
};

type Protocol = {
  id: string;
  title: string;
  templateName?: string;
  protocolNumber?: string;
  createdAt: string;
  todos?: Todo[];
  status?: string;
};

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type TaskExportRow = {
  task: string;
  done: boolean;
  status?: string;
  deadline?: string;
  priority?: string;
  floor?: string;
  room?: string;
  source?: string;
};

export async function exportTasksAsCSV(tasks?: TaskExportRow[]): Promise<void> {
  try {
    const rows: string[] = [];
    // Header
    rows.push("Aufgabe,Status,Fälligkeitsdatum,Priorität,Ort,Quelle");

    // Preferred: the exact tasks the screen is showing (incl. standalone tasks).
    if (tasks && tasks.length > 0) {
      for (const it of tasks) {
        const status = it.status === "in_arbeit" ? "In Arbeit" : it.done ? "Erledigt" : "Offen";
        const deadline = it.deadline && it.deadline !== "Offen" ? it.deadline : "-";
        const ort = [it.floor, it.room].filter(Boolean).join(" / ") || "-";
        rows.push(
          [
            escapeCSV(it.task),
            status,
            escapeCSV(deadline),
            it.priority || "Normal",
            escapeCSV(ort),
            escapeCSV(it.source || "-"),
          ].join(",")
        );
      }
    } else {
      const protocols: Protocol[] = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );
      for (const protocol of protocols) {
        if (!protocol.todos || protocol.status !== "ready") continue;
        for (const todo of protocol.todos) {
          const status = todo.done ? "Erledigt" : "Offen";
          const dueDate = todo.dueDate ? new Date(todo.dueDate).toLocaleDateString("de-DE") : "-";
          const priority = todo.priority || "Normal";
          const protocolName = protocol.templateName || protocol.title || "Protokoll";
          rows.push(
            [escapeCSV(todo.text), status, dueDate, priority, "-", escapeCSV(protocolName)].join(",")
          );
        }
      }
    }

    if (rows.length <= 1) {
      Alert.alert("Keine Aufgaben", "Es gibt keine Aufgaben zum Exportieren.");
      return;
    }

    const csvContent = "\uFEFF" + rows.join("\n"); // BOM for Excel UTF-8

    if (Platform.OS === "web") {
      // Web: Download as blob
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Aufgaben_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Native: Save and share
    const fileName = `Aufgaben_${new Date().toISOString().split("T")[0]}.csv`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/csv",
        dialogTitle: "Aufgabenliste exportieren",
        UTI: "public.comma-separated-values-text",
      });
    } else {
      Alert.alert("Fehler", "Teilen ist auf diesem Gerät nicht verfügbar.");
    }
  } catch (error) {
    console.error("CSV export error:", error);
    Alert.alert("Fehler", "CSV-Export fehlgeschlagen.");
  }
}
