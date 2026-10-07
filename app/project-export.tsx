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
import { BusyOverlay } from "@/components/busy-overlay";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { getDefects } from "@/lib/defect-store";
import { getChecklistResults, getChecklistCompletionRate, getChecklists } from "@/lib/checklist-store";
import { getFloorPlans } from "@/lib/floor-plan-store";
import { getTimeEntries, getTimeTrackingSettings } from "@/lib/time-tracking-store";
import { getProjectStructure } from "@/lib/room-store";
import { getDirectProjectPhotos } from "@/lib/project-photo-store";
import { getEvidence } from "@/lib/evidence-store";
import { generateAndSharePdf, type PdfSection, type PdfImage, type PdfCard } from "@/lib/pdf-professional";
import * as FileSystem from "expo-file-system/legacy";

type SourceKey = "defects" | "checklists" | "tasks" | "attendance" | "time" | "diary" | "protocols" | "rooms" | "plans" | "compare" | "measure" | "photos";

// Pill colours matching the app (status + priority).
const PRIO_COLOR: Record<string, string> = { hoch: "#B91C1C", mittel: "#B45309", niedrig: "#6B7280" };
const STATUS_COLOR: Record<string, string> = {
  offen: "#DC2626", zugewiesen: "#EA580C", in_bearbeitung: "#D97706", nachbesserung: "#DB2777",
  pruefung: "#7C3AED", erledigt: "#5E8B6F", abgelehnt: "#78716C", geschlossen: "#475569",
};

/** Read a local image file as a base64 data URI (or null if it can't be read). */
async function toDataUri(uri: string): Promise<string | null> {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const mime = uri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

const MAX_EXPORT_PHOTOS = 40;

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
    defects: true, checklists: true, tasks: true, attendance: true, time: true, diary: false, protocols: true, rooms: true, plans: true, compare: true, measure: true, photos: false,
  });
  const [counts, setCounts] = useState<Partial<Record<SourceKey, number>>>({});
  const [busy, setBusy] = useState(false);

  const SOURCES: { key: SourceKey; label: string; icon: string }[] = [
    { key: "defects", label: t('index_tool_maengel' as any), icon: "warning" },
    { key: "checklists", label: t('checklist_title' as any), icon: "checklist" },
    { key: "tasks", label: t('index_tool_aufgaben' as any), icon: "task-alt" },
    { key: "attendance", label: t('index_tool_anwesenheit' as any), icon: "how-to-reg" },
    { key: "time", label: t('index_tool_zeiterfassung' as any), icon: "timer" },
    { key: "protocols", label: t('project_export_protocols' as any), icon: "description" },
    { key: "rooms", label: t('index_tool_raeume' as any), icon: "layers" },
    { key: "plans", label: t('index_tool_grundriss' as any), icon: "map" },
    { key: "compare", label: t('vergleich' as any), icon: "compare" },
    { key: "measure", label: t('measure_title' as any), icon: "straighten" },
  ];

  useEffect(() => {
    void (async () => {
      if (!projectId) return;
      try {
        const [defects, checklists, timeEntries, structure, projectPhotos, floorPlans, evidence, attRaw, diaryRaw, protoRaw, tasksRaw, cmpRaw] = await Promise.all([
          getDefects(projectId),
          getChecklistResults(projectId),
          getTimeEntries(projectId),
          getProjectStructure(projectId),
          getDirectProjectPhotos(projectId),
          getFloorPlans(projectId),
          getEvidence(projectId),
          AsyncStorage.getItem("attendance_records"),
          AsyncStorage.getItem("bautagebuch_entries"),
          AsyncStorage.getItem("protocols"),
          AsyncStorage.getItem("project-tasks"),
          AsyncStorage.getItem("photo-comparisons"),
        ]);
        const att = (attRaw ? JSON.parse(attRaw) : []).filter((r: any) => r.projectId === projectId);
        const diary = (diaryRaw ? JSON.parse(diaryRaw) : []).filter((r: any) => r.projectId === projectId);
        const proto = (protoRaw ? JSON.parse(protoRaw) : []).filter((p: any) => p.projectId === projectId);
        const tasks = (tasksRaw ? JSON.parse(tasksRaw) : []).filter((tk: any) => !tk.projectId || tk.projectId === projectId);
        const compares = (cmpRaw ? JSON.parse(cmpRaw) : []).filter((c: any) => c.projectId === projectId && c.afterUri);
        const measures = evidence.filter((e) => (e.measurements?.length || 0) > 0 && e.previewUri);
        const defectPhotos = defects.reduce((s, d) => s + ((d.photos || []).length), 0);
        setCounts({
          defects: defects.length,
          checklists: checklists.length,
          tasks: tasks.length,
          attendance: att.length,
          time: timeEntries.length,
          diary: diary.length,
          protocols: proto.length,
          rooms: structure.rooms.length,
          plans: floorPlans.length,
          compare: compares.length,
          measure: measures.length,
          photos: projectPhotos.length + defectPhotos,
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
          const prioRank: Record<string, number> = { hoch: 0, mittel: 1, niedrig: 2 };
          const sorted = [...defects].sort((a, b) => (prioRank[a.priority] ?? 3) - (prioRank[b.priority] ?? 3));
          const cards: PdfCard[] = [];
          for (const d of sorted) {
            const images: PdfImage[] = [];
            for (const uri of (d.photos || []).slice(0, 4)) {
              const data = await toDataUri(uri);
              if (data) images.push({ base64: data });
            }
            const ort = [d.floor, d.room].map((s) => (s || "").trim()).filter(Boolean).join(" · ") || d.location || "";
            cards.push({
              title: d.title || "-",
              badges: [
                { label: STATUS_LABEL[d.status] || d.status, color: STATUS_COLOR[d.status] },
                { label: (d.priority || "").charAt(0).toUpperCase() + (d.priority || "").slice(1), color: PRIO_COLOR[d.priority] },
              ],
              fields: [
                { label: "Ort", value: ort },
                { label: "Gewerk", value: d.gewerk || "" },
                { label: "Zuständig", value: d.assignee || "" },
                { label: "Frist", value: d.dueDate || "" },
              ],
              note: d.description || "",
              images,
            });
          }
          sections.push({
            title: `${t('index_tool_maengel' as any)} (${defects.length})`,
            content: "",
            cards,
            pageBreakBefore: true,
          });
        }
      }

      if (selected.checklists) {
        const results = await getChecklistResults(projectId);
        const defs = await getChecklists();
        if (results.length) {
          // One card per checklist result, listing every single Prüfpunkt with
          // its checked state (not just a completion percentage).
          const cards: PdfCard[] = results.map((r) => {
            const def = defs.find((c) => c.id === r.checklistId);
            const textById = new Map((def?.items || []).map((it) => [it.id, it.text]));
            const items = (def?.items?.length
              ? def.items.map((it) => {
                  const res = r.results.find((x) => x.itemId === it.id);
                  return { text: it.text, checked: !!res?.checked, note: res?.note };
                })
              : r.results.map((x) => ({ text: textById.get(x.itemId) || "Prüfpunkt", checked: !!x.checked, note: x.note })));
            const rate = getChecklistCompletionRate(r);
            return {
              title: r.checklistName || "-",
              badges: [{ label: `${rate}% erledigt`, color: rate >= 100 ? "#16A34A" : rate >= 50 ? "#B45309" : "#DC2626" }],
              fields: [
                { label: "Ort", value: r.location || "" },
                { label: "Datum", value: new Date(r.createdAt).toLocaleDateString("de-DE") },
              ],
              checklist: items,
            };
          });
          sections.push({
            title: `${t('checklist_title' as any)} (${results.length})`,
            content: "",
            cards,
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
          const settings = await getTimeTrackingSettings();
          const rate = parseFloat(String(settings.hourlyRate || "").replace(",", ".")) || 0;
          const euro = (seconds: number) => `${((seconds / 3600) * rate).toFixed(2).replace(".", ",")} €`;
          const totalCost = (total / 3600) * rate;
          let content = `**${t('project_export_total_hours' as any)}:** ${fmtDuration(total)}`;
          if (rate > 0) content += `  ·  **${t('project_export_total_cost' as any)}:** ${totalCost.toFixed(2).replace(".", ",")} € (${rate.toFixed(2).replace(".", ",")} €/h)`;
          sections.push({
            title: `${t('index_tool_zeiterfassung' as any)} (${entries.length})`,
            content,
            table: {
              headers: rate > 0 ? ["Datum", "Kategorie", "Dauer", "Kosten", "Notiz"] : ["Datum", "Kategorie", "Dauer", "Notiz"],
              rows: entries.map((e) => rate > 0
                ? [new Date(e.startTime).toLocaleDateString("de-DE"), e.category || "-", fmtDuration(e.duration || 0), euro(e.duration || 0), e.note || "-"]
                : [new Date(e.startTime).toLocaleDateString("de-DE"), e.category || "-", fmtDuration(e.duration || 0), e.note || "-"]),
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
        // Never export protocols that are still processing — only finished ones.
        const proto = (raw ? JSON.parse(raw) : []).filter((p: any) => p.projectId === projectId && p.status !== "processing");
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
          // Human-readable room status — never the raw code (nicht_begonnen, in_arbeit, ...).
          const roomStatusLabels: Record<string, string> = {
            nicht_begonnen: "Nicht begonnen",
            in_arbeit: "In Arbeit",
            fertig: "Fertig",
            abgenommen: "Abgenommen",
          };
          // Order by floor (Geschoss) then room name, so rooms added during a
          // Begehung don't appear jumbled (1.OG · Keller · 1.OG …).
          const floorRank = new Map(structure.floors.map((f, i) => [f.id, f.number ?? i]));
          const sortedRooms = [...structure.rooms].sort((a, b) => {
            const fa = floorRank.get(a.floorId) ?? 999, fb = floorRank.get(b.floorId) ?? 999;
            if (fa !== fb) return fa - fb;
            return (a.name || "").localeCompare(b.name || "", "de");
          });
          sections.push({
            title: `${t('index_tool_raeume' as any)} (${structure.rooms.length})`,
            content: "",
            table: {
              headers: ["Geschoss", "Raum", "Status"],
              rows: sortedRooms.map((r) => [floorName(r.floorId), r.name, roomStatusLabels[r.status as string] || r.status || "-"]),
            },
          });
        }
      }

      if (selected.plans) {
        const plans = await getFloorPlans(projectId);
        const images: PdfImage[] = [];
        for (const p of plans.slice(0, 12)) {
          try {
            const b64 = await FileSystem.readAsStringAsync(p.imageUri, { encoding: FileSystem.EncodingType.Base64 });
            const mime = p.imageUri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
            images.push({ base64: `data:${mime};base64,${b64}`, width: 96 });
          } catch {}
        }
        if (images.length) {
          sections.push({
            title: `${t('index_tool_grundriss' as any)} (${images.length})`,
            content: "",
            images,
          });
        }
      }

      if (selected.compare) {
        const raw = await AsyncStorage.getItem("photo-comparisons");
        const pairs = (raw ? JSON.parse(raw) : []).filter((c: any) => c.projectId === projectId && c.afterUri);
        if (pairs.length) {
          const cards: PdfCard[] = [];
          for (const p of pairs) {
            const images: PdfImage[] = [];
            const before = await toDataUri(p.beforeUri);
            if (before) images.push({ base64: before, caption: "Vorher" });
            const after = p.afterUri ? await toDataUri(p.afterUri) : null;
            if (after) images.push({ base64: after, caption: "Nachher" });
            cards.push({
              title: p.label || t('vergleich' as any),
              fields: [
                { label: "Raum", value: p.room || "" },
                { label: "Gewerk", value: p.trade || "" },
              ],
              note: p.description || "",
              images,
            });
          }
          sections.push({ title: `${t('vergleich' as any)} (${pairs.length})`, content: "", cards });
        }
      }

      if (selected.measure) {
        const evidence = await getEvidence(projectId);
        const withM = evidence.filter((e) => (e.measurements?.length || 0) > 0 && e.previewUri);
        if (withM.length) {
          const cards: PdfCard[] = [];
          for (const e of withM) {
            const images: PdfImage[] = [];
            const data = e.previewUri ? await toDataUri(e.previewUri) : null;
            if (data) images.push({ base64: data });
            const mText = (e.measurements || []).map((m, i) => `M${i + 1}: ${String(m.value).replace(".", ",")} ${m.unit}`).join("   ·   ");
            cards.push({
              title: e.findingText || t('measure_title' as any),
              fields: [{ label: "Ort", value: [e.floor, e.room].map((s) => (s || "").trim()).filter(Boolean).join(" · ") }],
              note: mText,
              images,
            });
          }
          sections.push({ title: `${t('measure_title' as any)} (${withM.length})`, content: "", cards });
        }
      }

      if (selected.photos) {
        const direct = await getDirectProjectPhotos(projectId);
        const defects = await getDefects(projectId);
        const uris = [
          ...direct.map((p) => p.uri),
          ...defects.flatMap((d) => d.photos || []),
        ].filter(Boolean).slice(0, MAX_EXPORT_PHOTOS);
        const images: PdfImage[] = [];
        for (const uri of uris) {
          try {
            const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            const mime = uri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
            images.push({ base64: `data:${mime};base64,${b64}`, width: 31 });
          } catch {}
        }
        if (images.length) {
          sections.push({
            title: `${t('project_export_photos' as any)} (${images.length})`,
            content: uris.length >= MAX_EXPORT_PHOTOS ? t('project_export_photos_capped' as any).replace("{n}", String(MAX_EXPORT_PHOTOS)) : "",
            images,
          });
        }
      }

      if (sections.length === 0) {
        Alert.alert(t('project_export_title' as any), t('project_export_empty' as any));
        return;
      }

      // Optional project image → hero on the PDF cover.
      let heroDataUri: string | undefined;
      try {
        const projRaw = await AsyncStorage.getItem("projects");
        const proj = (projRaw ? JSON.parse(projRaw) : []).find((p: any) => p.id === projectId);
        if (proj?.imageUri) {
          const b64 = await FileSystem.readAsStringAsync(proj.imageUri, { encoding: FileSystem.EncodingType.Base64 });
          const mime = String(proj.imageUri).toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
          heroDataUri = `data:${mime};base64,${b64}`;
        }
      } catch {}

      const exportedUri = await generateAndSharePdf({
        title: t('project_export_title' as any),
        subtitle: projectName || undefined,
        reportType: t('project_export_title' as any),
        datum: new Date().toLocaleDateString("de-DE"),
        projekt: projectName || undefined,
        sections,
        includeTableOfContents: sections.length > 3,
        accentColor: "#1E3A5F",
        heroDataUri,
      });
      if (exportedUri) {
        try {
          const { addExportEntry } = await import("@/lib/pdf-export-history");
          await addExportEntry({ filename: exportedUri.split("/").pop() || "projekt-export.pdf", protocolTitle: t('project_export_title' as any), templateName: t('project_export_title' as any), projectName: projectName || "", recipients: [], ccRecipients: [], method: "share" });
        } catch {}
      }
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

        {/* Photos — optional, heavy */}
        <Pressable
          onPress={() => toggle("photos")}
          style={[styles.row, { backgroundColor: colors.surface, borderColor: selected.photos ? "#F59E0B" : colors.border, marginTop: 6 }]}
        >
          <MaterialIcons name={selected.photos ? "check-box" : "check-box-outline-blank"} size={22} color={selected.photos ? "#F59E0B" : colors.muted} />
          <MaterialIcons name="photo-library" size={20} color={colors.muted} />
          <Text style={[styles.rowLabel, { color: colors.foreground }]}>{t('project_export_photos' as any)}</Text>
          <Text style={[styles.rowCount, { color: colors.muted }]}>{counts.photos ?? 0}</Text>
        </Pressable>
        <View style={styles.warnRow}>
          <MaterialIcons name="info-outline" size={14} color="#F59E0B" />
          <Text style={styles.warnText}>{t('project_export_photos_warning' as any).replace("{n}", String(MAX_EXPORT_PHOTOS))}</Text>
        </View>

        <Pressable
          onPress={handleExport}
          disabled={busy || !anySelected}
          style={({ pressed }) => [styles.exportBtn, { backgroundColor: colors.primary, opacity: busy || !anySelected ? 0.4 : pressed ? 0.85 : 1 }]}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="picture-as-pdf" size={20} color="#fff" />}
          <Text style={styles.exportBtnText}>{t('project_export_button' as any)}</Text>
        </Pressable>
      </ScrollView>
      <BusyOverlay visible={busy} label={t('pdf_wird_erstellt' as any)} />
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
  warnRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 4, paddingHorizontal: 4 },
  warnText: { flex: 1, fontSize: 12, color: "#F59E0B", lineHeight: 16 },
  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 12, marginTop: 18 },
  exportBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
