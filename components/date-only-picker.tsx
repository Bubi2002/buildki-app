import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import {
  formatDateOnly,
  isDateOnOrAfter,
  parseDateOnly,
  parseGermanDateInput,
  toDateOnlyValue,
  todayDateOnly,
} from "@/lib/date-only";

type DateOnlyPickerProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  minimumDate?: string;
  allowClear?: boolean;
  testID?: string;
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function monthStart(value: string): string {
  const date = parseDateOnly(value) || parseDateOnly(todayDateOnly())!;
  return toDateOnlyValue(new Date(date.getFullYear(), date.getMonth(), 1, 12));
}

export function DateOnlyPicker({
  value,
  onChange,
  label = "Genaues Datum",
  minimumDate = todayDateOnly(),
  allowClear = true,
  testID,
}: DateOnlyPickerProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [cursor, setCursor] = useState(() => monthStart(value || minimumDate));
  const [manualValue, setManualValue] = useState(value ? formatDateOnly(value) : "");
  const [manualError, setManualError] = useState("");

  const cursorDate = parseDateOnly(cursor)!;
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const days = (() => {
    const leading = (new Date(year, month, 1, 12).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0, 12).getDate();
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: count }, (_, index) => index + 1),
    ];
  })();

  const cursorMonth = cursor.slice(0, 7);
  const minimumMonth = minimumDate.slice(0, 7);

  const moveMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1, 12);
    setCursor(toDateOnlyValue(next));
  };

  const chooseDate = (dateValue: string) => {
    if (!isDateOnOrAfter(dateValue, minimumDate)) return;
    onChange(dateValue);
    setManualValue(formatDateOnly(dateValue));
    setManualError("");
    setExpanded(false);
  };

  const applyManualDate = () => {
    const parsed = parseGermanDateInput(manualValue);
    if (!parsed) {
      setManualError("Bitte ein gültiges Datum als TT.MM.JJJJ eingeben.");
      return;
    }
    if (!isDateOnOrAfter(parsed, minimumDate)) {
      setManualError("Das Datum darf nicht in der Vergangenheit liegen.");
      return;
    }
    chooseDate(parsed);
  };

  return (
    <View testID={testID} style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Pressable
        onPress={() => {
          setManualError("");
          if (!expanded) {
            setManualValue(value ? formatDateOnly(value) : "");
            setCursor(monthStart(value || minimumDate));
          }
          setExpanded((current) => !current);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDateOnly(value) : "nicht gesetzt"}`}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor: expanded || value ? colors.primary : colors.border, backgroundColor: colors.background },
          pressed && { opacity: 0.75 },
        ]}
      >
        <MaterialIcons name="calendar-month" size={20} color={value ? colors.primary : colors.muted} />
        <Text style={[styles.triggerText, { color: value ? colors.foreground : colors.muted }]}>
          {value ? formatDateOnly(value) : "Datum wählen oder eingeben"}
        </Text>
        <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={20} color={colors.muted} />
      </Pressable>

      {expanded ? (
        <View style={[styles.calendar, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <View style={styles.monthHeader}>
            <Pressable
              onPress={() => moveMonth(-1)}
              disabled={cursorMonth <= minimumMonth}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
            >
              <MaterialIcons name="chevron-left" size={22} color={cursorMonth <= minimumMonth ? colors.border : colors.primary} />
            </Pressable>
            <Text style={[styles.monthTitle, { color: colors.foreground }]}>
              {cursorDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
            </Text>
            <Pressable onPress={() => moveMonth(1)} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}>
              <MaterialIcons name="chevron-right" size={22} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((weekday) => (
              <Text key={weekday} style={[styles.weekday, { color: colors.muted }]}>{weekday}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {days.map((day, index) => {
              if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const dateValue = toDateOnlyValue(new Date(year, month, day, 12));
              const disabled = !isDateOnOrAfter(dateValue, minimumDate);
              const selected = dateValue === value;
              return (
                <Pressable
                  key={dateValue}
                  onPress={() => chooseDate(dateValue)}
                  disabled={disabled}
                  style={({ pressed }) => [
                    styles.dayCell,
                    selected && { backgroundColor: colors.primary },
                    pressed && !disabled && { opacity: 0.65 },
                  ]}
                >
                  <Text style={{ color: disabled ? colors.border : selected ? "#FFFFFF" : colors.foreground, fontSize: 13, fontWeight: selected ? "700" : "500" }}>
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.manualLabel, { color: colors.muted }]}>Oder Datum direkt eingeben</Text>
          <View style={styles.manualRow}>
            <TextInput
              value={manualValue}
              onChangeText={(text) => { setManualValue(text); setManualError(""); }}
              onSubmitEditing={applyManualDate}
              placeholder="TT.MM.JJJJ"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              style={[styles.manualInput, { color: colors.foreground, borderColor: manualError ? colors.error : colors.border }]}
            />
            <Pressable onPress={applyManualDate} style={({ pressed }) => [styles.applyButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.75 }]}>
              <Text style={styles.applyText}>Übernehmen</Text>
            </Pressable>
          </View>
          {manualError ? <Text style={[styles.errorText, { color: colors.error }]}>{manualError}</Text> : null}

          {allowClear && value ? (
            <Pressable
              onPress={() => { onChange(""); setManualValue(""); setManualError(""); setExpanded(false); }}
              style={({ pressed }) => [styles.clearButton, { borderColor: colors.border }, pressed && { opacity: 0.65 }]}
            >
              <MaterialIcons name="event-busy" size={16} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Datum entfernen</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  trigger: { minHeight: 48, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  triggerText: { flex: 1, fontSize: 14, fontWeight: "600" },
  calendar: { borderWidth: 1, borderTopWidth: 0, padding: 12 },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  monthTitle: { fontSize: 15, fontWeight: "700", textTransform: "capitalize" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "700" },
  daysGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: "center", justifyContent: "center" },
  manualLabel: { fontSize: 12, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  manualRow: { flexDirection: "row", gap: 8 },
  manualInput: { flex: 1, minHeight: 44, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  applyButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  applyText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  errorText: { fontSize: 11, marginTop: 5 },
  clearButton: { minHeight: 38, borderWidth: 1, marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
