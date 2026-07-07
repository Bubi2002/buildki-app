import { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable, Switch, Alert, Platform, FlatList, Dimensions } from "react-native";
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

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

// Generate arrays for hours (0-23) and minutes (0-55 in 5-min steps)
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

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

function WheelPicker({ data, selectedValue, onValueChange, colors, formatValue }: {
  data: number[];
  selectedValue: number;
  onValueChange: (val: number) => void;
  colors: any;
  formatValue: (val: number) => string;
}) {
  const flatListRef = useRef<FlatList>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  const selectedIndex = data.indexOf(selectedValue);

  useEffect(() => {
    if (!isScrolling && flatListRef.current && selectedIndex >= 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: selectedIndex * ITEM_HEIGHT,
          animated: false,
        });
      }, 100);
    }
  }, [selectedIndex]);

  const handleScrollEnd = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(index, data.length - 1));
    if (data[clampedIndex] !== selectedValue) {
      onValueChange(data[clampedIndex]);
    }
    setIsScrolling(false);
  };

  const renderItem = ({ item, index }: { item: number; index: number }) => {
    const isSelected = item === selectedValue;
    return (
      <View style={{ height: ITEM_HEIGHT, justifyContent: "center", alignItems: "center" }}>
        <Text style={{
          fontSize: isSelected ? 22 : 16,
          fontWeight: isSelected ? "700" : "400",
          color: isSelected ? colors.foreground : colors.muted + "60",
        }}>
          {formatValue(item)}
        </Text>
      </View>
    );
  };

  // Padding to center the first/last items
  const paddingVertical = (PICKER_HEIGHT - ITEM_HEIGHT) / 2;

  return (
    <View style={{ height: PICKER_HEIGHT, overflow: "hidden", width: 80 }}>
      {/* Selection indicator */}
      <View style={{
        position: "absolute",
        top: paddingVertical,
        left: 4,
        right: 4,
        height: ITEM_HEIGHT,
        backgroundColor: colors.primary + "15",
        borderRadius: 0,
        borderWidth: 1,
        borderColor: colors.primary + "30",
        zIndex: 0,
      }} />
      <FlatList
        ref={flatListRef}
        data={data}
        keyExtractor={(item) => String(item)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical }}
        onScrollBeginDrag={() => setIsScrolling(true)}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={(e) => {
          // For when user lifts finger without momentum
          if (e.nativeEvent.velocity?.y === 0) {
            handleScrollEnd(e);
          }
        }}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
      />
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
          
          {/* Scroll Wheel Picker */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
            {/* Hours */}
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6, fontWeight: "600" }}>Stunde</Text>
              <WheelPicker
                data={HOURS}
                selectedValue={prefs.reminderHour}
                onValueChange={updateHour}
                colors={colors}
                formatValue={(v) => String(v).padStart(2, "0")}
              />
            </View>

            {/* Separator */}
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground, marginHorizontal: 8, marginTop: 20 }}>:</Text>

            {/* Minutes */}
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6, fontWeight: "600" }}>Minute</Text>
              <WheelPicker
                data={MINUTES}
                selectedValue={prefs.reminderMinute}
                onValueChange={updateMinute}
                colors={colors}
                formatValue={(v) => String(v).padStart(2, "0")}
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
