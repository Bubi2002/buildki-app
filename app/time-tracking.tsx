import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, Alert, StyleSheet, FlatList, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getActiveTimer,
  startTimer,
  stopTimer,
  getTimeEntries,
  deleteTimeEntry,
  getTodayTotal,
  getWeekTotal,
  formatDuration,
  formatDurationShort,
  getTimeTrackingSettings,
  saveTimeTrackingSettings,
  type TimeEntry,
  type ActiveTimer,
  type TimeTrackingSettings,
} from "@/lib/time-tracking-store";
import { exportTaqlohnzettelPdf, exportWeeklyPdf, shareTaqlohnzettel } from "@/lib/taglohnzettel-export";

const CATEGORIES: { id: TimeEntry["category"]; label: string; icon: string; color: string }[] = [
  { id: "arbeit", label: "Arbeit", icon: "engineering", color: "#0a7ea4" },
  { id: "besprechung", label: "Besprechung", icon: "groups", color: "#7C3AED" },
  { id: "fahrt", label: "Fahrt", icon: "directions-car", color: "#F59E0B" },
  { id: "pause", label: "Pause", icon: "free-breakfast", color: "#22C55E" },
];

export default function TimeTrackingScreen() {
  const { projectId, projectName } = useLocalSearchParams<{ projectId?: string; projectName?: string }>();
  const colors = useColors();
  const [activeTimer, setActiveTimer] = useState<ActiveTimer>(null);
  const [elapsed, setElapsed] = useState(0);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<TimeEntry["category"]>("arbeit");
  const [note, setNote] = useState("");
  const [showStartForm, setShowStartForm] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<TimeTrackingSettings>({
    workerName: "",
    companyName: "",
    hourlyRate: "",
    dailyRate: "",
  });

  useEffect(() => {
    loadData();
    loadSettings();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeTimer) {
      intervalRef.current = setInterval(() => {
        const diff = Math.floor((Date.now() - new Date(activeTimer.startTime).getTime()) / 1000);
        setElapsed(diff);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeTimer]);

  const loadSettings = async () => {
    const s = await getTimeTrackingSettings();
    setSettings(s);
  };

  const handleSaveSettings = async () => {
    await saveTimeTrackingSettings(settings);
    setShowSettings(false);
    Alert.alert("Gespeichert", "Einstellungen wurden gespeichert.");
  };

  const loadData = async () => {
    const timer = await getActiveTimer();
    setActiveTimer(timer);
    if (timer) {
      const diff = Math.floor((Date.now() - new Date(timer.startTime).getTime()) / 1000);
      setElapsed(diff);
    }
    const all = await getTimeEntries(projectId);
    setEntries(all);
    setTodayTotal(await getTodayTotal(projectId));
    setWeekTotal(await getWeekTotal(projectId));
  };

  const handleStart = async () => {
    if (!projectId || !projectName) {
      Alert.alert("Fehler", "Bitte wähle zuerst ein Projekt aus.");
      return;
    }
    await startTimer(projectId, projectName, selectedCategory, note.trim());
    setNote("");
    setShowStartForm(false);
    loadData();
  };

  const handleStop = async () => {
    const entry = await stopTimer();
    if (entry) {
      Alert.alert("Gestoppt", `${formatDuration(entry.duration)} erfasst für "${entry.projectName}".`);
    }
    loadData();
  };

  const handleDelete = (id: string) => {
    Alert.alert("Löschen", "Zeiteintrag wirklich löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          await deleteTimeEntry(id);
          loadData();
        },
      },
    ]);
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  };

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Zeiterfassung</Text>
        <Pressable onPress={() => setShowSettings(true)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
          <MaterialIcons name="settings" size={24} color={colors.foreground} />
        </Pressable>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {/* Timer Display */}
            <View style={[styles.timerCard, { backgroundColor: activeTimer ? colors.primary + "10" : colors.surface, borderColor: activeTimer ? colors.primary + "40" : colors.border }]}>
              {/* Clock Display */}
              <Text style={[styles.timerDisplay, { color: activeTimer ? colors.primary : colors.muted }]}>
                {h.toString().padStart(2, "0")}:{m.toString().padStart(2, "0")}:{s.toString().padStart(2, "0")}
              </Text>

              {activeTimer && (
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{activeTimer.projectName}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {CATEGORIES.find((c) => c.id === activeTimer.category)?.label} • seit {formatTime(activeTimer.startTime)}
                  </Text>
                </View>
              )}

              {/* Start/Stop Button */}
              {activeTimer ? (
                <Pressable
                  onPress={handleStop}
                  style={({ pressed }) => [styles.stopButton, { backgroundColor: colors.error, opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="stop" size={24} color="#FFF" />
                  <Text style={styles.buttonText}>Stoppen</Text>
                </Pressable>
              ) : showStartForm ? (
                <View style={{ width: "100%" }}>
                  {/* Category Selection */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {CATEGORIES.map((cat) => (
                      <Pressable
                        key={cat.id}
                        onPress={() => setSelectedCategory(cat.id)}
                        style={({ pressed }) => [{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 0,
                          borderWidth: 1.5,
                          borderColor: selectedCategory === cat.id ? cat.color : colors.border,
                          backgroundColor: selectedCategory === cat.id ? cat.color + "15" : "transparent",
                          opacity: pressed ? 0.7 : 1,
                        }]}
                      >
                        <MaterialIcons name={cat.icon as any} size={16} color={selectedCategory === cat.id ? cat.color : colors.muted} />
                        <Text style={{ fontSize: 12, fontWeight: "600", color: selectedCategory === cat.id ? cat.color : colors.foreground }}>{cat.label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Note */}
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Notiz (optional)"
                    placeholderTextColor={colors.muted}
                    style={{ padding: 12, borderRadius: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, fontSize: 14, marginBottom: 12 }}
                  />

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() => setShowStartForm(false)}
                      style={({ pressed }) => [{ flex: 1, paddingVertical: 12, borderRadius: 0, borderWidth: 1, borderColor: colors.border, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Abbrechen</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleStart}
                      style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 0, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                    >
                      <MaterialIcons name="play-arrow" size={20} color="#FFF" />
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFF" }}>Starten</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowStartForm(true)}
                  style={({ pressed }) => [styles.startButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="play-arrow" size={24} color="#FFF" />
                  <Text style={styles.buttonText}>Timer starten</Text>
                </Pressable>
              )}
            </View>

            {/* Stats */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16, marginBottom: 20 }}>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="today" size={18} color={colors.primary} />
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Heute</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{formatDurationShort(todayTotal)}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="date-range" size={18} color={colors.primary} />
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Diese Woche</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{formatDurationShort(weekTotal)}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="format-list-numbered" size={18} color={colors.primary} />
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Einträge</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{entries.length}</Text>
              </View>
            </View>

            {/* Export Buttons */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              <Pressable
                onPress={async () => {
                  if (!projectId || !projectName) {
                    Alert.alert("Fehler", "Bitte zuerst ein Projekt auswählen.");
                    return;
                  }
                  try {
                    const uri = await exportTaqlohnzettelPdf(projectName, projectId, new Date());
                    await shareTaqlohnzettel(uri);
                  } catch (e: any) {
                    Alert.alert("Fehler", e.message || "Export fehlgeschlagen");
                  }
                }}
                style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 0, backgroundColor: colors.primary + "15", borderWidth: 1, borderColor: colors.primary + "40", opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="receipt-long" size={16} color={colors.primary} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>Taglohnzettel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    const uri = await exportWeeklyPdf(projectId, projectName);
                    await shareTaqlohnzettel(uri);
                  } catch (e: any) {
                    Alert.alert("Fehler", e.message || "Export fehlgeschlagen");
                  }
                }}
                style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="summarize" size={16} color={colors.foreground} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>Wochenbericht</Text>
              </Pressable>
            </View>

            {/* History Header */}
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>Verlauf</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <MaterialIcons name="timer" size={48} color={colors.muted} />
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>Noch keine Zeiteinträge</Text>
          </View>
        }
        renderItem={({ item }) => {
          const cat = CATEGORIES.find((c) => c.id === item.category);
          return (
            <View style={[styles.entryItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: (cat?.color || colors.primary) + "15", alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name={(cat?.icon || "timer") as any} size={18} color={cat?.color || colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{formatDuration(item.duration)}</Text>
                    <Text style={{ fontSize: 11, color: cat?.color || colors.muted, fontWeight: "500" }}>{cat?.label}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                    {formatDate(item.startTime)} • {formatTime(item.startTime)} – {item.endTime ? formatTime(item.endTime) : "läuft"}
                  </Text>
                  {item.note ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>{item.note}</Text> : null}
                </View>
                <Pressable onPress={() => handleDelete(item.id)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 6 }]}>
                  <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {/* Modal Header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Zeiterfassung-Einstellungen</Text>
                <Pressable onPress={() => setShowSettings(false)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 4 }]}>
                  <MaterialIcons name="close" size={22} color={colors.muted} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                {/* Person / Name */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.inputLabel, { color: colors.muted }]}>Person / Name</Text>
                  <TextInput
                    value={settings.workerName}
                    onChangeText={(v) => setSettings({ ...settings, workerName: v })}
                    placeholder="z.B. Max Mustermann"
                    placeholderTextColor={colors.muted + "80"}
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  />
                </View>

                {/* Firma */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.inputLabel, { color: colors.muted }]}>Firma</Text>
                  <TextInput
                    value={settings.companyName}
                    onChangeText={(v) => setSettings({ ...settings, companyName: v })}
                    placeholder="z.B. Musterbau GmbH"
                    placeholderTextColor={colors.muted + "80"}
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  />
                </View>

                {/* Stundensatz */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.inputLabel, { color: colors.muted }]}>Stundensatz (€/h)</Text>
                  <TextInput
                    value={settings.hourlyRate}
                    onChangeText={(v) => setSettings({ ...settings, hourlyRate: v })}
                    placeholder="z.B. 65"
                    placeholderTextColor={colors.muted + "80"}
                    keyboardType="decimal-pad"
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  />
                </View>

                {/* Tagessatz */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.inputLabel, { color: colors.muted }]}>Tagessatz (€/Tag)</Text>
                  <TextInput
                    value={settings.dailyRate}
                    onChangeText={(v) => setSettings({ ...settings, dailyRate: v })}
                    placeholder="z.B. 520"
                    placeholderTextColor={colors.muted + "80"}
                    keyboardType="decimal-pad"
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  />
                </View>

                {/* Info text */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8, paddingHorizontal: 2 }}>
                  <MaterialIcons name="info-outline" size={14} color={colors.muted} style={{ marginTop: 2 }} />
                  <Text style={{ fontSize: 12, color: colors.muted, flex: 1, lineHeight: 18 }}>
                    Diese Daten werden im Taglohnzettel-PDF verwendet. Der Stundensatz wird mit der erfassten Arbeitszeit multipliziert.
                  </Text>
                </View>
              </ScrollView>

              {/* Action Buttons */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                <Pressable
                  onPress={() => setShowSettings(false)}
                  style={({ pressed }) => [{ flex: 1, paddingVertical: 13, borderRadius: 0, borderWidth: 1, borderColor: colors.border, alignItems: "center", opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Abbrechen</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveSettings}
                  style={({ pressed }) => [{ flex: 1, paddingVertical: 13, borderRadius: 0, backgroundColor: colors.primary, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>Speichern</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  timerCard: {
    padding: 24,
    borderRadius: 0,
    borderWidth: 1,
    alignItems: "center",
  },
  timerDisplay: {
    fontSize: 48,
    fontWeight: "200",
    fontVariant: ["tabular-nums"],
    marginBottom: 16,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 0,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 0,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderRadius: 0,
    borderWidth: 1,
  },
  entryItem: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 0,
    borderWidth: 1,
    padding: 24,
    alignSelf: "center",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    padding: 14,
    borderRadius: 0,
    borderWidth: 1,
    fontSize: 15,
  },
});
