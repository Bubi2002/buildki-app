import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, TextInput, Modal, Alert, KeyboardAvoidingView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "@/lib/language-provider";
import { useColors } from "@/hooks/use-colors";
import {
  getProjectStructure,
  updateRoom,
  deleteRoom,
  addFloor,
  addRoom,
  deleteFloor,
  initializeDefaultFloors,
  type Floor,
  type Room,
} from "@/lib/room-store";
import { syncRoomsFromProtocols } from "@/lib/room-sync";
import { syncStoredProtocolDefects } from "@/lib/protocol-defect-sync";
import { getDefects, updateDefectStatus, saveDefect, deleteDefect, type Defect, type DefectStatus } from "@/lib/defect-store";
import { AssigneeInput } from "@/components/assignee-input";
import { DateOnlyPicker } from "@/components/date-only-picker";
import { GEWERKE } from "@/lib/defect-pdf-export";
import { pickImagesWithSource } from "@/lib/import-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image as ExpoImage } from "expo-image";
import { getChecklistResults, getChecklistCompletionRate, getChecklists, saveChecklistResult, type ChecklistResult, type Checklist } from "@/lib/checklist-store";

type ProjectItem = { id: string; name: string; color?: string; archived?: boolean; favorite?: boolean };
type ProjectTask = { id: string; projectId?: string; status?: string; done?: boolean; room?: string; floor?: string; title?: string; task?: string; description?: string; dueDate?: string; assignee?: string };

const ROOM_STATUS_LABELS: Record<string, string> = {
  nicht_begonnen: "rooms_status_nicht_begonnen",
  in_arbeit: "rooms_status_in_arbeit",
  fertig: "rooms_status_fertig",
  abgenommen: "rooms_status_abgenommen",
};
const ROOM_STATUS_COLORS: Record<string, string> = {
  nicht_begonnen: "#6B7280",
  in_arbeit: "#F59E0B",
  fertig: "#10B981",
  abgenommen: "#3B82F6",
};
const OPEN_DEFECT_STATUSES = new Set<DefectStatus>(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
const DONE_STATUSES = new Set(["fertig", "abgenommen"]);
const FLOOR_NAME_KEYS: Record<string, string> = {
  "UG": "floor_ug",
  "EG": "floor_eg",
  "1. OG": "floor_og1",
  "2. OG": "floor_og2",
  "DG": "floor_dg",
};

// Reset on cold start (module state is recreated with the JS bundle): the
// "which project?" prompt appears once per app launch.
let launchChooserShown = false;

export default function RundgangTab() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [begehungCount, setBegehungCount] = useState(0);
  const [lastBegehung, setLastBegehung] = useState<string | null>(null);
  const [protocolList, setProtocolList] = useState<{ id: string; title?: string; templateName?: string; createdAt: string }[]>([]);

  // Start a Begehung: make sure this project is active, then go straight to the
  // recording screen. (The old "Was willst du tun?" chooser was removed — it was
  // an extra, mispositioned step that led to the same /record screen anyway.)
  const startBegehung = async () => {
    if (!selectedProjectId) { setShowProjectDropdown(true); return; }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try { await AsyncStorage.setItem("last-selected-project-id", selectedProjectId); } catch {}
    router.push("/record" as any);
  };
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [checklistResults, setChecklistResults] = useState<ChecklistResult[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [taskRoom, setTaskRoom] = useState<Room | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  // Defect create popup
  const [defectRoom, setDefectRoom] = useState<Room | null>(null);
  const [newDefectTitle, setNewDefectTitle] = useState("");
  const [newDefectDesc, setNewDefectDesc] = useState("");
  const [newDefectGewerk, setNewDefectGewerk] = useState("");
  const [newDefectPriority, setNewDefectPriority] = useState<"hoch" | "mittel" | "niedrig">("mittel");
  const [newDefectAssignee, setNewDefectAssignee] = useState("");
  const [newDefectDue, setNewDefectDue] = useState("");
  const [newDefectPhotos, setNewDefectPhotos] = useState<string[]>([]);
  // Detail popups
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [editDefectDesc, setEditDefectDesc] = useState("");
  const [editDefectTitle, setEditDefectTitle] = useState("");
  const [editDefectAssignee, setEditDefectAssignee] = useState("");
  const [editDefectDue, setEditDefectDue] = useState("");
  const [renameRoom, setRenameRoom] = useState<Room | null>(null);
  const [renameRoomName, setRenameRoomName] = useState("");
  const [addFloorOpen, setAddFloorOpen] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  const [addRoomFloor, setAddRoomFloor] = useState<Floor | null>(null);
  const [newRoomNameInput, setNewRoomNameInput] = useState("");
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskDesc, setEditTaskDesc] = useState("");
  const [editTaskAssignee, setEditTaskAssignee] = useState("");
  const [editTaskDue, setEditTaskDue] = useState("");
  const [selectedChecklist, setSelectedChecklist] = useState<ChecklistResult | null>(null);
  const [checklistDefs, setChecklistDefs] = useState<Checklist[]>([]);

  const tn = (key: string, n: number) => t(key as any).replace("{n}", String(n));

  const loadProjects = useCallback(async () => {
    try {
      const [projRaw, lastSel] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("last-selected-project-id"),
      ]);
      const all: ProjectItem[] = projRaw ? JSON.parse(projRaw) : [];
      const active = all.filter((p) => !p.archived);
      setProjects(active);
      setSelectedProjectId((prev) => {
        if (prev && active.some((p) => p.id === prev)) return prev;
        if (lastSel && active.some((p) => p.id === lastSel)) return lastSel;
        const fav = active.find((p) => p.favorite);
        return (fav || active[0])?.id ?? null;
      });
    } catch {}
  }, []);

  const loadRundgang = useCallback(async (pid: string) => {
    try {
      await initializeDefaultFloors(pid);
      // Pull rooms recorded during Begehungen ("Geschoss · Raum") into the structure.
      try { await syncRoomsFromProtocols(pid); } catch {}
      // Make sure Maengel detected in this project's protocols exist as defects
      // (idempotent) so they show up under their room. Older protocols that were
      // processed before this sync existed get backfilled here.
      try { await syncStoredProtocolDefects(pid); } catch {}
      const structure = await getProjectStructure(pid);
      const sortedFloors = structure.floors.sort((a, b) => a.number - b.number);
      setFloors(sortedFloors);
      setRooms(structure.rooms);
      setExpandedFloors((prev) => (prev.size === 0 && sortedFloors.length > 0 ? new Set([sortedFloors[0].id]) : prev));
      const [allDefects, allResults, tasksRaw] = await Promise.all([
        getDefects(pid),
        getChecklistResults(pid),
        AsyncStorage.getItem("project-tasks"),
      ]);
      setDefects(allDefects);
      setChecklistResults(allResults);
      const allTasks: ProjectTask[] = tasksRaw ? JSON.parse(tasksRaw) : [];
      setTasks(allTasks.filter((tk) => !tk.projectId || tk.projectId === pid));
      // Begehungen (protocols) of this project, for the home card.
      try {
        const protos = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
        const mine = protos.filter((p: any) => p.projectId === pid);
        setBegehungCount(mine.length);
        const last = mine.map((p: any) => p.createdAt).filter(Boolean).sort().slice(-1)[0] || null;
        setLastBegehung(last);
        setProtocolList(mine.slice().sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      } catch { setBegehungCount(0); setLastBegehung(null); setProtocolList([]); }
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProjects();
      if (selectedProjectId) loadRundgang(selectedProjectId);
    }, [loadProjects, loadRundgang, selectedProjectId])
  );

  useEffect(() => {
    if (selectedProjectId) {
      AsyncStorage.setItem("last-selected-project-id", selectedProjectId);
      loadRundgang(selectedProjectId);
    }
  }, [selectedProjectId, loadRundgang]);

  // On app launch: first ask which project (or create a new one), instead of
  // dropping straight into the last project.
  useEffect(() => {
    if (launchChooserShown) return;
    launchChooserShown = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("projects");
        const all: ProjectItem[] = raw ? JSON.parse(raw) : [];
        const active = all.filter((p) => !p.archived);
        if (active.length > 0) setShowProjectDropdown(true);
        else router.push("/project-wizard?mode=new" as any);
      } catch {}
    })();
  }, []);

  const pickProject = (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProjectId(id);
  };

  // Long-press a project chip to delete it; its protocols are kept (Ohne Projekt).
  const deleteProject = (project: ProjectItem) => {
    Alert.alert(
      t('projekt_loeschen_title' as any),
      t('projekt_loeschen_msg' as any).replace('{name}', project.name),
      [
        { text: t('cancel'), style: "cancel" },
        {
          text: t('btn_loeschen'),
          style: "destructive",
          onPress: async () => {
            try {
              const stored = await AsyncStorage.getItem("projects");
              const all: ProjectItem[] = stored ? JSON.parse(stored) : [];
              const remaining = all.filter((p) => p.id !== project.id);
              await AsyncStorage.setItem("projects", JSON.stringify(remaining));
              const protoStr = await AsyncStorage.getItem("protocols");
              if (protoStr) {
                const protos = JSON.parse(protoStr);
                let changed = false;
                for (const p of protos) { if (p.projectId === project.id) { p.projectId = undefined; changed = true; } }
                if (changed) await AsyncStorage.setItem("protocols", JSON.stringify(protos));
              }
              if (selectedProjectId === project.id) setSelectedProjectId(null);
              loadProjects();
            } catch {
              Alert.alert(t('alert_fehler'), t('msg_zuordnung_fehlgeschlagen'));
            }
          },
        },
      ],
    );
  };

  const toggleFloor = (id: string) =>
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const roomFloorName = (room: Room) => floors.find((f) => f.id === room.floorId)?.name || "";
  // An item belongs to a room when the room names match AND, if the item carries
  // a floor, that floor matches too. Otherwise several "Flur" rooms on different
  // floors would all show the same Mangel/Aufgabe. Items without a floor stay
  // name-matched for backward compatibility with older data.
  const sameFloor = (itemFloor: string | undefined, room: Room) => {
    const f = (itemFloor || "").trim().toLowerCase();
    if (!f) return true;
    return f === roomFloorName(room).trim().toLowerCase();
  };
  // Protocol-synced Maengel store their place in `location` (e.g. "DG · Schlafzimmer"),
  // not in room/floor. Split it so those Maengel still land in the right room.
  const splitLoc = (loc?: string): { floor?: string; room?: string } => {
    const parts = (loc || "").split(/[·,/|]|\s[-–]\s/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { floor: parts[0], room: parts[parts.length - 1] };
    if (parts.length === 1) return { room: parts[0] };
    return {};
  };
  const defectRoomName = (d: Defect) => ((d.room || "").trim() || splitLoc((d as any).location).room || "");
  const defectFloorName = (d: Defect) => ((d.floor || "").trim() || splitLoc((d as any).location).floor || "");
  const roomDefects = (room: Room) =>
    defects.filter((d) => defectRoomName(d).toLowerCase() === room.name.trim().toLowerCase() && sameFloor(defectFloorName(d), room));
  const roomOpenDefects = (room: Room) => roomDefects(room).filter((d) => OPEN_DEFECT_STATUSES.has(d.status)).length;
  const roomFollowUps = (room: Room) =>
    roomDefects(room).filter((d) => !!(d as any).followUpDate && d.status !== "erledigt" && d.status !== "geschlossen").length;
  const roomChecklists = (room: Room) =>
    checklistResults.filter((r) => (r.location || "").toLowerCase().includes(room.name.trim().toLowerCase())).length;
  const roomTasks = (room: Room) =>
    tasks.filter((tk) => (tk.room || "").trim().toLowerCase() === room.name.trim().toLowerCase() && sameFloor((tk as any).floor, room) && tk.status !== "erledigt" && tk.done !== true).length;


  const toggleRoomExpand = (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Full item lists per room (for the inline expand view)
  const roomTaskList = (room: Room) =>
    tasks.filter((tk) => (tk.room || "").trim().toLowerCase() === room.name.trim().toLowerCase() && sameFloor((tk as any).floor, room));
  const roomChecklistList = (room: Room) =>
    checklistResults.filter((r) => (r.location || "").toLowerCase().includes(room.name.trim().toLowerCase()));

  const isDefectDone = (d: Defect) => d.status === "erledigt" || d.status === "geschlossen";
  const isTaskDone = (tk: ProjectTask) => tk.done === true || tk.status === "erledigt";

  const toggleDefectDone = async (d: Defect) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next: DefectStatus = isDefectDone(d) ? "offen" : "erledigt";
    setDefects((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: next } : x)));
    try { await updateDefectStatus(d.id, next); } catch {}
  };

  const toggleTaskDone = async (tk: ProjectTask) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nextDone = !isTaskDone(tk);
    setTasks((prev) => prev.map((x) => (x.id === tk.id ? { ...x, done: nextDone, status: nextDone ? "erledigt" : "offen" } : x)));
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      const all: ProjectTask[] = raw ? JSON.parse(raw) : [];
      const idx = all.findIndex((x) => x.id === tk.id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], done: nextDone, status: nextDone ? "erledigt" : "offen" };
        await AsyncStorage.setItem("project-tasks", JSON.stringify(all));
      }
    } catch {}
  };

  // Tap cycles the status: offen → In Arbeit → Fertig → offen.
  const defectStatusVisual = (s: string): { name: any; color: string } => {
    if (s === "erledigt" || s === "geschlossen") return { name: "check-circle", color: "#10B981" };
    if (s === "in_bearbeitung" || s === "in_arbeit" || s === "nachbesserung" || s === "pruefung") return { name: "pending", color: "#F59E0B" };
    return { name: "radio-button-unchecked", color: "#4B5B6B" };
  };
  const cycleDefectStatus = async (d: Defect) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const order: DefectStatus[] = ["offen", "in_bearbeitung", "erledigt"];
    const cur: DefectStatus = (d.status === "erledigt" || d.status === "geschlossen") ? "erledigt" : (d.status === "in_bearbeitung" || d.status === "in_arbeit" as any) ? "in_bearbeitung" : "offen";
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setDefects((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: next } : x)));
    try { await updateDefectStatus(d.id, next); } catch {}
  };
  const cycleTaskStatus = async (tk: ProjectTask) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const order = ["offen", "in_arbeit", "erledigt"] as const;
    const cur = (tk.done === true || tk.status === "erledigt") ? "erledigt" : tk.status === "in_arbeit" ? "in_arbeit" : "offen";
    const next = order[(order.indexOf(cur) + 1) % order.length];
    const nextDone = next === "erledigt";
    setTasks((prev) => prev.map((x) => (x.id === tk.id ? { ...x, status: next, done: nextDone } : x)));
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      const all: ProjectTask[] = raw ? JSON.parse(raw) : [];
      const idx = all.findIndex((x) => x.id === tk.id);
      if (idx >= 0) { all[idx] = { ...all[idx], status: next, done: nextDone }; await AsyncStorage.setItem("project-tasks", JSON.stringify(all)); }
    } catch {}
  };

  const openDefect = (d: Defect) => {
    setEditDefectTitle(d.title || "");
    setEditDefectDesc(d.description || "");
    setEditDefectAssignee(d.assignee || "");
    setEditDefectDue(d.dueDate || "");
    setSelectedDefect(d);
  };
  const openTaskDetail = (tk: ProjectTask) => {
    setEditTaskTitle(taskTitle(tk));
    setEditTaskDesc(tk.description || "");
    setEditTaskAssignee(tk.assignee || "");
    setEditTaskDue(tk.dueDate || "");
    setSelectedTask(tk);
  };
  const openChecklistDetail = async (c: ChecklistResult) => {
    setSelectedChecklist(c);
    // Load the checklist definitions so we can show each Prüfpunkt's text.
    try { if (checklistDefs.length === 0) setChecklistDefs(await getChecklists()); } catch {}
  };
  // Map a result's itemId → its Prüfpunkt text (from the checklist definition).
  const checklistItemText = (c: ChecklistResult | null, itemId: string): string => {
    const def = checklistDefs.find((d) => d.id === c?.checklistId);
    return def?.items.find((it) => it.id === itemId)?.text || itemId;
  };
  // Toggle one Prüfpunkt directly from the room view and persist it.
  const toggleChecklistItem = async (itemId: string) => {
    if (!selectedChecklist) return;
    const results = (selectedChecklist.results || []).map((r) =>
      r.itemId === itemId ? { ...r, checked: !r.checked } : r,
    );
    const updated: ChecklistResult = { ...selectedChecklist, results };
    setSelectedChecklist(updated);
    setChecklistResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    try { await saveChecklistResult(updated); } catch {}
  };
  const taskTitle = (tk: ProjectTask) => (tk.title || tk.task || "").trim() || t("index_tool_aufgaben" as any);

  // ── Defect popup actions ──────────────────────────────────────────────────
  const setDefectStatusNow = async (d: Defect, status: DefectStatus) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDefects((prev) => prev.map((x) => (x.id === d.id ? { ...x, status } : x)));
    setSelectedDefect((prev) => (prev && prev.id === d.id ? { ...prev, status } : prev));
    try { await updateDefectStatus(d.id, status); } catch {}
  };
  const saveDefectEdit = async () => {
    const d = selectedDefect;
    if (!d) return;
    const updated = { ...d, title: editDefectTitle.trim() || d.title, description: editDefectDesc.trim(), assignee: editDefectAssignee.trim() || undefined, dueDate: editDefectDue.trim() || undefined, updatedAt: new Date().toISOString() };
    setDefects((prev) => prev.map((x) => (x.id === d.id ? updated : x)));
    try { await saveDefect(updated as any); } catch {}
    setSelectedDefect(null);
  };

  // ── Room rename / delete ──────────────────────────────────────────────────
  const openRoomRename = (room: Room) => { setRenameRoomName(room.name); setRenameRoom(room); };
  const saveRoomRename = async () => {
    const room = renameRoom;
    const name = renameRoomName.trim();
    if (!room || !name || !selectedProjectId) { setRenameRoom(null); return; }
    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, name } : r)));
    try { await updateRoom(selectedProjectId, room.id, { name }); } catch {}
    setRenameRoom(null);
  };
  const deleteRoomNow = async (room: Room) => {
    if (!selectedProjectId) return;
    setRooms((prev) => prev.filter((r) => r.id !== room.id));
    setRenameRoom(null);
    try { await deleteRoom(selectedProjectId, room.id); } catch {}
  };
  const confirmDeleteRoom = (room: Room) => {
    Alert.alert(room.name, "", [
      { text: t('btn_abbrechen'), style: "cancel" },
      { text: t('btn_loeschen'), style: "destructive", onPress: () => deleteRoomNow(room) },
    ]);
  };

  // ── Floor add / delete + room add ─────────────────────────────────────────
  const saveAddFloor = async () => {
    const name = newFloorName.trim();
    if (!name || !selectedProjectId) { setAddFloorOpen(false); return; }
    const nextNumber = floors.length ? Math.max(...floors.map((f) => f.number)) + 1 : 0;
    try { await addFloor(selectedProjectId, name, nextNumber); } catch {}
    setNewFloorName("");
    setAddFloorOpen(false);
    if (selectedProjectId) loadRundgang(selectedProjectId);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const confirmDeleteFloor = (floor: Floor) => {
    if (!selectedProjectId) return;
    const roomsOnFloor = rooms.filter((r) => r.floorId === floor.id).length;
    Alert.alert(
      FLOOR_NAME_KEYS[floor.name] ? t(FLOOR_NAME_KEYS[floor.name] as any) : floor.name,
      roomsOnFloor > 0 ? t('rundgang_delete_floor_msg' as any).replace("{n}", String(roomsOnFloor)) : "",
      [
        { text: t('btn_abbrechen'), style: "cancel" },
        { text: t('btn_loeschen'), style: "destructive", onPress: async () => {
          try { await deleteFloor(selectedProjectId, floor.id); } catch {}
          if (selectedProjectId) loadRundgang(selectedProjectId);
        } },
      ],
    );
  };
  const saveAddRoom = async () => {
    const floor = addRoomFloor;
    const name = newRoomNameInput.trim();
    if (!floor || !name || !selectedProjectId) { setAddRoomFloor(null); return; }
    try { await addRoom(selectedProjectId, floor.id, name); } catch {}
    setNewRoomNameInput("");
    setAddRoomFloor(null);
    if (selectedProjectId) loadRundgang(selectedProjectId);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const deleteDefectNow = async (d: Defect) => {
    setDefects((prev) => prev.filter((x) => x.id !== d.id));
    setSelectedDefect(null);
    try { await deleteDefect(d.id); } catch {}
  };

  const setRoomStatus = async (room: Room, status: Room["status"]) => {
    if (!selectedProjectId) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, status } : r)));
    try { await updateRoom(selectedProjectId, room.id, { status }); } catch {}
  };

  const openDefectCreate = (room: Room) => {
    setNewDefectTitle("");
    setNewDefectDesc("");
    setNewDefectGewerk("");
    setNewDefectPriority("mittel");
    setNewDefectAssignee("");
    setNewDefectDue("");
    setNewDefectPhotos([]);
    setDefectRoom(room);
  };

  const pickDefectPhotos = async () => {
    try {
      const picked = await pickImagesWithSource({ t, multiple: true } as any);
      if (!picked || picked.length === 0) return;
      const dir = `${FileSystem.documentDirectory}defect-photos/`;
      try { const info = await FileSystem.getInfoAsync(dir); if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch {}
      const uris: string[] = [];
      for (const a of picked) {
        try { const dest = `${dir}d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`; await FileSystem.copyAsync({ from: a.uri, to: dest }); uris.push(dest); } catch { uris.push(a.uri); }
      }
      setNewDefectPhotos((prev) => [...prev, ...uris]);
    } catch {}
  };
  const createRoomDefect = async () => {
    const room = defectRoom;
    const title = newDefectTitle.trim();
    if (!room || !title || !selectedProjectId) { setDefectRoom(null); return; }
    const now = new Date().toISOString();
    const floorName = floors.find((f) => f.id === room.floorId)?.name;
    const newDefect = {
      id: `defect_${Date.now()}`,
      projectId: selectedProjectId,
      title,
      description: newDefectDesc.trim(),
      status: "offen" as DefectStatus,
      priority: newDefectPriority,
      category: "sonstiges",
      gewerk: newDefectGewerk.trim() || undefined,
      photos: [...newDefectPhotos],
      floor: floorName,
      room: room.name,
      assignee: newDefectAssignee.trim() || undefined,
      dueDate: newDefectDue.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    try { await saveDefect(newDefect as any); } catch {}
    setDefects((prev) => [newDefect as any, ...prev]);
    setDefectRoom(null);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Task popup actions ────────────────────────────────────────────────────
  const persistTasks = async (updater: (all: ProjectTask[]) => ProjectTask[]) => {
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      const all: ProjectTask[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem("project-tasks", JSON.stringify(updater(all)));
    } catch {}
  };
  const saveTaskEdit = async () => {
    const tk = selectedTask;
    const title = editTaskTitle.trim();
    if (!tk || !title) { setSelectedTask(null); return; }
    const patch = {
      title,
      description: editTaskDesc.trim() || undefined,
      assignee: editTaskAssignee.trim() || undefined,
      dueDate: editTaskDue.trim() || undefined,
    };
    setTasks((prev) => prev.map((x) => (x.id === tk.id ? { ...x, ...patch } : x)));
    await persistTasks((all) => all.map((x) => (x.id === tk.id ? { ...x, ...patch } : x)));
    setSelectedTask(null);
  };
  const deleteTaskNow = async (tk: ProjectTask) => {
    setTasks((prev) => prev.filter((x) => x.id !== tk.id));
    setSelectedTask(null);
    await persistTasks((all) => all.filter((x) => x.id !== tk.id));
  };

  const openTaskCreate = (room: Room) => {
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskAssignee("");
    setNewTaskDue("");
    setTaskRoom(room);
  };

  const createRoomTask = async () => {
    const room = taskRoom;
    const title = newTaskTitle.trim();
    if (!room || !title || !selectedProjectId) { setTaskRoom(null); return; }
    const newTask: ProjectTask = {
      id: `task-${Date.now()}`,
      projectId: selectedProjectId,
      room: room.name,
      floor: roomFloorName(room) || undefined,
      title,
      description: newTaskDesc.trim() || undefined,
      assignee: newTaskAssignee.trim() || undefined,
      dueDate: newTaskDue.trim() || undefined,
      status: "offen",
      done: false,
    } as ProjectTask;
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      const all: ProjectTask[] = raw ? JSON.parse(raw) : [];
      all.unshift(newTask);
      await AsyncStorage.setItem("project-tasks", JSON.stringify(all));
      setTasks((prev) => [newTask, ...prev]);
    } catch {}
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskAssignee("");
    setNewTaskDue("");
    setTaskRoom(null);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleRoomDone = async (room: Room) => {
    if (!selectedProjectId) return;
    const isDone = DONE_STATUSES.has(room.status || "");
    const next: Room["status"] = isDone ? "nicht_begonnen" : "fertig";
    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, status: next } : r)));
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateRoom(selectedProjectId, room.id, { status: next });
    } catch {}
  };

  const doneRooms = rooms.filter((r) => DONE_STATUSES.has(r.status || "")).length;
  const totalRooms = rooms.length;
  const doneText = t("brain_rooms_done" as any).replace("{done}", String(doneRooms)).replace("{total}", String(totalRooms));
  const progress = totalRooms > 0 ? doneRooms / totalRooms : 0;

  return (
    <ScreenContainer className="flex-1">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("nav_projekte" as any)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {totalRooms > 0 && (
            <View style={styles.doneBadge}>
              <MaterialIcons name="check-circle" size={14} color="#10B981" />
              <Text style={styles.doneBadgeText}>{doneText}</Text>
            </View>
          )}
          <Pressable
            onPress={() => router.push("/project-wizard?mode=new" as any)}
            hitSlop={8}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#5DADE2", opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="add" size={18} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>{t("rundgang_new_project" as any)}</Text>
          </Pressable>
        </View>
      </View>

      {projects.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="folder-open" size={48} color="#4A5568" />
          <Text style={styles.emptyHint}>{t("rundgang_no_projects" as any)}</Text>
          <Pressable
            onPress={() => router.push("/project-wizard?mode=new" as any)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: "#5DADE2", opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }}>{t("rundgang_new_project" as any)}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Prominent Baustelle card — the clear starting point */}
          <View style={styles.baustelleCard}>
            <Pressable onPress={() => { setProjectSearch(""); setShowProjectDropdown(true); }} style={styles.baustelleHead}>
              <View style={[styles.baustelleDot, { backgroundColor: projects.find((p) => p.id === selectedProjectId)?.color || "#5DADE2" }]} />
              <Text style={styles.baustelleName} numberOfLines={1}>
                {projects.find((p) => p.id === selectedProjectId)?.name || t("rundgang_pick_project" as any)}
              </Text>
              <MaterialIcons name="unfold-more" size={22} color="#8FA3B8" />
            </Pressable>

            {totalRooms > 0 && (
              <>
                <View style={[styles.progressTrack, { marginHorizontal: 0, marginTop: 4 }]}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={styles.baustelleMeta}>{doneText}</Text>
              </>
            )}

            {/* Begehung starten */}
            <Pressable onPress={startBegehung} style={({ pressed }) => [styles.startBegehungBtn, { opacity: pressed ? 0.9 : 1 }]}>
              <MaterialIcons name="videocam" size={22} color="#FFFFFF" />
              <Text style={styles.startBegehungText}>{t("rundgang_start_begehung" as any)}</Text>
            </Pressable>

            {/* Letzte Begehungen */}
            <Pressable onPress={() => router.push(`/project-detail?id=${selectedProjectId}` as any)} style={styles.baustelleRecent}>
              <MaterialIcons name="history" size={16} color="#8FA3B8" />
              <Text style={styles.baustelleRecentText} numberOfLines={1}>
                {begehungCount} {t("nav_begehung" as any)}{lastBegehung ? ` · ${new Date(lastBegehung).toLocaleDateString("de-DE")}` : ""}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color="#8FA3B8" />
            </Pressable>
          </View>


          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>
            {floors.map((floor) => {
              const floorRooms = rooms.filter((r) => r.floorId === floor.id);
              const floorDone = floorRooms.filter((r) => DONE_STATUSES.has(r.status || "")).length;
              const expanded = expandedFloors.has(floor.id);
              return (
                <View key={floor.id} style={styles.floorBlock}>
                  <Pressable onPress={() => toggleFloor(floor.id)} onLongPress={() => confirmDeleteFloor(floor)} style={styles.floorHeader}>
                    <MaterialIcons name={expanded ? "expand-more" : "chevron-right"} size={22} color="#8FA3B8" />
                    <Text style={styles.floorName}>{FLOOR_NAME_KEYS[floor.name] ? t(FLOOR_NAME_KEYS[floor.name] as any) : floor.name}</Text>
                    <Text style={styles.floorCount}>
                      {floorDone}/{floorRooms.length}
                    </Text>
                  </Pressable>

                  {expanded &&
                    (floorRooms.length === 0 ? (
                      <Text style={styles.floorEmpty}>—</Text>
                    ) : (
                      floorRooms.map((room) => {
                        const od = roomOpenDefects(room);
                        const fu = roomFollowUps(room);
                        const tk = roomTasks(room);
                        const cl = roomChecklists(room);
                        const done = DONE_STATUSES.has(room.status || "");
                        const rStatus = room.status || "nicht_begonnen";
                        const statusColor = ROOM_STATUS_COLORS[rStatus];
                        const statusIcon = rStatus === "abgenommen" ? "verified"
                          : rStatus === "fertig" ? "check-circle"
                            : rStatus === "in_arbeit" ? "timelapse"
                              : "radio-button-unchecked";
                        const expanded = expandedRooms.has(room.id);
                        const dList = roomDefects(room);
                        const tList = roomTaskList(room);
                        const cList = roomChecklistList(room);
                        return (
                          <View key={room.id} style={styles.roomCard}>
                            <View style={styles.roomHeaderRow}>
                              <Pressable
                                onPress={() => toggleRoomDone(room)}
                                hitSlop={10}
                                style={styles.checkbox}
                              >
                                <MaterialIcons
                                  name={statusIcon as any}
                                  size={26}
                                  color={rStatus === "nicht_begonnen" ? "#4B5B6B" : statusColor}
                                />
                              </Pressable>
                              <Pressable onPress={() => toggleRoomExpand(room.id)} style={styles.roomHeaderTap}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.roomName}>{room.name}</Text>
                                  <View style={styles.badgeRow}>
                                    {od > 0 && (
                                      <View style={[styles.badge, { backgroundColor: "#3A1E12", borderColor: "#F97316" }]}>
                                        <MaterialIcons name="warning" size={11} color="#F97316" />
                                        <Text style={[styles.badgeText, { color: "#F9A97C" }]}>{tn("rundgang_defects", od)}</Text>
                                      </View>
                                    )}
                                    {fu > 0 && (
                                      <View style={[styles.badge, { backgroundColor: "#122A3A", borderColor: "#38BDF8" }]}>
                                        <MaterialIcons name="event-repeat" size={11} color="#38BDF8" />
                                        <Text style={[styles.badgeText, { color: "#8BD3F5" }]}>{tn("rundgang_followup", fu)}</Text>
                                      </View>
                                    )}
                                    {tk > 0 && (
                                      <View style={[styles.badge, { backgroundColor: "#1E2A3A", borderColor: "#818CF8" }]}>
                                        <MaterialIcons name="task-alt" size={11} color="#818CF8" />
                                        <Text style={[styles.badgeText, { color: "#B4B9F7" }]}>{tn("rundgang_tasks", tk)}</Text>
                                      </View>
                                    )}
                                    {cl > 0 && (
                                      <View style={[styles.badge, { backgroundColor: "#14261C", borderColor: "#34D399" }]}>
                                        <MaterialIcons name="checklist" size={11} color="#34D399" />
                                        <Text style={[styles.badgeText, { color: "#8FE3BE" }]}>{t("rundgang_checklist" as any)}</Text>
                                      </View>
                                    )}
                                    {od === 0 && fu === 0 && tk === 0 && cl === 0 && (
                                      <Text style={[styles.roomStatusText, { color: statusColor }]}>
                                        {t(ROOM_STATUS_LABELS[room.status || "nicht_begonnen"] as any)}
                                      </Text>
                                    )}
                                  </View>
                                </View>
                                <MaterialIcons name={expanded ? "expand-more" : "chevron-right"} size={22} color="#5A6B7C" />
                              </Pressable>
                            </View>

                            {expanded && (
                              <View style={styles.roomExpand}>
                                {/* Status */}
                                <View style={styles.statusRow}>
                                  {(["nicht_begonnen", "in_arbeit", "fertig", "abgenommen"] as const).map((s) => {
                                    const active = (room.status || "nicht_begonnen") === s;
                                    return (
                                      <Pressable
                                        key={s}
                                        onPress={() => setRoomStatus(room, s)}
                                        style={[styles.statusChip, { borderColor: active ? ROOM_STATUS_COLORS[s] : "#1E3A5F", backgroundColor: active ? ROOM_STATUS_COLORS[s] + "22" : "transparent" }]}
                                      >
                                        <Text style={{ fontSize: 12, fontWeight: active ? "800" : "600", color: active ? ROOM_STATUS_COLORS[s] : "#8FA3B8" }}>
                                          {t(ROOM_STATUS_LABELS[s] as any)}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>

                                {/* Mängel */}
                                <View style={styles.expandHeader}>
                                  <Text style={styles.expandHeaderText}>{t('maengel')} ({dList.length})</Text>
                                  <Pressable onPress={() => openDefectCreate(room)} hitSlop={6}>
                                    <Text style={styles.expandAdd}>+ {t('rooms_add_defect_here' as any)}</Text>
                                  </Pressable>
                                </View>
                                {dList.map((d) => {
                                  const ddone = isDefectDone(d);
                                  const vis = defectStatusVisual(d.status);
                                  const sub = [(d as any).assignee, (d as any).dueDate].map((s) => (s || "").trim()).filter(Boolean).join("  ·  ");
                                  return (
                                    <View key={d.id} style={styles.entryRow}>
                                      <Pressable onPress={() => cycleDefectStatus(d)} hitSlop={8} style={styles.entryCheck}>
                                        <MaterialIcons name={vis.name} size={22} color={vis.color} />
                                      </Pressable>
                                      <Pressable onPress={() => openDefect(d)} style={styles.entryTap}>
                                        <MaterialIcons name="warning" size={14} color="#F97316" />
                                        <View style={{ flex: 1 }}>
                                          <Text style={[styles.entryTitle, ddone && styles.entryTitleDone]} numberOfLines={1}>{d.title || d.description || t("index_tool_maengel" as any)}</Text>
                                          {sub ? <Text style={styles.entrySub} numberOfLines={1}>{sub}</Text> : null}
                                        </View>
                                      </Pressable>
                                      <MaterialIcons name="chevron-right" size={18} color="#5A6B7C" />
                                    </View>
                                  );
                                })}
                                {/* Aufgaben */}
                                <View style={styles.expandHeader}>
                                  <Text style={styles.expandHeaderText}>{t('index_tool_aufgaben')} ({tList.length})</Text>
                                  <Pressable onPress={() => openTaskCreate(room)} hitSlop={6}>
                                    <Text style={styles.expandAdd}>+ {t('rooms_add_task_here' as any)}</Text>
                                  </Pressable>
                                </View>
                                {tList.map((tkItem) => {
                                  const tdone = isTaskDone(tkItem);
                                  const vis = defectStatusVisual(tdone ? "erledigt" : (tkItem.status || "offen"));
                                  const sub = [tkItem.assignee, tkItem.dueDate].map((s) => (s || "").trim()).filter(Boolean).join("  ·  ");
                                  return (
                                    <View key={tkItem.id} style={styles.entryRow}>
                                      <Pressable onPress={() => cycleTaskStatus(tkItem)} hitSlop={8} style={styles.entryCheck}>
                                        <MaterialIcons name={vis.name} size={22} color={vis.color} />
                                      </Pressable>
                                      <Pressable onPress={() => openTaskDetail(tkItem)} style={styles.entryTap}>
                                        <MaterialIcons name="task-alt" size={14} color="#818CF8" />
                                        <View style={{ flex: 1 }}>
                                          <Text style={[styles.entryTitle, tdone && styles.entryTitleDone]} numberOfLines={1}>{taskTitle(tkItem)}</Text>
                                          {sub ? <Text style={styles.entrySub} numberOfLines={1}>{sub}</Text> : null}
                                        </View>
                                      </Pressable>
                                      <MaterialIcons name="chevron-right" size={18} color="#5A6B7C" />
                                    </View>
                                  );
                                })}
                                {cList.length > 0 && (
                                  <>
                                    <View style={styles.expandHeader}>
                                      <Text style={styles.expandHeaderText}>{t('rundgang_checklist')} ({cList.length})</Text>
                                    </View>
                                    {cList.map((c) => (
                                      <Pressable key={c.id} onPress={() => openChecklistDetail(c)} style={styles.entryRow}>
                                        <View style={styles.entryCheck}>
                                          <MaterialIcons name="checklist" size={20} color="#34D399" />
                                        </View>
                                        <View style={styles.entryTap}>
                                          <Text style={styles.entryTitle} numberOfLines={1}>{c.checklistName || t("rundgang_checklist" as any)}</Text>
                                        </View>
                                        <MaterialIcons name="chevron-right" size={18} color="#5A6B7C" />
                                      </Pressable>
                                    ))}
                                  </>
                                )}

                                {/* Raum bearbeiten */}
                                <View style={styles.roomActions}>
                                  <Pressable onPress={() => openRoomRename(room)} style={styles.roomActionBtn} hitSlop={6}>
                                    <MaterialIcons name="edit" size={15} color="#5DADE2" />
                                    <Text style={styles.roomActionText}>{t('umbenennen' as any)}</Text>
                                  </Pressable>
                                  <Pressable onPress={() => confirmDeleteRoom(room)} style={styles.roomActionBtn} hitSlop={6}>
                                    <MaterialIcons name="delete-outline" size={16} color="#F87171" />
                                    <Text style={[styles.roomActionText, { color: "#F87171" }]}>{t('btn_loeschen')}</Text>
                                  </Pressable>
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })
                    ))}
                  {expanded && (
                    <Pressable onPress={() => { setNewRoomNameInput(""); setAddRoomFloor(floor); }} style={styles.addRoomRow} hitSlop={6}>
                      <MaterialIcons name="add" size={16} color="#5DADE2" />
                      <Text style={styles.addRoomText}>{t('rundgang_add_room' as any)}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}

            {selectedProjectId && (
              <Pressable onPress={() => { setNewFloorName(""); setAddFloorOpen(true); }} style={styles.addFloorRow}>
                <MaterialIcons name="add" size={18} color="#5DADE2" />
                <Text style={styles.addFloorText}>{t('rundgang_add_floor' as any)}</Text>
              </Pressable>
            )}

            {floors.length > 0 && totalRooms === 0 && (
              <View style={styles.empty}>
                <MaterialIcons name="meeting-room" size={44} color="#4A5568" />
                <Text style={styles.emptyTitle}>{t("rooms_empty_title" as any)}</Text>
                <Text style={styles.emptyHint}>{t("rooms_empty_hint" as any)}</Text>
              </View>
            )}

            {selectedProjectId && (
              <>
                {/* Protokolle */}
                <Text style={styles.sectionHead}>{t('nav_protocols' as any)}</Text>
                {protocolList.length === 0 ? (
                  <Text style={styles.sectionEmpty}>—</Text>
                ) : (
                  protocolList.slice(0, 5).map((p) => (
                    <Pressable key={p.id} onPress={() => router.push(`/protocol-detail?id=${p.id}` as any)} style={styles.protoRow}>
                      <MaterialIcons name="description" size={18} color="#8FA3B8" />
                      <Text style={styles.protoText} numberOfLines={1}>{p.title || p.templateName || t('protokoll')} · {new Date(p.createdAt).toLocaleDateString("de-DE")}</Text>
                      <MaterialIcons name="chevron-right" size={18} color="#8FA3B8" />
                    </Pressable>
                  ))
                )}

                {/* Tools */}
                <Text style={styles.sectionHead}>{t('werkzeuge')}</Text>
                <View style={styles.toolRow}>
                  {([
                    { icon: "map", label: t('grundriss'), route: `/floor-plan?projectId=${selectedProjectId}` },
                    { icon: "photo-library", label: t('gallery_photos'), route: `/photo-gallery?projectId=${selectedProjectId}` },
                    { icon: "compare", label: t('vergleich'), route: `/photo-compare?projectId=${selectedProjectId}` },
                    { icon: "straighten", label: t('measure_title' as any), route: `/measure?projectId=${selectedProjectId}` },
                    { icon: "auto-stories", label: t('raumbuch_title' as any), route: `/raumbuch?projectId=${selectedProjectId}` },
                    { icon: "checklist", label: t('checklist_title'), route: `/checklists?projectId=${selectedProjectId}` },
                    { icon: "groups", label: t('anwesenheit'), route: `/attendance?projectId=${selectedProjectId}` },
                    { icon: "schedule", label: t('zeiterfassung'), route: `/time-tracking?projectId=${selectedProjectId}` },
                  ] as const).map((tool) => (
                    <Pressable key={tool.label} onPress={() => router.push(tool.route as any)} style={styles.toolBox}>
                      <MaterialIcons name={tool.icon as any} size={22} color="#5DADE2" />
                      <Text style={styles.toolBoxText} numberOfLines={1}>{tool.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* PDF Export */}
                <Pressable onPress={() => router.push(`/project-export?projectId=${selectedProjectId}&projectName=${encodeURIComponent(projects.find((p) => p.id === selectedProjectId)?.name || "")}` as any)} style={styles.pdfExportBtn}>
                  <MaterialIcons name="picture-as-pdf" size={20} color="#FFFFFF" />
                  <Text style={styles.pdfExportText}>{t('export')}</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </>
      )}

      {/* Add task to a room (inline, no window switch) */}
      <Modal visible={!!taskRoom} transparent animationType="slide" onRequestClose={() => setTaskRoom(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            <Text style={styles.taskSheetTitle}>{t('rooms_add_task_here' as any)}</Text>
            <Text style={styles.taskSheetSub}>{[taskRoom && roomFloorName(taskRoom), taskRoom?.name].filter(Boolean).join(" · ")}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <TextInput
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                placeholder={t('titel' as any)}
                placeholderTextColor="#5F7590"
                autoFocus
                returnKeyType="next"
                style={styles.taskInput}
              />
              <TextInput
                value={newTaskDesc}
                onChangeText={setNewTaskDesc}
                placeholder={t('beschreibung_optional' as any)}
                placeholderTextColor="#5F7590"
                multiline
                style={[styles.taskInput, { minHeight: 70, textAlignVertical: "top" }]}
              />

              <Text style={styles.defLabel}>{t('zustaendig')}</Text>
              <AssigneeInput value={newTaskAssignee} onChange={setNewTaskAssignee} placeholder={t('zustaendig')} style={styles.taskInput} />

              <View style={{ marginTop: 8 }}>
                <DateOnlyPicker value={newTaskDue} onChange={setNewTaskDue} label={t('frist')} withTime />
              </View>
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setTaskRoom(null)} style={styles.taskCancel}>
                <Text style={{ color: "#8FA3B8", fontWeight: "700" }}>{t('btn_abbrechen')}</Text>
              </Pressable>
              <Pressable onPress={createRoomTask} style={styles.taskSave}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create defect for a room (inline popup) */}
      <Modal visible={!!defectRoom} transparent animationType="slide" onRequestClose={() => setDefectRoom(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            <Text style={styles.taskSheetTitle}>{t('rooms_add_defect_here' as any)}</Text>
            <Text style={styles.taskSheetSub}>{defectRoom?.name}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              <TextInput value={newDefectTitle} onChangeText={setNewDefectTitle} placeholder={t('titel' as any)} placeholderTextColor="#5F7590" autoFocus returnKeyType="next" style={styles.taskInput} />
              <TextInput value={newDefectDesc} onChangeText={setNewDefectDesc} placeholder={t('beschreibung_optional' as any)} placeholderTextColor="#5F7590" multiline style={[styles.taskInput, { minHeight: 70, textAlignVertical: "top" }]} />

              <Text style={styles.defLabel}>{t('gewerk')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                {GEWERKE.map((g) => {
                  const active = newDefectGewerk === g;
                  return (
                    <Pressable key={g} onPress={() => setNewDefectGewerk(active ? "" : g)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: active ? "#5DADE2" : "#1E3A5F", backgroundColor: active ? "#5DADE218" : "transparent" }}>
                      <Text style={{ fontSize: 13, fontWeight: active ? "700" : "600", color: active ? "#5DADE2" : "#8FA3B8" }}>{g}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.defLabel}>{t('prioritaet')}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["hoch", "mittel", "niedrig"] as const).map((p) => {
                  const active = newDefectPriority === p;
                  const c = p === "hoch" ? "#DC2626" : p === "mittel" ? "#F59E0B" : "#16A34A";
                  return (
                    <Pressable key={p} onPress={() => setNewDefectPriority(p)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center", borderColor: active ? c : "#1E3A5F", backgroundColor: active ? c + "18" : "transparent" }}>
                      <Text style={{ fontSize: 13, fontWeight: active ? "800" : "600", color: active ? c : "#8FA3B8" }}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.defLabel}>{t('zustaendig')}</Text>
              <AssigneeInput value={newDefectAssignee} onChange={setNewDefectAssignee} placeholder={t('zustaendig')} style={styles.taskInput} />

              <View style={{ marginTop: 8 }}>
                <DateOnlyPicker value={newDefectDue} onChange={setNewDefectDue} label={t('frist')} withTime />
              </View>

              <Pressable onPress={pickDefectPhotos} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#1E3A5F", opacity: pressed ? 0.8 : 1 }]}>
                <MaterialIcons name="add-a-photo" size={18} color="#5DADE2" />
                <Text style={{ color: "#5DADE2", fontWeight: "700", fontSize: 14 }}>{t('fotos_hinzufuegen')}</Text>
              </Pressable>
              {newDefectPhotos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
                  {newDefectPhotos.map((uri, i) => (
                    <View key={i}>
                      <ExpoImage source={{ uri }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" />
                      <Pressable onPress={() => setNewDefectPhotos((prev) => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#EF4444", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                        <MaterialIcons name="close" size={13} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setDefectRoom(null)} style={styles.taskCancel}><Text style={{ color: "#8FA3B8", fontWeight: "700" }}>{t('btn_abbrechen')}</Text></Pressable>
              <Pressable onPress={createRoomDefect} style={styles.taskSave}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Defect detail popup */}
      <Modal visible={!!selectedDefect} transparent animationType="slide" onRequestClose={() => setSelectedDefect(null)}>
        <View style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            {selectedDefect && (
              <>
                {selectedDefect.room ? <Text style={styles.taskSheetSub}>{selectedDefect.room}</Text> : null}
                <TextInput value={editDefectTitle} onChangeText={setEditDefectTitle} placeholder={t('titel' as any)} placeholderTextColor="#5F7590" style={[styles.taskInput, { fontSize: 16, fontWeight: "700", marginTop: 8 }]} />
                <View style={styles.statusRow}>
                  {([["offen", "index_offen"], ["in_bearbeitung", "index_in_arbeit"], ["erledigt", "index_erledigt"]] as const).map(([s, lbl]) => {
                    const active = selectedDefect.status === s;
                    const col = s === "erledigt" ? "#10B981" : s === "in_bearbeitung" ? "#F59E0B" : "#F97316";
                    return (
                      <Pressable key={s} onPress={() => setDefectStatusNow(selectedDefect, s as DefectStatus)} style={[styles.statusChip, { borderColor: active ? col : "#1E3A5F", backgroundColor: active ? col + "22" : "transparent" }]}>
                        <Text style={{ fontSize: 12, fontWeight: active ? "800" : "600", color: active ? col : "#8FA3B8" }}>{t(lbl as any)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput value={editDefectDesc} onChangeText={setEditDefectDesc} placeholder={t('beschreibung_optional' as any)} placeholderTextColor="#5F7590" multiline style={[styles.taskInput, { minHeight: 70, textAlignVertical: "top", marginTop: 12 }]} />
                <Text style={[styles.createLabelSm]}>{t('zustaendig')}</Text>
                <AssigneeInput value={editDefectAssignee} onChange={setEditDefectAssignee} placeholder={t('zustaendig')} style={styles.taskInput} />
                <View style={{ marginTop: 12 }}>
                  <DateOnlyPicker value={editDefectDue} onChange={setEditDefectDue} label={t('frist')} withTime />
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <Pressable onPress={() => deleteDefectNow(selectedDefect)} style={[styles.taskCancel, { borderColor: "#7F1D1D" }]}><Text style={{ color: "#F87171", fontWeight: "700" }}>{t('btn_loeschen')}</Text></Pressable>
                  <Pressable onPress={saveDefectEdit} style={styles.taskSave}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text></Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Task detail popup */}
      <Modal visible={!!selectedTask} transparent animationType="slide" onRequestClose={() => setSelectedTask(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            {selectedTask && (
              <>
                <Text style={styles.taskSheetTitle}>{t('index_tool_aufgaben' as any)}</Text>
                {(selectedTask.floor || selectedTask.room) ? <Text style={styles.taskSheetSub}>{[selectedTask.floor, selectedTask.room].filter(Boolean).join(" · ")}</Text> : null}
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                  <TextInput value={editTaskTitle} onChangeText={setEditTaskTitle} placeholder={t('titel' as any)} placeholderTextColor="#5F7590" style={styles.taskInput} />
                  <TextInput value={editTaskDesc} onChangeText={setEditTaskDesc} placeholder={t('beschreibung_optional' as any)} placeholderTextColor="#5F7590" multiline style={[styles.taskInput, { minHeight: 70, textAlignVertical: "top" }]} />

                  <Text style={styles.defLabel}>{t('zustaendig')}</Text>
                  <AssigneeInput value={editTaskAssignee} onChange={setEditTaskAssignee} placeholder={t('zustaendig')} style={styles.taskInput} />

                  <View style={{ marginTop: 8 }}>
                    <DateOnlyPicker value={editTaskDue} onChange={setEditTaskDue} label={t('frist')} withTime />
                  </View>

                  <Pressable onPress={() => toggleTaskDone(selectedTask)} style={[styles.doneToggle, { borderColor: isTaskDone(selectedTask) ? "#10B981" : "#1E3A5F", marginTop: 14 }]}>
                    <MaterialIcons name={isTaskDone(selectedTask) ? "check-circle" : "radio-button-unchecked"} size={22} color={isTaskDone(selectedTask) ? "#10B981" : "#4B5B6B"} />
                    <Text style={{ color: isTaskDone(selectedTask) ? "#10B981" : "#8FA3B8", fontWeight: "700" }}>{t('index_erledigt' as any)}</Text>
                  </Pressable>
                </ScrollView>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  <Pressable onPress={() => deleteTaskNow(selectedTask)} style={[styles.taskCancel, { borderColor: "#7F1D1D" }]}><Text style={{ color: "#F87171", fontWeight: "700" }}>{t('btn_loeschen')}</Text></Pressable>
                  <Pressable onPress={saveTaskEdit} style={styles.taskSave}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text></Pressable>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Checklist detail popup (read-only) */}
      <Modal visible={!!selectedChecklist} transparent animationType="slide" onRequestClose={() => setSelectedChecklist(null)}>
        <View style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            {selectedChecklist && (
              <>
                <Text style={styles.taskSheetTitle} numberOfLines={2}>{selectedChecklist.checklistName}</Text>
                <Text style={styles.taskSheetSub}>
                  {getChecklistCompletionRate(selectedChecklist)}%
                  {selectedChecklist.location ? `  ·  ${selectedChecklist.location}` : ""}
                  {selectedChecklist.inspector ? `  ·  ${selectedChecklist.inspector}` : ""}
                </Text>
                <Text style={{ color: "#8FA3B8", fontSize: 13, marginTop: 10, marginBottom: 6 }}>
                  {(selectedChecklist.results || []).filter((r) => r.checked).length} / {(selectedChecklist.results || []).length} {t('index_erledigt' as any)}
                </Text>
                {/* The actual Prüfpunkte — tap to toggle; saved immediately. */}
                <ScrollView style={{ maxHeight: 360, marginTop: 4 }} showsVerticalScrollIndicator>
                  {(selectedChecklist.results || []).map((r) => (
                    <Pressable
                      key={r.itemId}
                      onPress={() => void toggleChecklistItem(r.itemId)}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1E3A5F", opacity: pressed ? 0.7 : 1 }]}
                    >
                      <MaterialIcons
                        name={r.checked ? "check-box" : "check-box-outline-blank"}
                        size={22}
                        color={r.checked ? "#34D399" : "#5A7184"}
                        style={{ marginTop: 1 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: r.checked ? "#8FA3B8" : "#E8EEF4", fontSize: 14, fontWeight: "600", textDecorationLine: r.checked ? "line-through" : "none" }}>
                          {checklistItemText(selectedChecklist, r.itemId)}
                        </Text>
                        {r.note ? <Text style={{ color: "#8FA3B8", fontSize: 12, marginTop: 2 }}>{r.note}</Text> : null}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable onPress={() => setSelectedChecklist(null)} style={[styles.taskSave, { marginTop: 14 }]}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('close' as any)}</Text></Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Rename a room */}
      <Modal visible={!!renameRoom} transparent animationType="slide" onRequestClose={() => setRenameRoom(null)}>
        <View style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            <Text style={styles.taskSheetTitle}>{t('umbenennen' as any)}</Text>
            <TextInput
              value={renameRoomName}
              onChangeText={setRenameRoomName}
              placeholder={t('rooms_add_room' as any)}
              placeholderTextColor="#5F7590"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveRoomRename}
              style={styles.taskInput}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => renameRoom && confirmDeleteRoom(renameRoom)} style={[styles.taskCancel, { borderColor: "#7F1D1D" }]}><Text style={{ color: "#F87171", fontWeight: "700" }}>{t('btn_loeschen')}</Text></Pressable>
              <Pressable onPress={saveRoomRename} style={styles.taskSave}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add floor */}
      <Modal visible={addFloorOpen} transparent animationType="slide" onRequestClose={() => setAddFloorOpen(false)}>
        <View style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            <Text style={styles.taskSheetTitle}>{t('rundgang_add_floor' as any)}</Text>
            <TextInput
              value={newFloorName}
              onChangeText={setNewFloorName}
              placeholder={t('rundgang_add_floor' as any)}
              placeholderTextColor="#5F7590"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveAddFloor}
              style={styles.taskInput}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setAddFloorOpen(false)} style={styles.taskCancel}><Text style={{ color: "#8FA3B8", fontWeight: "700" }}>{t('btn_abbrechen')}</Text></Pressable>
              <Pressable onPress={saveAddFloor} style={styles.taskSave}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add room to a floor */}
      <Modal visible={!!addRoomFloor} transparent animationType="slide" onRequestClose={() => setAddRoomFloor(null)}>
        <View style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            <Text style={styles.taskSheetTitle}>{t('rundgang_add_room' as any)}</Text>
            <TextInput
              value={newRoomNameInput}
              onChangeText={setNewRoomNameInput}
              placeholder={t('rooms_add_room' as any)}
              placeholderTextColor="#5F7590"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveAddRoom}
              style={styles.taskInput}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setAddRoomFloor(null)} style={styles.taskCancel}><Text style={{ color: "#8FA3B8", fontWeight: "700" }}>{t('btn_abbrechen')}</Text></Pressable>
              <Pressable onPress={saveAddRoom} style={styles.taskSave}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Project dropdown with search */}
      <Modal visible={showProjectDropdown} animationType="slide" onRequestClose={() => { if (selectedProjectId) setShowProjectDropdown(false); }}>
        <View style={[styles.chooserScreen, { backgroundColor: colors.background }]}>
          {selectedProjectId && (
            <Pressable onPress={() => setShowProjectDropdown(false)} hitSlop={10} style={styles.chooserClose}>
              <MaterialIcons name="close" size={28} color={colors.foreground} />
            </Pressable>
          )}
          <Text style={[styles.chooserTitle, { color: colors.foreground }]}>{t("index_projekt_auswaehlen" as any)}</Text>
          <Text style={[styles.chooserSubtitle, { color: colors.muted }]}>{t("chooser_subtitle" as any)}</Text>

          <View style={[styles.chooserSearch, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="search" size={20} color={colors.muted} />
            <TextInput
              value={projectSearch}
              onChangeText={setProjectSearch}
              placeholder={t("rundgang_search_project" as any)}
              placeholderTextColor={colors.muted}
              style={[styles.chooserSearchInput, { color: colors.foreground }]}
            />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
            {projects
              .filter((p) => !projectSearch.trim() || p.name.toLowerCase().includes(projectSearch.trim().toLowerCase()))
              .map((p) => {
                const active = p.id === selectedProjectId;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => { pickProject(p.id); setShowProjectDropdown(false); }}
                    style={({ pressed }) => [styles.chooserRow, { backgroundColor: colors.surface, borderColor: active ? "#5DADE2" : colors.border, borderWidth: active ? 2 : 1 }, { opacity: pressed ? 0.85 : 1 }]}
                  >
                    <View style={[styles.chipDot, { width: 14, height: 14, borderRadius: 7, backgroundColor: p.color || "#5DADE2" }]} />
                    <Text style={[styles.chooserRowText, { color: active ? "#5DADE2" : colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                    {active && <MaterialIcons name="check-circle" size={22} color="#5DADE2" />}
                    <Pressable onPress={() => deleteProject(p)} hitSlop={10} style={{ padding: 4, marginLeft: 4 }}>
                      <MaterialIcons name="delete-outline" size={22} color="#E57373" />
                    </Pressable>
                  </Pressable>
                );
              })}
          </ScrollView>

          <Pressable onPress={() => { setShowProjectDropdown(false); router.push("/project-wizard?mode=new" as any); }} style={({ pressed }) => [styles.chooserNew, { opacity: pressed ? 0.85 : 1 }]}>
            <MaterialIcons name="add" size={22} color="#FFFFFF" />
            <Text style={styles.chooserNewText}>{t("rundgang_new_project" as any)}</Text>
          </Pressable>
        </View>
      </Modal>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 30, fontWeight: "800", color: "#F0F4F8" },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "#14261C",
    borderWidth: 1,
    borderColor: "#166534",
  },
  doneBadgeText: { color: "#8FE3BE", fontSize: 12, fontWeight: "700" },
  baustelleCard: { marginHorizontal: 16, marginTop: 8, marginBottom: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F2235" },
  baustelleHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  baustelleDot: { width: 14, height: 14, borderRadius: 7 },
  baustelleName: { flex: 1, color: "#F0F4F8", fontSize: 22, fontWeight: "800" },
  baustelleMeta: { color: "#8FA3B8", fontSize: 12, fontWeight: "600", marginTop: 6 },
  startBegehungBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#5DADE2", borderRadius: 12, paddingVertical: 14, marginTop: 14 },
  startBegehungText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  whatDoCard: { width: "86%", maxWidth: 420, backgroundColor: "#0F2235", borderRadius: 18, borderWidth: 1, borderColor: "#1E3A5F", padding: 20, gap: 10 },
  whatDoTitle: { color: "#F0F4F8", fontSize: 20, fontWeight: "800", marginBottom: 6 },
  whatDoBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#13293D", borderRadius: 12, borderWidth: 1, borderColor: "#1E3A5F", paddingVertical: 15, paddingHorizontal: 14 },
  whatDoBtnText: { flex: 1, color: "#E8EEF4", fontSize: 15, fontWeight: "700" },
  whatDoBtnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#5DADE2", borderRadius: 12, paddingVertical: 15, paddingHorizontal: 14 },
  whatDoBtnPrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  baustelleRecent: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#1E3A5F" },
  baustelleRecentText: { flex: 1, color: "#8FA3B8", fontSize: 13, fontWeight: "600" },
  projectSelect: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F2235", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  projectSelectText: { flex: 1, color: "#F0F4F8", fontSize: 16, fontWeight: "700" },
  dropdownOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
  dropdownCard: { backgroundColor: "#0B1A2A", borderWidth: 1, borderColor: "#1E3A5F", borderRadius: 16, padding: 12, maxWidth: 560, width: "100%", alignSelf: "center" },
  dropdownSearch: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#1E3A5F", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  dropdownSearchInput: { flex: 1, color: "#F0F4F8", fontSize: 15 },
  dropdownRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1E3A5F" },
  dropdownRowText: { flex: 1, color: "#E2E8F0", fontSize: 15, fontWeight: "600" },
  dropdownNew: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "#5DADE2" },
  // Full-screen project chooser (entry point) — uses the app's dark theme with
  // blue only as an accent; colors are applied inline from `colors`.
  chooserScreen: { flex: 1, paddingTop: Platform.OS === "ios" ? 64 : 36, paddingHorizontal: 20 },
  chooserClose: { position: "absolute", top: Platform.OS === "ios" ? 58 : 30, right: 16, padding: 6, zIndex: 2 },
  chooserTitle: { fontSize: 30, fontWeight: "800", marginBottom: 4 },
  chooserSubtitle: { fontSize: 15, marginBottom: 22 },
  chooserSearch: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  chooserSearchInput: { flex: 1, fontSize: 16 },
  chooserRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 10 },
  chooserRowText: { flex: 1, fontSize: 17, fontWeight: "700" },
  chooserNew: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#5DADE2", borderRadius: 14, paddingVertical: 17, marginBottom: 24, marginTop: 4 },
  chooserNewText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  pickerWrap: { paddingHorizontal: 16, marginBottom: 10 },
  pickerLabel: { color: "#7F8C9B", fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 },
  chipsRow: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    backgroundColor: "#132238",
    maxWidth: 220,
  },
  chipActive: { borderColor: "#5DADE2", backgroundColor: "#15304A" },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { color: "#B7C4D2", fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF", fontWeight: "800" },
  progressTrack: {
    height: 6,
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 3,
    backgroundColor: "#13233A",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#10B981", borderRadius: 3 },
  floorBlock: { marginBottom: 8 },
  floorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  floorName: { flex: 1, color: "#DCE6F0", fontSize: 16, fontWeight: "800" },
  floorCount: { color: "#7F8C9B", fontSize: 13, fontWeight: "700" },
  floorEmpty: { color: "#5A6B7C", fontSize: 13, paddingHorizontal: 52, paddingBottom: 8 },
  roomCard: {
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: "#101E30",
    borderWidth: 1,
    borderColor: "#17293F",
    overflow: "hidden",
  },
  roomHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  roomHeaderTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  roomExpand: {
    borderTopWidth: 1,
    borderTopColor: "#17293F",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#0C1826",
  },
  expandEmpty: { color: "#5A6B7C", fontSize: 13, paddingVertical: 10, paddingHorizontal: 4 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 8, paddingHorizontal: 2 },
  statusChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  expandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  expandHeaderText: { color: "#7F8C9B", fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  expandAdd: { color: "#5DADE2", fontSize: 12, fontWeight: "700" },
  addRoomRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 14 },
  addRoomText: { color: "#5DADE2", fontSize: 13, fontWeight: "700" },
  addFloorRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginTop: 6, marginBottom: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#1E3A5F", borderStyle: "dashed" },
  sectionHead: { color: "#8FA3B8", fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginHorizontal: 16, marginTop: 22, marginBottom: 8 },
  sectionEmpty: { color: "#5F7590", fontSize: 14, marginHorizontal: 16 },
  protoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F2235" },
  protoText: { flex: 1, color: "#E8EEF4", fontSize: 14, fontWeight: "600" },
  toolRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 16 },
  toolBox: { flexBasis: "22%", flexGrow: 1, minWidth: 72, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#1E3A5F", backgroundColor: "#0F2235" },
  toolBoxText: { color: "#E8EEF4", fontSize: 11, fontWeight: "600" },
  pdfExportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginTop: 14, paddingVertical: 14, borderRadius: 12, backgroundColor: "#1E3A5F" },
  pdfExportText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  addFloorText: { color: "#5DADE2", fontSize: 14, fontWeight: "800" },
  taskOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center" },
  taskSheet: { backgroundColor: "#0F1E30", borderRadius: 18, padding: 20, paddingBottom: 34, borderWidth: 1, borderColor: "#1E3A5F" },
  taskSheetTitle: { color: "#F0F4F8", fontSize: 18, fontWeight: "800" },
  createLabelSm: { color: "#8FA3B8", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  defLabel: { fontSize: 12, color: "#8FA3B8", fontWeight: "700", marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  taskSheetSub: { color: "#8FA3B8", fontSize: 13, marginTop: 2 },
  taskInput: { marginTop: 14, borderWidth: 1, borderColor: "#1E3A5F", borderRadius: 8, padding: 12, color: "#F0F4F8", fontSize: 15, backgroundColor: "#0C1826" },
  taskCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: "#1E3A5F", alignItems: "center" },
  taskSave: { flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: "#5DADE2", alignItems: "center" },
  doneToggle: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
  roomActions: { flexDirection: "row", gap: 18, marginTop: 12, paddingHorizontal: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#17293F" },
  roomActionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4 },
  roomActionText: { color: "#5DADE2", fontSize: 13, fontWeight: "700" },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  entryCheck: { padding: 2, width: 28, alignItems: "center" },
  entryTap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  entryTitle: { color: "#DCE6F0", fontSize: 14, fontWeight: "600" },
  entryTitleDone: { color: "#6B7A8A", textDecorationLine: "line-through" },
  entrySub: { color: "#7E8EA0", fontSize: 11, fontWeight: "500", marginTop: 1 },
  roomOpenLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  roomOpenLinkText: { color: "#5DADE2", fontSize: 13, fontWeight: "700" },
  checkbox: { padding: 2 },
  roomName: { color: "#F0F4F8", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  roomStatusText: { fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", justifyContent: "center", padding: 40, gap: 10, marginTop: 40 },
  emptyTitle: { color: "#B7C4D2", fontSize: 16, fontWeight: "700" },
  emptyHint: { color: "#7F8C9B", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
