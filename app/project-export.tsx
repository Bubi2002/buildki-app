/**
 * Projekt-Gesamtexport – wählt aus, welche Tool-Daten (Mängel, Checklisten,
 * Aufgaben, Anwesenheit, Zeiterfassung, Bautagebuch, Protokolle, Räume) in eine
 * einzige PDF exportiert werden.
 */
import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { getDefects } from "@/lib/defect-store";
import { getChecklistResults, getChecklistCompletionRate } from "@/lib/checklist-store";
import { getTimeEntries } from "@/lib/time-tracking-store";
import { getProjectStructure } from "@/lib/room-store";
import { generateAndSharePdf, type PdfSection } from "@/lib/pdf-professional";

type SourceKey = "defects" | "checklists" | "tasks" | "attendance" | "time" | "diary" | "protocols" | "rooms";

const STATUS_LABEL: Record<string, string> = {
  offen: "Offen", zugewiesen: "Zugewiesen", in_bearbeitung: "In Arbeit", nachbesserung: "Nachbesserung",
  pruefung: "Prüfung", erledigt: "Erledigt", abgelehnt: "Abgelehnt", geschlossen: "Geschlossen",
};

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")} h`;
}

export default function ProjectExportScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useColors();
  const { projectId = "", projectName } = useLocalSearchParams<{ projectId: string; projectName?: string }>();

  const [selected, setSelected] = useState<Record<SourceKey, boolean>>({
    defects: true, checklists: true, tasks: true, attendance: true, time: true, diary: true, protocols: true, rooms: true,
  });
  const [counts, setCounts] = useState<Partial<Record<SourceKey, number>>>({});
  const [busy, setBusy] = useState(false);

  const SOURCES: { key: SourceKey; label: string; icon: string }[] = [
    { key: "defects", label: t('index_tool_maengel' as any), icon: "warning" },
    { key: "checklists", label: t('checklist_title' as any), icon: "checklist" },
    { key: "tasks", label: t('index_tool_aufgaben' as any), icon: "task-alt" },
    { key: "attendance", label: t('index_tool_anwesenheit' as any), icon: "how-to-reg" },
    { key: "time", label: t('index_tool_zeiterfassung' as any), icon: "timer" },
    { key: "diary", label: t('index_tool_bautagebuch' as any), icon: "menu-book" },
    { key: "protocols", label: t('project_export_protocols' as any), icon: "description" },
    { key: "rooms", label: t('index_tool_raeume' as any), icon: "layers" },
  ];

  useEffect(() => {
    void (async () => {
      if (!projectId) return;
      try {
        const [defects, checklists, timeEntries, structure, attRaw, diaryRaw, protoRaw, tasksRaw] = await Promise.all([
          getDefects(projectId),
          getChecklistResults(projectId),
          getTimeEntries(projectId),
          getProjectStructure(projectId),
          AsyncStorage.getItem("attendance_records"),
          AsyncStorage.getItem("bautagebuch_entries"),
          AsyncStorage.getItem("protocols"),
          AsyncStorage.getItem("project-tasks"),
        ]);
        const att = (attRaw ? JSON.parse(attRaw) : []).filter((r: any) => r.projectId === projectId);
        const diary = (diaryRaw ? JSON.parse(diaryRaw) : []).filter((r: any) => r.projectId === projectId);
        const proto = (protoRaw ? JSON.parse(protoRaw) : []).filter((p: any) => p.projectId === projectId);
        const tasks = (tasksRaw ? JSON.parse(tasksRaw) : []).filter((tk: any) => !tk.projectId || tk.projectId === projectId);
        setCounts({
          defects: defects.length,
          checklists: checklists.length,
          tasks: tasks.length,
          attendance: att.length,
          time: timeEntries.length,
          diary: diary.length,
          protocols: proto.length,
          rooms: structure.rooms.length,
        });
      } catch {}
    })();
  }, [projectId]);

  const toggle = (key: SourceKey) => setSelected((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleExport = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      const sections: PdfSection[] = [];

      if (selected.defects) {
        const defects = await getDefects(projectId);
        if (defects.length) {
          sections.push({
            title: `${t('index_tool_maengel' as any)} (${defects.length})`,
            content: "",
            table: {
              headers: ["Titel", "Status", "Priorität", "Ort"],
              rows: defects.map((d) => [d.title || "-", STATUS_LABEL[d.status] || d.status, d.priority || "-", d.room || d.location || "-"]),
            },
          });
        }
      }

      if (selected.checklists) {
        const results = await getChecklistResults(projectId);
        if (results.length) {
          sections.push({
            title: `${t('checklist_title' as any)} (${results.length})`,
            content: "",
            table: {
              headers: ["Checkliste", "Ort", "Erledigt", "Datum"],
              rows: results.map((r) => [r.checklistName || "-", r.location || "-", `${getChecklistCompletionRate(r)}%`, new Date(r.createdAt).toLocaleDateString("de-DE")]),
            },
          });
        }
      }

      if (selected.tasks) {
        const raw = await AsyncStorage.getItem("project-tasks");
        const tasks = (raw ? JSON.parse(raw) : []).filter((tk: any) => !tk.projectId || tk.projectId === projectId);
        if (tasks.length) {
          sections.push({
            title: `${t('index_tool_aufgaben' as any)} (${tasks.length})`,
            content: "",
            table: {
              headers: ["Aufgabe", "Raum", "Status"],
              rows: tasks.map((tk: any) => [tk.title || tk.task || "-", tk.room || "-", tk.status === "erledigt" || tk.done ? "Erledigt" : "Offen"]),
            },
          });
        }
      }

      if (selected.attendance) {
        const raw = await AsyncStorage.getItem("attendance_records");
        const att = (raw ? JSON.parse(raw) : []).filter((r: any) => r.projectId === projectId);
        if (att.length) {
          sections.push({
            title: `${t('index_tool_anwesenheit' as any)} (${att.length})`,
            content: "",
            table: {
              headers: ["Datum", "Anzahl", "Personen"],
              rows: att.map((r: any) => [
                new Date(r.date).toLocaleDateString("de-DE"),
                String((r.workers || []).length),
                (r.workers || []).map((w: any) => w.name || w.workerName || "").filter(Boolean).join(", ") || "-",
              ]),
            },
          });
        }
      }

      if (selected.time) {
        const entries = await getTimeEntries(projectId);
        if (entries.length) {
          const total = entries.reduce((s, e) => s + (e.duration || 0), 0);
          sections.push({
            title: `${t('index_tool_zeiterfassung' as any)} (${entries.length})`,
            content: `**${t('project_export_total_hours' as any)}:** ${fmtDuration(total)}`,
            table: {
              headers: ["Datum", "Kategorie", "Dauer", "Notiz"],
              rows: entries.map((e) => [new Date(e.startTime).toLocaleDateString("de-DE"), e.category || "-", fmtDuration(e.duration || 0), e.note || "-"]),
            },
          });
        }
      }

      if (selected.diary) {
        const raw = await AsyncStorage.getItem("bautagebuch_entries");
        const diary = (raw ? JSON.parse(raw) : []).filter((r: any) => r.projectId === projectId);
        if (diary.length) {
          sections.push({
            title: `${t('index_tool_bautagebuch' as any)} (${diary.length})`,
            content: diary.map((d: any) => `**${new Date(d.date).toLocaleDateString("de-DE")}** — ${d.weather || ""}`).join("\n\n"),
          });
        }
      }

      if (selected.protocols) {
        const raw = await AsyncStorage.getItem("protocols");
        const proto = (raw ? JSON.parse(raw) : []).filter((p: any) => p.projectId === projectId);
        if (proto.length) {
          sections.push({
            title: `${t('project_export_protocols' as any)} (${proto.length})`,
            content: "",
            table: {
              headers: ["Titel", "Datum"],
              rows: proto.map((p: any) => [p.title || "-", new Date(p.createdAt).toLocaleDateString("de-DE")]),
            },
          });
        }
      }

      if (selected.rooms) {
        const structure = await getProjectStructure(projectId);
        if (structure.rooms.length) {
          const floorName = (fid: string) => structure.floors.find((f) => f.id === fid)?.name || "-";
          sections.push({
            title: `${t('index_tool_raeume' as any)} (${structure.rooms.length})`,
            content: "",
            table: {
              headers: ["Geschoss", "Raum", "Status"],
              rows: structure.rooms.map((r) => [floorName(r.floorId), r.name, r.status || "-"]),
            },
          });
        }
      }

      if (sections.length === 0) {
        Alert.alert(t('project_export_title' as any), t('project_export_empty' as any));
        return;
      }

      await generateAndSharePdf({
        title: t('project_export_title' as any),
        subtitle: projectName || undefined,
        reportType: t('project_export_title' as any),
        datum: new Date().toLocaleDateString("de-DE"),
        projekt: projectName || undefined,
        sections,
        includeTableOfContents: sections.length > 3,
        accentColor: "#2563EB",
      });
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), e?.message || t('project_export_failed' as any));
    } finally {
      setBusy(false);
    }
  };

  const anySelected = Object.values(selected).some(Boolean);

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('project_export_title' as any)}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.hint, { color: colors.muted }]}>{t('project_export_hint' as any)}</Text>

        {SOURCES.map((s) => {
          const on = selected[s.key];
          const count = counts[s.key] ?? 0;
          return (
            <Pressable
              key={s.key}
              onPress={() => toggle(s.key)}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: on ? colors.primary : colors.border }]}
            >
              <MaterialIcons name={on ? "check-box" : "check-box-outline-blank"} size={22} color={on ? colors.primary : colors.muted} />
              <MaterialIcons name={s.icon as any} size={20} color={colors.muted} />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{s.label}</Text>
              <Text style={[styles.rowCount, { color: colors.muted }]}>{count}</Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={handleExport}
          disabled={busy || !anySelected}
          style={({ pressed }) => [styles.exportBtn, { backgroundColor: colors.primary, opacity: busy || !anySelected ? 0.4 : pressed ? 0.85 : 1 }]}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="picture-as-pdf" size={20} color="#fff" />}
          <Text style={styles.exportBtnText}>{t('project_export_button' as any)}</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  title: { fontSize: 17, fontWeight: "700" },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderRadius: 10, marginBottom: 8 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
  rowCount: { fontSize: 14, fontWeight: "700" },
  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 12, marginTop: 18 },
  exportBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
