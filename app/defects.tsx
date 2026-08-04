import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Image,
  KeyboardAvoidingView,
 Platform } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  Defect,
  DefectStatus,
  DefectPriority,
  DEFECT_CATEGORIES,
  getDefects,
  saveDefect,
  deleteDefect,
  updateDefectStatus,
  getDefectStats,
  recordDefectCreated,
  recordPhotoAdded,
  recordPhotoRemoved,
  getDefectHistory,
  formatHistoryEntry,
  addDefectSignature,
  setVoiceNote,
  type DefectHistoryEntry,
  type DefectSignature,
} from "@/lib/defect-store";
import { syncStoredProtocolDefects } from "@/lib/protocol-defect-sync";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { SignaturePad } from "@/components/signature-pad";
import { TradePicker } from "@/components/trade-picker";
import { GEWERKE , generateDefectPdfHtml } from "@/lib/defect-pdf-export";
import { getProjectStructure, type Floor, type Room } from "@/lib/room-store";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { useTranslation } from "@/lib/language-provider";
import { generatePositionCode } from "@/lib/position-numbering";
import { DateOnlyPicker } from "@/components/date-only-picker";
import { addDaysToDateOnly, formatDateOnly, isDateOnOrAfter, todayDateOnly } from "@/lib/date-only";
import {
  formatVoiceNoteDuration,
  persistDefectVoiceNote,
  removePersistedDefectVoiceNote,
} from "@/lib/defect-voice-note";

export default function DefectsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; defectId?: string }>();
  const projectId = params.projectId || "";

  const [defects, setDefects] = useState<Defect[]>([]);
  const [filter, setFilter] = useState<DefectStatus | "alle">("alle");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<DefectPriority>("mittel");
  const [newCategory, setNewCategory] = useState(DEFECT_CATEGORIES[0]);
  const [newLocation, setNewLocation] = useState("");
  const [newGewerk, setNewGewerk] = useState<string>(GEWERKE[0]);
  const [newDueDate, setNewDueDate] = useState<string>("");
  const [newAssignee, setNewAssignee] = useState<string>("");
  const [newFloorId, setNewFloorId] = useState<string>("");
  const [newRoomId, setNewRoomId] = useState<string>("");
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [gewerkFilter, setGewerkFilter] = useState<string>("alle");
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [defectHistoryEntries, setDefectHistoryEntries] = useState<DefectHistoryEntry[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureRole, setSignatureRole] = useState<string>(t('defects_rolle_auftraggeber' as any));
  const defectVoiceRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const defectVoiceRecorderState = useAudioRecorderState(defectVoiceRecorder, 250);
  const defectVoicePlayer = useAudioPlayer(selectedDefect?.voiceNoteUri || null);
  const defectVoicePlayerStatus = useAudioPlayerStatus(defectVoicePlayer);
  const [voiceNoteMode, setVoiceNoteMode] = useState<"idle" | "recording" | "paused" | "saving">("idle");
  const [showVoiceNoteFinish, setShowVoiceNoteFinish] = useState(false);
  const voiceNoteDefectIdRef = useRef<string | null>(null);
  const routeDefectHandledRef = useRef("");

  useFocusEffect(
    useCallback(() => {
      loadDefects().then(async (loaded) => {
        const requestedDefectId = typeof params.defectId === "string" ? params.defectId : "";
        if (!requestedDefectId || routeDefectHandledRef.current === requestedDefectId) return;
        const requestedDefect = loaded.find((defect) => defect.id === requestedDefectId);
        if (!requestedDefect) return;
        routeDefectHandledRef.current = requestedDefectId;
        setSelectedDefect(requestedDefect);
        setDefectHistoryEntries(await getDefectHistory(requestedDefect.id));
        setShowDetailModal(true);
      });
      loadRoomStructure();
    }, [projectId, params.defectId])
  );

  async function loadRoomStructure() {
    if (!projectId) return;
    try {
      const structure = await getProjectStructure(projectId);
      setFloors(structure.floors);
      setRooms(structure.rooms);
    } catch  {
      // Rooms not initialized yet - that's fine
    }
  }

  async function loadDefects() {
    if (projectId) await syncStoredProtocolDefects(projectId);
    const loaded = await getDefects(projectId || undefined);
    setDefects(loaded);
    return loaded;
  }

  const filteredDefects = defects.filter((d) => {
    if (filter !== "alle" && d.status !== filter) return false;
    if (gewerkFilter !== "alle" && (d as any).gewerk !== gewerkFilter) return false;
    return true;
  });
  const stats = getDefectStats(defects);

  const addNewDefectCameraPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t('alert_berechtigung'), t('msg_kamerazugriff_wird_benu00f6tigt'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setNewPhotos((photos) => [...photos, result.assets[0].uri]);
    }
  };

  const addNewDefectLibraryPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t('alert_berechtigung'), t('defects_fotomediathek_zugriff' as any));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (!result.canceled && result.assets.length > 0) {
      setNewPhotos((photos) => [...photos, ...result.assets.map((asset) => asset.uri)]);
    }
  };

  const removeNewDefectPhoto = (index: number) => {
    setNewPhotos((photos) => photos.filter((_, photoIndex) => photoIndex !== index));
  };

  const createDefect = async () => {
    if (!newTitle.trim()) return;
    if (newDueDate && !isDateOnOrAfter(newDueDate, todayDateOnly())) {
      Alert.alert(t('defects_frist_pruefen_titel' as any), t('defects_frist_pruefen_msg' as any));
      return;
    }

    const defect: Defect & { gewerk?: string; dueDate?: string; assignee?: string } = {
      id: `defect-${Date.now()}`,
      projectId,
      title: newTitle.trim(),
      description: newDescription.trim(),
      status: "offen",
      priority: newPriority,
      category: newCategory,
      photos: [...newPhotos],
      location: newLocation.trim() || undefined,
      floor: newFloorId ? floors.find(f => f.id === newFloorId)?.name : undefined,
      room: newRoomId ? rooms.find(r => r.id === newRoomId)?.name : undefined,
      gewerk: newGewerk,
      dueDate: newDueDate || undefined,
      assignee: newAssignee.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Generate position code (Gewerk.Geschoss.Position)
    if (newGewerk && newFloorId) {
      const floor = floors.find(f => f.id === newFloorId);
      if (floor) {
        const code = await generatePositionCode(projectId, newGewerk, floor.number, defect.id);
        defect.positionCode = code;
      }
    }
    await saveDefect(defect);
    await recordDefectCreated(defect.id);
    for (let photoIndex = 0; photoIndex < newPhotos.length; photoIndex += 1) {
      await recordPhotoAdded(defect.id);
    }
    setDefects([defect, ...defects]);
    setShowCreateModal(false);
    setNewTitle("");
    setNewDescription("");
    setNewPriority("mittel");
    setNewLocation("");
    setNewDueDate("");
    setNewAssignee("");
    setNewFloorId("");
    setNewRoomId("");
    setNewPhotos([]);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const cycleStatus = async (defect: Defect) => {
    const nextStatus: Record<DefectStatus, DefectStatus> = {
      offen: "zugewiesen",
      zugewiesen: "in_bearbeitung",
      in_bearbeitung: "pruefung",
      nachbesserung: "in_bearbeitung",
      pruefung: "erledigt",
      erledigt: "geschlossen",
      abgelehnt: "offen",
      geschlossen: "offen",
    };
    const newStatus = nextStatus[defect.status];
    await updateDefectStatus(defect.id, newStatus);
    await loadDefects();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removeDefect = (defectId: string) => {
    Alert.alert(t('alert_mangel_loeschen'), t('msg_diesen_mangel_wirklich_entfernen'), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_loeschen'),
        style: "destructive",
        onPress: async () => {
          await deleteDefect(defectId);
          await loadDefects();
        },
      },
    ]);
  };

    const statusColors: Record<DefectStatus, string> = {
    offen: colors.error,
    zugewiesen: "#FF9800",
    in_bearbeitung: colors.warning,
    nachbesserung: "#E91E63",
    pruefung: "#9C27B0",
    erledigt: colors.success,
    abgelehnt: "#795548",
    geschlossen: "#607D8B",
  };
  const statusLabels: Record<DefectStatus, string> = {
    offen: t('defects_status_offen' as any),
    zugewiesen: t('defects_status_zugewiesen' as any),
    in_bearbeitung: t('defects_status_in_bearbeitung' as any),
    nachbesserung: t('defects_status_nachbesserung' as any),
    pruefung: t('defects_status_pruefung' as any),
    erledigt: t('defects_status_erledigt' as any),
    abgelehnt: t('defects_status_abgelehnt' as any),
    geschlossen: t('defects_status_geschlossen' as any),
  };

  const priorityIcons: Record<DefectPriority, string> = {
    hoch: "priority-high",
    mittel: "remove",
    niedrig: "arrow-downward",
  };

  const openDetail = async (defect: Defect) => {
    setSelectedDefect(defect);
    const history = await getDefectHistory(defect.id);
    setDefectHistoryEntries(history);
    setShowDetailModal(true);
  };

  const resetVoiceAudioMode = async () => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    } catch (error) {
      console.warn("Defect voice-note audio reset failed:", error);
    }
  };

  const startDefectVoiceNote = async () => {
    if (!selectedDefect || voiceNoteMode !== "idle") return;
    if (Platform.OS === "web") {
      Alert.alert(
        t('defects_sprachnotiz' as any),
        t('defects_web_aufnahme_nicht_verfuegbar' as any),
      );
      return;
    }

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t('defects_mikrofonzugriff_titel' as any),
          t('defects_mikrofonzugriff_msg' as any),
        );
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await defectVoiceRecorder.prepareToRecordAsync();
      defectVoiceRecorder.record();
      voiceNoteDefectIdRef.current = selectedDefect.id;
      setVoiceNoteMode("recording");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      await resetVoiceAudioMode();
      setVoiceNoteMode("idle");
      Alert.alert(t('defects_aufnahme_nicht_moeglich_titel' as any), t('defects_aufnahme_nicht_moeglich_msg' as any));
      console.warn("Defect voice-note start failed:", error);
    }
  };

  const pauseDefectVoiceNote = () => {
    try {
      defectVoiceRecorder.pause();
      setVoiceNoteMode("paused");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.warn("Defect voice-note pause failed:", error);
    }
  };

  const resumeDefectVoiceNote = () => {
    try {
      defectVoiceRecorder.record();
      setVoiceNoteMode("recording");
      setShowVoiceNoteFinish(false);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.warn("Defect voice-note resume failed:", error);
    }
  };

  const requestFinishDefectVoiceNote = () => {
    if (voiceNoteMode === "recording") pauseDefectVoiceNote();
    setShowVoiceNoteFinish(true);
  };

  const closeDefectDetail = () => {
    if (voiceNoteMode === "recording" || voiceNoteMode === "paused") {
      requestFinishDefectVoiceNote();
      return;
    }
    if (voiceNoteMode === "saving") return;
    setShowDetailModal(false);
  };

  const stopDefectVoiceRecorder = async (): Promise<string | null> => {
    try {
      const stopPromise = defectVoiceRecorder.stop();
      const timeout = new Promise<void>((_, reject) => setTimeout(() => reject(new Error("stop timeout")), 4000));
      try {
        await Promise.race([stopPromise, timeout]);
      } catch (error) {
        console.warn("Defect voice-note stop race:", error);
      }
      return defectVoiceRecorder.uri || defectVoiceRecorder.getStatus().url;
    } catch (error) {
      console.warn("Defect voice-note stop failed:", error);
      return defectVoiceRecorder.uri || null;
    } finally {
      await resetVoiceAudioMode();
    }
  };

  const saveDefectVoiceNote = async () => {
    const defectId = voiceNoteDefectIdRef.current;
    const durationMillis = defectVoiceRecorderState.durationMillis;
    if (!defectId) return;
    setShowVoiceNoteFinish(false);
    setVoiceNoteMode("saving");

    const sourceUri = await stopDefectVoiceRecorder();
    if (!sourceUri) {
      setVoiceNoteMode("idle");
      Alert.alert(t('defects_sprachnotiz_nicht_gespeichert_titel' as any), t('defects_sprachnotiz_nicht_gespeichert_msg' as any));
      return;
    }

    try {
      const permanentUri = await persistDefectVoiceNote(sourceUri, defectId);
      const updated = await setVoiceNote(defectId, {
        uri: permanentUri,
        durationMillis,
        recordedAt: new Date().toISOString(),
      });
      if (updated) setSelectedDefect(updated);
      await loadDefects();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert(t('defects_speichern_fehlgeschlagen_titel' as any), t('defects_sprachnotiz_persistenz_msg' as any));
      console.warn("Defect voice-note persistence failed:", error);
    } finally {
      voiceNoteDefectIdRef.current = null;
      setVoiceNoteMode("idle");
    }
  };

  const discardDefectVoiceNote = async () => {
    setShowVoiceNoteFinish(false);
    setVoiceNoteMode("saving");
    const temporaryUri = await stopDefectVoiceRecorder();
    await removePersistedDefectVoiceNote(temporaryUri || undefined);
    voiceNoteDefectIdRef.current = null;
    setVoiceNoteMode("idle");
  };

  const toggleDefectVoicePlayback = async () => {
    if (defectVoicePlayerStatus.playing) {
      defectVoicePlayer.pause();
      return;
    }
    if (
      defectVoicePlayerStatus.duration > 0 &&
      defectVoicePlayerStatus.currentTime >= defectVoicePlayerStatus.duration - 0.2
    ) {
      await defectVoicePlayer.seekTo(0);
    }
    defectVoicePlayer.play();
  };

  const deleteDefectVoiceNote = () => {
    if (!selectedDefect?.voiceNoteUri) return;
    Alert.alert(t('defects_sprachnotiz_loeschen_titel' as any), t('defects_sprachnotiz_loeschen_msg' as any), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_loeschen'),
        style: "destructive",
        onPress: async () => {
          const uri = selectedDefect.voiceNoteUri;
          defectVoicePlayer.pause();
          const updated = await setVoiceNote(selectedDefect.id, null);
          await removePersistedDefectVoiceNote(uri);
          if (updated) setSelectedDefect(updated);
          await loadDefects();
        },
      },
    ]);
  };

  const renderDefect = ({ item }: { item: Defect }) => (
    <Pressable
      onPress={() => openDetail(item)}
      onLongPress={() => removeDefect(item.id)}
      style={({ pressed }) => [
        styles.defectCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] }]} />
      <View style={styles.defectContent}>
        <View style={styles.defectHeader}>
          <Text style={[styles.defectTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.title}
          </Text>
          <MaterialIcons name={priorityIcons[item.priority] as any} size={18} color={item.priority === "hoch" ? colors.error : colors.muted} />
        </View>
        <Text style={[styles.defectMeta, { color: colors.muted }]}>
          {item.positionCode ? `[${item.positionCode}] ` : ""}{(item as any).gewerk || item.category} {item.location ? `• ${item.location}` : ""} • {statusLabels[item.status]}
        </Text>
        {item.description ? (
          <Text style={[styles.defectDesc, { color: colors.muted }]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer className="p-4">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('maengel')}</Text>
        <Pressable
          onPress={async () => {
            try {
              const html = await generateDefectPdfHtml(projectId, "Projekt", { includePhotos: true });
              const { uri } = await Print.printToFileAsync({ html, base64: false });
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
              }
            } catch (e: any) {
              Alert.alert(t('alert_fehler'), e?.message || t('defects_pdf_export_fehlgeschlagen' as any));
            }
          }}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
        >
          <MaterialIcons name="picture-as-pdf" size={22} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => setShowCreateModal(true)} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="add" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statBadge, { backgroundColor: colors.error + "20" }]}>
          <Text style={[styles.statNum, { color: colors.error }]}>{stats.offen}</Text>
          <Text style={[styles.statLabel, { color: colors.error }]}>{t('checklist_incomplete')}</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: colors.warning + "20" }]}>
          <Text style={[styles.statNum, { color: colors.warning }]}>{stats.inBearbeitung}</Text>
          <Text style={[styles.statLabel, { color: colors.warning }]}>{t('in_arbeit')}</Text>
        </View>
        <View style={[styles.statBadge, { backgroundColor: colors.success + "20" }]}>
          <Text style={[styles.statNum, { color: colors.success }]}>{stats.erledigt}</Text>
          <Text style={[styles.statLabel, { color: colors.success }]}>{t('defect_resolved')}</Text>
        </View>
      </View>

      {/* Status Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {(["alle", "offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung", "erledigt", "abgelehnt", "geschlossen"] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterBtn,
              { borderColor: filter === f ? colors.primary : colors.border },
              filter === f && { backgroundColor: colors.primary + "15" },
            ]}
          >
            <Text style={[styles.filterText, { color: filter === f ? colors.primary : colors.muted }]}>
              {f === "alle" ? t('defects_alle' as any) : statusLabels[f]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Gewerk Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterRow, { marginBottom: 12 }]}>
        <Pressable
          onPress={() => setGewerkFilter("alle")}
          style={[
            styles.filterBtn,
            { borderColor: gewerkFilter === "alle" ? colors.primary : colors.border },
            gewerkFilter === "alle" && { backgroundColor: colors.primary + "15" },
          ]}
        >
          <Text style={[styles.filterText, { color: gewerkFilter === "alle" ? colors.primary : colors.muted }]}>{t('alle_gewerke')}</Text>
        </Pressable>
        {GEWERKE.map((g) => (
          <Pressable
            key={g}
            onPress={() => setGewerkFilter(g)}
            style={[
              styles.filterBtn,
              { borderColor: gewerkFilter === g ? colors.primary : colors.border },
              gewerkFilter === g && { backgroundColor: colors.primary + "15" },
            ]}
          >
            <Text style={[styles.filterText, { color: gewerkFilter === g ? colors.primary : colors.muted }]}>{g}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Defect List */}
      <FlatList
        data={filteredDefects}
        keyExtractor={(item) => item.id}
        renderItem={renderDefect}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="check-circle" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {filter === "alle" ? t('keine_maengel_erfasst') : t('keine_status_maengel').replace('{status}', statusLabels[filter as DefectStatus] || '')}
            </Text>
          </View>
        }
      />

      {/* Detail Modal with History */}
      <Modal visible={showDetailModal} transparent animationType="slide" onRequestClose={closeDefectDetail}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {selectedDefect && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={[styles.modalTitle, { color: colors.foreground, marginBottom: 0 }]}>{selectedDefect.title}</Text>
                  <Pressable onPress={closeDefectDetail} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                    <MaterialIcons name="close" size={24} color={colors.muted} />
                  </Pressable>
                </View>

                {/* Position Code */}
                {selectedDefect.positionCode && (
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary, marginBottom: 8, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                    {t('defects_position' as any)}: {selectedDefect.positionCode}
                  </Text>
                )}
                {/* Status + Priority */}
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0, backgroundColor: statusColors[selectedDefect.status] + "20" }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: statusColors[selectedDefect.status] }}>
                      {statusLabels[selectedDefect.status]}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.border + "40" }}>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{selectedDefect.priority}</Text>
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.border + "40" }}>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{selectedDefect.category}</Text>
                  </View>
                </View>

                {selectedDefect.description ? (
                  <Text style={{ fontSize: 14, color: colors.foreground, marginBottom: 12, lineHeight: 20 }}>{selectedDefect.description}</Text>
                ) : null}

                {selectedDefect.location ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <MaterialIcons name="place" size={16} color={colors.muted} />
                    <Text style={{ fontSize: 13, color: colors.muted }}>{selectedDefect.location}</Text>
                  </View>
                ) : null}

                {/* Gewerk, Frist, Verantwortlicher */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {(selectedDefect as any).gewerk ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.primary + "12" }}>
                      <MaterialIcons name="construction" size={14} color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "500" }}>{(selectedDefect as any).gewerk}</Text>
                    </View>
                  ) : null}
                  {(selectedDefect as any).dueDate ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0, backgroundColor: new Date((selectedDefect as any).dueDate) < new Date() && selectedDefect.status !== "erledigt" ? colors.error + "12" : colors.warning + "12" }}>
                      <MaterialIcons name="event" size={14} color={new Date((selectedDefect as any).dueDate) < new Date() && selectedDefect.status !== "erledigt" ? colors.error : colors.warning} />
                      <Text style={{ fontSize: 12, color: new Date((selectedDefect as any).dueDate) < new Date() && selectedDefect.status !== "erledigt" ? colors.error : colors.warning, fontWeight: "500" }}>
                        {t('defects_frist' as any)}: {new Date((selectedDefect as any).dueDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </Text>
                    </View>
                  ) : null}
                  {(selectedDefect as any).assignee ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 0, backgroundColor: colors.surface }}>
                      <MaterialIcons name="person" size={14} color={colors.muted} />
                      <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "500" }}>{(selectedDefect as any).assignee}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Photos Section */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{t('defects_fotos' as any)} ({selectedDefect.photos.length})</Text>
                  
                  {selectedDefect.photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                      {selectedDefect.photos.map((photo, idx) => (
                        <Pressable
                          key={idx}
                          onLongPress={() => {
                            Alert.alert(t('alert_foto_entfernen'), t('msg_dieses_foto_vom_mangel_entfernen'), [
                              { text: t('btn_abbrechen'), style: "cancel" },
                              {
                                text: t('btn_entfernen'),
                                style: "destructive",
                                onPress: async () => {
                                  const updatedPhotos = selectedDefect.photos.filter((_, i) => i !== idx);
                                  const updatedDefect = { ...selectedDefect, photos: updatedPhotos };
                                  await saveDefect(updatedDefect);
                                  await recordPhotoRemoved(selectedDefect.id);
                                  setSelectedDefect(updatedDefect);
                                  const history = await getDefectHistory(selectedDefect.id);
                                  setDefectHistoryEntries(history);
                                  await loadDefects();
                                },
                              },
                            ]);
                          }}
                          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, marginRight: 8 }]}
                        >
                          <Image source={{ uri: photo }} style={{ width: 80, height: 80, borderRadius: 0 }} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={async () => {
                        const { status } = await ImagePicker.requestCameraPermissionsAsync();
                        if (status !== "granted") {
                          Alert.alert(t('alert_berechtigung'), t('msg_kamerazugriff_wird_benu00f6tigt'));
                          return;
                        }
                        const result = await ImagePicker.launchCameraAsync({
                          mediaTypes: ["images"],
                          quality: 0.8,
                        });
                        if (!result.canceled && result.assets[0]) {
                          const updatedPhotos = [...selectedDefect.photos, result.assets[0].uri];
                          const updatedDefect = { ...selectedDefect, photos: updatedPhotos };
                          await saveDefect(updatedDefect);
                          await recordPhotoAdded(selectedDefect.id);
                          setSelectedDefect(updatedDefect);
                          const history = await getDefectHistory(selectedDefect.id);
                          setDefectHistoryEntries(history);
                          await loadDefects();
                          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                      }}
                      style={({ pressed }) => [{
                        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                        paddingVertical: 10, borderRadius: 0, backgroundColor: colors.primary + "15",
                        borderWidth: 1, borderColor: colors.primary + "40",
                        opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      <MaterialIcons name="camera-alt" size={18} color={colors.primary} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{t('kamera')}</Text>
                    </Pressable>

                    <Pressable
                      onPress={async () => {
                        const result = await ImagePicker.launchImageLibraryAsync({
                          mediaTypes: ["images"],
                          quality: 0.8,
                          allowsMultipleSelection: true,
                          selectionLimit: 5,
                        });
                        if (!result.canceled && result.assets.length > 0) {
                          const newUris = result.assets.map(a => a.uri);
                          const updatedPhotos = [...selectedDefect.photos, ...newUris];
                          const updatedDefect = { ...selectedDefect, photos: updatedPhotos };
                          await saveDefect(updatedDefect);
                          for (const _ of newUris) await recordPhotoAdded(selectedDefect.id);
                          setSelectedDefect(updatedDefect);
                          const history = await getDefectHistory(selectedDefect.id);
                          setDefectHistoryEntries(history);
                          await loadDefects();
                          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                      }}
                      style={({ pressed }) => [{
                        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                        paddingVertical: 10, borderRadius: 0, backgroundColor: colors.border + "30",
                        borderWidth: 1, borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      <MaterialIcons name="photo-library" size={18} color={colors.muted} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted }}>{t('galerie')}</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Quick Status Change */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{t('status_u00e4ndern')}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung", "erledigt", "abgelehnt", "geschlossen"] as DefectStatus[]).map((s) => (
                      <Pressable
                        key={s}
                        onPress={async () => {
                          await updateDefectStatus(selectedDefect.id, s);
                          const updated = { ...selectedDefect, status: s, updatedAt: new Date().toISOString() };
                          setSelectedDefect(updated);
                          const history = await getDefectHistory(selectedDefect.id);
                          setDefectHistoryEntries(history);
                          await loadDefects();
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        style={({ pressed }) => [{
                          minWidth: "30%", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 0, alignItems: "center",
                          borderWidth: 1,
                          borderColor: selectedDefect.status === s ? statusColors[s] : colors.border,
                          backgroundColor: selectedDefect.status === s ? statusColors[s] + "15" : "transparent",
                          opacity: pressed ? 0.7 : 1,
                        }]}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "600", color: selectedDefect.status === s ? statusColors[s] : colors.muted }}>
                          {statusLabels[s]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Voice Note Section */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{t('defects_sprachnotiz' as any)}</Text>
                  {selectedDefect.voiceNoteUri ? (
                    <View style={[styles.voiceNoteCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      <Pressable
                        onPress={toggleDefectVoicePlayback}
                        style={({ pressed }) => [
                          styles.voiceNotePlayButton,
                          { backgroundColor: colors.primary + "18", borderColor: colors.primary + "50" },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <MaterialIcons name={defectVoicePlayerStatus.playing ? "pause" : "play-arrow"} size={22} color={colors.primary} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600" }}>
                          {defectVoicePlayerStatus.playing ? t('defects_sprachnotiz_wird_abgespielt' as any) : t('defects_sprachnotiz_abspielen' as any)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                          {formatVoiceNoteDuration((defectVoicePlayerStatus.currentTime || 0) * 1000)} / {formatVoiceNoteDuration(selectedDefect.voiceNoteDurationMillis || (defectVoicePlayerStatus.duration || 0) * 1000)}
                        </Text>
                      </View>
                      <Pressable onPress={deleteDefectVoiceNote} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 8 }]}>
                        <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                      </Pressable>
                    </View>
                  ) : voiceNoteMode !== "idle" ? (
                    <View
                      style={[
                        styles.voiceRecordingCard,
                        {
                          borderColor: voiceNoteMode === "recording" ? colors.error : colors.warning,
                          backgroundColor: colors.background,
                        },
                      ]}
                    >
                      <View style={styles.voiceRecordingHeader}>
                        <View style={[styles.voiceRecordingDot, { backgroundColor: voiceNoteMode === "recording" ? colors.error : colors.warning }]} />
                        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700", flex: 1 }}>
                          {voiceNoteMode === "saving" ? t('defects_sprachnotiz_wird_gespeichert' as any) : voiceNoteMode === "paused" ? t('defects_aufnahme_pausiert' as any) : t('defects_aufnahme_laeuft' as any)}
                        </Text>
                        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                          {formatVoiceNoteDuration(defectVoiceRecorderState.durationMillis)}
                        </Text>
                      </View>
                      {voiceNoteMode !== "saving" ? (
                        <View style={styles.voiceRecordingActions}>
                          <Pressable
                            onPress={voiceNoteMode === "recording" ? pauseDefectVoiceNote : resumeDefectVoiceNote}
                            style={({ pressed }) => [styles.voiceSecondaryButton, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                          >
                            <MaterialIcons name={voiceNoteMode === "recording" ? "pause" : "mic"} size={17} color={colors.primary} />
                            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                              {voiceNoteMode === "recording" ? t('defects_pausieren' as any) : t('defects_fortsetzen' as any)}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={requestFinishDefectVoiceNote}
                            style={({ pressed }) => [styles.voicePrimaryButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.75 }]}
                          >
                            <MaterialIcons name="stop" size={17} color="#FFFFFF" />
                            <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>{t('defects_aufnahme_abschliessen' as any)}</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <Pressable
                      onPress={startDefectVoiceNote}
                      style={({ pressed }) => [{
                        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                        paddingVertical: 10, borderWidth: 1, borderColor: colors.primary + "40",
                        backgroundColor: colors.primary + "10", opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      <MaterialIcons name="mic" size={18} color={colors.primary} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{t('defects_sprachnotiz_aufnehmen' as any)}</Text>
                    </Pressable>
                  )}
                </View>
                {/* Signatures Section */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{t('defects_unterschriften' as any)} ({selectedDefect.signatures?.length || 0})</Text>
                  {selectedDefect.signatures && selectedDefect.signatures.length > 0 && (
                    <View style={{ marginBottom: 8 }}>
                      {selectedDefect.signatures.map((sig, idx) => (
                        <View key={idx} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                          <MaterialIcons name="draw" size={16} color={colors.primary} />
                          <Text style={{ fontSize: 13, color: colors.foreground, marginLeft: 8, flex: 1 }}>{sig.role}</Text>
                          <Text style={{ fontSize: 11, color: colors.muted }}>{new Date(sig.signedAt).toLocaleDateString("de-DE")}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {[t('defects_rolle_auftraggeber' as any), t('defects_rolle_auftragnehmer' as any), t('defects_rolle_zeuge' as any), t('defects_rolle_pruefer' as any)].map((role) => (
                      <Pressable
                        key={role}
                        onPress={() => { setSignatureRole(role); setShowSignaturePad(true); }}
                        style={({ pressed }) => [{
                          flex: 1, paddingVertical: 8, alignItems: "center",
                          borderWidth: 1, borderColor: colors.border,
                          backgroundColor: colors.background, opacity: pressed ? 0.7 : 1,
                        }]}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted }}>{role.substring(0, 2).toUpperCase()}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {/* KI-Zusammenfassung */}
                {selectedDefect.aiSummary && (
                  <View style={{ marginBottom: 16, padding: 10, backgroundColor: colors.primary + "08", borderLeftWidth: 3, borderLeftColor: colors.primary }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, marginBottom: 4 }}>{t('defects_ki_zusammenfassung' as any)}</Text>
                    <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 18 }}>{selectedDefect.aiSummary}</Text>
                  </View>
                )}
                {/* 3D-Viewer Button (for Matterport defects) */}
                {selectedDefect.pinId && (
                  <Pressable
                    onPress={() => {
                      if (voiceNoteMode !== "idle") { requestFinishDefectVoiceNote(); return; }
                      setShowDetailModal(false);
                      router.push(`/matterport-viewer?modelId=&projectId=${selectedDefect.projectId}&navigateToDefect=${selectedDefect.id}` as any);
                    }}
                    style={({ pressed }) => [{
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                      paddingVertical: 12, marginBottom: 12, borderWidth: 1,
                      borderColor: "#00B0FF40", backgroundColor: "#00B0FF10",
                      opacity: pressed ? 0.7 : 1,
                    }]}
                  >
                    <MaterialIcons name="view-in-ar" size={18} color="#00B0FF" />
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#00B0FF" }}>{t('defects_im_3d_modell_anzeigen' as any)}</Text>
                  </Pressable>
                )}

                {/* Nachprüfung Button */}
                <Pressable
                  onPress={() => {
                    if (voiceNoteMode !== "idle") { requestFinishDefectVoiceNote(); return; }
                    setShowDetailModal(false);
                    router.push(`/follow-up?projectId=${selectedDefect.projectId}&defectId=${selectedDefect.id}` as any);
                  }}
                  style={({ pressed }) => [{
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    paddingVertical: 12, marginBottom: 16, borderWidth: 1,
                    borderColor: "#A78BFA40", backgroundColor: "#A78BFA10",
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <MaterialIcons name="event-repeat" size={18} color="#A78BFA" />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#A78BFA" }}>
                    {selectedDefect.followUpDate
                      ? t('defects_nachpruefung_geplant_am' as any).replace('{date}', new Date(selectedDefect.followUpDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }))
                      : t('defects_nachpruefung_planen' as any)}
                  </Text>
                </Pressable>

                {/* History Timeline */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{t('verlauf')}</Text>
                  {defectHistoryEntries.length === 0 ? (
                    <Text style={{ fontSize: 13, color: colors.muted, fontStyle: "italic" }}>{t('noch_keine_u00c4nderungen_erfasst')}</Text>
                  ) : (
                    defectHistoryEntries.map((entry, idx) => (
                      <View key={entry.id} style={{ flexDirection: "row", marginBottom: 10 }}>
                        <View style={{ width: 20, alignItems: "center" }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: idx === defectHistoryEntries.length - 1 ? colors.primary : colors.border, marginTop: 4 }} />
                          {idx < defectHistoryEntries.length - 1 && (
                            <View style={{ width: 1, flex: 1, backgroundColor: colors.border, marginTop: 2 }} />
                          )}
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={{ fontSize: 13, color: colors.foreground }}>{formatHistoryEntry(entry)}</Text>
                          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                            {new Date(entry.timestamp).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center" }}>
                  {t('defects_erstellt' as any)}: {new Date(selectedDefect.createdAt).toLocaleString("de-DE")}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Signature Pad Modal */}
      <Modal visible={showSignaturePad} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('defects_unterschrift' as any)}: {signatureRole}</Text>
            <SignaturePad
              onSave={async (paths) => {
                if (selectedDefect && paths.length > 0) {
                  const sig: DefectSignature = { role: signatureRole, paths, signedAt: new Date().toISOString() };
                  const updated = await addDefectSignature(selectedDefect.id, sig);
                  if (updated) {
                    setSelectedDefect(updated);
                    await loadDefects();
                  }
                }
                setShowSignaturePad(false);
                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
              onCancel={() => setShowSignaturePad(false)}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showVoiceNoteFinish} transparent animationType="fade">
        <View style={styles.voiceConfirmOverlay}>
          <View style={[styles.voiceConfirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="pause-circle" size={34} color={colors.primary} />
            <Text style={[styles.voiceConfirmTitle, { color: colors.foreground }]}>{t('defects_aufnahme_pausiert' as any)}</Text>
            <Text style={[styles.voiceConfirmText, { color: colors.muted }]}>{t('defects_sprachnotiz_finish_frage' as any)}</Text>
            <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"], marginBottom: 14 }}>
              {formatVoiceNoteDuration(defectVoiceRecorderState.durationMillis)}
            </Text>
            <Pressable
              onPress={saveDefectVoiceNote}
              style={({ pressed }) => [styles.voiceConfirmPrimary, { backgroundColor: colors.primary }, pressed && { opacity: 0.75 }]}
            >
              <MaterialIcons name="save" size={18} color="#FFFFFF" />
              <Text style={styles.voiceConfirmPrimaryText}>{t('defects_sprachnotiz_speichern' as any)}</Text>
            </Pressable>
            <Pressable
              onPress={resumeDefectVoiceNote}
              style={({ pressed }) => [styles.voiceConfirmSecondary, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="mic" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>{t('defects_aufnahme_fortsetzen' as any)}</Text>
            </Pressable>
            <Pressable onPress={discardDefectVoiceNote} style={({ pressed }) => [styles.voiceConfirmDiscard, pressed && { opacity: 0.65 }]}>
              <Text style={{ color: colors.error, fontSize: 12, fontWeight: "700" }}>{t('defects_aufnahme_verwerfen' as any)}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Create Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.createKeyboardAvoider}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
          >
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <ScrollView
                style={styles.createFormScroll}
                contentContainerStyle={styles.createFormContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                showsVerticalScrollIndicator
              >
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('neuen_mangel_erfassen')}</Text>

            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={t('bezeichnung')}
              placeholderTextColor={colors.muted}
              value={newTitle}
              onChangeText={setNewTitle}
            />

                <TextInput
                  style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder={t('project_description')}
                  placeholderTextColor={colors.muted}
                  value={newDescription}
                  onChangeText={setNewDescription}
                  multiline
                  numberOfLines={3}
                />

                {/* Fotos direkt beim Erfassen */}
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('defects_fotos' as any)} ({newPhotos.length})</Text>
                {newPhotos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.newPhotoPreviewScroll}>
                    {newPhotos.map((photo, index) => (
                      <View key={`${photo}-${index}`} style={styles.newPhotoPreviewItem}>
                        <Image source={{ uri: photo }} style={styles.newPhotoPreviewImage} />
                        <Pressable
                          onPress={() => removeNewDefectPhoto(index)}
                          accessibilityRole="button"
                          accessibilityLabel={t('defects_foto_n_entfernen' as any).replace('{n}', String(index + 1))}
                          style={({ pressed }) => [styles.newPhotoRemoveButton, pressed && { opacity: 0.7 }]}
                        >
                          <MaterialIcons name="close" size={16} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}
                <View style={styles.newPhotoActions}>
                  <Pressable
                    onPress={addNewDefectCameraPhoto}
                    accessibilityRole="button"
                    accessibilityLabel={t('defects_foto_kamera_aufnehmen' as any)}
                    style={({ pressed }) => [styles.newPhotoActionButton, { borderColor: colors.primary }, pressed && { opacity: 0.7 }]}
                  >
                    <MaterialIcons name="camera-alt" size={20} color={colors.primary} />
                    <Text style={[styles.newPhotoActionText, { color: colors.primary }]}>{t('kamera')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={addNewDefectLibraryPhotos}
                    accessibilityRole="button"
                    accessibilityLabel={t('defects_fotos_galerie_auswaehlen' as any)}
                    style={({ pressed }) => [styles.newPhotoActionButton, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
                  >
                    <MaterialIcons name="photo-library" size={20} color={colors.muted} />
                    <Text style={[styles.newPhotoActionText, { color: colors.muted }]}>{t('galerie')}</Text>
                  </Pressable>
                </View>

                {/* Geschoss / Raum Picker */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('defects_geschoss' as any)}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {floors.length > 0 ? floors.sort((a,b) => a.number - b.number).map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => { setNewFloorId(newFloorId === f.id ? "" : f.id); setNewRoomId(""); }}
                  style={[
                    styles.categoryBtn,
                    { borderColor: newFloorId === f.id ? colors.primary : colors.border },
                    newFloorId === f.id && { backgroundColor: colors.primary + "15" },
                  ]}
                >
                  <Text style={[styles.categoryText, { color: newFloorId === f.id ? colors.primary : colors.muted }]}>
                    {f.name}
                  </Text>
                </Pressable>
              )) : (
                <Text style={{ fontSize: 12, color: colors.muted, paddingVertical: 8 }}>{t('defects_keine_geschosse' as any)}</Text>
              )}
            </ScrollView>
            {newFloorId && rooms.filter(r => r.floorId === newFloorId).length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('defects_raum' as any)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                  {rooms.filter(r => r.floorId === newFloorId).map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => setNewRoomId(newRoomId === r.id ? "" : r.id)}
                      style={[
                        styles.categoryBtn,
                        { borderColor: newRoomId === r.id ? colors.primary : colors.border },
                        newRoomId === r.id && { backgroundColor: colors.primary + "15" },
                      ]}
                    >
                      <Text style={[styles.categoryText, { color: newRoomId === r.id ? colors.primary : colors.muted }]}>
                        {r.number ? `${r.number} – ${r.name}` : r.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={floors.length > 0 ? t('defects_zusaetzliche_ortsbeschreibung' as any) : t('ortraum_zb_eg_flur')}
              placeholderTextColor={colors.muted}
              value={newLocation}
              onChangeText={setNewLocation}
            />

            {/* Priority */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('prioritaet')}</Text>
            <View style={styles.priorityRow}>
              {(["niedrig", "mittel", "hoch"] as DefectPriority[]).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setNewPriority(p)}
                  style={[
                    styles.priorityBtn,
                    { borderColor: newPriority === p ? colors.primary : colors.border },
                    newPriority === p && { backgroundColor: colors.primary + "15" },
                  ]}
                >
                  <Text style={[styles.priorityText, { color: newPriority === p ? colors.primary : colors.muted }]}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Gewerk */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('gewerk')}</Text>
            <TradePicker
              value={newGewerk}
              onChange={setNewGewerk}
              allowEmpty={false}
              accessibilityLabel={t('defects_gewerk_auswaehlen' as any)}
            />

            {/* Category */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('kategorie')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {DEFECT_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setNewCategory(cat)}
                  style={[
                    styles.categoryBtn,
                    { borderColor: newCategory === cat ? colors.primary : colors.border },
                    newCategory === cat && { backgroundColor: colors.primary + "15" },
                  ]}
                >
                  <Text style={[styles.categoryText, { color: newCategory === cat ? colors.primary : colors.muted }]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Deadline */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('frist_optional')}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {[7, 14, 30, 60].map((days) => {
                const iso = addDaysToDateOnly(todayDateOnly(), days);
                return (
                  <Pressable
                    key={days}
                    onPress={() => setNewDueDate(newDueDate === iso ? "" : iso)}
                    style={[
                      styles.categoryBtn,
                      { borderColor: newDueDate === iso ? colors.primary : colors.border },
                      newDueDate === iso && { backgroundColor: colors.primary + "15" },
                    ]}
                  >
                    <Text style={[styles.categoryText, { color: newDueDate === iso ? colors.primary : colors.muted }]}>
                      {days} {t('defects_tage' as any)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <DateOnlyPicker
              value={newDueDate}
              onChange={setNewDueDate}
              minimumDate={todayDateOnly()}
              label={t('defects_genaues_fristdatum' as any)}
              testID="defect-due-date-picker"
            />
            {newDueDate ? (
              <Text style={{ fontSize: 12, color: colors.primary, marginBottom: 12, marginTop: -8 }}>
                {t('defects_frist' as any)}: {formatDateOnly(newDueDate)}
              </Text>
            ) : null}

            {/* Verantwortlicher */}
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={t('verantwortlicher_optional')}
              placeholderTextColor={colors.muted}
              value={newAssignee}
              onChangeText={setNewAssignee}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => {
                  setShowCreateModal(false);
                  setNewTitle("");
                  setNewDescription("");
                  setNewLocation("");
                  setNewPhotos([]);
                  setNewDueDate("");
                  setNewAssignee("");
                  setNewFloorId("");
                  setNewRoomId("");
                }}
                style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.muted }]}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={createDefect}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.saveBtnText}>{t('erstellen')}</Text>
              </Pressable>
              </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  addBtn: { padding: 8 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statBadge: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 0 },
  statNum: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  filterRow: { marginBottom: 12, maxHeight: 44 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 0, borderWidth: 1, marginRight: 8 },
  filterText: { fontSize: 13, fontWeight: "500" },
  list: { paddingBottom: 20 },
  defectCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0, borderWidth: 1, marginBottom: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  defectContent: { flex: 1 },
  defectHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  defectTitle: { fontSize: 15, fontWeight: "600", flex: 1 },
  defectMeta: { fontSize: 12, marginTop: 3 },
  defectDesc: { fontSize: 13, marginTop: 4 },
  voiceNoteCard: { borderWidth: 1, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, padding: 10 },
  voiceNotePlayButton: { width: 42, height: 42, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  voiceRecordingCard: { borderWidth: 1, padding: 12 },
  voiceRecordingHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  voiceRecordingDot: { width: 9, height: 9, borderRadius: 5 },
  voiceRecordingActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  voiceSecondaryButton: { flex: 1, minHeight: 42, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  voicePrimaryButton: { flex: 1.4, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  voiceConfirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 24 },
  voiceConfirmCard: { width: "100%", maxWidth: 420, borderWidth: 1, padding: 22, alignItems: "center" },
  voiceConfirmTitle: { fontSize: 20, fontWeight: "800", marginTop: 10 },
  voiceConfirmText: { fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8, marginBottom: 10 },
  voiceConfirmPrimary: { width: "100%", minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  voiceConfirmPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  voiceConfirmSecondary: { width: "100%", minHeight: 46, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  voiceConfirmDiscard: { minHeight: 42, justifyContent: "center", paddingHorizontal: 16, marginTop: 4 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 24, maxHeight: "92%" },
  createKeyboardAvoider: { flex: 1, justifyContent: "flex-end" },
  createFormScroll: { flexGrow: 0 },
  createFormContent: { paddingBottom: 20 },
  newPhotoPreviewScroll: { marginBottom: 12, maxHeight: 96 },
  newPhotoPreviewItem: { width: 88, height: 88, marginRight: 10, position: "relative" },
  newPhotoPreviewImage: { width: 88, height: 88, borderRadius: 0 },
  newPhotoRemoveButton: { position: "absolute", top: 4, right: 4, width: 26, height: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(198,40,40,0.92)" },
  newPhotoActions: { flexDirection: "row", gap: 10, marginBottom: 16 },
  newPhotoActionButton: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 0 },
  newPhotoActionText: { fontSize: 14, fontWeight: "700" },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 0, padding: 12, fontSize: 15, marginBottom: 12 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  sectionLabel: { fontSize: 13, fontWeight: "500", marginBottom: 8 },
  priorityRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  priorityBtn: { flex: 1, paddingVertical: 10, borderRadius: 0, borderWidth: 1, alignItems: "center" },
  priorityText: { fontSize: 14, fontWeight: "500" },
  categoryScroll: { marginBottom: 16, maxHeight: 44 },
  categoryBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 0, borderWidth: 1, marginRight: 8 },
  categoryText: { fontSize: 13, fontWeight: "500" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 0, borderWidth: 1, alignItems: "center" },
  cancelBtnText: { fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 0, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
