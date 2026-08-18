import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useTranslation } from "@/lib/language-provider";
import {
  getProjectStructure,
  updateRoom,
  initializeDefaultFloors,
  type Floor,
  type Room,
} from "@/lib/room-store";
import { getDefects, type Defect, type DefectStatus } from "@/lib/defect-store";
import { getChecklistResults, type ChecklistResult } from "@/lib/checklist-store";

type ProjectItem = { id: string; name: string; color?: string; archived?: boolean; favorite?: boolean };
type ProjectTask = { id: string; projectId?: string; status?: string; done?: boolean; room?: string };

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
                        const statusColor = ROOM_STATUS_COLORS[room.status || "nicht_begonnen"];
                        return (
                          <Pressable key={room.id} onPress={() => openRoom(room)} style={styles.roomCard}>
                            <Pressable
                              onPress={() => toggleRoomDone(room)}
                              hitSlop={10}
                              style={styles.checkbox}
                            >
                              <MaterialIcons
                                name={done ? "check-circle" : "radio-button-unchecked"}
                                size={26}
                                color={done ? "#10B981" : "#4B5B6B"}
                              />
                            </Pressable>
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
                            <MaterialIcons name="chevron-right" size={20} color="#5A6B7C" />
                          </Pressable>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: "#101E30",
    borderWidth: 1,
    borderColor: "#17293F",
  },
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
