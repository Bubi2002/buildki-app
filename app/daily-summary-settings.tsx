import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, Alert } from "react-native";
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
import { Platform } from "react-native";

const TIME_OPTIONS = [
  "07:00", "08:00", "09:00", "12:00", "15:00", "17:00", "18:00", "19:00", "20:00", "21:00",
];

const DEADLINE_DAYS_OPTIONS = [1, 2, 3, 5, 7];

export default function DailySummarySettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [settings, setSettings] = useState<DailySummarySettings>(DEFAULT_SUMMARY_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const s = await getDailySummarySettings();
    setSettings(s);
  };

  const updateSetting = <K extends keyof DailySummarySettings>(key: K, value: DailySummarySettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const saveSettings = async () => {
    await saveDailySummarySettings(settings);
    setHasChanges(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Gespeichert", "Benachrichtigungs-Einstellungen wurden aktualisiert.");
  };

  return (
    <ScreenContainer className="p-4">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Tages-Zusammenfassung</Text>
        {hasChanges && (
          <Pressable onPress={saveSettings} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary }}>Speichern</Text>
          </Pressable>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Main Toggle */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Tages-Zusammenfassung</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Abendliche Push-Benachrichtigung mit Tagesübersicht</Text>
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
            {/* Time Selection */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Uhrzeit</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {TIME_OPTIONS.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => updateSetting("time", t)}
                    style={[
                      styles.chip,
                      { borderColor: settings.time === t ? colors.primary : colors.border },
                      settings.time === t && { backgroundColor: colors.primary + "15" },
                    ]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: settings.time === t ? colors.primary : colors.muted }}>
                      {t} Uhr
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Content Options */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Inhalt</Text>
              <View style={{ gap: 12, marginTop: 8 }}>
                <View style={styles.row}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Protokolle</Text>
                  <Switch
                    value={settings.includeProtocols}
                    onValueChange={(v) => updateSetting("includeProtocols", v)}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Mängel-Status</Text>
                  <Switch
                    value={settings.includeDefects}
                    onValueChange={(v) => updateSetting("includeDefects", v)}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Aufgaben</Text>
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
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Mängel-Frist-Erinnerung</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Push bei ablaufender Frist</Text>
                </View>
                <Switch
                  value={settings.defectDeadlineReminder}
                  onValueChange={(v) => updateSetting("defectDeadlineReminder", v)}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              {settings.defectDeadlineReminder && (
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.rowSubtitle, { color: colors.muted, marginBottom: 8 }]}>Tage vor Frist erinnern:</Text>
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
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>Hinweis</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            Die Tages-Zusammenfassung wird als lokale Push-Benachrichtigung zur gewählten Uhrzeit gesendet. 
            Mängel-Frist-Erinnerungen werden beim App-Start geprüft und sofort gesendet, wenn Fristen bevorstehen oder überschritten sind.
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
});
