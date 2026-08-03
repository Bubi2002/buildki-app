import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  ScrollView,
  TextInput,
  Alert,
 Platform } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@/lib/language-provider";
import {
  AutoReportSettings,
  ReportFrequency,
  ReportDay,
  getAutoReportSettings,
  saveAutoReportSettings,
  formatFrequency,
  formatWeekday,
  getLastReportRun,
} from "@/lib/auto-report";

export default function AutoReportSettingsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [settings, setSettings] = useState<AutoReportSettings | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    const s = await getAutoReportSettings();
    setSettings(s);
    const lr = await getLastReportRun();
    setLastRun(lr);
  }

  useEffect(() => {
    void Promise.resolve().then(loadSettings);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await saveAutoReportSettings(settings);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('alert_gespeichert'), settings.enabled
        ? `${t('automatischer')} ${settings.frequency === "daily" ? t('tagesbericht') : t('wochenbericht')} ${t('aktiviert_um')} ${String(settings.time.hour).padStart(2, "0")}:${String(settings.time.minute).padStart(2, "0")} ${t('uhr')}.`
        : t('auto_report_settings_deaktiviert' as any)
      );
    } catch {
      Alert.alert(t('alert_fehler'), t('msg_einstellungen_konnten_nicht_gespeichert_werden'));
    }
    setSaving(false);
  };

  if (!settings) return null;

  const frequencies: ReportFrequency[] = ["daily", "weekly", "off"];
  const weekdays: ReportDay[] = [1, 2, 3, 4, 5, 6, 0];

  return (
    <ScreenContainer className="p-4">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('autobericht')}</Text>
          <Pressable onPress={handleSave} style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}>
            <Text style={styles.saveBtnText}>{saving ? '...' : t('btn_speichern')}</Text>
          </Pressable>
        </View>

        {/* Enable Toggle */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t('automatischer_gesamtbericht')}</Text>
              <Text style={[styles.cardDesc, { color: colors.muted }]}>
                {t('auto_report_settings_card_desc' as any)}
              </Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(v) => setSettings({ ...settings, enabled: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </View>

        {settings.enabled && (
          <>
            {/* Frequency */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('haeufigkeit')}</Text>
              <View style={styles.optionRow}>
                {frequencies.map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setSettings({ ...settings, frequency: f })}
                    style={[
                      styles.optionBtn,
                      { borderColor: settings.frequency === f ? colors.primary : colors.border },
                      settings.frequency === f && { backgroundColor: colors.primary + "15" },
                    ]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: settings.frequency === f ? colors.primary : colors.muted }}>
                      {formatFrequency(f)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Time */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('uhrzeit')}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={String(settings.time.hour).padStart(2, "0")}
                  onChangeText={(t) => {
                    const h = parseInt(t) || 0;
                    if (h >= 0 && h <= 23) setSettings({ ...settings, time: { ...settings.time, hour: h } });
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>:</Text>
                <TextInput
                  style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={String(settings.time.minute).padStart(2, "0")}
                  onChangeText={(t) => {
                    const m = parseInt(t) || 0;
                    if (m >= 0 && m <= 59) setSettings({ ...settings, time: { ...settings.time, minute: m } });
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={{ fontSize: 14, color: colors.muted, marginLeft: 8 }}>{t('uhr')}</Text>
              </View>
            </View>

            {/* Weekday (for weekly) */}
            {settings.frequency === "weekly" && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('wochentag')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {weekdays.map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => setSettings({ ...settings, weekday: d })}
                        style={[
                          styles.dayBtn,
                          { borderColor: settings.weekday === d ? colors.primary : colors.border },
                          settings.weekday === d && { backgroundColor: colors.primary + "15" },
                        ]}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "600", color: settings.weekday === d ? colors.primary : colors.muted }}>
                          {formatWeekday(d).substring(0, 2)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Content Options */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('inhalt')}</Text>
              
              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t('fotos_einbetten')}</Text>
                <Switch
                  value={settings.includePhotos}
                  onValueChange={(v) => setSettings({ ...settings, includePhotos: v })}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t('maengeluebersicht')}</Text>
                <Switch
                  value={settings.includeDefects}
                  onValueChange={(v) => setSettings({ ...settings, includeDefects: v })}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t('offene_aufgaben')}</Text>
                <Switch
                  value={settings.includeTodos}
                  onValueChange={(v) => setSettings({ ...settings, includeTodos: v })}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            </View>

            {/* Auto-Send Options */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('automatischer_versand')}</Text>
              
              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t('per_email_senden')}</Text>
                <Switch
                  value={settings.autoSendEmail}
                  onValueChange={(v) => setSettings({ ...settings, autoSendEmail: v })}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              {settings.autoSendEmail && (
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder={t('emailadresse')}
                  placeholderTextColor={colors.muted}
                  value={settings.emailRecipient}
                  onChangeText={(t) => setSettings({ ...settings, emailRecipient: t })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}

              <View style={[styles.toggleRow, { marginTop: 8 }]}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t('in_dropbox_hochladen')}</Text>
                <Switch
                  value={settings.autoUploadDropbox}
                  onValueChange={(v) => setSettings({ ...settings, autoUploadDropbox: v })}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            </View>

            {/* Last Run Info */}
            {lastRun && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialIcons name="history" size={18} color={colors.muted} />
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {t('auto_report_settings_letzter_bericht' as any)} {new Date(lastRun).toLocaleString("de-DE")}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* Info Box */}
        <View style={[styles.infoBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
          <MaterialIcons name="info-outline" size={18} color={colors.primary} />
          <Text style={{ fontSize: 12, color: colors.primary, flex: 1, marginLeft: 8, lineHeight: 18 }}>
            {t('auto_report_settings_info' as any)}
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
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 0 },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  card: { borderWidth: 1, borderRadius: 0, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center" },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  optionRow: { flexDirection: "row", gap: 8 },
  optionBtn: { flex: 1, paddingVertical: 10, borderRadius: 0, borderWidth: 1, alignItems: "center" },
  dayBtn: { width: 40, height: 40, borderRadius: 0, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  timeInput: { width: 50, height: 44, borderWidth: 1, borderRadius: 0, textAlign: "center", fontSize: 18, fontWeight: "600" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  toggleLabel: { fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 0, padding: 12, fontSize: 14, marginTop: 8 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", padding: 12, borderRadius: 0, borderWidth: 1, marginTop: 8, marginBottom: 40 },
});
