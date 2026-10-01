import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  SectionList,
  ScrollView,
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
import { DateOnlyPicker } from "@/components/date-only-picker";
import { formatDateTime } from "@/lib/date-only";
import { AssigneeInput } from "@/components/assignee-input";
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
import { ContactPickerModal } from "@/components/contact-picker-modal";
import { buildExportDetailsHeaderHtml } from "@/lib/pdf-meta-header";
import { buildPremiumHtml, resolveBrandingLogo, escHtml } from "@/lib/pdf-premium";
import { getPdfBranding } from "@/lib/pdf-branding-store";
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
  source?: "protocol" | "project-task" | "defect";
  taskId?: string;
  status?: "offen" | "in_arbeit" | "erledigt";
  floor?: string;
  room?: string;
  responsible?: string;
  projectId?: string;
  projectLabel?: string;
};

type FilterType = "all" | "open" | "in_progress" | "done";

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
  const [newDeadline, setNewDeadline] = useState("");
  const [newFloor, setNewFloor] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [newStatus, setNewStatus] = useState<"offen" | "in_arbeit" | "erledigt">("offen");
  const [newAssignee, setNewAssignee] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  // When editing a task that lives inside a protocol's todos[] (not a standalone task).
  const [editingProtocol, setEditingProtocol] = useState<{ protocolId: string; todoIndex: number } | null>(null);

  // Opened from the Aufgaben tab (no projectId param): default to the current
  // Baustelle so you don't see every project's tasks at once.
  useEffect(() => {
    if (projectId) return;
    (async () => {
      try {
        const last = await AsyncStorage.getItem("last-selected-project-id");
        if (last) setSelectedProjectId((cur) => cur ?? last);
      } catch {}
    })();
  }, [projectId]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId || null);
  // Share flow (one "Teilen" button)
  const [showShare, setShowShare] = useState(false);
  const [shareFormat, setShareFormat] = useState<"pdf" | "csv">("pdf");
  const [shareExcluded, setShareExcluded] = useState<Set<string>>(new Set());
  const [showContacts, setShowContacts] = useState(false);

  const taskKey = (it: ProtocolTodo) => `${it.source}-${it.taskId || it.protocolId}-${it.todoIndex}`;

  const openShareSheet = () => {
    // Prefill project data from the selected project so it's already saved.
    const proj = projects.find((p) => p.id === selectedProjectId);
    if (proj) setExportDetails((prev) => ({ ...prev, bauvorhaben: prev.bauvorhaben || proj.name }));
    setShareExcluded(new Set());
    setShowShare(true);
  };

  const getShareTasks = () => filteredTodos.filter((it) => !shareExcluded.has(taskKey(it)));

  const shareCsvSelected = async () => {
    const sel = getShareTasks();
    if (sel.length === 0) { Alert.alert(t('alert_fehler'), t('tasks_keine_aufgaben' as any)); return; }
    setShowShare(false);
    await exportTasksAsCSV(sel.map((it) => ({ task: it.task, done: it.done, status: it.status, deadline: it.deadline, priority: it.priority, floor: it.floor, room: it.room, source: it.protocolTitle })));
  };

  const shareSelected = async () => {
    const sel = getShareTasks();
    if (sel.length === 0) { Alert.alert(t('alert_fehler'), t('tasks_keine_aufgaben' as any)); return; }
    setShowShare(false);
    if (shareFormat === "csv") await shareCsvSelected();
    else await exportPdf(sel);
  };

  const emailSelected = async (emails: string[]) => {
    setShowContacts(false);
    const sel = getShareTasks();
    if (sel.length === 0 || emails.length === 0) return;
    setShowShare(false);
    try {
      setPdfBusy(true);
      const html = await buildTasksPdfHtml(sel);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const MailComposer = await import("expo-mail-composer");
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({
          recipients: emails,
          subject: `${t('tasks_aufgaben' as any)}${exportDetails.bauvorhaben ? " – " + exportDetails.bauvorhaben : ""}`,
          body: t('tasks_email_body' as any),
          attachments: [uri],
        });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), e?.message || "");
    } finally {
      setPdfBusy(false);
    }
  };

  const resetTaskForm = () => {
    setNewTitle(""); setNewTrade(""); setNewPriority("mittel");
    setNewDeadline(""); setNewFloor(""); setNewRoom(""); setNewStatus("offen"); setNewAssignee("");
    setEditingTaskId(null);
    setEditingProtocol(null);
  };

  // Row tap: open the project task for editing, or the source protocol.
  const openTask = (item: ProtocolTodo) => {
    if (item.source === "project-task") {
      setEditingTaskId(item.taskId || null);
      setNewTitle(item.task);
      setNewTrade(item.assignee && item.assignee !== t('nicht_zugewiesen') ? item.assignee : "");
      setNewPriority(item.priority);
      setNewDeadline(item.deadline && item.deadline !== t('frist_offen') ? item.deadline : "");
      setNewFloor(item.floor || "");
      setNewRoom(item.room || "");
      setNewStatus(item.status || (item.done ? "erledigt" : "offen"));
      setNewAssignee((item as any).responsible || "");
      setEditingProtocol(null);
      setShowCreate(true);
    } else if (item.source === "defect") {
      // Open exactly this Mangel, not the whole defect list.
      router.push(`/defects?projectId=${item.projectId || ""}&defectId=${item.taskId || item.protocolId}` as any);
    } else {
      // Protocol todo: edit it inline instead of jumping into the protocol.
      setEditingTaskId(null);
      setEditingProtocol({ protocolId: item.protocolId, todoIndex: item.todoIndex ?? 0 });
      setNewTitle(item.task);
      setNewTrade(item.assignee && item.assignee !== t('nicht_zugewiesen') ? item.assignee : "");
      setNewPriority(item.priority);
      setNewDeadline(item.deadline && item.deadline !== t('frist_offen') ? item.deadline : "");
      setNewFloor(item.floor || "");
      setNewRoom(item.room || "");
      setNewStatus(item.status || (item.done ? "erledigt" : "offen"));
      setNewAssignee((item as any).responsible || "");
      setShowCreate(true);
    }
  };

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
      if (ex.dueDate) setNewDeadline(ex.dueDate);
      if (ex.floor) setNewFloor(ex.floor);
      if (ex.room) setNewRoom(ex.room);
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
      // Editing a task that lives inside a protocol's todos[].
      if (editingProtocol) {
        const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
        const pIdx = protocols.findIndex((p: any) => p.id === editingProtocol.protocolId);
        if (pIdx !== -1 && protocols[pIdx].todos?.[editingProtocol.todoIndex]) {
          protocols[pIdx].todos[editingProtocol.todoIndex] = {
            ...protocols[pIdx].todos[editingProtocol.todoIndex],
            task: newTitle.trim(),
            assignee: newAssignee.trim() || newTrade.trim() || protocols[pIdx].todos[editingProtocol.todoIndex].assignee,
            priority: newPriority,
            deadline: newDeadline.trim() || undefined,
            dueDate: newDeadline.trim() || undefined,
            status: newStatus,
            done: newStatus === "erledigt",
            floor: newFloor.trim() || undefined,
            room: newRoom.trim() || undefined,
          };
          await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
        }
        if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowCreate(false);
        resetTaskForm();
        loadAllTodos();
        return;
      }
      const raw = await AsyncStorage.getItem("project-tasks");
      const tasks = raw ? JSON.parse(raw) : [];
      const fields = {
        title: newTitle.trim(),
        trade: newTrade.trim() || undefined,
        priority: newPriority,
        deadline: newDeadline.trim() || undefined,
        floor: newFloor.trim() || undefined,
        room: newRoom.trim() || undefined,
        responsible: newAssignee.trim() || undefined,
        status: newStatus,
        done: newStatus === "erledigt",
      };
      if (editingTaskId) {
        const idx = tasks.findIndex((x: any) => x.id === editingTaskId);
        if (idx !== -1) tasks[idx] = { ...tasks[idx], ...fields };
      } else {
        tasks.push({
          id: `task_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
          projectId: projectId || selectedProjectId || undefined,
          createdAt: new Date().toISOString(),
          ...fields,
        });
      }
      await AsyncStorage.setItem("project-tasks", JSON.stringify(tasks));
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreate(false);
      resetTaskForm();
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

      // Project id → name, so every task can show which project it belongs to.
      const projectsList = JSON.parse((await AsyncStorage.getItem("projects")) || "[]");
      const projectName = (pid?: string) => projectsList.find((p: any) => p.id === pid)?.name || undefined;
      setProjects(projectsList.filter((p: any) => !p.archived).map((p: any) => ({ id: p.id, name: p.name })));

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
              projectId: protocol.projectId,
              projectLabel: protocol.projectName || projectName(protocol.projectId),
            });
          });
        }
      }

      // Mängel aus allen Projekten als Aufgaben mit aufnehmen (im richtigen Projekt).
      try {
        const { getDefects } = await import("@/lib/defect-store");
        const defects = await getDefects();
        const doneStatus = ["erledigt", "geschlossen"];
        const inArbeitStatus = ["zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"];
        for (const d of defects) {
          const done = doneStatus.includes(d.status);
          todos.push({
            task: d.title,
            assignee: d.gewerk || "",
            priority: (d.priority as any) || "mittel",
            deadline: d.dueDate || "",
            done,
            protocolId: d.id,
            protocolTitle: t('maengel'),
            protocolDate: (d as any).createdAt || new Date().toISOString(),
            todoIndex: 0,
            source: "defect",
            taskId: d.id,
            status: done ? "erledigt" : inArbeitStatus.includes(d.status) ? "in_arbeit" : "offen",
            floor: d.floor || undefined,
            room: d.room || d.location || undefined,
            projectId: d.projectId,
            projectLabel: projectName(d.projectId),
          });
        }
      } catch {}

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
            protocolTitle: t('tasks_source_manual' as any),
            protocolDate: pt.createdAt || new Date().toISOString(),
            todoIndex: 0,
            source: "project-task",
            taskId: pt.id,
            status: pt.status || (pt.done ? "erledigt" : "offen"),
            floor: pt.floor || undefined,
            room: pt.room || undefined,
            responsible: pt.responsible || undefined,
            projectId: pt.projectId || undefined,
            projectLabel: projectName(pt.projectId),
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

    // Mängel: Status im Defect-Store umschalten (offen ↔ erledigt)
    if (item.source === "defect") {
      try {
        const { updateDefectStatus } = await import("@/lib/defect-store");
        await updateDefectStatus(item.taskId!, item.done ? "offen" : "erledigt");
      } catch (error) {
        console.error("Error toggling defect:", error);
      }
      setAllTodos((prev) =>
        prev.map((tt) => (tt.source === "defect" && tt.taskId === item.taskId ? { ...tt, done: !tt.done, status: !tt.done ? "erledigt" : "offen" } : tt))
      );
      return;
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

  const filteredTodos = allTodos.filter((tt) => {
    if (selectedProjectId && tt.projectId !== selectedProjectId) return false;
    if (filter === "open") return !tt.done && tt.status !== "in_arbeit";
    if (filter === "in_progress") return !tt.done && tt.status === "in_arbeit";
    if (filter === "done") return tt.done;
    return true;
  });

  // Group by Geschoss/Raum ("wie im Rundgang"); tasks without a room go last.
  const sections = useMemo(() => {
    const groups = new Map<string, ProtocolTodo[]>();
    for (const tt of filteredTodos) {
      const key = [tt.floor, tt.room].filter(Boolean).join(" · ");
      const g = groups.get(key) || [];
      g.push(tt);
      groups.set(key, g);
    }
    const entries = Array.from(groups.entries());
    entries.sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])));
    return entries.map(([key, data]) => ({ title: key || t('tasks_no_room' as any), data }));
  }, [filteredTodos]);

  // Count only tasks in the selected project scope.
  const scopedTodos = allTodos.filter((tt) => !selectedProjectId || tt.projectId === selectedProjectId);
  const openCount = scopedTodos.filter((tt) => !tt.done).length;
  const doneCount = scopedTodos.filter((tt) => tt.done).length;

  const buildTasksPdfHtml = async (exportTasks: ProtocolTodo[]): Promise<string> => {
    const priorityLabel = (p: ProtocolTodo["priority"]) =>
      p === "hoch" ? t('tasks_prioritaet_hoch' as any) : p === "niedrig" ? t('prioritaet_niedrig') : t('prioritaet_mittel');
    const pill = (text: string, color: string) =>
      `<span class="badge" style="background:${color}1A;color:${color};border:1px solid ${color}44;">${escHtml(text)}</span>`;
    const prioColor = (p: ProtocolTodo["priority"]) => (p === "hoch" ? "#B91C1C" : p === "niedrig" ? "#6B7280" : "#B45309");
    const rows = exportTasks
      .map((item) => {
        const assignee = item.assignee && item.assignee !== t('nicht_zugewiesen') ? item.assignee : "—";
        const deadline = item.deadline && item.deadline !== t('frist_offen') ? item.deadline : "—";
        const ort = [item.floor, item.room].filter(Boolean).join(" · ") || "—";
        const statusPill = item.done ? pill(t('status_erledigt'), "#5E8B6F") : item.status === "in_arbeit" ? pill(t('tasks_status_in_arbeit' as any), "#B45309") : pill(t('status_offen'), "#DC2626");
        return `<tr><td>${escHtml(item.task)}</td><td>${escHtml(assignee)}</td><td>${escHtml(ort)}</td><td>${pill(priorityLabel(item.priority), prioColor(item.priority))}</td><td>${escHtml(deadline)}</td><td>${statusPill}</td></tr>`;
      })
      .join("");
    const generated = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const metaHeader = buildExportDetailsHeaderHtml(exportDetails, {
      bauvorhaben: t('export_bauvorhaben'), adresse: t('export_adresse'),
      etage: t('export_etage'), raum: t('export_raum'), notizen: t('export_notizen'),
    });
    const branding = await getPdfBranding().catch(() => null);
    const accent = branding?.accentColor || "#1E3A5F";
    const logoDataUri = await resolveBrandingLogo(branding);
    const body = `${metaHeader}<table class="prem-table" style="margin-top:14px;"><thead><tr><th>Aufgabe</th><th>Zuständig</th><th>Ort</th><th>Priorität</th><th>Fällig</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
    return buildPremiumHtml({
      branding: branding || ({} as any),
      accentColor: accent,
      title: t('tasks_aufgaben' as any),
      reportTag: t('tasks_aufgaben' as any),
      subtitle: escHtml(generated),
      body,
      logoDataUri,
    });
  };

  const exportPdf = async (tasksArg?: ProtocolTodo[]) => {
    if (pdfBusy) return;
    const exportTasks = tasksArg && tasksArg.length ? tasksArg : filteredTodos;
    if (exportTasks.length === 0) {
      Alert.alert(t('alert_fehler'), t('tasks_keine_aufgaben' as any));
      return;
    }
    setPdfBusy(true);
    try {
      const html = await buildTasksPdfHtml(exportTasks);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });
      }
      try {
        const { addExportEntry } = await import("@/lib/pdf-export-history");
        await addExportEntry({ filename: uri.split("/").pop() || "aufgaben.pdf", protocolTitle: t('tasks_aufgaben' as any), templateName: t('tasks_aufgaben' as any), projectName: "", recipients: [], ccRecipients: [], method: "share" });
      } catch {}
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
        onPress={() => openTask(item)}
        style={({ pressed }) => [
          styles.todoItem,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        {/* Only the checkbox toggles done — tapping the row opens the task. */}
        <Pressable
          onPress={() => toggleTodo(item)}
          hitSlop={12}
          style={[
            styles.checkbox,
            {
              borderColor: item.done ? colors.primary : item.status === "in_arbeit" ? "#F59E0B" : colors.muted,
              backgroundColor: item.done ? colors.primary : "transparent",
            },
          ]}
        >
          {item.done ? (
            <MaterialIcons name="check" size={14} color="#FFFFFF" />
          ) : item.status === "in_arbeit" ? (
            <MaterialIcons name="hourglass-empty" size={12} color="#F59E0B" />
          ) : null}
        </Pressable>
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
            {!!item.responsible && (
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="assignment-ind" size={11} color={colors.muted} />
                <Text style={[styles.badgeText, { color: colors.muted }]}>{item.responsible}</Text>
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
            {item.deadline && item.deadline !== t('frist_offen') && (
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="schedule" size={11} color={colors.muted} />
                <Text style={[styles.badgeText, { color: colors.muted }]}>
                  {formatDateTime(item.deadline)}
                </Text>
              </View>
            )}
            {(item.floor || item.room) && (
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="place" size={11} color={colors.muted} />
                <Text style={[styles.badgeText, { color: colors.muted }]}>
                  {[item.floor, item.room].filter(Boolean).join(" · ")}
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
      <Modal visible={showVoiceCreate} transparent animationType="fade" onRequestClose={cancelVoiceCreate}>
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
                    t('tasks_voice_g_wann' as any), t('tasks_voice_g_wo' as any),
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
            {scopedTodos.length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>{t('gesamt')}</Text>
        </View>
      </View>

      {/* Project selector */}
      {projects.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginVertical: 8 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}>
          <Pressable
            onPress={() => setSelectedProjectId(null)}
            style={[styles.projChip, { backgroundColor: !selectedProjectId ? colors.primary + "20" : colors.surface, borderColor: !selectedProjectId ? colors.primary : colors.border }]}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: !selectedProjectId ? colors.primary : colors.muted }}>{t('all')}</Text>
          </Pressable>
          {projects.map((p) => {
            const active = selectedProjectId === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setSelectedProjectId(p.id)}
                style={[styles.projChip, { backgroundColor: active ? colors.primary + "20" : colors.surface, borderColor: active ? colors.primary : colors.border }]}
              >
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: active ? colors.primary : colors.foreground, maxWidth: 160 }}>{p.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Filter tabs */}
      <View style={[styles.filterRow, { borderColor: colors.border }]}>
        {(["open", "in_progress", "all", "done"] as FilterType[]).map((f) => (
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
              numberOfLines={1}
            >
              {f === "open" ? t('status_offen') : f === "in_progress" ? t('tasks_status_in_arbeit' as any) : f === "done" ? t('status_erledigt') : t('filter_alle')}
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
        <SectionList
          sections={sections}
          renderItem={renderTodo}
          keyExtractor={(item, index) => `${item.protocolId}-${item.todoIndex}-${index}`}
          renderSectionHeader={({ section }) =>
            sections.length <= 1 ? null : (
              <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                <MaterialIcons name="meeting-room" size={14} color={colors.muted} />
                <Text style={[styles.sectionHeaderText, { color: colors.muted }]}>{section.title}</Text>
                <Text style={[styles.sectionCount, { color: colors.muted }]}>{section.data.length}</Text>
              </View>
            )
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* One "Teilen" button (replaces the old export box + header icons) */}
      {filteredTodos.length > 0 && (
        <View style={[styles.shareBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable onPress={openShareSheet} style={({ pressed }) => [styles.shareBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <MaterialIcons name="ios-share" size={20} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 16 }}>{t('protocol_share')}</Text>
          </Pressable>
        </View>
      )}

      {/* Share sheet — centered popup */}
      <Modal visible={showShare} transparent animationType="fade" onRequestClose={() => setShowShare(false)}>
        <View style={styles.createOverlay}>
          <View style={[styles.createSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('tasks_share_title' as any)}</Text>
              <Pressable onPress={() => setShowShare(false)} hitSlop={8}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Format */}
              <Text style={[styles.createLabel, { color: colors.muted }]}>{t('tasks_share_format' as any)}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["pdf", "csv"] as const).map((f) => {
                  const active = shareFormat === f;
                  return (
                    <Pressable key={f} onPress={() => setShareFormat(f)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center", borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : "transparent" }}>
                      <Text style={{ fontSize: 13, fontWeight: active ? "700" : "600", color: active ? colors.primary : colors.muted }}>{f.toUpperCase()}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Task selection */}
              <Text style={[styles.createLabel, { color: colors.muted, marginTop: 14 }]}>{t('tasks_share_select' as any)} ({getShareTasks().length}/{filteredTodos.length})</Text>
              <View style={{ maxHeight: 220, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  {filteredTodos.map((it) => {
                    const key = taskKey(it);
                    const sel = !shareExcluded.has(key);
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setShareExcluded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
                      >
                        <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center", borderColor: sel ? colors.primary : colors.muted, backgroundColor: sel ? colors.primary : "transparent" }}>
                          {sel && <MaterialIcons name="check" size={13} color="#FFFFFF" />}
                        </View>
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.foreground }}>{it.task}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Project data (prefilled) */}
              <View style={{ marginTop: 14 }}>
                <ExportDetailsBox value={exportDetails} onChange={setExportDetails} />
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                <Pressable onPress={() => setShowContacts(true)} style={[styles.createBtn, { borderWidth: 1, borderColor: colors.border, flexDirection: "row", gap: 6 }]}>
                  <MaterialIcons name="email" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>{t('tasks_email' as any)}</Text>
                </Pressable>
                <Pressable onPress={shareSelected} style={[styles.createBtn, { flex: 2, backgroundColor: colors.primary, flexDirection: "row", gap: 6 }]}>
                  <MaterialIcons name="ios-share" size={18} color="#FFFFFF" />
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{t('protocol_share')}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ContactPickerModal visible={showContacts} onClose={() => setShowContacts(false)} onSelect={emailSelected} />

      {/* Create / edit task — centered popup */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => { setShowCreate(false); resetTaskForm(); }}>
        <View style={styles.createOverlay}>
          <View style={[styles.createSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>{editingTaskId || editingProtocol ? t('tasks_edit' as any) : t('tasks_add' as any)}</Text>
              <Pressable onPress={() => { setShowCreate(false); resetTaskForm(); }} hitSlop={8}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.createLabel, { color: colors.muted }]}>{t('titel' as any)}</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={t('tasks_title_placeholder' as any)}
              placeholderTextColor={colors.muted}
              style={[styles.createInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <Text style={[styles.createLabel, { color: colors.muted, marginTop: 12 }]}>{t('gewerk' as any)}</Text>
            <TradePicker value={newTrade} onChange={setNewTrade} placeholder={t('tasks_trade_placeholder' as any)} accessibilityLabel={t('gewerk' as any)} />

            <Text style={[styles.createLabel, { color: colors.muted, marginTop: 12 }]}>{t('tasks_field_responsible' as any)}</Text>
            <AssigneeInput
              value={newAssignee}
              onChange={setNewAssignee}
              placeholder={t('tasks_responsible_placeholder' as any)}
              style={[styles.createInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

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

            {/* Status */}
            <Text style={[styles.createLabel, { color: colors.muted, marginTop: 12 }]}>{t('status' as any)}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([
                { key: "offen" as const, label: t('status_offen'), col: "#DC2626" },
                { key: "in_arbeit" as const, label: t('tasks_status_in_arbeit' as any), col: "#F59E0B" },
                { key: "erledigt" as const, label: t('status_erledigt'), col: "#5E8B6F" },
              ]).map((s) => {
                const active = newStatus === s.key;
                return (
                  <Pressable key={s.key} onPress={() => setNewStatus(s.key)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center", borderColor: active ? s.col : colors.border, backgroundColor: active ? s.col + "18" : "transparent" }}>
                    <Text style={{ fontSize: 12.5, fontWeight: active ? "700" : "600", color: active ? s.col : colors.muted }}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Wann (Frist) — date wheel */}
            <View style={{ marginTop: 12 }}>
              <DateOnlyPicker value={newDeadline} onChange={setNewDeadline} label={t('tasks_field_wann' as any)} withTime />
            </View>

            {/* Wo (Geschoss / Raum) */}
            <Text style={[styles.createLabel, { color: colors.muted, marginTop: 12 }]}>{t('tasks_field_wo' as any)}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={newFloor}
                onChangeText={setNewFloor}
                placeholder={t('export_etage')}
                placeholderTextColor={colors.muted}
                style={[styles.createInput, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
              <TextInput
                value={newRoom}
                onChangeText={setNewRoom}
                placeholder={t('export_raum')}
                placeholderTextColor={colors.muted}
                style={[styles.createInput, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable onPress={() => { setShowCreate(false); resetTaskForm(); }} style={[styles.createBtn, { borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ color: colors.muted, fontWeight: "700" }}>{t('btn_abbrechen')}</Text>
              </Pressable>
              <Pressable onPress={saveNewTask} style={[styles.createBtn, { flex: 2, backgroundColor: colors.primary }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BusyOverlay visible={pdfBusy} label={t('pdf_wird_erstellt' as any)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  createOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
  createSheet: { borderRadius: 18, borderWidth: 1, padding: 22, maxHeight: "86%", maxWidth: 560, width: "100%", alignSelf: "center" },
  createLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  createInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  createBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: "center" },
  projChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  shareBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 0.5 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sectionHeaderText: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, flex: 1 },
  sectionCount: { fontSize: 12, fontWeight: "700" },
  voiceOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  voiceSheet: { borderRadius: 18, borderWidth: 1, padding: 20, maxWidth: 560, width: "100%", alignSelf: "center" },
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
