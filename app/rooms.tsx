/**
 * protoKI – Räume & Geschosse
 * 
 * Manage floors and rooms per project.
 * Accessible from project-detail and the tools grid.
 */
import { useState, useCallback } from "react";
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
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
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

const ROOM_STATUS_LABELS: Record<string, string> = {
  nicht_begonnen: "Nicht begonnen",
  in_arbeit: "In Arbeit",
  fertig: "Fertig",
  abgenommen: "Abgenommen",
};

const ROOM_STATUS_COLORS: Record<string, string> = {
  nicht_begonnen: "#6B7280",
  in_arbeit: "#F59E0B",
  fertig: "#10B981",
  abgenommen: "#3B82F6",
};

export default function RoomsScreen() {
  const { projectId, projectName } = useLocalSearchParams<{ projectId: string; projectName?: string }>();
  const router = useRouter();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [expandedFloor, setExpandedFloor] = useState<string | null>(null);

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
    // Expand first floor by default
    if (structure.floors.length > 0 && !expandedFloor) {
      setExpandedFloor(structure.floors[0].id);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleAddFloor = async () => {
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
      "Geschoss löschen",
      `"${floor.name}" und ${floorRooms.length} Räume löschen?`,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Löschen", style: "destructive", onPress: async () => {
          await deleteFloor(projectId!, floor.id);
          loadData();
        }},
      ]
    );
  };

  const handleDeleteRoom = (room: Room) => {
    Alert.alert(
      "Raum löschen",
      `"${room.name}" löschen?`,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Löschen", style: "destructive", onPress: async () => {
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
            <Text style={styles.title}>Räume & Geschosse</Text>
            <Text style={styles.subtitle}>{projectName || "Projekt"}</Text>
          </View>
          <Pressable
            onPress={() => setShowAddFloor(true)}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="add" size={18} color="#5DADE2" />
            <Text style={styles.addBtnText}>Geschoss</Text>
          </Pressable>
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{floors.length}</Text>
            <Text style={styles.summaryLabel}>Geschosse</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalRooms}</Text>
            <Text style={styles.summaryLabel}>Räume</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{completedRooms}/{totalRooms}</Text>
            <Text style={styles.summaryLabel}>Fertig</Text>
          </View>
        </View>

        {/* Floor List */}
        {floors.map((floor) => {
          const floorRooms = getRoomsForFloor(floor.id);
          const isExpanded = expandedFloor === floor.id;
          const floorDone = floorRooms.filter(r => r.status === "fertig" || r.status === "abgenommen").length;

          return (
            <View key={floor.id} style={styles.floorSection}>
              {/* Floor Header */}
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
                <Text style={styles.floorCount}>{floorRooms.length} Räume</Text>
                {floorRooms.length > 0 && (
                  <Text style={styles.floorProgress}>{floorDone}/{floorRooms.length}</Text>
                )}
              </Pressable>

              {/* Rooms */}
              {isExpanded && (
                <View style={styles.roomList}>
                  {floorRooms.map((room) => (
                    <Pressable
                      key={room.id}
                      onPress={() => cycleRoomStatus(room)}
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
                      <Text style={[styles.roomStatusText, { color: ROOM_STATUS_COLORS[room.status || "nicht_begonnen"] }]}>
                        {ROOM_STATUS_LABELS[room.status || "nicht_begonnen"]}
                      </Text>
                    </Pressable>
                  ))}

                  {/* Add Room Button */}
                  <Pressable
                    onPress={() => { setAddRoomFloorId(floor.id); setShowAddRoom(true); }}
                    style={({ pressed }) => [styles.addRoomBtn, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="add" size={16} color="#5DADE2" />
                    <Text style={styles.addRoomBtnText}>Raum hinzufügen</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {floors.length === 0 && (
          <View style={styles.empty}>
            <MaterialIcons name="apartment" size={48} color="#4A5568" />
            <Text style={styles.emptyText}>Noch keine Geschosse angelegt</Text>
            <Text style={styles.emptyHint}>Tippe oben auf &quot;+ Geschoss&quot; um zu beginnen</Text>
          </View>
        )}
      </ScrollView>

      {/* ─── Add Floor Modal ─────────────────────────────────────────── */}
      <Modal visible={showAddFloor} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Geschoss hinzufügen</Text>
            <TextInput
              style={styles.input}
              placeholder="Name (z.B. EG, 1. OG, UG)"
              placeholderTextColor="#6B7280"
              value={newFloorName}
              onChangeText={setNewFloorName}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Nummer (Sortierung, z.B. 0, 1, 2)"
              placeholderTextColor="#6B7280"
              value={newFloorNumber}
              onChangeText={setNewFloorNumber}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowAddFloor(false)} style={({ pressed }) => [styles.modalBtn, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.modalBtnCancel}>Abbrechen</Text>
              </Pressable>
              <Pressable onPress={handleAddFloor} style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.modalBtnPrimaryText}>Hinzufügen</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Add Room Modal ──────────────────────────────────────────── */}
      <Modal visible={showAddRoom} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Raum hinzufügen</Text>
            <TextInput
              style={styles.input}
              placeholder="Name (z.B. Bad, Küche, Flur)"
              placeholderTextColor="#6B7280"
              value={newRoomName}
              onChangeText={setNewRoomName}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Nummer (z.B. EG 03) – optional"
              placeholderTextColor="#6B7280"
              value={newRoomNumber}
              onChangeText={setNewRoomNumber}
            />
            <TextInput
              style={styles.input}
              placeholder="Gewerk (z.B. Fliesen) – optional"
              placeholderTextColor="#6B7280"
              value={newRoomTrade}
              onChangeText={setNewRoomTrade}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowAddRoom(false)} style={({ pressed }) => [styles.modalBtn, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.modalBtnCancel}>Abbrechen</Text>
              </Pressable>
              <Pressable onPress={handleAddRoom} style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.modalBtnPrimaryText}>Hinzufügen</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
