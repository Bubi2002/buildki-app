import { useState, useCallback } from "react";
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
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
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
  type DefectHistoryEntry,
} from "@/lib/defect-store";
import { GEWERKE } from "@/lib/defect-pdf-export";
import { getProjectStructure, getFloors, getAllRooms, type Floor, type Room } from "@/lib/room-store";
import { generateDefectPdfHtml } from "@/lib/defect-pdf-export";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "@/lib/language-provider";
import { generatePositionCode, GEWERKE_NUMBERED } from "@/lib/position-numbering";

export default function DefectsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
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
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [gewerkFilter, setGewerkFilter] = useState<string>("alle");
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [defectHistoryEntries, setDefectHistoryEntries] = useState<DefectHistoryEntry[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadDefects();
      loadRoomStructure();
    }, [projectId])
  );

  const loadRoomStructure = async () => {
    if (!projectId) return;
    try {
      const structure = await getProjectStructure(projectId);
      setFloors(structure.floors);
      setRooms(structure.rooms);
    } catch (e) {
      // Rooms not initialized yet - that's fine
    }
  };

  const loadDefects = async () => {
    const loaded = await getDefects(projectId || undefined);
    setDefects(loaded);
  };

  const filteredDefects = defects.filter((d) => {
    if (filter !== "alle" && d.status !== filter) return false;
    if (gewerkFilter !== "alle" && (d as any).gewerk !== gewerkFilter) return false;
    return true;
  });
  const stats = getDefectStats(defects);

  const createDefect = async () => {
    if (!newTitle.trim()) return;

    const defect: Defect & { gewerk?: string; dueDate?: string; assignee?: string } = {
      id: `defect-${Date.now()}`,
      projectId,
      title: newTitle.trim(),
      description: newDescription.trim(),
      status: "offen",
      priority: newPriority,
      category: newCategory,
      photos: [],
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
    offen: "Offen",
    zugewiesen: "Zugewiesen",
    in_bearbeitung: "In Arbeit",
    nachbesserung: "Nachbesserung",
    pruefung: "Pr\u00fcfung",
    erledigt: "Erledigt",
    abgelehnt: "Abgelehnt",
    geschlossen: "Geschlossen",
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
              Alert.alert(t('alert_fehler'), e?.message || "PDF-Export fehlgeschlagen");
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
              {f === "alle" ? "Alle" : statusLabels[f]}
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
      <Modal visible={showDetailModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {selectedDefect && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={[styles.modalTitle, { color: colors.foreground, marginBottom: 0 }]}>{selectedDefect.title}</Text>
                  <Pressable onPress={() => setShowDetailModal(false)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                    <MaterialIcons name="close" size={24} color={colors.muted} />
                  </Pressable>
                </View>

                {/* Position Code */}
                {selectedDefect.positionCode && (
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary, marginBottom: 8, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                    Position: {selectedDefect.positionCode}
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
                        Frist: {new Date((selectedDefect as any).dueDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
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
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Fotos ({selectedDefect.photos.length})</Text>
                  
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

                {/* 3D-Viewer Button (for Matterport defects) */}
                {selectedDefect.pinId && (
                  <Pressable
                    onPress={() => {
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
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#00B0FF" }}>Im 3D-Modell anzeigen</Text>
                  </Pressable>
                )}

                {/* Nachprüfung Button */}
                <Pressable
                  onPress={() => {
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
                      ? `Nachprüfung: ${new Date(selectedDefect.followUpDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`
                      : "Nachprüfung planen"}
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
                  Erstellt: {new Date(selectedDefect.createdAt).toLocaleString("de-DE")}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Create Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
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

            {/* Geschoss / Raum Picker */}
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>Geschoss</Text>
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
                <Text style={{ fontSize: 12, color: colors.muted, paddingVertical: 8 }}>Keine Geschosse angelegt – Freitext nutzen:</Text>
              )}
            </ScrollView>
            {newFloorId && rooms.filter(r => r.floorId === newFloorId).length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>Raum</Text>
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
              placeholder={floors.length > 0 ? "Zusätzliche Ortsbeschreibung (optional)" : t('ortraum_zb_eg_flur')}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {GEWERKE.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setNewGewerk(g)}
                  style={[
                    styles.categoryBtn,
                    { borderColor: newGewerk === g ? colors.primary : colors.border },
                    newGewerk === g && { backgroundColor: colors.primary + "15" },
                  ]}
                >
                  <Text style={[styles.categoryText, { color: newGewerk === g ? colors.primary : colors.muted }]}>
                    {g}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

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
                const d = new Date();
                d.setDate(d.getDate() + days);
                const iso = d.toISOString().split("T")[0];
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
                      {days} Tage
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {newDueDate ? (
              <Text style={{ fontSize: 12, color: colors.primary, marginBottom: 12, marginTop: -8 }}>
                Frist: {new Date(newDueDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
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
                onPress={() => { setShowCreateModal(false); setNewTitle(""); setNewDescription(""); setNewLocation(""); }}
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
          </View>
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
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: "85%" },
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
