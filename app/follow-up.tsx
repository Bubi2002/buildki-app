import { useState, useCallback, useRef } from "react";
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
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { getDefects, updateDefectStatus, saveDefect, recordPriorityChanged, type Defect, type DefectPriority } from "@/lib/defect-store";
import { requestReinspection } from "@/lib/defect-comments";
import { scheduleFollowUpForDefect, sendImmediateNotification } from "@/lib/notification-service";
import { addHistoryEntry } from "@/lib/defect-store";
import { DateOnlyPicker } from "@/components/date-only-picker";
import { addDaysToDateOnly, formatDateOnly, isDateOnOrAfter, todayDateOnly } from "@/lib/date-only";
import { useTranslation } from "@/lib/language-provider";

type FollowUpFilter = "alle" | "heute" | "ueberfaellig" | "kommend";

export default function FollowUpScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; defectId?: string }>();
  const projectId = params.projectId || "";

  const [defects, setDefects] = useState<Defect[]>([]);
  const [filter, setFilter] = useState<FollowUpFilter>("alle");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [selectedFollowUpDate, setSelectedFollowUpDate] = useState(() => addDaysToDateOnly(todayDateOnly(), 3));
  const [followUpNote, setFollowUpNote] = useState("");
  const routeDefectHandledRef = useRef("");

  useFocusEffect(
    useCallback(() => {
      loadFollowUps();
    }, [projectId, params.defectId])
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

    const requestedDefectId = typeof params.defectId === "string" ? params.defectId : "";
    if (requestedDefectId && routeDefectHandledRef.current !== requestedDefectId) {
      routeDefectHandledRef.current = requestedDefectId;
      const requestedDefect = allDefects.find((defect) => defect.id === requestedDefectId);
      if (requestedDefect && requestedDefect.status !== "erledigt" && requestedDefect.status !== "geschlossen") {
        setSelectedDefect(requestedDefect);
        setSelectedFollowUpDate(requestedDefect.followUpDate || addDaysToDateOnly(todayDateOnly(), 3));
        setFollowUpNote(requestedDefect.followUpNote || "");
        setShowDatePicker(true);
      } else if (requestedDefect) {
        Alert.alert(t('follow_up_reinspection_not_needed_title' as any), t('follow_up_reinspection_not_needed_msg' as any));
      }
    }
  }

  const now = new Date();
  // Local date to match how followUpDate is stored (avoids an off-by-one near midnight)
  const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;

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

  const scheduleFollowUp = async (defect: Defect, isoDate: string) => {
    if (!isDateOnOrAfter(isoDate, todayDateOnly())) {
      Alert.alert(t('follow_up_check_date_title' as any), t('follow_up_check_date_msg' as any));
      return;
    }

    // Set follow-up date and change status to "pruefung"
    await requestReinspection(defect.id, isoDate, followUpNote);

    // Schedule push notification
    await scheduleFollowUpForDefect(
      defect.id,
      defect.title,
      isoDate,
      defect.location
    );

    // Record in history
    await addHistoryEntry(
      defect.id,
      "status_changed",
      defect.status,
      "pruefung",
      `${t('follow_up_history_scheduled' as any)}${formatDateOnly(isoDate)}${followUpNote.trim() ? ` · ${followUpNote.trim()}` : ""}`,
    );

    // Immediate confirmation
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    await loadFollowUps();
    setShowDatePicker(false);
    setSelectedDefect(null);

    Alert.alert(
      t('follow_up_scheduled_title' as any),
      `${t('follow_up_scheduled_msg_a' as any)}${defect.title}${t('follow_up_scheduled_msg_b' as any)}${formatDateOnly(isoDate)}${t('follow_up_scheduled_msg_c' as any)}`,
      [{ text: t('ok') }]
    );
  };

  const markInspectionDone = async (defect: Defect) => {
    Alert.alert(
      t('follow_up_complete_title' as any),
      t('follow_up_complete_msg' as any),
      [
        { text: t('btn_abbrechen'), style: "cancel" },
        {
          text: t('follow_up_defect_fixed' as any),
          onPress: async () => {
            await updateDefectStatus(defect.id, "erledigt");
            await addHistoryEntry(defect.id, "resolved", "pruefung", "erledigt", t('follow_up_history_passed' as any));
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await sendImmediateNotification(t('follow_up_defect_fixed' as any), `"${defect.title}${t('follow_up_notif_marked_done' as any)}`);
            await loadFollowUps();
          },
        },
        {
          text: t('follow_up_needs_rework' as any),
          style: "destructive",
          onPress: async () => {
            await updateDefectStatus(defect.id, "nachbesserung");
            await addHistoryEntry(defect.id, "status_changed", "pruefung", "nachbesserung", t('follow_up_history_failed' as any));
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            await sendImmediateNotification(t('follow_up_notif_rework_title' as any), `"${defect.title}${t('follow_up_notif_failed' as any)}`);
            await loadFollowUps();
          },
        },
      ]
    );
  };

  const rescheduleFollowUp = (defect: Defect) => {
    setSelectedDefect(defect);
    setSelectedFollowUpDate(defect.followUpDate || addDaysToDateOnly(todayDateOnly(), 3));
    setFollowUpNote(defect.followUpNote || "");
    setShowDatePicker(true);
  };

  const changePriority = (defect: Defect) => {
    const options: { label: string; value: DefectPriority }[] = [
      { label: t('defect_priority_low'), value: "niedrig" },
      { label: t('defect_priority_medium'), value: "mittel" },
      { label: t('defect_priority_high'), value: "hoch" },
    ];
    Alert.alert(
      t('prioritaet'),
      undefined,
      [
        ...options.map((o) => ({
          text: defect.priority === o.value ? `✓ ${o.label}` : o.label,
          onPress: async () => {
            if (defect.priority === o.value) return;
            const oldPriority = defect.priority;
            await saveDefect({ ...defect, priority: o.value, updatedAt: new Date().toISOString() });
            await recordPriorityChanged(defect.id, oldPriority, o.value);
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await loadFollowUps();
          },
        })),
        { text: t('btn_abbrechen'), style: "cancel" as const },
      ]
    );
  };

  const getStatusColor = (defect: Defect): string => {
    if (!defect.followUpDate) return colors.muted;
    if (defect.followUpDate < today) return "#F87171"; // overdue
    if (defect.followUpDate === today) return "#FBBF24"; // today
    return "#4ADE80"; // upcoming
  };

  const getStatusLabel = (defect: Defect): string => {
    if (!defect.followUpDate) return t('follow_up_no_date' as any);
    if (defect.followUpDate < today) return t('ueberfaellig');
    if (defect.followUpDate === today) return t('follow_up_due_today' as any);
    const diff = Math.ceil((new Date(defect.followUpDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return `${t('follow_up_in' as any)} ${diff} ${diff === 1 ? t('follow_up_day' as any) : t('follow_up_days' as any)}`;
  };

  const renderDefect = ({ item }: { item: Defect }) => {
    const statusColor = getStatusColor(item);
    const statusLabel = getStatusLabel(item);
    const isOverdue = item.followUpDate ? item.followUpDate < today : false;
    const isToday = item.followUpDate === today;

    return (
      <View style={[styles.card, { borderColor: isOverdue ? "#F8717140" : isToday ? "#FBBF2440" : "#1E3A5F" }]}>
        <View style={styles.cardHeader}>
          <Pressable
            onPress={() => markInspectionDone(item)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('follow_up_complete_title' as any)}
            style={({ pressed }) => [styles.checkCircle, { opacity: pressed ? 0.5 : 1 }]}
          >
            <MaterialIcons name="radio-button-unchecked" size={26} color={statusColor} />
          </Pressable>
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
              <Text style={[styles.actionBtnText, { color: "#4ADE80" }]}>{t('anno_pruefen')}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => rescheduleFollowUp(item)}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="event-repeat" size={16} color="#5DADE2" />
            <Text style={[styles.actionBtnText, { color: "#5DADE2" }]}>
              {item.followUpDate ? t('follow_up_reschedule' as any) : t('follow_up_set_date' as any)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/defects?projectId=${item.projectId}&defectId=${item.id}` as any)}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="open-in-new" size={16} color="#8FA3B8" />
            <Text style={[styles.actionBtnText, { color: "#8FA3B8" }]}>{t('follow_up_detail' as any)}</Text>
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
          <Pressable
            onPress={() => changePriority(item)}
            style={({ pressed }) => [styles.footerChip, { backgroundColor: item.priority === "hoch" ? "#F8717115" : item.priority === "mittel" ? "#FBBF2415" : "#4ADE8015", opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="edit" size={11} color={item.priority === "hoch" ? "#F87171" : item.priority === "mittel" ? "#FBBF24" : "#4ADE80"} />
            <Text style={[styles.footerChipText, { color: item.priority === "hoch" ? "#F87171" : item.priority === "mittel" ? "#FBBF24" : "#4ADE80" }]}>
              {item.priority === "hoch" ? t('defect_priority_high') : item.priority === "mittel" ? t('defect_priority_medium') : t('defect_priority_low')}
            </Text>
          </Pressable>
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
            <Text style={styles.headerTitle}>{t('follow_up_title' as any)}</Text>
            <Text style={styles.headerSubtitle}>{t('follow_up_subtitle' as any)}</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: "#F0F4F8" }]}>{stats.total}</Text>
            <Text style={styles.statLabel}>{t('gesamt')}</Text>
          </View>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: "#F87171" }]}>{stats.overdue}</Text>
            <Text style={styles.statLabel}>{t('ueberfaellig')}</Text>
          </View>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: "#FBBF24" }]}>{stats.today}</Text>
            <Text style={styles.statLabel}>{t('heute')}</Text>
          </View>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: "#4ADE80" }]}>{stats.upcoming}</Text>
            <Text style={styles.statLabel}>{t('follow_up_upcoming' as any)}</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {([
            { key: "alle", label: t('all') },
            { key: "ueberfaellig", label: t('ueberfaellig') },
            { key: "heute", label: t('heute') },
            { key: "kommend", label: t('follow_up_upcoming' as any) },
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
              <Text style={styles.emptyTitle}>{t('follow_up_empty_title' as any)}</Text>
              <Text style={styles.emptySubtitle}>
                {filter === "alle"
                  ? t('follow_up_empty_all' as any)
                  : `${t('follow_up_none_prefix' as any)}${filter === "ueberfaellig" ? t('follow_up_adj_overdue' as any) : filter === "heute" ? t('follow_up_adj_today' as any) : t('follow_up_adj_upcoming' as any)}${t('follow_up_none_suffix' as any)}`}
              </Text>
              <Pressable
                onPress={() => router.push(`/defects?projectId=${projectId}` as any)}
                style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.7 }]}
              >
                <MaterialIcons name="report-problem" size={17} color="#5DADE2" />
                <Text style={styles.emptyActionText}>{t('follow_up_select_open_defect' as any)}</Text>
              </Pressable>
            </View>
          }
        />
      </View>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalKeyboardAvoider} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{t('follow_up_modal_title' as any)}</Text>
            {selectedDefect && (
              <Text style={styles.modalSubtitle} numberOfLines={2}>
                {selectedDefect.title}
              </Text>
            )}

            <Text style={styles.sectionLabel}>{t('follow_up_choose_date' as any)}</Text>
            <View style={styles.dateOptions}>
              {[
                { days: 1, label: t('follow_up_opt_tomorrow' as any) },
                { days: 3, label: t('follow_up_opt_3days' as any) },
                { days: 7, label: t('follow_up_opt_1week' as any) },
                { days: 14, label: t('follow_up_opt_2weeks' as any) },
                { days: 30, label: t('follow_up_opt_1month' as any) },
              ].map((opt) => {
                const dateValue = addDaysToDateOnly(todayDateOnly(), opt.days);
                const date = new Date(`${dateValue}T12:00:00`);
                return (
                  <Pressable
                    key={opt.days}
                    onPress={() => setSelectedFollowUpDate(dateValue)}
                    style={[
                      styles.dateOption,
                      selectedFollowUpDate === dateValue && styles.dateOptionActive,
                    ]}
                  >
                    <Text style={[
                      styles.dateOptionLabel,
                      selectedFollowUpDate === dateValue && styles.dateOptionLabelActive,
                    ]}>
                      {opt.label}
                    </Text>
                    <Text style={[
                      styles.dateOptionDate,
                      selectedFollowUpDate === dateValue && { color: "#5DADE2" },
                    ]}>
                      {date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <DateOnlyPicker
              value={selectedFollowUpDate}
              onChange={setSelectedFollowUpDate}
              minimumDate={todayDateOnly()}
              label={t('follow_up_exact_date' as any)}
              allowClear={false}
              testID="follow-up-date-picker"
            />

            <Text style={styles.sectionLabel}>{t('follow_up_note_label' as any)}</Text>
            <TextInput
              value={followUpNote}
              onChangeText={setFollowUpNote}
              placeholder={t('follow_up_note_placeholder' as any)}
              placeholderTextColor="#6F8296"
              multiline
              numberOfLines={3}
              style={styles.noteInput}
            />

            <View style={styles.modalInfo}>
              <MaterialIcons name="notifications-active" size={16} color="#5DADE2" />
              <Text style={styles.modalInfoText}>
                {t('follow_up_info_text' as any)}
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => { setShowDatePicker(false); setSelectedDefect(null); }}
                style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.cancelBtnText}>{t('btn_abbrechen')}</Text>
              </Pressable>
              <Pressable
                onPress={() => selectedDefect && scheduleFollowUp(selectedDefect, selectedFollowUpDate)}
                style={({ pressed }) => [styles.confirmBtn, { opacity: pressed ? 0.8 : 1 }]}
              >
                <MaterialIcons name="event-available" size={18} color="#fff" />
                <Text style={styles.confirmBtnText}>{t('follow_up_set_date' as any)}</Text>
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
  checkCircle: {
    width: 30,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
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
  emptyAction: {
    minHeight: 44,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#5DADE250",
    backgroundColor: "#5DADE210",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  emptyActionText: {
    color: "#5DADE2",
    fontSize: 13,
    fontWeight: "700",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalKeyboardAvoider: {
    width: "100%",
    maxHeight: "92%",
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
  noteInput: {
    minHeight: 84,
    borderWidth: 1,
    borderColor: "#1E3A5F",
    color: "#F0F4F8",
    backgroundColor: "#0B1622",
    padding: 12,
    textAlignVertical: "top",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
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
