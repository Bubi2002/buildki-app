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

export async function exportTasksAsCSV(): Promise<void> {
  try {
    const protocols: Protocol[] = JSON.parse(
      (await AsyncStorage.getItem("protocols")) || "[]"
    );

    const rows: string[] = [];
    // Header
    rows.push("Aufgabe,Status,Fälligkeitsdatum,Priorität,Protokoll,Protokoll-Nr.,Erstellt am");

    for (const protocol of protocols) {
      if (!protocol.todos || protocol.status !== "ready") continue;

      for (const todo of protocol.todos) {
        const status = todo.done ? "Erledigt" : "Offen";
        const dueDate = todo.dueDate
          ? new Date(todo.dueDate).toLocaleDateString("de-DE")
          : "-";
        const priority = todo.priority || "Normal";
        const protocolName = protocol.templateName || protocol.title || "Protokoll";
        const protocolNum = protocol.protocolNumber || "-";
        const createdAt = new Date(protocol.createdAt).toLocaleDateString("de-DE");

        rows.push(
          [
            escapeCSV(todo.text),
            status,
            dueDate,
            priority,
            escapeCSV(protocolName),
            protocolNum,
            createdAt,
          ].join(",")
        );
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
