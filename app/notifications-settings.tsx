import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Switch, Alert, Platform, TextInput } from "react-native";
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


// Weekday names
const WEEKDAYS = [
  { key: 1, short: "Mo", label: "Montag" },
  { key: 2, short: "Di", label: "Dienstag" },
  { key: 3, short: "Mi", label: "Mittwoch" },
  { key: 4, short: "Do", label: "Donnerstag" },
  { key: 5, short: "Fr", label: "Freitag" },
  { key: 6, short: "Sa", label: "Samstag" },
  { key: 0, short: "So", label: "Sonntag" },
];

function NumberInput({ value, min, max, onValueChange, colors, formatValue }: {
  value: number;
  min: number;
  max: number;
  onValueChange: (val: number) => void;
  colors: any;
  formatValue: (val: number) => string;
}) {
  const [text, setText] = useState(formatValue(value));

  useEffect(() => {
    setText(formatValue(value));
  }, [value]);

  const increment = () => {
    const next = value >= max ? min : value + (max === 59 ? 5 : 1);
    const clamped = Math.min(next, max);
    onValueChange(clamped);
  };

  const decrement = () => {
    const next = value <= min ? max : value - (max === 59 ? 5 : 1);
    const clamped = Math.max(next, min);
    onValueChange(clamped);
  };

  const handleBlur = () => {
    const parsed = parseInt(text) || 0;
    const clamped = Math.min(max, Math.max(min, parsed));
    setText(formatValue(clamped));
    onValueChange(clamped);
  };

  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <Pressable
        onPress={increment}
        style={({ pressed }) => [{
          width: 44, height: 44, alignItems: "center", justifyContent: "center",
          backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        }]}
      >
        <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.foreground} />
      </Pressable>
      <TextInput
        value={text}
        onChangeText={(t) => setText(t.replace(/[^0-9]/g, '').slice(0, 2))}
        onBlur={handleBlur}
        keyboardType="number-pad"
        maxLength={2}
        style={{
          width: 60, height: 50, textAlign: 'center',
          fontSize: 24, fontWeight: '700',
          color: colors.foreground,
          backgroundColor: colors.primary + '10',
          borderWidth: 1, borderColor: colors.primary + '40',
        }}
      />
      <Pressable
        onPress={decrement}
        style={({ pressed }) => [{
          width: 44, height: 44, alignItems: "center", justifyContent: "center",
          backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        }]}
      >
        <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

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
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mo-Fr default
  const [hasPermission, setHasPermission] = useState(true);

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    const saved = await getNotificationPreferences();
    setPrefs(saved);
    // Load saved weekdays
    if ((saved as any).weekdays) {
      setSelectedDays((saved as any).weekdays);
    }
    if (Platform.OS !== "web") {
      const perm = await requestPermissions();
      setHasPermission(perm);
    }
  };

  const updatePref = async (key: keyof NotificationPreferences, value: boolean | number) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    await saveNotificationPreferences({ ...updated, weekdays: selectedDays } as any);
    if (updated.enabled) {
      await scheduleNotifications();
    }
  };

  const updateHour = async (hour: number) => {
    const updated = { ...prefs, reminderHour: hour };
    setPrefs(updated);
    await saveNotificationPreferences({ ...updated, weekdays: selectedDays } as any);
    if (updated.enabled) await scheduleNotifications();
  };

  const updateMinute = async (minute: number) => {
    const updated = { ...prefs, reminderMinute: minute };
    setPrefs(updated);
    await saveNotificationPreferences({ ...updated, weekdays: selectedDays } as any);
    if (updated.enabled) await scheduleNotifications();
  };

  const toggleDay = async (day: number) => {
    let newDays: number[];
    if (selectedDays.includes(day)) {
      newDays = selectedDays.filter(d => d !== day);
      if (newDays.length === 0) newDays = [day]; // Must have at least one day
    } else {
      newDays = [...selectedDays, day];
    }
    setSelectedDays(newDays);
    await saveNotificationPreferences({ ...prefs, weekdays: newDays } as any);
    if (prefs.enabled) await scheduleNotifications();
  };

  const selectAllDays = async () => {
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    setSelectedDays(allDays);
    await saveNotificationPreferences({ ...prefs, weekdays: allDays } as any);
    if (prefs.enabled) await scheduleNotifications();
  };

  const selectWeekdays = async () => {
    const weekdays = [1, 2, 3, 4, 5];
    setSelectedDays(weekdays);
    await saveNotificationPreferences({ ...prefs, weekdays } as any);
    if (prefs.enabled) await scheduleNotifications();
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
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 0, backgroundColor: colors.warning + "15", borderWidth: 1, borderColor: colors.warning, marginBottom: 20, opacity: pressed ? 0.8 : 1 }]}
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
        <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
          <View style={{ width: 40, height: 40, borderRadius: 0, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
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
        <View style={{ borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 20, overflow: "hidden" }}>
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

        {/* Time Picker - Apple Clock Style */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Uhrzeit</Text>
        <View style={{ borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 16 }}>
            Erinnerung um {String(prefs.reminderHour).padStart(2, "0")}:{String(prefs.reminderMinute).padStart(2, "0")} Uhr
          </Text>
          
          {/* Time Input */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
            {/* Hours */}
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontWeight: "600" }}>Stunde</Text>
              <NumberInput
                value={prefs.reminderHour}
                min={0}
                max={23}
                onValueChange={updateHour}
                colors={colors}
                formatValue={(v: number) => String(v).padStart(2, "0")}
              />
            </View>

            {/* Separator */}
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground, marginTop: 20 }}>:</Text>

            {/* Minutes */}
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontWeight: "600" }}>Minute</Text>
              <NumberInput
                value={prefs.reminderMinute}
                min={0}
                max={55}
                onValueChange={updateMinute}
                colors={colors}
                formatValue={(v: number) => String(v).padStart(2, "0")}
              />
            </View>
          </View>
        </View>

        {/* Weekday Selection */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Wochentage</Text>
        <View style={{ borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 20 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            {WEEKDAYS.map(day => {
              const isActive = selectedDays.includes(day.key);
              return (
                <Pressable
                  key={day.key}
                  onPress={() => toggleDay(day.key)}
                  style={({ pressed }) => [{
                    width: 40,
                    height: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 0,
                    backgroundColor: isActive ? colors.primary : "transparent",
                    borderWidth: 1,
                    borderColor: isActive ? colors.primary : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: isActive ? "#fff" : colors.muted }}>{day.short}</Text>
                </Pressable>
              );
            })}
          </View>
          {/* Quick select buttons */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={selectWeekdays}
              style={({ pressed }) => [{
                flex: 1, paddingVertical: 8, alignItems: "center",
                borderWidth: 1, borderColor: colors.border, borderRadius: 0,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "500", color: colors.primary }}>Mo – Fr</Text>
            </Pressable>
            <Pressable
              onPress={selectAllDays}
              style={({ pressed }) => [{
                flex: 1, paddingVertical: 8, alignItems: "center",
                borderWidth: 1, borderColor: colors.border, borderRadius: 0,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "500", color: colors.primary }}>Jeden Tag</Text>
            </Pressable>
          </View>
        </View>

        {/* Info */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 0, backgroundColor: colors.primary + "08" }}>
          <MaterialIcons name="info-outline" size={18} color={colors.primary} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            Benachrichtigungen werden lokal auf deinem Gerät geplant. Sie funktionieren auch ohne Internetverbindung. Die Erinnerungen werden an den gewählten Tagen zur eingestellten Uhrzeit ausgelöst, wenn offene Punkte vorhanden sind.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
