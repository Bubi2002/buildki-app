import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Switch,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "@/lib/language-provider";
import {
  getRecurringMeetings,
  saveRecurringMeeting,
  deleteRecurringMeeting,
  toggleMeetingActive,
  getRecurrenceLabel,
  getNextOccurrence,
  type RecurringMeeting,
  type RecurrencePattern,
} from "@/lib/recurring-meetings";

const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export default function RecurringMeetingsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [meetings, setMeetings] = useState<RecurringMeeting[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<RecurringMeeting | null>(null);
  
  // Editor state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrencePattern>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timeHour, setTimeHour] = useState(9);
  const [timeMinute, setTimeMinute] = useState(0);
  const [duration, setDuration] = useState(30);
  const [participants, setParticipants] = useState("");
  const [templateName, setTemplateName] = useState("Besprechungsprotokoll");
  const [notes, setNotes] = useState("");

  const loadMeetings = async () => {
    const data = await getRecurringMeetings();
    setMeetings(data);
  };

  useFocusEffect(useCallback(() => { loadMeetings(); }, []));

  const resetEditor = () => {
    setTitle("");
    setDescription("");
    setRecurrence("weekly");
    setDayOfWeek(1);
    setDayOfMonth(1);
    setTimeHour(9);
    setTimeMinute(0);
    setDuration(30);
    setParticipants("");
    setTemplateName(t('besprechungsprotokoll'));
    setNotes("");
    setEditingMeeting(null);
  };

  const openEditor = (meeting?: RecurringMeeting) => {
    if (meeting) {
      setEditingMeeting(meeting);
      setTitle(meeting.title);
      setDescription(meeting.description);
      setRecurrence(meeting.recurrence);
      setDayOfWeek(meeting.dayOfWeek || 1);
      setDayOfMonth(meeting.dayOfMonth || 1);
      setTimeHour(meeting.timeHour);
      setTimeMinute(meeting.timeMinute);
      setDuration(meeting.duration);
      setParticipants(meeting.participants.join(", "));
      setTemplateName(meeting.templateName);
      setNotes(meeting.notes || "");
    } else {
      resetEditor();
    }
    setShowEditor(true);
  };

  const saveMeeting = async () => {
    if (!title.trim()) {
      Alert.alert(t('alert_fehler'), t('msg_bitte_geben_sie_einen_titel'));
      return;
    }
    
    const meeting: RecurringMeeting = {
      id: editingMeeting?.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: title.trim(),
      description: description.trim(),
      templateId: "besprechungsprotokoll",
      templateName,
      recurrence,
      dayOfWeek: recurrence === "weekly" || recurrence === "biweekly" ? dayOfWeek : undefined,
      dayOfMonth: recurrence === "monthly" ? dayOfMonth : undefined,
      timeHour,
      timeMinute,
      duration,
      participants: participants.split(",").map(p => p.trim()).filter(Boolean),
      isActive: editingMeeting?.isActive ?? true,
      createdAt: editingMeeting?.createdAt || new Date().toISOString(),
      lastTriggered: editingMeeting?.lastTriggered,
      notes: notes.trim() || undefined,
    };
    
    await saveRecurringMeeting(meeting);
    setShowEditor(false);
    resetEditor();
    loadMeetings();
  };

  const handleDelete = (id: string) => {
    Alert.alert(t('alert_loeschen'), t('msg_wiederkehrendes_meeting_wirklich_loeschen'), [
      { text: t('btn_abbrechen'), style: "cancel" },
      { text: t('btn_loeschen'), style: "destructive", onPress: async () => {
        await deleteRecurringMeeting(id);
        loadMeetings();
      }},
    ]);
  };

  const handleToggle = async (id: string) => {
    await toggleMeetingActive(id);
    loadMeetings();
  };

  return (
    <ScreenContainer className="p-0">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <View>
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground }}>{t('wiederkehrende_meetings')}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{t('automatisch_protokolle_vorbereiten')}</Text>
            </View>
          </View>
          <Pressable onPress={() => openEditor()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, backgroundColor: colors.primary, borderRadius: 0, width: 36, height: 36, alignItems: "center", justifyContent: "center" })}>
            <MaterialIcons name="add" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Meeting List */}
        {meetings.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <MaterialIcons name="event-repeat" size={48} color={colors.muted} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginTop: 12 }}>{t('keine_wiederkehrenden_meetings')}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, textAlign: "center" }}>Erstellen Sie ein wiederkehrendes Meeting, um automatisch Protokolle vorzubereiten.</Text>
          </View>
        ) : (
          meetings.map((meeting) => {
            const nextDate = getNextOccurrence(meeting);
            return (
              <Pressable
                key={meeting.id}
                onPress={() => openEditor(meeting)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.8 : 1,
                  backgroundColor: colors.surface,
                  borderRadius: 0,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: meeting.isActive ? colors.foreground : colors.muted }}>{meeting.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{getRecurrenceLabel(meeting)}</Text>
                    <Text style={{ fontSize: 11, color: colors.primary, marginTop: 4 }}>
                      Nächstes: {nextDate.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })} um {nextDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {meeting.participants.length > 0 && (
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>👥 {meeting.participants.join(", ")}</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Switch
                      value={meeting.isActive}
                      onValueChange={() => handleToggle(meeting.id)}
                      trackColor={{ false: colors.border, true: colors.primary + "60" }}
                      thumbColor={meeting.isActive ? colors.primary : colors.muted}
                    />
                    <Pressable onPress={() => handleDelete(meeting.id)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                      <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Editor Modal */}
      <Modal visible={showEditor} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* Modal Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <Pressable onPress={() => { setShowEditor(false); resetEditor(); }}>
                <Text style={{ fontSize: 15, color: colors.muted }}>{t('cancel')}</Text>
              </Pressable>
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.foreground }}>
                {editingMeeting ? t('label_bearbeiten') : t('neues_meeting')}
              </Text>
              <Pressable onPress={saveMeeting}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary }}>{t('save')}</Text>
              </Pressable>
            </View>

            {/* Title */}
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('titel_2')}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('placeholder_zb_meeting')}
              placeholderTextColor={colors.muted}
              style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}
            />

            {/* Description */}
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('project_description')}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('optionale_beschreibung')}
              placeholderTextColor={colors.muted}
              multiline
              style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, marginBottom: 16, minHeight: 60 }}
            />

            {/* Recurrence */}
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('wiederholung')}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {(["daily", "weekly", "biweekly", "monthly"] as RecurrencePattern[]).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRecurrence(r)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 0, backgroundColor: recurrence === r ? colors.primary : colors.surface, borderWidth: 1, borderColor: recurrence === r ? colors.primary : colors.border }}
                >
                  <Text style={{ fontSize: 13, color: recurrence === r ? "#fff" : colors.foreground }}>
                    {r === "daily" ? t('taeglich') : r === "weekly" ? t('woechentlich') : r === "biweekly" ? t('alle_2_wochen') : t('monatlich')}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Day of Week (for weekly/biweekly) */}
            {(recurrence === "weekly" || recurrence === "biweekly") && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('wochentag')}</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {DAYS.map((day, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => setDayOfWeek(idx)}
                      style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: dayOfWeek === idx ? colors.primary : colors.surface, borderWidth: 1, borderColor: dayOfWeek === idx ? colors.primary : colors.border }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "500", color: dayOfWeek === idx ? "#fff" : colors.foreground }}>{day}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Day of Month (for monthly) */}
            {recurrence === "monthly" && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('tag_im_monat')}</Text>
                <TextInput
                  value={dayOfMonth.toString()}
                  onChangeText={(v) => setDayOfMonth(Math.min(31, Math.max(1, parseInt(v) || 1)))}
                  keyboardType="number-pad"
                  style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, width: 80 }}
                />
              </View>
            )}

            {/* Time */}
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('uhrzeit')}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <TextInput
                value={timeHour.toString().padStart(2, "0")}
                onChangeText={(v) => setTimeHour(Math.min(23, Math.max(0, parseInt(v) || 0)))}
                keyboardType="number-pad"
                maxLength={2}
                style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, width: 60, textAlign: "center" }}
              />
              <Text style={{ fontSize: 20, color: colors.foreground }}>:</Text>
              <TextInput
                value={timeMinute.toString().padStart(2, "0")}
                onChangeText={(v) => setTimeMinute(Math.min(59, Math.max(0, parseInt(v) || 0)))}
                keyboardType="number-pad"
                maxLength={2}
                style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, width: 60, textAlign: "center" }}
              />
              <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 8 }}>{t('uhr')}</Text>
            </View>

            {/* Duration */}
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('dauer_minuten')}</Text>
            <TextInput
              value={duration.toString()}
              onChangeText={(v) => setDuration(parseInt(v) || 30)}
              keyboardType="number-pad"
              style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, width: 100, marginBottom: 16 }}
            />

            {/* Template */}
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('protokollvorlage')}</Text>
            <TextInput
              value={templateName}
              onChangeText={setTemplateName}
              placeholder={t('vorlage_waehlen')}
              placeholderTextColor={colors.muted}
              style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}
            />

            {/* Participants */}
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('teilnehmer_kommagetrennt')}</Text>
            <TextInput
              value={participants}
              onChangeText={setParticipants}
              placeholder={t('placeholder_zb_teilnehmer')}
              placeholderTextColor={colors.muted}
              style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}
            />

            {/* Notes */}
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, marginBottom: 6 }}>{t('notizen')}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('agendapunkte_hinweise')}
              placeholderTextColor={colors.muted}
              multiline
              style={{ backgroundColor: colors.surface, borderRadius: 0, padding: 14, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border, minHeight: 80 }}
            />
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
