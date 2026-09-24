import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, TextInput, Modal, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "@/lib/language-provider";
import {
  getProjectStructure,
  updateRoom,
  deleteRoom,
  initializeDefaultFloors,
  type Floor,
  type Room,
} from "@/lib/room-store";
import { getDefects, updateDefectStatus, saveDefect, deleteDefect, type Defect, type DefectStatus } from "@/lib/defect-store";
import { getChecklistResults, getChecklistCompletionRate, type ChecklistResult } from "@/lib/checklist-store";

type ProjectItem = { id: string; name: string; color?: string; archived?: boolean; favorite?: boolean };
type ProjectTask = { id: string; projectId?: string; status?: string; done?: boolean; room?: string; title?: string; task?: string; dueDate?: string };

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

export default function RundgangTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [checklistResults, setChecklistResults] = useState<ChecklistResult[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [taskRoom, setTaskRoom] = useState<Room | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  // Defect create popup
  const [defectRoom, setDefectRoom] = useState<Room | null>(null);
  const [newDefectTitle, setNewDefectTitle] = useState("");
  const [newDefectDesc, setNewDefectDesc] = useState("");
  // Detail popups
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [editDefectDesc, setEditDefectDesc] = useState("");
  const [editDefectTitle, setEditDefectTitle] = useState("");
  const [renameRoom, setRenameRoom] = useState<Room | null>(null);
  const [renameRoomName, setRenameRoomName] = useState("");
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [selectedChecklist, setSelectedChecklist] = useState<ChecklistResult | null>(null);

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

  const pickProject = (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProjectId(id);
  };

  const toggleFloor = (id: string) =>
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const roomDefects = (room: Room) =>
    defects.filter((d) => (d.room || "").trim().toLowerCase() === room.name.trim().toLowerCase());
  const roomOpenDefects = (room: Room) => roomDefects(room).filter((d) => OPEN_DEFECT_STATUSES.has(d.status)).length;
  const roomFollowUps = (room: Room) =>
    roomDefects(room).filter((d) => !!(d as any).followUpDate && d.status !== "erledigt" && d.status !== "geschlossen").length;
  const roomChecklists = (room: Room) =>
    checklistResults.filter((r) => (r.location || "").toLowerCase().includes(room.name.trim().toLowerCase())).length;
  const roomTasks = (room: Room) =>
    tasks.filter((tk) => (tk.room || "").trim().toLowerCase() === room.name.trim().toLowerCase() && tk.status !== "erledigt" && tk.done !== true).length;

  const openRoom = (room: Room) => {
    if (!selectedProjectId) return;
    router.push(`/rooms?projectId=${selectedProjectId}&openRoom=${room.id}` as any);
  };

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
    tasks.filter((tk) => (tk.room || "").trim().toLowerCase() === room.name.trim().toLowerCase());
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

  const openDefect = (d: Defect) => {
    setEditDefectTitle(d.title || "");
    setEditDefectDesc(d.description || "");
    setSelectedDefect(d);
  };
  const openTaskDetail = (tk: ProjectTask) => {
    setEditTaskTitle(taskTitle(tk));
    setSelectedTask(tk);
  };
  const openChecklistDetail = (c: ChecklistResult) => setSelectedChecklist(c);
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
    const updated = { ...d, title: editDefectTitle.trim() || d.title, description: editDefectDesc.trim(), updatedAt: new Date().toISOString() };
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
    setDefectRoom(room);
  };
  const createRoomDefect = async () => {
    const room = defectRoom;
    const title = newDefectTitle.trim();
    if (!room || !title || !selectedProjectId) { setDefectRoom(null); return; }
    const now = new Date().toISOString();
    const newDefect = {
      id: `defect_${Date.now()}`,
      projectId: selectedProjectId,
      title,
      description: newDefectDesc.trim(),
      status: "offen" as DefectStatus,
      priority: "mittel",
      category: "sonstiges",
      photos: [] as string[],
      room: room.name,
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
    setTasks((prev) => prev.map((x) => (x.id === tk.id ? { ...x, title } : x)));
    await persistTasks((all) => all.map((x) => (x.id === tk.id ? { ...x, title } : x)));
    setSelectedTask(null);
  };
  const deleteTaskNow = async (tk: ProjectTask) => {
    setTasks((prev) => prev.filter((x) => x.id !== tk.id));
    setSelectedTask(null);
    await persistTasks((all) => all.filter((x) => x.id !== tk.id));
  };

  const openTaskCreate = (room: Room) => {
    setNewTaskTitle("");
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
      title,
      status: "offen",
      done: false,
    };
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      const all: ProjectTask[] = raw ? JSON.parse(raw) : [];
      all.unshift(newTask);
      await AsyncStorage.setItem("project-tasks", JSON.stringify(all));
      setTasks((prev) => [newTask, ...prev]);
    } catch {}
    setNewTaskTitle("");
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
        <Text style={styles.headerTitle}>{t("rundgang" as any)}</Text>
        {totalRooms > 0 && (
          <View style={styles.doneBadge}>
            <MaterialIcons name="check-circle" size={14} color="#10B981" />
            <Text style={styles.doneBadgeText}>{doneText}</Text>
          </View>
        )}
      </View>

      {projects.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="folder-open" size={48} color="#4A5568" />
          <Text style={styles.emptyHint}>{t("rundgang_no_projects" as any)}</Text>
        </View>
      ) : (
        <>
          {/* Project selector */}
          <View style={styles.pickerWrap}>
            <Text style={styles.pickerLabel}>{t("rundgang_pick_project" as any)}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {projects.map((p) => {
                const active = p.id === selectedProjectId;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => pickProject(p.id)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <View style={[styles.chipDot, { backgroundColor: p.color || "#5DADE2" }]} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Progress bar */}
          {totalRooms > 0 && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          )}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>
            {floors.map((floor) => {
              const floorRooms = rooms.filter((r) => r.floorId === floor.id);
              const floorDone = floorRooms.filter((r) => DONE_STATUSES.has(r.status || "")).length;
              const expanded = expandedFloors.has(floor.id);
              return (
                <View key={floor.id} style={styles.floorBlock}>
                  <Pressable onPress={() => toggleFloor(floor.id)} style={styles.floorHeader}>
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
                                  return (
                                    <View key={d.id} style={styles.entryRow}>
                                      <Pressable onPress={() => toggleDefectDone(d)} hitSlop={8} style={styles.entryCheck}>
                                        <MaterialIcons name={ddone ? "check-circle" : "radio-button-unchecked"} size={22} color={ddone ? "#10B981" : "#4B5B6B"} />
                                      </Pressable>
                                      <Pressable onPress={() => openDefect(d)} style={styles.entryTap}>
                                        <MaterialIcons name="warning" size={14} color="#F97316" />
                                        <Text style={[styles.entryTitle, ddone && styles.entryTitleDone]} numberOfLines={1}>{d.title || d.description || t("index_tool_maengel" as any)}</Text>
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
                                  return (
                                    <View key={tkItem.id} style={styles.entryRow}>
                                      <Pressable onPress={() => toggleTaskDone(tkItem)} hitSlop={8} style={styles.entryCheck}>
                                        <MaterialIcons name={tdone ? "check-circle" : "radio-button-unchecked"} size={22} color={tdone ? "#10B981" : "#4B5B6B"} />
                                      </Pressable>
                                      <Pressable onPress={() => openTaskDetail(tkItem)} style={styles.entryTap}>
                                        <MaterialIcons name="task-alt" size={14} color="#818CF8" />
                                        <Text style={[styles.entryTitle, tdone && styles.entryTitleDone]} numberOfLines={1}>{taskTitle(tkItem)}</Text>
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
                </View>
              );
            })}

            {floors.length > 0 && totalRooms === 0 && (
              <View style={styles.empty}>
                <MaterialIcons name="meeting-room" size={44} color="#4A5568" />
                <Text style={styles.emptyTitle}>{t("rooms_empty_title" as any)}</Text>
                <Text style={styles.emptyHint}>{t("rooms_empty_hint" as any)}</Text>
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* Add task to a room (inline, no window switch) */}
      <Modal visible={!!taskRoom} transparent animationType="slide" onRequestClose={() => setTaskRoom(null)}>
        <View style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            <Text style={styles.taskSheetTitle}>{t('rooms_add_task_here' as any)}</Text>
            <Text style={styles.taskSheetSub}>{taskRoom?.name}</Text>
            <TextInput
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholder={t('titel' as any)}
              placeholderTextColor="#5F7590"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createRoomTask}
              style={styles.taskInput}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setTaskRoom(null)} style={styles.taskCancel}>
                <Text style={{ color: "#8FA3B8", fontWeight: "700" }}>{t('btn_abbrechen')}</Text>
              </Pressable>
              <Pressable onPress={createRoomTask} style={styles.taskSave}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create defect for a room (inline popup) */}
      <Modal visible={!!defectRoom} transparent animationType="slide" onRequestClose={() => setDefectRoom(null)}>
        <View style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            <Text style={styles.taskSheetTitle}>{t('rooms_add_defect_here' as any)}</Text>
            <Text style={styles.taskSheetSub}>{defectRoom?.name}</Text>
            <TextInput value={newDefectTitle} onChangeText={setNewDefectTitle} placeholder={t('titel' as any)} placeholderTextColor="#5F7590" autoFocus returnKeyType="next" style={styles.taskInput} />
            <TextInput value={newDefectDesc} onChangeText={setNewDefectDesc} placeholder={t('beschreibung_optional' as any)} placeholderTextColor="#5F7590" multiline style={[styles.taskInput, { minHeight: 70, textAlignVertical: "top" }]} />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setDefectRoom(null)} style={styles.taskCancel}><Text style={{ color: "#8FA3B8", fontWeight: "700" }}>{t('btn_abbrechen')}</Text></Pressable>
              <Pressable onPress={createRoomDefect} style={styles.taskSave}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text></Pressable>
            </View>
          </View>
        </View>
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
                <TextInput value={editDefectDesc} onChangeText={setEditDefectDesc} placeholder={t('beschreibung_optional' as any)} placeholderTextColor="#5F7590" multiline style={[styles.taskInput, { minHeight: 80, textAlignVertical: "top", marginTop: 12 }]} />
                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
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
        <View style={styles.taskOverlay}>
          <View style={styles.taskSheet}>
            {selectedTask && (
              <>
                <Text style={styles.taskSheetTitle}>{t('index_tool_aufgaben' as any)}</Text>
                {selectedTask.room ? <Text style={styles.taskSheetSub}>{selectedTask.room}</Text> : null}
                <TextInput value={editTaskTitle} onChangeText={setEditTaskTitle} placeholder={t('titel' as any)} placeholderTextColor="#5F7590" style={styles.taskInput} />
                <Pressable onPress={() => toggleTaskDone(selectedTask)} style={[styles.doneToggle, { borderColor: isTaskDone(selectedTask) ? "#10B981" : "#1E3A5F" }]}>
                  <MaterialIcons name={isTaskDone(selectedTask) ? "check-circle" : "radio-button-unchecked"} size={22} color={isTaskDone(selectedTask) ? "#10B981" : "#4B5B6B"} />
                  <Text style={{ color: isTaskDone(selectedTask) ? "#10B981" : "#8FA3B8", fontWeight: "700" }}>{t('index_erledigt' as any)}</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  <Pressable onPress={() => deleteTaskNow(selectedTask)} style={[styles.taskCancel, { borderColor: "#7F1D1D" }]}><Text style={{ color: "#F87171", fontWeight: "700" }}>{t('btn_loeschen')}</Text></Pressable>
                  <Pressable onPress={saveTaskEdit} style={styles.taskSave}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text></Pressable>
                </View>
              </>
            )}
          </View>
        </View>
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
                <Text style={{ color: "#8FA3B8", fontSize: 13, marginTop: 10 }}>
                  {(selectedChecklist.results || []).filter((r) => r.checked).length} / {(selectedChecklist.results || []).length} {t('index_erledigt' as any)}
                </Text>
                <Pressable onPress={() => setSelectedChecklist(null)} style={[styles.taskSave, { marginTop: 18 }]}><Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text></Pressable>
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
  taskOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  taskSheet: { backgroundColor: "#0F1E30", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 34, borderWidth: 1, borderColor: "#1E3A5F" },
  taskSheetTitle: { color: "#F0F4F8", fontSize: 18, fontWeight: "800" },
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
  entryTitle: { flex: 1, color: "#DCE6F0", fontSize: 14, fontWeight: "600" },
  entryTitleDone: { color: "#6B7A8A", textDecorationLine: "line-through" },
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
