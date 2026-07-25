import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { getDefects, updateDefectStatus, type Defect } from "@/lib/defect-store";
import { requestReinspection } from "@/lib/defect-comments";
import { scheduleFollowUpForDefect, sendImmediateNotification } from "@/lib/notification-service";
import { addHistoryEntry } from "@/lib/defect-store";

type FollowUpFilter = "alle" | "heute" | "ueberfaellig" | "kommend";

export default function FollowUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; defectId?: string }>();
  const projectId = params.projectId || "";

  const [defects, setDefects] = useState<Defect[]>([]);
  const [filter, setFilter] = useState<FollowUpFilter>("alle");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(3);

  useFocusEffect(
    useCallback(() => {
      loadFollowUps();
    }, [projectId])
  );

  async function loadFollowUps() {
    const allDefects = await getDefects(projectId || undefined);
    // Show defects that have followUpDate or are in "pruefung" status
    const followUpDefects = allDefects.filter(d =>
      (d.followUpDate || d.status === "pruefung") &&
      d.status !== "erledigt" &&
      d.status !== "geschlossen"
    );
    setDefects(followUpDefects);
  }

  const now = new Date();
  const today = now.toISOString().split("T")[0];

  const filteredDefects = defects.filter(d => {
    if (filter === "alle") return true;
    if (!d.followUpDate) return false;
    const fDate = d.followUpDate;
    if (filter === "heute") return fDate === today;
    if (filter === "ueberfaellig") return fDate < today;
    if (filter === "kommend") return fDate > today;
    return true;
  }).sort((a, b) => {
    const dateA = a.followUpDate ? new Date(a.followUpDate).getTime() : Infinity;
    const dateB = b.followUpDate ? new Date(b.followUpDate).getTime() : Infinity;
    return dateA - dateB;
  });

  const stats = {
    total: defects.length,
    today: defects.filter(d => d.followUpDate === today).length,
    overdue: defects.filter(d => d.followUpDate && d.followUpDate < today).length,
    upcoming: defects.filter(d => d.followUpDate && d.followUpDate > today).length,
  };

  const scheduleFollowUp = async (defect: Defect, days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const isoDate = date.toISOString().split("T")[0];

    // Set follow-up date and change status to "pruefung"
    await requestReinspection(defect.id, isoDate);

    // Schedule push notification
    await scheduleFollowUpForDefect(
      defect.id,
      defect.title,
      isoDate,
      defect.location
    );

    // Record in history
    await addHistoryEntry(defect.id, "status_changed", defect.status, "pruefung", `Nachprüfung geplant: ${formatDate(isoDate)}`);

    // Immediate confirmation
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    await loadFollowUps();
    setShowDatePicker(false);
    setSelectedDefect(null);

    Alert.alert(
      "Nachprüfung geplant",
      `Nachprüfung für "${defect.title}" am ${formatDate(isoDate)} eingeplant. Du erhältst eine Erinnerung am Vortag.`,
      [{ text: "OK" }]
    );
  };

  const markInspectionDone = async (defect: Defect) => {
    Alert.alert(
      "Nachprüfung abschließen",
      "Ergebnis der Nachprüfung:",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "✓ Mangel behoben",
          onPress: async () => {
            await updateDefectStatus(defect.id, "erledigt");
            await addHistoryEntry(defect.id, "resolved", "pruefung", "erledigt", "Nachprüfung bestanden – Mangel behoben");
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await sendImmediateNotification("✓ Mangel behoben", `"${defect.title}" wurde als erledigt markiert.`);
            await loadFollowUps();
          },
        },
        {
          text: "✗ Nachbesserung nötig",
          style: "destructive",
          onPress: async () => {
            await updateDefectStatus(defect.id, "nachbesserung");
            await addHistoryEntry(defect.id, "status_changed", "pruefung", "nachbesserung", "Nachprüfung nicht bestanden – Nachbesserung erforderlich");
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            await sendImmediateNotification("⚠️ Nachbesserung erforderlich", `"${defect.title}" hat die Nachprüfung nicht bestanden.`);
            await loadFollowUps();
          },
        },
      ]
    );
  };

  const rescheduleFollowUp = (defect: Defect) => {
    setSelectedDefect(defect);
    setShowDatePicker(true);
  };

  const getStatusColor = (defect: Defect): string => {
    if (!defect.followUpDate) return colors.muted;
    if (defect.followUpDate < today) return "#F87171"; // overdue
    if (defect.followUpDate === today) return "#FBBF24"; // today
    return "#4ADE80"; // upcoming
  };

  const getStatusLabel = (defect: Defect): string => {
    if (!defect.followUpDate) return "Kein Datum";
    if (defect.followUpDate < today) return "Überfällig";
    if (defect.followUpDate === today) return "Heute fällig";
    const diff = Math.ceil((new Date(defect.followUpDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return `In ${diff} ${diff === 1 ? "Tag" : "Tagen"}`;
  };

  const renderDefect = ({ item }: { item: Defect }) => {
    const statusColor = getStatusColor(item);
    const statusLabel = getStatusLabel(item);
    const isOverdue = item.followUpDate ? item.followUpDate < today : false;
    const isToday = item.followUpDate === today;

    return (
      <View style={[styles.card, { borderColor: isOverdue ? "#F8717140" : isToday ? "#FBBF2440" : "#1E3A5F" }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
              {item.location && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <MaterialIcons name="place" size={12} color="#8FA3B8" />
                  <Text style={styles.cardMeta}>{item.location}</Text>
                </View>
              )}
              {item.gewerk && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <MaterialIcons name="construction" size={12} color="#8FA3B8" />
                  <Text style={styles.cardMeta}>{item.gewerk}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.statusBadge, { color: statusColor }]}>{statusLabel}</Text>
            {item.followUpDate && (
              <Text style={styles.dateText}>{formatDate(item.followUpDate)}</Text>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.cardActions}>
          {(isOverdue || isToday) && (
            <Pressable
              onPress={() => markInspectionDone(item)}
              style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="check-circle" size={16} color="#4ADE80" />
              <Text style={[styles.actionBtnText, { color: "#4ADE80" }]}>Prüfen</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => rescheduleFollowUp(item)}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="event-repeat" size={16} color="#5DADE2" />
            <Text style={[styles.actionBtnText, { color: "#5DADE2" }]}>
              {item.followUpDate ? "Verschieben" : "Termin setzen"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/defects?projectId=${item.projectId}` as any)}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="open-in-new" size={16} color="#8FA3B8" />
            <Text style={[styles.actionBtnText, { color: "#8FA3B8" }]}>Detail</Text>
          </Pressable>
        </View>

        {/* Assignee & Priority */}
        <View style={styles.cardFooter}>
          {item.assignee && (
            <View style={styles.footerChip}>
              <MaterialIcons name="person" size={12} color="#8FA3B8" />
              <Text style={styles.footerChipText}>{item.assignee}</Text>
            </View>
          )}
          <View style={[styles.footerChip, { backgroundColor: item.priority === "hoch" ? "#F8717115" : item.priority === "mittel" ? "#FBBF2415" : "#4ADE8015" }]}>
            <Text style={[styles.footerChipText, { color: item.priority === "hoch" ? "#F87171" : item.priority === "mittel" ? "#FBBF24" : "#4ADE80" }]}>
              {item.priority === "hoch" ? "Hoch" : item.priority === "mittel" ? "Mittel" : "Niedrig"}
            </Text>
          </View>
          {item.positionCode && (
            <View style={styles.footerChip}>
              <Text style={styles.footerChipText}>{item.positionCode}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer className="p-0">
      <View style={{ flex: 1, backgroundColor: "#0B1622" }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 8 }]}>
            <MaterialIcons name="arrow-back" size={24} color="#F0F4F8" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Nachprüfungen</Text>
            <Text style={styles.headerSubtitle}>Offene Inspektionstermine</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: "#F0F4F8" }]}>{stats.total}</Text>
            <Text style={styles.statLabel}>Gesamt</Text>
          </View>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: "#F87171" }]}>{stats.overdue}</Text>
            <Text style={styles.statLabel}>Überfällig</Text>
          </View>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: "#FBBF24" }]}>{stats.today}</Text>
            <Text style={styles.statLabel}>Heute</Text>
          </View>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: "#4ADE80" }]}>{stats.upcoming}</Text>
            <Text style={styles.statLabel}>Kommend</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {([
            { key: "alle", label: "Alle" },
            { key: "ueberfaellig", label: "Überfällig" },
            { key: "heute", label: "Heute" },
            { key: "kommend", label: "Kommend" },
          ] as { key: FollowUpFilter; label: string }[]).map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterBtn,
                { borderColor: filter === f.key ? "#5DADE2" : "#1E3A5F" },
                filter === f.key && { backgroundColor: "#5DADE215" },
              ]}
            >
              <Text style={[styles.filterText, { color: filter === f.key ? "#5DADE2" : "#8FA3B8" }]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* List */}
        <FlatList
          data={filteredDefects}
          keyExtractor={(item) => item.id}
          renderItem={renderDefect}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="event-available" size={48} color="#1E3A5F" />
              <Text style={styles.emptyTitle}>Keine Nachprüfungen</Text>
              <Text style={styles.emptySubtitle}>
                {filter === "alle"
                  ? "Setze Nachprüfungstermine bei offenen Mängeln"
                  : `Keine ${filter === "ueberfaellig" ? "überfälligen" : filter === "heute" ? "heutigen" : "kommenden"} Nachprüfungen`}
              </Text>
            </View>
          }
        />
      </View>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nachprüfungstermin</Text>
            {selectedDefect && (
              <Text style={styles.modalSubtitle} numberOfLines={2}>
                {selectedDefect.title}
              </Text>
            )}

            <Text style={styles.sectionLabel}>Termin wählen</Text>
            <View style={styles.dateOptions}>
              {[
                { days: 1, label: "Morgen" },
                { days: 2, label: "In 2 Tagen" },
                { days: 3, label: "In 3 Tagen" },
                { days: 5, label: "In 5 Tagen" },
                { days: 7, label: "In 1 Woche" },
                { days: 14, label: "In 2 Wochen" },
                { days: 21, label: "In 3 Wochen" },
                { days: 30, label: "In 1 Monat" },
              ].map((opt) => {
                const date = new Date();
                date.setDate(date.getDate() + opt.days);
                return (
                  <Pressable
                    key={opt.days}
                    onPress={() => setSelectedDays(opt.days)}
                    style={[
                      styles.dateOption,
                      selectedDays === opt.days && styles.dateOptionActive,
                    ]}
                  >
                    <Text style={[
                      styles.dateOptionLabel,
                      selectedDays === opt.days && styles.dateOptionLabelActive,
                    ]}>
                      {opt.label}
                    </Text>
                    <Text style={[
                      styles.dateOptionDate,
                      selectedDays === opt.days && { color: "#5DADE2" },
                    ]}>
                      {date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalInfo}>
              <MaterialIcons name="notifications-active" size={16} color="#5DADE2" />
              <Text style={styles.modalInfoText}>
                Du erhältst eine Push-Erinnerung am Vortag und am Tag der Nachprüfung.
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setShowDatePicker(false); setSelectedDefect(null); }}
                style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={() => selectedDefect && scheduleFollowUp(selectedDefect, selectedDays)}
                style={({ pressed }) => [styles.confirmBtn, { opacity: pressed ? 0.8 : 1 }]}
              >
                <MaterialIcons name="event-available" size={18} color="#fff" />
                <Text style={styles.confirmBtnText}>Termin setzen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F0F4F8",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#8FA3B8",
    marginTop: 1,
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  statBadge: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
  },
  statNum: {
    fontSize: 18,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 10,
    color: "#8FA3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  filterRow: {
    maxHeight: 44,
    marginBottom: 12,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 0,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "500",
  },
  // Card
  card: {
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderRadius: 0,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  statusIndicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#F0F4F8",
  },
  cardMeta: {
    fontSize: 12,
    color: "#8FA3B8",
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: "600",
  },
  dateText: {
    fontSize: 11,
    color: "#8FA3B8",
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#1E3A5F",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
  },
  actionBtnPrimary: {
    borderColor: "#4ADE8040",
    backgroundColor: "#4ADE8010",
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  footerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#1E3A5F30",
    borderRadius: 0,
  },
  footerChipText: {
    fontSize: 11,
    color: "#8FA3B8",
    fontWeight: "500",
  },
  // Empty State
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F0F4F8",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#8FA3B8",
    textAlign: "center",
    maxWidth: 260,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#0F1E30",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F0F4F8",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#8FA3B8",
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8FA3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  dateOptions: {
    gap: 6,
    marginBottom: 16,
  },
  dateOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
  },
  dateOptionActive: {
    borderColor: "#5DADE2",
    backgroundColor: "#5DADE210",
  },
  dateOptionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#F0F4F8",
  },
  dateOptionLabelActive: {
    color: "#5DADE2",
    fontWeight: "600",
  },
  dateOptionDate: {
    fontSize: 12,
    color: "#8FA3B8",
  },
  modalInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#5DADE210",
    borderWidth: 1,
    borderColor: "#5DADE230",
    padding: 12,
    marginBottom: 20,
  },
  modalInfoText: {
    fontSize: 12,
    color: "#5DADE2",
    flex: 1,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 0,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#8FA3B8",
  },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 14,
    backgroundColor: "#5DADE2",
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
