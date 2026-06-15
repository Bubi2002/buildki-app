import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Switch, Alert, Platform } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  requestPermissions,
  scheduleNotifications,
  type NotificationPreferences,
} from "@/lib/notification-service";

export default function NotificationsSettingsScreen() {
  const colors = useColors();
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    enabled: true,
    openDefectsReminder: true,
    checklistReminder: true,
    dailyDigest: true,
    reminderHour: 8,
    reminderMinute: 0,
  });
  const [hasPermission, setHasPermission] = useState(true);

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    const saved = await getNotificationPreferences();
    setPrefs(saved);
    if (Platform.OS !== "web") {
      const perm = await requestPermissions();
      setHasPermission(perm);
    }
  };

  const updatePref = async (key: keyof NotificationPreferences, value: boolean | number) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    await saveNotificationPreferences(updated);
  };

  const enableNotifications = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Nicht verfügbar", "Push-Benachrichtigungen sind nur auf dem Gerät verfügbar.");
      return;
    }
    const granted = await requestPermissions();
    setHasPermission(granted);
    if (granted) {
      await updatePref("enabled", true);
      await scheduleNotifications();
      Alert.alert("Aktiviert", "Benachrichtigungen wurden aktiviert.");
    } else {
      Alert.alert("Berechtigung verweigert", "Bitte aktiviere Benachrichtigungen in den Geräte-Einstellungen.");
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <ScreenContainer className="flex-1">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ marginRight: 12, opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Benachrichtigungen</Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>Erinnerungen konfigurieren</Text>
          </View>
        </View>

        {/* Permission Warning */}
        {!hasPermission && Platform.OS !== "web" && (
          <Pressable
            onPress={enableNotifications}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, backgroundColor: colors.warning + "15", borderWidth: 1, borderColor: colors.warning, marginBottom: 20, opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="notifications-off" size={24} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Benachrichtigungen deaktiviert</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Tippe hier um sie zu aktivieren</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        )}

        {/* Master Toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <MaterialIcons name="notifications-active" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Benachrichtigungen</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Alle Erinnerungen ein/ausschalten</Text>
          </View>
          <Switch
            value={prefs.enabled}
            onValueChange={(v) => updatePref("enabled", v)}
            trackColor={{ false: colors.border, true: colors.primary + "60" }}
            thumbColor={prefs.enabled ? colors.primary : colors.muted}
          />
        </View>

        {/* Reminder Types */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Erinnerungen</Text>
        <View style={{ borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 20, overflow: "hidden" }}>
          {/* Open Defects */}
          <View style={{ flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <MaterialIcons name="warning" size={20} color={colors.warning} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Offene Mängel</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>Tägliche Erinnerung bei offenen Mängeln</Text>
            </View>
            <Switch
              value={prefs.openDefectsReminder}
              onValueChange={(v) => updatePref("openDefectsReminder", v)}
              trackColor={{ false: colors.border, true: colors.primary + "60" }}
              thumbColor={prefs.openDefectsReminder ? colors.primary : colors.muted}
              disabled={!prefs.enabled}
            />
          </View>

          {/* Checklists */}
          <View style={{ flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <MaterialIcons name="checklist" size={20} color={"#8E24AA"} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Checklisten</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>Erinnerung bei offenen Prüfpunkten</Text>
            </View>
            <Switch
              value={prefs.checklistReminder}
              onValueChange={(v) => updatePref("checklistReminder", v)}
              trackColor={{ false: colors.border, true: colors.primary + "60" }}
              thumbColor={prefs.checklistReminder ? colors.primary : colors.muted}
              disabled={!prefs.enabled}
            />
          </View>

          {/* Daily Digest */}
          <View style={{ flexDirection: "row", alignItems: "center", padding: 14 }}>
            <MaterialIcons name="today" size={20} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>Tägliche Zusammenfassung</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>Morgens an offene Aufgaben erinnern</Text>
            </View>
            <Switch
              value={prefs.dailyDigest}
              onValueChange={(v) => updatePref("dailyDigest", v)}
              trackColor={{ false: colors.border, true: colors.primary + "60" }}
              thumbColor={prefs.dailyDigest ? colors.primary : colors.muted}
              disabled={!prefs.enabled}
            />
          </View>
        </View>

        {/* Reminder Time */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Erinnerungszeit</Text>
        <View style={{ borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
            Tägliche Erinnerung um {String(prefs.reminderHour).padStart(2, "0")}:{String(prefs.reminderMinute).padStart(2, "0")} Uhr
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {[6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20].map((hour) => (
              <Pressable
                key={hour}
                onPress={() => updatePref("reminderHour", hour)}
                style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: prefs.reminderHour === hour ? colors.primary + "15" : "transparent", borderWidth: 1, borderColor: prefs.reminderHour === hour ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: prefs.reminderHour === hour ? colors.primary : colors.muted }}>{String(hour).padStart(2, "0")}:00</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Info */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 10, backgroundColor: colors.primary + "08" }}>
          <MaterialIcons name="info-outline" size={18} color={colors.primary} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            Benachrichtigungen werden lokal auf deinem Gerät geplant. Sie funktionieren auch ohne Internetverbindung. Die Erinnerungen werden täglich zur eingestellten Uhrzeit ausgelöst, wenn offene Punkte vorhanden sind.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
