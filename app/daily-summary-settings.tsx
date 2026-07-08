import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, Alert, TextInput } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  getDailySummarySettings,
  saveDailySummarySettings,
  type DailySummarySettings,
  DEFAULT_SUMMARY_SETTINGS,
} from "@/lib/daily-summary";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useTranslation } from "@/lib/language-provider";

const DEADLINE_DAYS_OPTIONS = [1, 2, 3, 5, 7];

// Weekdays in expo-notifications convention: 1=Sunday, 2=Monday, ..., 7=Saturday
const WEEKDAY_LABELS: { id: number; short: string; long: string }[] = [
  { id: 2, short: "Mo", long: "Montag" },
  { id: 3, short: "Di", long: "Dienstag" },
  { id: 4, short: "Mi", long: "Mittwoch" },
  { id: 5, short: "Do", long: "Donnerstag" },
  { id: 6, short: "Fr", long: "Freitag" },
  { id: 7, short: "Sa", long: "Samstag" },
  { id: 1, short: "So", long: "Sonntag" },
];

export default function DailySummarySettingsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [settings, setSettings] = useState<DailySummarySettings>(DEFAULT_SUMMARY_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  useEffect(() => {
    loadSettings();
    checkPermission();
  }, []);

  const checkPermission = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionGranted(status === "granted");
  };

  const requestPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setPermissionGranted(status === "granted");
    if (status !== "granted") {
      Alert.alert(t('alert_berechtigung_verweigert'), t('msg_bitte_erlaube_pushbenachrichtigungen_in_den'));
    }
  };

  const loadSettings = async () => {
    const s = await getDailySummarySettings();
    setSettings(s);
  };

  const updateSetting = <K extends keyof DailySummarySettings>(key: K, value: DailySummarySettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const toggleWeekday = (dayId: number) => {
    const current = settings.weekdays || [];
    const updated = current.includes(dayId)
      ? current.filter(d => d !== dayId)
      : [...current, dayId];
    updateSetting("weekdays", updated);
  };

  const adjustHour = (delta: number) => {
    const newHour = (settings.hour + delta + 24) % 24;
    updateSetting("hour", newHour);
  };

  const adjustMinute = (delta: number) => {
    const newMinute = (settings.minute + delta + 60) % 60;
    updateSetting("minute", newMinute);
  };

  const saveSettings = async () => {
    // Ensure permission before saving
    if (!permissionGranted) {
      await requestPermission();
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") return;
    }
    await saveDailySummarySettings(settings);
    setHasChanges(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(t('alert_gespeichert'), t('msg_erinnerungen_wurden_aktualisiert_und_geplant'));
  };

  const formatTime = (h: number, m: number) => {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  return (
    <ScreenContainer className="p-4">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('tageszusammenfassung')}</Text>
        {hasChanges && (
          <Pressable onPress={saveSettings} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary }}>{t('save')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Permission Warning */}
        {permissionGranted === false && (
          <Pressable onPress={requestPermission} style={[styles.section, { backgroundColor: "#E5393915", borderColor: "#E53935" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MaterialIcons name="notifications-off" size={20} color="#E53935" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#E53935" }}>{t('pushberechtigung_fehlt')}</Text>
                <Text style={{ fontSize: 11, color: "#E53935", marginTop: 2 }}>{t('tippe_hier_um_benachrichtigungen')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#E53935" />
            </View>
          </Pressable>
        )}

        {/* Main Toggle */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('tageszusammenfassung')}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{t('pushbenachrichtigung_mit_tagesuebersicht')}</Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(v) => updateSetting("enabled", v)}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </View>

        {settings.enabled && (
          <>
            {/* Time Picker */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('uhrzeit')}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted, marginBottom: 12 }]}>{t('wann_soll_die_erinnerung')}</Text>
              
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {/* Hour picker */}
                <View style={{ alignItems: "center" }}>
                  <Pressable onPress={() => adjustHour(1)} style={({ pressed }) => [styles.arrowBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.foreground} />
                  </Pressable>
                  <View style={[styles.timeDisplay, { backgroundColor: colors.primary + "15", borderColor: colors.primary }]}>
                    <Text style={{ fontSize: 28, fontWeight: "700", color: colors.primary, fontVariant: ["tabular-nums"] }}>
                      {String(settings.hour).padStart(2, "0")}
                    </Text>
                  </View>
                  <Pressable onPress={() => adjustHour(-1)} style={({ pressed }) => [styles.arrowBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.foreground} />
                  </Pressable>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{t('stunde')}</Text>
                </View>

                <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground, marginBottom: 20 }}>:</Text>

                {/* Minute picker */}
                <View style={{ alignItems: "center" }}>
                  <Pressable onPress={() => adjustMinute(5)} style={({ pressed }) => [styles.arrowBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.foreground} />
                  </Pressable>
                  <View style={[styles.timeDisplay, { backgroundColor: colors.primary + "15", borderColor: colors.primary }]}>
                    <Text style={{ fontSize: 28, fontWeight: "700", color: colors.primary, fontVariant: ["tabular-nums"] }}>
                      {String(settings.minute).padStart(2, "0")}
                    </Text>
                  </View>
                  <Pressable onPress={() => adjustMinute(-5)} style={({ pressed }) => [styles.arrowBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                    <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.foreground} />
                  </Pressable>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{t('minute')}</Text>
                </View>
              </View>

              <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 12 }}>
                Erinnerung um {formatTime(settings.hour, settings.minute)} Uhr
              </Text>
            </View>

            {/* Weekday Selection */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('wochentage')}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted, marginBottom: 12 }]}>{t('an_welchen_tagen_erinnern')}</Text>
              
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {WEEKDAY_LABELS.map((day) => {
                  const isSelected = (settings.weekdays || []).includes(day.id);
                  return (
                    <Pressable
                      key={day.id}
                      onPress={() => toggleWeekday(day.id)}
                      style={[
                        styles.dayChip,
                        { borderColor: isSelected ? colors.primary : colors.border },
                        isSelected && { backgroundColor: colors.primary + "15" },
                      ]}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: isSelected ? colors.primary : colors.muted }}>
                        {day.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Quick select buttons */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => updateSetting("weekdays", [2, 3, 4, 5, 6])}
                  style={({ pressed }) => [styles.quickBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ fontSize: 11, color: colors.muted }}>{t('mofr')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => updateSetting("weekdays", [1, 2, 3, 4, 5, 6, 7])}
                  style={({ pressed }) => [styles.quickBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ fontSize: 11, color: colors.muted }}>{t('jeden_tag')}</Text>
                </Pressable>
              </View>
            </View>

            {/* Content Options */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('inhalt')}</Text>
              <View style={{ gap: 12, marginTop: 8 }}>
                <View style={styles.row}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('project_protocols')}</Text>
                  <Switch
                    value={settings.includeProtocols}
                    onValueChange={(v) => updateSetting("includeProtocols", v)}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('stats_defects_status')}</Text>
                  <Switch
                    value={settings.includeDefects}
                    onValueChange={(v) => updateSetting("includeDefects", v)}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('team_tasks')}</Text>
                  <Switch
                    value={settings.includeTasks}
                    onValueChange={(v) => updateSetting("includeTasks", v)}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </View>
            </View>

            {/* Defect Deadline Reminders */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('maengelfristerinnerung')}</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{t('push_bei_ablaufender_frist')}</Text>
                </View>
                <Switch
                  value={settings.defectDeadlineReminder}
                  onValueChange={(v) => updateSetting("defectDeadlineReminder", v)}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              {settings.defectDeadlineReminder && (
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.rowSubtitle, { color: colors.muted, marginBottom: 8 }]}>{t('tage_vor_frist_erinnern')}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {DEADLINE_DAYS_OPTIONS.map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => updateSetting("defectDeadlineDays", d)}
                        style={[
                          styles.chip,
                          { borderColor: settings.defectDeadlineDays === d ? colors.primary : colors.border },
                          settings.defectDeadlineDays === d && { backgroundColor: colors.primary + "15" },
                        ]}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: settings.defectDeadlineDays === d ? colors.primary : colors.muted }}>
                          {d} {d === 1 ? "Tag" : "Tage"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* Info */}
        <View style={{ marginTop: 16, padding: 16, backgroundColor: colors.primary + "08", borderRadius: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <MaterialIcons name="info-outline" size={18} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>{t('hinweis')}</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            Die Erinnerung wird als echte Push-Benachrichtigung an den gewählten Tagen zur eingestellten Uhrzeit gesendet – auch wenn die App geschlossen ist. 
            Mängel-Frist-Erinnerungen werden beim App-Start geprüft und sofort gesendet.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 20, fontWeight: "700", flex: 1 },
  section: { borderRadius: 0, borderWidth: 1, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowTitle: { fontSize: 14, fontWeight: "500" },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 0, borderWidth: 1, marginRight: 8 },
  dayChip: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 0 },
  quickBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderRadius: 0 },
  arrowBtn: { width: 44, height: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 0 },
  timeDisplay: { width: 64, height: 56, alignItems: "center", justifyContent: "center", borderWidth: 2, borderRadius: 0, marginVertical: 4 },
});
