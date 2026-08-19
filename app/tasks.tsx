import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
 Platform } from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { TradePicker } from "@/components/trade-picker";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { exportTasksAsCSV } from "@/lib/csv-export";
import { useTranslation } from "@/lib/language-provider";
import { timelineEngine } from "@/lib/timeline-engine";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { ExportDetailsBox, EMPTY_EXPORT_DETAILS, type ExportDetails } from "@/components/export-details-box";
import { buildExportDetailsHeaderHtml } from "@/lib/pdf-meta-header";
import { BusyOverlay } from "@/components/busy-overlay";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { trpc } from "@/lib/trpc";
import * as FileSystem from "expo-file-system/legacy";
import { extractDefectFromText } from "@/lib/defect-extraction";
import { GEWERKE } from "@/lib/defect-pdf-export";

type TodoItem = {
  task: string;
  assignee: string;
  priority: "hoch" | "mittel" | "niedrig";
  deadline: string;
  done: boolean;
};

type ProtocolTodo = TodoItem & {
  protocolId: string;
  protocolTitle: string;
  protocolDate: string;
  todoIndex: number;
  source?: "protocol" | "project-task";
  taskId?: string;
};

type FilterType = "all" | "open" | "done";

export default function TasksScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [allTodos, setAllTodos] = useState<ProtocolTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("open");
  const [csvEnabled, setCsvEnabled] = useState(true);
  const [exportDetails, setExportDetails] = useState<ExportDetails>(EMPTY_EXPORT_DETAILS);
  const { projectId, projectName } = useLocalSearchParams<{ projectId?: string; projectName?: string }>();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newPriority, setNewPriority] = useState<"hoch" | "mittel" | "niedrig">("mittel");
  const [pdfBusy, setPdfBusy] = useState(false);

  // Voice-create: speak a task, AI pre-fills the form (still editable).
  const aiRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [showVoiceCreate, setShowVoiceCreate] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceCreateBusy, setVoiceCreateBusy] = useState<string | null>(null);
  const uploadAudioMutation = trpc.upload.audio.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation();

  const beginVoiceRecording = async () => {
    if (Platform.OS === "web") {
      Alert.alert(t('defects_voice_title' as any), t('defects_web_aufnahme_nicht_verfuegbar' as any));
      return;
    }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('defects_mikrofonzugriff_titel' as any), t('defects_mikrofonzugriff_msg' as any));
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await aiRecorder.prepareToRecordAsync();
      aiRecorder.record();
      setVoiceRecording(true);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), e?.message || t('defects_voice_failed' as any));
    }
  };

  const stopVoiceCreateAndProcess = async () => {
    setVoiceRecording(false);
    setVoiceCreateBusy(t('defects_voice_transcribing' as any));
    try {
      try { await aiRecorder.stop(); } catch {}
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = aiRecorder.uri || aiRecorder.getStatus().url || null;
      if (!uri) throw new Error(t('defects_voice_empty' as any));
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const uploaded = await uploadAudioMutation.mutateAsync({ base64, mimeType: "audio/m4a", filename: `task-${Date.now()}.m4a` });
      const transcribed = await transcribeMutation.mutateAsync({ audioUrl: uploaded.url, language: "de" });
      const text = (transcribed.text || "").trim();
      if (!text) throw new Error(t('defects_voice_empty' as any));
      const ex = extractDefectFromText(text);
      if (ex.title || ex.description) setNewTitle(ex.title || ex.description || "");
      if (ex.priority) setNewPriority(ex.priority);
      if (ex.gewerk) {
        const g = ex.gewerk.toLowerCase();
        const match = GEWERKE.find((x) => x.toLowerCase() === g || x.toLowerCase().includes(g) || g.includes(x.toLowerCase()));
        if (match) setNewTrade(match);
      }
      setVoiceCreateBusy(null);
      setShowVoiceCreate(false);
      setShowCreate(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setVoiceCreateBusy(null);
      Alert.alert(t('alert_fehler'), e?.message || t('defects_voice_failed' as any));
    }
  };

  const cancelVoiceCreate = async () => {
    try { if (voiceRecording) await aiRecorder.stop(); } catch {}
    try { await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }); } catch {}
    setVoiceRecording(false);
    setVoiceCreateBusy(null);
    setShowVoiceCreate(false);
  };

  const saveNewTask = async () => {
    if (!newTitle.trim()) return;
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      const tasks = raw ? JSON.parse(raw) : [];
      tasks.push({
        id: `task_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
        projectId: projectId || undefined,
        title: newTitle.trim(),
        trade: newTrade.trim() || undefined,
        priority: newPriority,
        status: "offen",
        createdAt: new Date().toISOString(),
      });
      await AsyncStorage.setItem("project-tasks", JSON.stringify(tasks));
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreate(false);
      setNewTitle(""); setNewTrade(""); setNewPriority("mittel");
      loadAllTodos();
    } catch {
      Alert.alert(t('alert_fehler'));
    }
  };

  async function loadAllTodos() {
    try {
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );

      const todos: ProtocolTodo[] = [];
      for (const protocol of protocols) {
        if (protocol.todos && protocol.todos.length > 0) {
          protocol.todos.forEach((todo: TodoItem, index: number) => {
            todos.push({
              ...todo,
              protocolId: protocol.id,
              protocolTitle: protocol.templateName || t('protokoll'),
              protocolDate: protocol.createdAt,
              todoIndex: index,
              source: "protocol",
            });
          });
        }
      }

      // Auch eigenstaendige Projekt-Tasks laden (z. B. aus KI-Analyse "Add as task")
      try {
        const projectTasks = JSON.parse(
          (await AsyncStorage.getItem("project-tasks")) || "[]"
        );
        for (const pt of projectTasks) {
          todos.push({
            task: pt.title || pt.task || "",
            assignee: pt.trade || pt.assignee || "",
            priority: (pt.priority as any) || "mittel",
            deadline: pt.deadline || "",
            done: pt.status === "erledigt" || pt.done === true,
            protocolId: pt.id,
            protocolTitle: "KI-Analyse",
            protocolDate: pt.createdAt || new Date().toISOString(),
            todoIndex: 0,
            source: "project-task",
            taskId: pt.id,
          });
        }
      } catch {}

      // Sort: open first, then by priority (hoch > mittel > niedrig)
      const priorityOrder = { hoch: 0, mittel: 1, niedrig: 2 };
      todos.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
      });

      setAllTodos(todos);
    } catch (error) {
      console.error("Error loading todos:", error);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadAllTodos();
      (async () => {
        const { isFeatureEnabled } = require("@/lib/feature-toggles");
        setCsvEnabled(await isFeatureEnabled("csvExport"));
      })();
    }, [])
  );

  const toggleTodo = async (item: ProtocolTodo) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Eigenstaendige Projekt-Tasks im eigenen Speicher abhaken
    if (item.source === "project-task") {
      try {
        const tasks = JSON.parse(
          (await AsyncStorage.getItem("project-tasks")) || "[]"
        );
        const idx = tasks.findIndex((x: any) => x.id === item.taskId);
        if (idx !== -1) {
          const nowDone = !item.done;
          tasks[idx].status = nowDone ? "erledigt" : "offen";
          tasks[idx].done = nowDone;
          await AsyncStorage.setItem("project-tasks", JSON.stringify(tasks));
        }
      } catch (error) {
        console.error("Error toggling project task:", error);
      }
      setAllTodos((prev) =>
        prev.map((t) =>
          t.source === "project-task" && t.taskId === item.taskId
            ? { ...t, done: !t.done }
            : t
        )
      );
      return;
    }

    try {
      const protocols = JSON.parse(
        (await AsyncStorage.getItem("protocols")) || "[]"
      );
      const protocolIdx = protocols.findIndex(
        (p: any) => p.id === item.protocolId
      );
      if (protocolIdx !== -1 && protocols[protocolIdx].todos) {
        protocols[protocolIdx].todos[item.todoIndex].done = !item.done;
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));

        // Timeline event
        try {
          const projectId = protocols[protocolIdx].projectId || "default";
          await timelineEngine.emit({
            projectId,
            eventType: !item.done ? "task_completed" : "task_updated",
            source: "user",
            title: !item.done ? t('tasks_event_aufgabe_erledigt' as any) : t('tasks_event_aufgabe_geoeffnet' as any),
            description: item.task,
            entityId: item.protocolId,
            entityType: "task",
            tags: ["task", !item.done ? "completed" : "reopened"],
          });
        } catch {}
      }

      // Update local state
      setAllTodos((prev) =>
        prev.map((t) =>
          t.protocolId === item.protocolId && t.todoIndex === item.todoIndex
            ? { ...t, done: !t.done }
            : t
        )
      );
    } catch (error) {
      console.error("Error toggling todo:", error);
    }
  };

  const filteredTodos = allTodos.filter((t) => {
    if (filter === "open") return !t.done;
    if (filter === "done") return t.done;
    return true;
  });

  const openCount = allTodos.filter((t) => !t.done).length;
  const doneCount = allTodos.filter((t) => t.done).length;

  const exportPdf = async () => {
    if (pdfBusy) return;
    // Respect the currently active filter (open / done / all)
    if (filteredTodos.length === 0) {
      Alert.alert(t('alert_fehler'), t('tasks_keine_aufgaben' as any));
      return;
    }

    const esc = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const priorityLabel = (p: ProtocolTodo["priority"]) =>
      p === "hoch"
        ? t('tasks_prioritaet_hoch' as any)
        : p === "niedrig"
        ? t('prioritaet_niedrig')
        : t('prioritaet_mittel');

    setPdfBusy(true);
    try {
      const rows = filteredTodos
        .map((item) => {
          const assignee =
            item.assignee && item.assignee !== t('nicht_zugewiesen')
              ? item.assignee
              : "—";
          const deadline =
            item.deadline && item.deadline !== t('frist_offen')
              ? item.deadline
              : "—";
          const status = item.done ? t('status_erledigt') : t('status_offen');
          return `<tr>
            <td>${esc(item.task)}</td>
            <td>${esc(assignee)}</td>
            <td>${esc(priorityLabel(item.priority))}</td>
            <td>${esc(deadline)}</td>
            <td>${esc(status)}</td>
          </tr>`;
        })
        .join("");

      const generated = new Date().toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const metaHeader = buildExportDetailsHeaderHtml(exportDetails, {
        bauvorhaben: t('export_bauvorhaben'), adresse: t('export_adresse'),
        etage: t('export_etage'), raum: t('export_raum'), notizen: t('export_notizen'),
      });

      const html = `<html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Arial,sans-serif; padding:24px; color:#1F2937;">
        <h1 style="font-size:22px; margin:0 0 4px;">${esc(t('tasks_aufgaben' as any))}</h1>
        ${metaHeader}
        <p style="font-size:12px; color:#6B7280; margin:0 0 20px;">${esc(generated)}</p>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="background:#F3F4F6; text-align:left;">
              <th style="padding:8px; border:1px solid #E5E7EB;">Aufgabe</th>
              <th style="padding:8px; border:1px solid #E5E7EB;">Zuständig</th>
              <th style="padding:8px; border:1px solid #E5E7EB;">Priorität</th>
              <th style="padding:8px; border:1px solid #E5E7EB;">Fällig</th>
              <th style="padding:8px; border:1px solid #E5E7EB;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>`.replace(
        /<td>/g,
        '<td style="padding:8px; border:1px solid #E5E7EB;">'
      );

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      }
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), e?.message || t('pdf_teilen'));
    } finally {
      setPdfBusy(false);
    }
  };

  const renderTodo = ({ item }: { item: ProtocolTodo }) => {
    const date = new Date(item.protocolDate).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
    });

    return (
      <Pressable
        onPress={() => toggleTodo(item)}
        onLongPress={() =>
          router.push(`/protocol-detail?id=${item.protocolId}` as any)
        }
        style={({ pressed }) => [
          styles.todoItem,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: item.done ? colors.primary : colors.muted,
              backgroundColor: item.done ? colors.primary : "transparent",
            },
          ]}
        >
          {item.done && (
            <MaterialIcons name="check" size={14} color="#FFFFFF" />
          )}
        </View>
        <View style={styles.todoContent}>
          <Text
            style={[
              styles.todoTask,
              {
                color: colors.foreground,
                textDecorationLine: item.done ? "line-through" : "none",
                opacity: item.done ? 0.6 : 1,
              },
            ]}
          >
            {item.task}
          </Text>
          <View style={styles.todoMeta}>
            {item.assignee !== t('nicht_zugewiesen') && (
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="person" size={11} color={colors.muted} />
                <Text style={[styles.badgeText, { color: colors.muted }]}>
                  {item.assignee}
                </Text>
              </View>
            )}
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    item.priority === "hoch"
                      ? "#E5393515"
                      : item.priority === "mittel"
                      ? "#FF980015"
                      : colors.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color:
                      item.priority === "hoch"
                        ? "#E53935"
                        : item.priority === "mittel"
                        ? "#FF9800"
                        : colors.muted,
                  },
                ]}
              >
                {item.priority === "hoch"
                  ? t('tasks_prioritaet_hoch' as any)
                  : item.priority === "mittel"
                  ? t('prioritaet_mittel')
                  : t('prioritaet_niedrig')}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="description" size={11} color={colors.muted} />
              <Text style={[styles.badgeText, { color: colors.muted }]}>
                {item.protocolTitle} ({date})
              </Text>
            </View>
            {item.deadline !== t('frist_offen') && (
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="schedule" size={11} color={colors.muted} />
                <Text style={[styles.badgeText, { color: colors.muted }]}>
                  {item.deadline}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t('tasks_aufgaben' as any)}
        </Text>
        {csvEnabled && <Pressable onPress={exportTasksAsCSV} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <MaterialIcons name="file-download" size={22} color={colors.primary} />
        </Pressable>}
        <Pressable
          onPress={exportPdf}
          accessibilityLabel={t('pdf_teilen')}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="picture-as-pdf" size={22} color={colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => setShowVoiceCreate(true)}
          accessibilityLabel={t('tasks_voice_title' as any)}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="mic" size={23} color={colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => setShowCreate(true)}
          accessibilityLabel={t('tasks_add' as any)}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="add" size={26} color={colors.primary} />
        </Pressable>
      </View>

      {/* Voice-create task */}
      <Modal visible={showVoiceCreate} transparent animationType="slide" onRequestClose={cancelVoiceCreate}>
        <View style={styles.voiceOverlay}>
          <View style={[styles.voiceSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('tasks_voice_title' as any)}</Text>
              <Pressable onPress={cancelVoiceCreate} hitSlop={8}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            {voiceCreateBusy ? (
              <View style={{ alignItems: "center", paddingVertical: 34, gap: 12 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.muted }}>{voiceCreateBusy}</Text>
              </View>
            ) : (
              <View>
                <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 10 }}>{t('defects_voice_hint' as any)}</Text>
                <View style={[styles.voiceGuide, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  {[
                    t('defects_voice_g_title' as any), t('defects_voice_g_gewerk' as any), t('defects_voice_g_prio' as any),
                  ].map((g, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                      <MaterialIcons name="chevron-right" size={16} color={colors.primary} style={{ marginTop: 1 }} />
                      <Text style={{ flex: 1, color: colors.foreground, fontSize: 13 }}>{g}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ color: colors.muted, fontSize: 12, fontStyle: "italic", marginTop: 12 }}>{t('tasks_voice_example' as any)}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>{t('defects_voice_editable' as any)}</Text>
                {voiceRecording && <Text style={{ textAlign: "center", color: "#DC2626", marginTop: 12, fontWeight: "700" }}>● {t('defects_voice_recording' as any)}</Text>}
                {!voiceRecording ? (
                  <Pressable onPress={beginVoiceRecording} style={[styles.voiceRecBtn, { backgroundColor: colors.primary }]}>
                    <MaterialIcons name="mic" size={22} color="#fff" />
                    <Text style={styles.voiceRecText}>{t('defects_voice_start' as any)}</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={stopVoiceCreateAndProcess} style={[styles.voiceRecBtn, { backgroundColor: "#DC2626" }]}>
                    <MaterialIcons name="stop" size={22} color="#fff" />
                    <Text style={styles.voiceRecText}>{t('defects_voice_stop' as any)}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.primary }]}>
            {openCount}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>{t('checklist_incomplete')}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.success }]}>
            {doneCount}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>
            {t('tasks_erledigt' as any)}
          </Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.foreground }]}>
            {allTodos.length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>{t('gesamt')}</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[styles.filterRow, { borderColor: colors.border }]}>
        {(["open", "all", "done"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterTab,
              filter === f && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? colors.primary : colors.muted },
              ]}
            >
              {f === "open" ? t('status_offen') : f === "done" ? t('status_erledigt') : t('filter_alle')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Todo list */}
      {filteredTodos.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons
            name="check-circle-outline"
            size={48}
            color={colors.muted}
          />
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {filter === "open"
              ? t('tasks_keine_offenen' as any)
              : filter === "done"
              ? t('tasks_keine_erledigten' as any)
              : t('tasks_keine_aufgaben' as any)}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.muted }]}>
            {t('tasks_extrahiert_hinweis' as any)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTodos}
          renderItem={renderTodo}
          keyExtractor={(item, index) =>
            `${item.protocolId}-${item.todoIndex}-${index}`
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <ExportDetailsBox value={exportDetails} onChange={setExportDetails} />
          }
        />
      )}

      {/* Create task */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.createOverlay}>
          <View style={[styles.createSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('tasks_add' as any)}</Text>
              <Pressable onPress={() => setShowCreate(false)} hitSlop={8}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={[styles.createLabel, { color: colors.muted }]}>{t('titel' as any)}</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={t('tasks_title_placeholder' as any)}
              placeholderTextColor={colors.muted}
              autoFocus
              style={[styles.createInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <Text style={[styles.createLabel, { color: colors.muted, marginTop: 12 }]}>{t('gewerk' as any)}</Text>
            <TradePicker value={newTrade} onChange={setNewTrade} placeholder={t('tasks_trade_placeholder' as any)} accessibilityLabel={t('gewerk' as any)} />

            <Text style={[styles.createLabel, { color: colors.muted, marginTop: 12 }]}>{t('prioritaet' as any)}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["niedrig", "mittel", "hoch"] as const).map((p) => {
                const active = newPriority === p;
                const col = p === "hoch" ? "#DC2626" : p === "mittel" ? "#F59E0B" : "#16A34A";
                return (
                  <Pressable key={p} onPress={() => setNewPriority(p)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center", borderColor: active ? col : colors.border, backgroundColor: active ? col + "18" : "transparent" }}>
                    <Text style={{ fontSize: 13, fontWeight: active ? "700" : "600", color: active ? col : colors.muted }}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable onPress={() => setShowCreate(false)} style={[styles.createBtn, { borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: colors.muted, fontWeight: "700" }}>{t('btn_abbrechen')}</Text>
              </Pressable>
              <Pressable onPress={saveNewTask} style={[styles.createBtn, { flex: 2, backgroundColor: colors.primary }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <BusyOverlay visible={pdfBusy} label={t('pdf_wird_erstellt' as any)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  createOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  createSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 24, paddingBottom: 40 },
  createLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  createInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  createBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: "center" },
  voiceOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  voiceSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, paddingBottom: 34 },
  voiceGuide: { borderWidth: 1, borderRadius: 10, padding: 14 },
  voiceRecBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 52, borderRadius: 12, marginTop: 14 },
  voiceRecText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 0,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  filterTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  todoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  todoContent: {
    flex: 1,
    gap: 6,
  },
  todoTask: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  todoMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 0,
    gap: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
  },
});
