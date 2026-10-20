import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Switch, Alert, Platform, TextInput } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  requestPermissions,
  type NotificationPreferences,
} from "@/lib/notification-service";

// Weekdays in display order (Mo..So) with their expo numbers (1=Sun..7=Sat).
function weekdayDefs(t: (key: any) => string) {
  return [
    { expo: 2, short: t("cal_mo") },
    { expo: 3, short: t("cal_di") },
    { expo: 4, short: t("cal_mi") },
    { expo: 5, short: t("cal_do") },
    { expo: 6, short: t("cal_fr") },
    { expo: 7, short: t("cal_sa") },
    { expo: 1, short: t("cal_so") },
  ];
}

function NumberInput({ value, min, max, onValueChange, colors }: {
  value: number; min: number; max: number; onValueChange: (val: number) => void; colors: any;
}) {
  const fmt = (v: number) => String(v).padStart(2, "0");
  const [text, setText] = useState(fmt(value));
  useEffect(() => { void Promise.resolve().then(() => setText(fmt(value))); }, [value]);
  const step = max === 59 ? 5 : 1;
  const inc = () => onValueChange(Math.min(value >= max ? min : value + step, max));
  const dec = () => onValueChange(Math.max(value <= min ? max : value - step, min));
  const blur = () => { const n = Math.min(max, Math.max(min, parseInt(text) || 0)); setText(fmt(n)); onValueChange(n); };
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <Pressable onPress={inc} style={({ pressed }) => [{ width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
        <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.foreground} />
      </Pressable>
      <TextInput value={text} onChangeText={(v) => setText(v.replace(/[^0-9]/g, "").slice(0, 2))} onBlur={blur} keyboardType="number-pad" maxLength={2}
        style={{ width: 60, height: 50, textAlign: "center", fontSize: 24, fontWeight: "700", color: colors.foreground, backgroundColor: colors.primary + "10", borderWidth: 1, borderColor: colors.primary + "40" }} />
      <Pressable onPress={dec} style={({ pressed }) => [{ width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
        <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

export default function NotificationsSettingsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [hasPermission, setHasPermission] = useState(true);

  useEffect(() => {
    void (async () => {
      setPrefs(await getNotificationPreferences());
      if (Platform.OS !== "web") setHasPermission(await requestPermissions());
    })();
  }, []);

  const save = (next: NotificationPreferences) => {
    setPrefs(next);
    void saveNotificationPreferences(next);
  };
  const set = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    if (!prefs) return;
    save({ ...prefs, [key]: value });
  };
  const toggleWeekday = (expo: number) => {
    if (!prefs) return;
    let days = prefs.weekdays.includes(expo) ? prefs.weekdays.filter((d) => d !== expo) : [...prefs.weekdays, expo];
    if (days.length === 0) days = [expo];
    save({ ...prefs, weekdays: days });
  };

  const enableNotifications = async () => {
    if (Platform.OS === "web") { Alert.alert(t("alert_nicht_verfuegbar"), t("msg_pushbenachrichtigungen_sind_nur_auf_dem")); return; }
    const granted = await requestPermissions();
    setHasPermission(granted);
    if (granted) { if (prefs) save({ ...prefs, enabled: true }); Alert.alert(t("alert_aktiviert"), t("msg_benachrichtigungen_wurden_aktiviert")); }
    else Alert.alert(t("alert_berechtigung_verweigert"), t("msg_bitte_aktiviere_benachrichtigungen_in_den"));
  };

  const secStyle = { fontSize: 13, fontWeight: "600" as const, color: colors.muted, marginBottom: 10, marginTop: 4, textTransform: "uppercase" as const, letterSpacing: 0.5 };
  const cardStyle = { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 20, overflow: "hidden" as const };

  const ToggleRow = ({ icon, iconColor, title, sub, value, onChange, last }: { icon: any; iconColor: string; title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) => (
    <View style={{ flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <MaterialIcons name={icon} size={20} color={iconColor} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{title}</Text>
        {!!sub && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{sub}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.primary + "60" }} thumbColor={value ? colors.primary : colors.muted} disabled={!prefs?.enabled} />
    </View>
  );

  const Chips = ({ options, value, onPick, suffix }: { options: number[]; value: number; onPick: (n: number) => void; suffix?: string }) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((n) => {
        const on = value === n;
        return (
          <Pressable key={n} onPress={() => onPick(n)} style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "18" : colors.surface, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: on ? "800" : "600", color: on ? colors.primary : colors.foreground }}>{n}{suffix || ""}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const TimeBox = ({ hour, minute, onHour, onMinute }: { hour: number; minute: number; onHour: (n: number) => void; onMinute: (n: number) => void }) => (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, marginBottom: 14, alignItems: "center" }}>
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>{String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")} {t("uhr" as any)}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontWeight: "600" }}>{t("stunde")}</Text>
          <NumberInput value={hour} min={0} max={23} onValueChange={onHour} colors={colors} />
        </View>
        <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground, marginTop: 20 }}>:</Text>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontWeight: "600" }}>{t("minute")}</Text>
          <NumberInput value={minute} min={0} max={55} onValueChange={onMinute} colors={colors} />
        </View>
      </View>
    </View>
  );

  if (!prefs) return <ScreenContainer className="flex-1" />;

  return (
    <ScreenContainer className="flex-1">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>{t("settings_notifications")}</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>{t("erinnerungen_konfigurieren")}</Text>
          </View>
        </View>

        {/* Permission warning */}
        {!hasPermission && Platform.OS !== "web" && (
          <Pressable onPress={enableNotifications} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: colors.warning + "15", borderWidth: 1, borderColor: colors.warning, marginBottom: 20, opacity: pressed ? 0.8 : 1 }]}>
            <MaterialIcons name="notifications-off" size={24} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t("benachrichtigungen_deaktiviert")}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t("tippe_hier_um_sie")}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        )}

        {/* Master toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
          <View style={{ width: 40, height: 40, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <MaterialIcons name="notifications-active" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{t("settings_notifications")}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t("alle_erinnerungen_einausschalten")}</Text>
          </View>
          <Switch value={prefs.enabled} onValueChange={(v) => set("enabled", v)} trackColor={{ false: colors.border, true: colors.primary + "60" }} thumbColor={prefs.enabled ? colors.primary : colors.muted} />
        </View>

        {/* ── Tägliche Erinnerungen ── */}
        <Text style={secStyle}>{t("notif_sec_daily" as any)}</Text>
        <TimeBox hour={prefs.reminderHour} minute={prefs.reminderMinute} onHour={(n) => set("reminderHour", n)} onMinute={(n) => set("reminderMinute", n)} />
        {/* Weekdays (shared by daily reminders + summary) */}
        <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, marginBottom: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 10 }}>{t("wochentage")}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            {weekdayDefs(t).map((d) => {
              const on = prefs.weekdays.includes(d.expo);
              return (
                <Pressable key={d.expo} onPress={() => toggleWeekday(d.expo)} style={({ pressed }) => [{ width: 38, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.primary : "transparent", borderWidth: 1, borderColor: on ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: on ? "#fff" : colors.muted }}>{d.short}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => set("weekdays", [2, 3, 4, 5, 6])} style={({ pressed }) => [{ flex: 1, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>{t("mo_fr")}</Text>
            </Pressable>
            <Pressable onPress={() => set("weekdays", [1, 2, 3, 4, 5, 6, 7])} style={({ pressed }) => [{ flex: 1, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>{t("jeden_tag")}</Text>
            </Pressable>
          </View>
        </View>
        <View style={cardStyle}>
          <ToggleRow icon="warning" iconColor={colors.warning} title={t("offene_maengel")} sub={t("taegliche_erinnerung_bei_offenen")} value={prefs.openDefectsReminder} onChange={(v) => set("openDefectsReminder", v)} />
          <ToggleRow icon="checklist" iconColor="#8E24AA" title={t("checklist_title")} sub={t("erinnerung_bei_offenen_pruefpunkten")} value={prefs.checklistReminder} onChange={(v) => set("checklistReminder", v)} />
          <ToggleRow icon="task-alt" iconColor={colors.primary} title={t("notif_tasks_title" as any)} sub={t("notif_tasks_sub" as any)} value={prefs.taskReminder} onChange={(v) => set("taskReminder", v)} />
          {prefs.taskReminder && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>{t("notif_lead_days" as any)}</Text>
              <Chips options={[1, 2, 3, 7]} value={prefs.taskLeadDays} onPick={(n) => set("taskLeadDays", n)} />
            </View>
          )}
          <ToggleRow icon="fact-check" iconColor="#26A69A" title={t("notif_followup_title" as any)} sub={t("notif_followup_sub" as any)} value={prefs.followUpReminder} onChange={(v) => set("followUpReminder", v)} last />
        </View>

        {/* ── Tages-Zusammenfassung ── */}
        <Text style={secStyle}>{t("notif_sec_summary" as any)}</Text>
        <View style={cardStyle}>
          <ToggleRow icon="event-note" iconColor={colors.primary} title={t("notif_sec_summary" as any)} sub={t("notif_summary_sub" as any)} value={prefs.summaryEnabled} onChange={(v) => set("summaryEnabled", v)} last />
        </View>
        {prefs.summaryEnabled && (
          <>
            <TimeBox hour={prefs.summaryHour} minute={prefs.summaryMinute} onHour={(n) => set("summaryHour", n)} onMinute={(n) => set("summaryMinute", n)} />
            <View style={cardStyle}>
              <View style={{ padding: 12, paddingBottom: 6 }}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>{t("notif_content" as any)}</Text></View>
              <ToggleRow icon="description" iconColor={colors.primary} title={t("notif_content_protocols" as any)} value={prefs.summaryIncludeProtocols} onChange={(v) => set("summaryIncludeProtocols", v)} />
              <ToggleRow icon="warning" iconColor={colors.warning} title={t("notif_content_defects" as any)} value={prefs.summaryIncludeDefects} onChange={(v) => set("summaryIncludeDefects", v)} />
              <ToggleRow icon="task-alt" iconColor="#26A69A" title={t("notif_content_tasks" as any)} value={prefs.summaryIncludeTasks} onChange={(v) => set("summaryIncludeTasks", v)} last />
            </View>
          </>
        )}

        {/* ── Mängel-Fristen ── */}
        <Text style={secStyle}>{t("notif_sec_deadlines" as any)}</Text>
        <View style={cardStyle}>
          <ToggleRow icon="schedule" iconColor={colors.warning} title={t("notif_deadline_active" as any)} sub={t("notif_deadline_sub" as any)} value={prefs.defectDeadlineReminder} onChange={(v) => set("defectDeadlineReminder", v)} last />
        </View>
        {prefs.defectDeadlineReminder && (
          <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, marginBottom: 20 }}>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>{t("notif_deadline_days" as any)}</Text>
            <Chips options={[1, 2, 3, 5, 7]} value={prefs.defectDeadlineDays} onPick={(n) => set("defectDeadlineDays", n)} />
          </View>
        )}

        {/* Info */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, backgroundColor: colors.primary + "08" }}>
          <MaterialIcons name="info-outline" size={18} color={colors.primary} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.muted, lineHeight: 18 }}>{t("notif_info_text" as any)}</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
