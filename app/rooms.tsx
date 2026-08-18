/**
 * protoKI – Räume & Geschosse
 * 
 * Manage floors and rooms per project.
 * Accessible from project-detail and the tools grid.
 */
import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  StyleSheet,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { TradePicker } from "@/components/trade-picker";
import { SwipeableRow } from "@/components/swipeable-row";
import { useTranslation } from "@/lib/language-provider";
import {
  type Floor,
  type Room,
  getProjectStructure,
  addFloor,
  addRoom,
  updateRoom,
  deleteRoom,
  deleteFloor,
  initializeDefaultFloors,
} from "@/lib/room-store";
import { getDefects, type Defect, type DefectStatus } from "@/lib/defect-store";
import { getChecklistResults, type ChecklistResult } from "@/lib/checklist-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ProjectTask = { id: string; projectId?: string; title?: string; task?: string; status?: string; done?: boolean; priority?: string; room?: string; floor?: string; createdAt?: string };

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

const DEFECT_STATUS_DOT: Record<string, string> = {
  offen: "#EF4444",
  zugewiesen: "#F59E0B",
  in_bearbeitung: "#F59E0B",
  nachbesserung: "#F59E0B",
  pruefung: "#8B5CF6",
  erledigt: "#10B981",
  abgelehnt: "#6B7280",
  geschlossen: "#10B981",
};

export default function RoomsScreen() {
  const { t } = useTranslation();
  const { projectId, projectName, openRoom } = useLocalSearchParams<{ projectId: string; projectName?: string; openRoom?: string }>();
  const openRoomHandled = useRef(false);
  const router = useRouter();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [expandedFloor, setExpandedFloor] = useState<string | null>(null);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [checklistResults, setChecklistResults] = useState<ChecklistResult[]>([]);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [taskRoom, setTaskRoom] = useState<Room | null>(null);
  const [taskTitle, setTaskTitle] = useState("");

  // Add Floor Modal
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  const [newFloorNumber, setNewFloorNumber] = useState("");

  // Add Room Modal
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [addRoomFloorId, setAddRoomFloorId] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const [newRoomTrade, setNewRoomTrade] = useState("");

  const loadData = useCallback(async () => {
    if (!projectId) return;
    // Initialize default floors if none exist
    await initializeDefaultFloors(projectId);
    const structure = await getProjectStructure(projectId);
    setFloors(structure.floors.sort((a, b) => a.number - b.number));
    setRooms(structure.rooms);
    // Deep-link from the home overview: auto-open a specific room once.
    if (openRoom && !openRoomHandled.current) {
      const target = structure.rooms.find((r) => r.id === openRoom);
      if (target) {
        openRoomHandled.current = true;
        setExpandedFloor(target.floorId);
        setSelectedRoom(target);
      }
    }
    // Cross-tool link: defects & checklist inspections tied to a room (by name).
    try {
      const [allDefects, allResults, tasksRaw] = await Promise.all([
        getDefects(projectId),
        getChecklistResults(projectId),
        AsyncStorage.getItem("project-tasks"),
      ]);
      setDefects(allDefects);
      setChecklistResults(allResults);
      const allTasks: ProjectTask[] = tasksRaw ? JSON.parse(tasksRaw) : [];
      setProjectTasks(allTasks.filter((t) => !t.projectId || t.projectId === projectId));
    } catch {}
    // Expand first floor by default
    if (structure.floors.length > 0 && !expandedFloor) {
      setExpandedFloor(structure.floors[0].id);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const OPEN_DEFECT_STATUSES = new Set<DefectStatus>(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
  const roomDefects = (room: Room) =>
    defects.filter((d) => (d.room || "").trim().toLowerCase() === room.name.trim().toLowerCase());
  const roomOpenDefectCount = (room: Room) =>
    roomDefects(room).filter((d) => OPEN_DEFECT_STATUSES.has(d.status)).length;
  const roomChecklists = (room: Room) =>
    checklistResults.filter((r) => (r.location || "").toLowerCase().includes(room.name.trim().toLowerCase()));
  const roomFollowUps = (room: Room) =>
    roomDefects(room).filter((d) => !!(d as any).followUpDate && d.status !== "erledigt" && d.status !== "geschlossen");
  const roomTasks = (room: Room) =>
    projectTasks.filter((tk) => (tk.room || "").trim().toLowerCase() === room.name.trim().toLowerCase() && tk.status !== "erledigt" && tk.done !== true);

  const createRoomTask = async () => {
    const room = taskRoom;
    const title = taskTitle.trim();
    if (!room || !title) { setTaskRoom(null); return; }
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      const tasks: ProjectTask[] = raw ? JSON.parse(raw) : [];
      tasks.push({
        id: `task_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
        projectId,
        title,
        status: "offen",
        priority: "mittel",
        room: room.name,
        floor: floors.find((f) => f.id === room.floorId)?.name,
        createdAt: new Date().toISOString(),
      });
      await AsyncStorage.setItem("project-tasks", JSON.stringify(tasks));
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setTaskRoom(null);
    setTaskTitle("");
    loadData();
  };

  const handleAddFloor = async () => {
    Keyboard.dismiss();
    if (!newFloorName.trim() || !projectId) return;
    const num = parseInt(newFloorNumber) || 0;
    await addFloor(projectId, newFloorName.trim(), num);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewFloorName("");
    setNewFloorNumber("");
    setShowAddFloor(false);
    loadData();
  };

  const handleAddRoom = async () => {
    Keyboard.dismiss();
    if (!newRoomName.trim() || !projectId || !addRoomFloorId) return;
    await addRoom(projectId, addRoomFloorId, newRoomName.trim(), newRoomNumber.trim() || undefined, newRoomTrade.trim() || undefined);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewRoomName("");
    setNewRoomNumber("");
    setNewRoomTrade("");
    setShowAddRoom(false);
    loadData();
  };

  const handleDeleteFloor = (floor: Floor) => {
    const floorRooms = rooms.filter(r => r.floorId === floor.id);
    Alert.alert(
      t('rooms_delete_floor_title' as any),
      `"${floor.name}" ${t('rooms_delete_floor_connector' as any)} ${floorRooms.length} ${t('rooms_delete_floor_suffix' as any)}`,
      [
        { text: t('rooms_cancel' as any), style: "cancel" },
        { text: t('rooms_delete' as any), style: "destructive", onPress: async () => {
          await deleteFloor(projectId!, floor.id);
          loadData();
        }},
      ]
    );
  };

  const handleDeleteRoom = (room: Room) => {
    Alert.alert(
      t('rooms_delete_room_title' as any),
      `"${room.name}" ${t('rooms_delete_room_q' as any)}`,
      [
        { text: t('rooms_cancel' as any), style: "cancel" },
        { text: t('rooms_delete' as any), style: "destructive", onPress: async () => {
          await deleteRoom(projectId!, room.id);
          loadData();
        }},
      ]
    );
  };

  const cycleRoomStatus = async (room: Room) => {
    const statuses: Room["status"][] = ["nicht_begonnen", "in_arbeit", "fertig", "abgenommen"];
    const currentIdx = statuses.indexOf(room.status || "nicht_begonnen");
    const nextStatus = statuses[(currentIdx + 1) % statuses.length];
    await updateRoom(projectId!, room.id, { status: nextStatus });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadData();
  };

  const setRoomStatus = async (room: Room, status: Room["status"]) => {
    await updateRoom(projectId!, room.id, { status });
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    setSelectedRoom({ ...room, status });
    loadData();
  };

  const getRoomsForFloor = (floorId: string) => rooms.filter(r => r.floorId === floorId);

  const totalRooms = rooms.length;
  const completedRooms = rooms.filter(r => r.status === "fertig" || r.status === "abgenommen").length;

  return (
    <ScreenContainer>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="arrow-back" size={24} color="#F0F4F8" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.title}>{t('rooms_title' as any)}</Text>
            <Text style={styles.subtitle}>{projectName || t('rooms_project_fallback' as any)}</Text>
          </View>
          <Pressable
            onPress={() => setShowAddFloor(true)}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="add" size={18} color="#5DADE2" />
            <Text style={styles.addBtnText}>{t('rooms_floor' as any)}</Text>
          </Pressable>
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{floors.length}</Text>
            <Text style={styles.summaryLabel}>{t('rooms_floors' as any)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalRooms}</Text>
            <Text style={styles.summaryLabel}>{t('rooms_rooms' as any)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{completedRooms}/{totalRooms}</Text>
            <Text style={styles.summaryLabel}>{t('rooms_summary_done' as any)}</Text>
          </View>
        </View>

        {/* Bedien-Hinweis: die Gesten sind sonst nicht erkennbar */}
        <View style={styles.hint}>
          <MaterialIcons name="info-outline" size={15} color="#5DADE2" />
          <Text style={styles.hintText}>
            Geschoss antippen = auf-/zuklappen · Raum antippen = Status weiter
            (nicht begonnen → in Arbeit → fertig → abgenommen) · lang drücken = löschen.
            Ein Raum auf „fertig" bewegt auch den Baufortschritt.
          </Text>
        </View>

        {/* Floor List */}
        {floors.map((floor) => {
          const floorRooms = getRoomsForFloor(floor.id);
          const isExpanded = expandedFloor === floor.id;
          const floorDone = floorRooms.filter(r => r.status === "fertig" || r.status === "abgenommen").length;

          return (
            <View key={floor.id} style={styles.floorSection}>
              {/* Floor Header */}
              <SwipeableRow onDelete={() => handleDeleteFloor(floor)} deleteLabel={t('btn_loeschen')}>
              <Pressable
                onPress={() => setExpandedFloor(isExpanded ? null : floor.id)}
                onLongPress={() => handleDeleteFloor(floor)}
                style={({ pressed }) => [styles.floorHeader, { opacity: pressed ? 0.8 : 1 }]}
              >
                <MaterialIcons
                  name={isExpanded ? "expand-more" : "chevron-right"}
                  size={20}
                  color="#8FA3B8"
                />
                <Text style={styles.floorName}>{floor.name}</Text>
                <Text style={styles.floorCount}>{floorRooms.length} {t('rooms_rooms' as any)}</Text>
                {floorRooms.length > 0 && (
                  <Text style={styles.floorProgress}>{floorDone}/{floorRooms.length}</Text>
                )}
              </Pressable>
              </SwipeableRow>

              {/* Rooms */}
              {isExpanded && (
                <View style={styles.roomList}>
                  {floorRooms.map((room) => (
                    <SwipeableRow key={room.id} onDelete={() => handleDeleteRoom(room)} deleteLabel={t('btn_loeschen')}>
                    <Pressable
                      onPress={() => setSelectedRoom(room)}
                      onLongPress={() => handleDeleteRoom(room)}
                      style={({ pressed }) => [styles.roomCard, { opacity: pressed ? 0.8 : 1 }]}
                    >
                      <View style={[styles.roomStatus, { backgroundColor: ROOM_STATUS_COLORS[room.status || "nicht_begonnen"] }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.roomName}>{room.name}</Text>
                        <View style={styles.roomMeta}>
                          {room.number && <Text style={styles.roomNumber}>{room.number}</Text>}
                          {room.trade && <Text style={styles.roomTrade}>{room.trade}</Text>}
                        </View>
                      </View>
                      {roomOpenDefectCount(room) > 0 && (
                        <View style={styles.roomDefectBadge}>
                          <MaterialIcons name="warning" size={12} color="#F97316" />
                          <Text style={styles.roomDefectBadgeText}>{roomOpenDefectCount(room)}</Text>
                        </View>
                      )}
                      <Text style={[styles.roomStatusText, { color: ROOM_STATUS_COLORS[room.status || "nicht_begonnen"] }]}>
                        {t(ROOM_STATUS_LABELS[room.status || "nicht_begonnen"] as any)}
                      </Text>
                      <MaterialIcons name="chevron-right" size={18} color="#8FA3B8" style={{ marginLeft: 2 }} />
                    </Pressable>
                    </SwipeableRow>
                  ))}

                  {/* Add Room Button */}
                  <Pressable
                    onPress={() => { setAddRoomFloorId(floor.id); setShowAddRoom(true); }}
                    style={({ pressed }) => [styles.addRoomBtn, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="add" size={16} color="#5DADE2" />
                    <Text style={styles.addRoomBtnText}>{t('rooms_add_room' as any)}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {floors.length === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="apartment" size={48} color="#4A5568" />
            <Text style={styles.emptyText}>{t('rooms_empty_title' as any)}</Text>
            <Text style={styles.emptyHint}>{t('rooms_empty_hint' as any)}</Text>
          </View>
        )}
      </ScrollView>

      {/* ─── Add Floor Modal ─────────────────────────────────────────── */}
      <Modal visible={showAddFloor} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('rooms_add_floor_title' as any)}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('rooms_floor_name_placeholder' as any)}
              placeholderTextColor="#6B7280"
              value={newFloorName}
              onChangeText={setNewFloorName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <TextInput
              style={styles.input}
              placeholder={t('rooms_floor_number_placeholder' as any)}
              placeholderTextColor="#6B7280"
              value={newFloorNumber}
              onChangeText={setNewFloorNumber}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => { Keyboard.dismiss(); setShowAddFloor(false); }} style={({ pressed }) => [styles.modalBtn, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.modalBtnCancel}>{t('rooms_cancel' as any)}</Text>
              </Pressable>
              <Pressable onPress={handleAddFloor} style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.modalBtnPrimaryText}>{t('rooms_add' as any)}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Add Room Modal ──────────────────────────────────────────── */}
      <Modal visible={showAddRoom} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('rooms_add_room' as any)}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('rooms_room_name_placeholder' as any)}
              placeholderTextColor="#6B7280"
              value={newRoomName}
              onChangeText={setNewRoomName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <TextInput
              style={styles.input}
              placeholder={t('rooms_room_number_placeholder' as any)}
              placeholderTextColor="#6B7280"
              value={newRoomNumber}
              onChangeText={setNewRoomNumber}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <TradePicker
              value={newRoomTrade}
              onChange={setNewRoomTrade}
              placeholder={t('rooms_room_trade_placeholder' as any)}
              accessibilityLabel={t('rooms_room_trade_a11y' as any)}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => { Keyboard.dismiss(); setShowAddRoom(false); }} style={({ pressed }) => [styles.modalBtn, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.modalBtnCancel}>{t('rooms_cancel' as any)}</Text>
              </Pressable>
              <Pressable onPress={handleAddRoom} style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.modalBtnPrimaryText}>{t('rooms_add' as any)}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Room Detail Hub */}
      <Modal visible={!!selectedRoom} transparent animationType="slide" onRequestClose={() => setSelectedRoom(null)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailSheet}>
            {selectedRoom && (() => {
              const rd = roomDefects(selectedRoom);
              const rc = roomChecklists(selectedRoom);
              const rf = roomFollowUps(selectedRoom);
              const rt = roomTasks(selectedRoom);
              const floorName = floors.find((f) => f.id === selectedRoom.floorId)?.name || "";
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailTitle}>{selectedRoom.name}</Text>
                      <Text style={styles.detailSubtitle}>{floorName}{selectedRoom.trade ? ` · ${selectedRoom.trade}` : ""}</Text>
                    </View>
                    <Pressable onPress={() => setSelectedRoom(null)} hitSlop={8}>
                      <MaterialIcons name="close" size={24} color="#8FA3B8" />
                    </Pressable>
                  </View>

                  <Text style={styles.detailLabel}>{t('status_label' as any)}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                    {(["nicht_begonnen", "in_arbeit", "fertig", "abgenommen"] as const).map((s) => {
                      const active = (selectedRoom.status || "nicht_begonnen") === s;
                      return (
                        <Pressable
                          key={s}
                          onPress={() => setRoomStatus(selectedRoom, s)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: active ? ROOM_STATUS_COLORS[s] : "#1E3A5F", backgroundColor: active ? ROOM_STATUS_COLORS[s] + "22" : "transparent" }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: active ? "700" : "600", color: active ? ROOM_STATUS_COLORS[s] : "#8FA3B8" }}>{t(ROOM_STATUS_LABELS[s] as any)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={styles.detailLabel}>{t('maengel')} ({rd.length})</Text>
                    <Pressable onPress={() => { setSelectedRoom(null); router.push(`/defects?projectId=${projectId}` as any); }}>
                      <Text style={{ color: "#5DADE2", fontSize: 12, fontWeight: "700" }}>{t('rooms_open_all' as any)}</Text>
                    </Pressable>
                  </View>
                  {rd.length === 0 ? (
                    <Text style={styles.detailEmpty}>{t('rooms_no_defects' as any)}</Text>
                  ) : rd.map((d) => (
                    <View key={d.id} style={styles.linkRow}>
                      <View style={[styles.linkDot, { backgroundColor: DEFECT_STATUS_DOT[d.status] || "#6B7280" }]} />
                      <Text style={styles.linkText} numberOfLines={1}>{d.title}</Text>
                    </View>
                  ))}

                  {/* Nachprüfungen */}
                  <Text style={[styles.detailLabel, { marginTop: 18 }]}>{t('index_tool_nachpruefung')} ({rf.length})</Text>
                  {rf.length === 0 ? (
                    <Text style={styles.detailEmpty}>—</Text>
                  ) : rf.map((d) => (
                    <View key={`fu-${d.id}`} style={styles.linkRow}>
                      <MaterialIcons name="event-repeat" size={14} color="#A78BFA" />
                      <Text style={styles.linkText} numberOfLines={1}>{d.title}</Text>
                      <Text style={{ fontSize: 11, color: "#8FA3B8" }}>{(d as any).followUpDate}</Text>
                    </View>
                  ))}

                  {/* Aufgaben */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 8 }}>
                    <Text style={styles.detailLabel}>{t('index_tool_aufgaben')} ({rt.length})</Text>
                    <Pressable onPress={() => { setTaskTitle(""); setTaskRoom(selectedRoom); }}>
                      <Text style={{ color: "#5DADE2", fontSize: 12, fontWeight: "700" }}>+ {t('rooms_add_task_here' as any)}</Text>
                    </Pressable>
                  </View>
                  {rt.length === 0 ? (
                    <Text style={styles.detailEmpty}>{t('rooms_no_tasks' as any)}</Text>
                  ) : rt.map((tk) => (
                    <View key={`tk-${tk.id}`} style={styles.linkRow}>
                      <MaterialIcons name="task-alt" size={14} color="#8FA3B8" />
                      <Text style={styles.linkText} numberOfLines={1}>{tk.title || tk.task}</Text>
                    </View>
                  ))}

                  {rc.length > 0 && (
                    <>
                      <Text style={[styles.detailLabel, { marginTop: 18 }]}>{t('checklist_title')} ({rc.length})</Text>
                      {rc.map((r) => (
                        <View key={r.id} style={styles.linkRow}>
                          <MaterialIcons name="checklist" size={14} color="#8FA3B8" />
                          <Text style={styles.linkText} numberOfLines={1}>{r.checklistName}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  <Pressable
                    onPress={() => { setSelectedRoom(null); router.push(`/defects?projectId=${projectId}` as any); }}
                    style={styles.detailActionBtn}
                  >
                    <MaterialIcons name="add" size={18} color="#fff" />
                    <Text style={styles.detailActionText}>{t('rooms_add_defect_here' as any)}</Text>
                  </Pressable>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Add task to room */}
      <Modal visible={!!taskRoom} transparent animationType="slide" onRequestClose={() => setTaskRoom(null)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailSheet}>
            <Text style={styles.detailTitle}>{t('rooms_add_task_here' as any)}</Text>
            <Text style={styles.detailSubtitle}>{taskRoom?.name}</Text>
            <TextInput
              value={taskTitle}
              onChangeText={setTaskTitle}
              placeholder={t('titel' as any)}
              placeholderTextColor="#5F7590"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createRoomTask}
              style={{ marginTop: 14, borderWidth: 1, borderColor: "#1E3A5F", borderRadius: 8, padding: 12, color: "#F0F4F8", fontSize: 15 }}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setTaskRoom(null)} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: "#1E3A5F", alignItems: "center" }}>
                <Text style={{ color: "#8FA3B8", fontWeight: "700" }}>{t('btn_abbrechen')}</Text>
              </Pressable>
              <Pressable onPress={createRoomTask} style={{ flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: "#5DADE2", alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{t('save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  detailOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  detailSheet: { backgroundColor: "#0F1E30", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: "85%" },
  detailTitle: { fontSize: 20, fontWeight: "800", color: "#F0F4F8" },
  detailSubtitle: { fontSize: 13, color: "#8FA3B8", marginTop: 2 },
  detailLabel: { fontSize: 12, fontWeight: "700", color: "#5F7590", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  detailEmpty: { fontSize: 13, color: "#5F7590", fontStyle: "italic" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#12263E" },
  linkDot: { width: 8, height: 8, borderRadius: 4 },
  linkText: { flex: 1, fontSize: 14, color: "#F0F4F8" },
  detailActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#5DADE2", borderRadius: 10, paddingVertical: 12, marginTop: 20 },
  detailActionText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  roomDefectBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F9731622", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginRight: 6 },
  roomDefectBadgeText: { fontSize: 12, fontWeight: "700", color: "#F97316" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#F0F4F8" },
  subtitle: { fontSize: 12, color: "#8FA3B8", marginTop: 1 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  addBtnText: { fontSize: 12, fontWeight: "600", color: "#5DADE2" },
  // Summary
  summary: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
    padding: 14,
    justifyContent: "space-around",
  },
  summaryItem: { alignItems: "center" },
  summaryValue: { fontSize: 18, fontWeight: "700", color: "#F0F4F8" },
  summaryLabel: { fontSize: 10, color: "#8FA3B8", marginTop: 2 },
  hint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginTop: -8,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
  },
  hintText: { flex: 1, fontSize: 11, lineHeight: 16, color: "#8FA3B8" },
  // Floor
  floorSection: { marginHorizontal: 16, marginBottom: 8 },
  floorHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
    padding: 12,
    gap: 8,
  },
  floorName: { fontSize: 14, fontWeight: "700", color: "#F0F4F8", flex: 1 },
  floorCount: { fontSize: 11, color: "#8FA3B8" },
  floorProgress: { fontSize: 11, color: "#10B981", fontWeight: "600" },
  // Rooms
  roomList: { paddingLeft: 12, paddingTop: 6, gap: 4 },
  roomCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A1628",
    borderWidth: 1,
    borderColor: "#1E3A5F50",
    borderRadius: 0,
    padding: 10,
    gap: 10,
  },
  roomStatus: { width: 8, height: 8, borderRadius: 4 },
  roomName: { fontSize: 13, fontWeight: "600", color: "#F0F4F8" },
  roomMeta: { flexDirection: "row", gap: 8, marginTop: 2 },
  roomNumber: { fontSize: 10, color: "#8FA3B8" },
  roomTrade: { fontSize: 10, color: "#AB47BC" },
  roomStatusText: { fontSize: 10, fontWeight: "600" },
  addRoomBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  addRoomBtnText: { fontSize: 12, color: "#5DADE2" },
  // Empty
  empty: { alignItems: "center", marginTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: "#8FA3B8" },
  emptyHint: { fontSize: 12, color: "#6B7280" },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#0F1E30",
    borderRadius: 0,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#F0F4F8" },
  input: {
    backgroundColor: "#0A1628",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
    padding: 12,
    fontSize: 14,
    color: "#F0F4F8",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 0 },
  modalBtnCancel: { fontSize: 14, color: "#8FA3B8" },
  modalBtnPrimary: { backgroundColor: "#5DADE2" },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: "600", color: "#fff" },
});
