import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Linking, Modal, FlatList, ActivityIndicator, type TextStyle, type StyleProp } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadPhoneContacts, type PhoneContact } from "@/lib/phone-contacts";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

const HISTORY_KEY = "assignee-history";

/** Remember a used "Zuständig" value so it's suggested next time. */
export async function rememberAssignee(value: string) {
  const v = (value || "").trim();
  if (!v) return;
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [v, ...list.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 30);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * Text field for the responsible person. Autocompletes inline from previously
 * used values and the phone's contacts, AND offers an always-available contacts
 * button that opens a modal picker — the button path does NOT depend on the
 * keyboard-focus state, so it works reliably even across the iOS permission
 * dialog (which blurs the field).
 */
export function AssigneeInput({ value, onChange, placeholder, style }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const [history, setHistory] = useState<string[]>([]);
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [focused, setFocused] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const loadedContacts = useRef(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal picker state (focus-independent, reliable path).
  const [showPicker, setShowPicker] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState<null | "denied" | "empty" | "error" | "web">(null);
  const [pickerQuery, setPickerQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        if (raw) setHistory(JSON.parse(raw));
      } catch {}
    })();
    return () => { if (blurTimer.current) clearTimeout(blurTimer.current); };
  }, []);

  const loadContactsOnce = async () => {
    if (loadedContacts.current && contacts.length > 0) return;
    try {
      const res = await loadPhoneContacts();
      if (res.ok) {
        setContacts(res.contacts.slice(0, 1000));
        setPermDenied(false);
        loadedContacts.current = true;
      } else if (res.reason === "denied") {
        setPermDenied(true);
      }
    } catch {}
  };

  // Open the modal picker and (re)load contacts, surfacing the real reason on failure.
  const openPicker = async () => {
    setShowPicker(true);
    setPickerQuery("");
    setPickerBusy(true);
    setPickerError(null);
    try {
      const res = await loadPhoneContacts();
      if (res.ok) {
        setContacts(res.contacts.slice(0, 1000));
        loadedContacts.current = true;
        setPermDenied(false);
        setPickerError(null);
      } else {
        setPickerError(res.reason);
        if (res.reason === "denied") setPermDenied(true);
      }
    } catch {
      setPickerError("error");
    } finally {
      setPickerBusy(false);
    }
  };

  const pick = (name: string) => {
    onChange(name);
    void rememberAssignee(name);
    setShowPicker(false);
    setFocused(false);
  };

  const q = value.trim().toLowerCase();
  const suggestions: { label: string; sub?: string; value: string }[] = [];
  if (q.length >= 1) {
    for (const h of history) {
      if (h.toLowerCase().includes(q) && h.toLowerCase() !== q) suggestions.push({ label: h, value: h });
    }
    for (const c of contacts) {
      if (c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q)) {
        suggestions.push({ label: c.name, sub: c.email || c.phone, value: c.name });
      }
    }
  } else {
    for (const h of history) suggestions.push({ label: h, value: h });
    for (const c of contacts) suggestions.push({ label: c.name, sub: c.email || c.phone, value: c.name });
  }
  const seen = new Set<string>();
  const top = suggestions.filter((s) => (seen.has(s.value.toLowerCase()) ? false : seen.add(s.value.toLowerCase()))).slice(0, 8);

  const pq = pickerQuery.trim().toLowerCase();
  const pickerList = (pq
    ? contacts.filter((c) => c.name.toLowerCase().includes(pq) || (c.email || "").toLowerCase().includes(pq) || (c.phone || "").toLowerCase().includes(pq))
    : contacts
  ).slice(0, 500);

  return (
    <View>
      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          value={value}
          onChangeText={(v) => { setFocused(true); onChange(v); }}
          onFocus={() => { if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; } setFocused(true); void loadContactsOnce(); }}
          onBlur={() => { if (value.trim()) rememberAssignee(value); if (blurTimer.current) clearTimeout(blurTimer.current); blurTimer.current = setTimeout(() => setFocused(false), 180); }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={[style, { paddingRight: 44 }]}
        />
        {/* Always-visible contacts button (reliable, focus-independent). */}
        <Pressable
          onPress={() => void openPicker()}
          hitSlop={8}
          style={({ pressed }) => [{ position: "absolute", right: 8, padding: 6, opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel={t('assignee_pick_title' as any)}
        >
          <MaterialIcons name="contacts" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {focused && top.length > 0 && (
        <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {top.map((s, i) => (
            <Pressable
              key={`${s.value}-${i}`}
              onPress={() => { onChange(s.value); rememberAssignee(s.value); setFocused(false); }}
              style={({ pressed }) => [styles.row, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, pressed && { opacity: 0.6 }]}
            >
              <MaterialIcons name={s.sub ? "contacts" : "history"} size={16} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 14 }} numberOfLines={1}>{s.label}</Text>
                {s.sub ? <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{s.sub}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Contacts picker modal — not tied to keyboard focus, so it always works. */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowPicker(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "800", color: colors.foreground }}>{t('assignee_pick_title' as any)}</Text>
              <Pressable onPress={() => setShowPicker(false)} hitSlop={8}><MaterialIcons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            {contacts.length > 0 && (
              <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <MaterialIcons name="search" size={18} color={colors.muted} />
                <TextInput
                  value={pickerQuery}
                  onChangeText={setPickerQuery}
                  placeholder={t('search' as any)}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  style={{ flex: 1, color: colors.foreground, fontSize: 15, paddingVertical: 8 }}
                />
              </View>
            )}
            {pickerBusy ? (
              <View style={{ padding: 30, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
            ) : pickerError ? (
              <Pressable onPress={() => { if (pickerError === "denied") void Linking.openSettings(); else void openPicker(); }} style={{ padding: 20, alignItems: "center", gap: 8 }}>
                <MaterialIcons name="contacts" size={28} color={colors.muted} />
                <Text style={{ color: colors.foreground, fontSize: 14, textAlign: "center" }}>
                  {pickerError === "denied" ? t('assignee_enable_contacts' as any) : t('assignee_no_contacts' as any)}
                </Text>
              </Pressable>
            ) : (
              <FlatList
                data={pickerList}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 380 }}
                keyExtractor={(item, i) => `${item.name}-${i}`}
                ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: "center", padding: 20 }}>{t('assignee_no_contacts' as any)}</Text>}
                renderItem={({ item }) => (
                  <Pressable onPress={() => pick(item.name)} style={({ pressed }) => [styles.pickRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}>
                    <MaterialIcons name="person" size={18} color={colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>{item.name}</Text>
                      {(item.email || item.phone) ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.email || item.phone}</Text> : null}
                    </View>
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: 8, marginTop: 4, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, padding: 16, paddingBottom: 28 },
  sheetHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
