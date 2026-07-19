import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "@/lib/language-provider";

const ATTENDANCE_KEY = "attendance_records";

type AttendanceRecord = {
  id: string;
  projectId: string;
  date: string; // YYYY-MM-DD
  workers: AttendanceWorker[];
  createdAt: string;
  updatedAt: string;
};

type AttendanceWorker = {
  id: string;
  name: string;
  firma: string;
  gewerk: string;
  arrivalTime: string; // HH:MM
  departureTime: string; // HH:MM
  notes?: string;
};

export default function AttendanceScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = params.projectId || "";

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  // Form state
  const [workerName, setWorkerName] = useState("");
  const [workerFirma, setWorkerFirma] = useState("");
  const [workerGewerk, setWorkerGewerk] = useState("");
  const [arrivalTime, setArrivalTime] = useState("07:00");
  const [departureTime, setDepartureTime] = useState("16:00");
  const [workerNotes, setWorkerNotes] = useState("");

  const today = new Date().toISOString().split("T")[0];

  useFocusEffect(
    useCallback(() => {
      loadRecords();
    }, [projectId])
  );

  const loadRecords = async () => {
    try {
      const raw = await AsyncStorage.getItem(ATTENDANCE_KEY);
      const all: AttendanceRecord[] = raw ? JSON.parse(raw) : [];
      const filtered = projectId ? all.filter((r) => r.projectId === projectId) : all;
      setRecords(filtered.sort((a, b) => b.date.localeCompare(a.date)));
    } catch {}
  };

  const getTodayRecord = (): AttendanceRecord | undefined => {
    return records.find((r) => r.date === today);
  };

  const addWorker = async () => {
    if (!workerName.trim()) {
      Alert.alert("Fehler", "Name ist erforderlich");
      return;
    }

    const worker: AttendanceWorker = {
      id: `w_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: workerName.trim(),
      firma: workerFirma.trim(),
      gewerk: workerGewerk.trim(),
      arrivalTime,
      departureTime,
      notes: workerNotes.trim() || undefined,
    };

    const raw = await AsyncStorage.getItem(ATTENDANCE_KEY);
    const all: AttendanceRecord[] = raw ? JSON.parse(raw) : [];

    let record = all.find((r) => r.projectId === projectId && r.date === today);
    if (!record) {
      record = {
        id: `att_${Date.now()}`,
        projectId,
        date: today,
        workers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      all.push(record);
    }

    record.workers.push(worker);
    record.updatedAt = new Date().toISOString();

    await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(all));
    await loadRecords();

    setWorkerName("");
    setWorkerFirma("");
    setWorkerGewerk("");
    setWorkerNotes("");
    setShowAddModal(false);

    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removeWorker = async (recordId: string, workerId: string) => {
    const raw = await AsyncStorage.getItem(ATTENDANCE_KEY);
    const all: AttendanceRecord[] = raw ? JSON.parse(raw) : [];
    const record = all.find((r) => r.id === recordId);
    if (record) {
      record.workers = record.workers.filter((w) => w.id !== workerId);
      record.updatedAt = new Date().toISOString();
      await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(all));
      await loadRecords();
    }
  };

  const todayRecord = getTodayRecord();
  const totalWorkersToday = todayRecord?.workers.length || 0;

  const renderRecord = ({ item }: { item: AttendanceRecord }) => {
    const isToday = item.date === today;
    const dateFormatted = new Date(item.date + "T12:00:00").toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    return (
      <Pressable
        onPress={() => setSelectedRecord(item)}
        style={({ pressed }) => [
          styles.recordCard,
          { backgroundColor: colors.surface, borderColor: isToday ? colors.primary : colors.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.recordHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MaterialIcons name="calendar-today" size={16} color={isToday ? colors.primary : colors.muted} />
            <Text style={[styles.recordDate, { color: isToday ? colors.primary : colors.foreground }]}>
              {dateFormatted}
            </Text>
            {isToday && (
              <View style={[styles.todayBadge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.primary }}>HEUTE</Text>
              </View>
            )}
          </View>
          <View style={[styles.workerCount, { backgroundColor: colors.primary + "15" }]}>
            <MaterialIcons name="people" size={14} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{item.workers.length}</Text>
          </View>
        </View>

        {item.workers.length > 0 && (
          <View style={{ marginTop: 8 }}>
            {item.workers.slice(0, 3).map((w) => (
              <Text key={w.id} style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
                {w.name} ({w.firma || w.gewerk}) • {w.arrivalTime}–{w.departureTime}
              </Text>
            ))}
            {item.workers.length > 3 && (
              <Text style={{ fontSize: 11, color: colors.muted, fontStyle: "italic" }}>
                +{item.workers.length - 3} weitere
              </Text>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <ScreenContainer className="p-4">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Anwesenheit</Text>
        <Pressable onPress={() => setShowAddModal(true)} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="person-add" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Today Summary */}
      <View style={[styles.summaryCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
        <MaterialIcons name="groups" size={28} color={colors.primary} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>Heute auf der Baustelle</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            {totalWorkersToday} {totalWorkersToday === 1 ? "Person" : "Personen"} erfasst
          </Text>
        </View>
        <Pressable
          onPress={() => setShowAddModal(true)}
          style={({ pressed }) => [styles.quickAddBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
        >
          <MaterialIcons name="add" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Records List */}
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderRecord}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="people-outline" size={48} color={colors.muted} />
            <Text style={{ fontSize: 15, color: colors.muted, marginTop: 12 }}>
              Noch keine Anwesenheit erfasst
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
              Tippen Sie +, um Personen hinzuzufügen
            </Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal visible={!!selectedRecord} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {selectedRecord && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                    {new Date(selectedRecord.date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  </Text>
                  <Pressable onPress={() => setSelectedRecord(null)}>
                    <MaterialIcons name="close" size={24} color={colors.muted} />
                  </Pressable>
                </View>

                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 12 }}>
                  {selectedRecord.workers.length} Personen
                </Text>

                {selectedRecord.workers.map((w) => (
                  <View key={w.id} style={[styles.workerRow, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{w.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {w.firma ? `${w.firma} • ` : ""}{w.gewerk || "–"}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2 }}>
                        {w.arrivalTime} – {w.departureTime}
                      </Text>
                      {w.notes && <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{w.notes}</Text>}
                    </View>
                    <Pressable
                      onPress={() => {
                        Alert.alert("Entfernen", `${w.name} entfernen?`, [
                          { text: "Abbrechen", style: "cancel" },
                          { text: "Entfernen", style: "destructive", onPress: () => removeWorker(selectedRecord.id, w.id) },
                        ]);
                      }}
                      style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 8 }]}
                    >
                      <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Worker Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Person erfassen</Text>

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Name *"
              placeholderTextColor={colors.muted}
              value={workerName}
              onChangeText={setWorkerName}
              autoFocus
            />

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Firma"
              placeholderTextColor={colors.muted}
              value={workerFirma}
              onChangeText={setWorkerFirma}
            />

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Gewerk (z.B. Elektro, Sanitär)"
              placeholderTextColor={colors.muted}
              value={workerGewerk}
              onChangeText={setWorkerGewerk}
            />

            <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Ankunft</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, marginBottom: 0 }]}
                  placeholder="07:00"
                  placeholderTextColor={colors.muted}
                  value={arrivalTime}
                  onChangeText={setArrivalTime}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Abgang</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, marginBottom: 0 }]}
                  placeholder="16:00"
                  placeholderTextColor={colors.muted}
                  value={departureTime}
                  onChangeText={setDepartureTime}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Notizen (optional)"
              placeholderTextColor={colors.muted}
              value={workerNotes}
              onChangeText={setWorkerNotes}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setShowAddModal(false)}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ fontSize: 15, color: colors.muted }}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={addWorker}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff" }}>Erfassen</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  addBtn: { padding: 8 },
  summaryCard: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 0, borderWidth: 1, marginBottom: 16 },
  quickAddBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  recordCard: { padding: 14, borderRadius: 0, borderWidth: 1, marginBottom: 8 },
  recordHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recordDate: { fontSize: 14, fontWeight: "600" },
  todayBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 0 },
  workerCount: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0 },
  emptyState: { alignItems: "center", paddingTop: 60 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: "85%" },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  workerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1 },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderRadius: 0 },
  saveBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 0 },
});
