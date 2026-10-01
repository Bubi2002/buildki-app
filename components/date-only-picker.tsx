import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
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
  /** Also let the user pick a time of day (value becomes "YYYY-MM-DDTHH:mm"). */
  withTime?: boolean;
  testID?: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const datePart = (v: string) => (v || "").slice(0, 10);
const timePart = (v: string) => ((v || "").length >= 16 && v[10] === "T" ? v.slice(11, 16) : "");

const WEEKDAY_KEYS = [
  "date_only_picker_weekday_mo",
  "date_only_picker_weekday_di",
  "date_only_picker_weekday_mi",
  "date_only_picker_weekday_do",
  "date_only_picker_weekday_fr",
  "date_only_picker_weekday_sa",
  "date_only_picker_weekday_so",
];

function monthStart(value: string): string {
  const date = parseDateOnly(value) || parseDateOnly(todayDateOnly())!;
  return toDateOnlyValue(new Date(date.getFullYear(), date.getMonth(), 1, 12));
}

export function DateOnlyPicker({
  value,
  onChange,
  label,
  minimumDate = todayDateOnly(),
  allowClear = true,
  withTime = false,
  testID,
}: DateOnlyPickerProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const displayLabel = label ?? t('date_only_picker_genaues_datum' as any);
  const [expanded, setExpanded] = useState(false);
  const dPart = datePart(value);
  const tPart = timePart(value);
  const [cursor, setCursor] = useState(() => monthStart(dPart || minimumDate));
  const [manualValue, setManualValue] = useState(dPart ? formatDateOnly(dPart) : "");
  const [manualError, setManualError] = useState("");

  // Default time when the user turns on a time for a date that has none yet.
  const effectiveTime = tPart || "08:00";
  const [th, tm] = effectiveTime.split(":").map((n) => parseInt(n, 10) || 0);
  const emitWithTime = (dateValue: string, time: string) => onChange(`${dateValue}T${time}`);
  const stepTime = (deltaH: number, deltaM: number) => {
    if (!dPart) return;
    let h = (th + deltaH + 24) % 24;
    let m = tm + deltaM;
    if (m >= 60) m -= 60;
    if (m < 0) m += 60;
    emitWithTime(dPart, `${pad2(h)}:${pad2(m)}`);
  };

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
    if (withTime) emitWithTime(dateValue, effectiveTime);
    else onChange(dateValue);
    setManualValue(formatDateOnly(dateValue));
    setManualError("");
    // With a time picker the calendar stays open so the user can set the time.
    if (!withTime) setExpanded(false);
  };

  const applyManualDate = () => {
    const parsed = parseGermanDateInput(manualValue);
    if (!parsed) {
      setManualError(t('date_only_picker_ungueltiges_datum' as any));
      return;
    }
    if (!isDateOnOrAfter(parsed, minimumDate)) {
      setManualError(t('date_only_picker_datum_vergangenheit' as any));
      return;
    }
    chooseDate(parsed);
  };

  return (
    <View testID={testID} style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.muted }]}>{displayLabel}</Text>
      <Pressable
        onPress={() => {
          setManualError("");
          if (!expanded) {
            setManualValue(dPart ? formatDateOnly(dPart) : "");
            setCursor(monthStart(dPart || minimumDate));
          }
          setExpanded((current) => !current);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${displayLabel}: ${dPart ? formatDateOnly(dPart) : t('date_only_picker_nicht_gesetzt' as any)}`}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor: expanded || dPart ? colors.primary : colors.border, backgroundColor: colors.background },
          pressed && { opacity: 0.75 },
        ]}
      >
        <MaterialIcons name="calendar-month" size={20} color={dPart ? colors.primary : colors.muted} />
        <Text style={[styles.triggerText, { color: dPart ? colors.foreground : colors.muted }]}>
          {dPart ? `${formatDateOnly(dPart)}${withTime && tPart ? ` · ${tPart}` : ""}` : t('date_only_picker_datum_waehlen' as any)}
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
            {WEEKDAY_KEYS.map((weekdayKey) => (
              <Text key={weekdayKey} style={[styles.weekday, { color: colors.muted }]}>{t(weekdayKey as any)}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {days.map((day, index) => {
              if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const dateValue = toDateOnlyValue(new Date(year, month, day, 12));
              const disabled = !isDateOnOrAfter(dateValue, minimumDate);
              const selected = dateValue === dPart;
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

          {withTime && dPart ? (
            <View style={[styles.timeRow, { borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialIcons name="schedule" size={18} color={colors.primary} />
                <Text style={[styles.timeLabel, { color: colors.foreground }]}>{t('date_only_picker_uhrzeit' as any)}</Text>
              </View>
              <View style={styles.timeControls}>
                <Pressable onPress={() => stepTime(-1, 0)} style={({ pressed }) => [styles.timeStep, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}><MaterialIcons name="remove" size={18} color={colors.primary} /></Pressable>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>{pad2(th)}</Text>
                <Pressable onPress={() => stepTime(1, 0)} style={({ pressed }) => [styles.timeStep, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}><MaterialIcons name="add" size={18} color={colors.primary} /></Pressable>
                <Text style={[styles.timeColon, { color: colors.muted }]}>:</Text>
                <Pressable onPress={() => stepTime(0, -5)} style={({ pressed }) => [styles.timeStep, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}><MaterialIcons name="remove" size={18} color={colors.primary} /></Pressable>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>{pad2(tm)}</Text>
                <Pressable onPress={() => stepTime(0, 5)} style={({ pressed }) => [styles.timeStep, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}><MaterialIcons name="add" size={18} color={colors.primary} /></Pressable>
              </View>
            </View>
          ) : null}

          <Text style={[styles.manualLabel, { color: colors.muted }]}>{t('date_only_picker_oder_direkt' as any)}</Text>
          <View style={styles.manualRow}>
            <TextInput
              value={manualValue}
              onChangeText={(text) => { setManualValue(text); setManualError(""); }}
              onSubmitEditing={applyManualDate}
              placeholder={t('date_only_picker_format_placeholder' as any)}
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              style={[styles.manualInput, { color: colors.foreground, borderColor: manualError ? colors.error : colors.border }]}
            />
            <Pressable onPress={applyManualDate} style={({ pressed }) => [styles.applyButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.75 }]}>
              <Text style={styles.applyText}>{t('date_only_picker_uebernehmen' as any)}</Text>
            </Pressable>
          </View>
          {manualError ? <Text style={[styles.errorText, { color: colors.error }]}>{manualError}</Text> : null}

          {allowClear && dPart ? (
            <Pressable
              onPress={() => { onChange(""); setManualValue(""); setManualError(""); setExpanded(false); }}
              style={({ pressed }) => [styles.clearButton, { borderColor: colors.border }, pressed && { opacity: 0.65 }]}
            >
              <MaterialIcons name="event-busy" size={16} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>{t('date_only_picker_datum_entfernen' as any)}</Text>
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
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, marginTop: 10, paddingTop: 12 },
  timeLabel: { fontSize: 13, fontWeight: "700" },
  timeControls: { flexDirection: "row", alignItems: "center", gap: 4 },
  timeStep: { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  timeValue: { fontSize: 16, fontWeight: "800", minWidth: 26, textAlign: "center" },
  timeColon: { fontSize: 16, fontWeight: "800", marginHorizontal: 2 },
  manualLabel: { fontSize: 12, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  manualRow: { flexDirection: "row", gap: 8 },
  manualInput: { flex: 1, minHeight: 44, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  applyButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  applyText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  errorText: { fontSize: 11, marginTop: 5 },
  clearButton: { minHeight: 38, borderWidth: 1, marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
