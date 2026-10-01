import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, type TextStyle, type StyleProp } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadPhoneContactEmails, type PhoneContactEmail } from "@/lib/phone-contacts";
import { useColors } from "@/hooks/use-colors";

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
 * Text field for the responsible person that autocompletes from the phone's
 * contacts (loaded on first focus, with permission) and from previously used
 * values. Picking a contact fills in its email so it can be contacted later.
 */
export function AssigneeInput({ value, onChange, placeholder, style }: Props) {
  const colors = useColors();
  const [history, setHistory] = useState<string[]>([]);
  const [contacts, setContacts] = useState<PhoneContactEmail[]>([]);
  const [focused, setFocused] = useState(false);
  const loadedContacts = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        if (raw) setHistory(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  const loadContactsOnce = async () => {
    if (loadedContacts.current) return;
    loadedContacts.current = true;
    try {
      const res = await loadPhoneContactEmails();
      if (res.ok) setContacts(res.contacts.slice(0, 500));
    } catch {}
  };

  const q = value.trim().toLowerCase();
  const suggestions: { label: string; sub?: string; value: string }[] = [];
  if (q.length >= 1) {
    for (const h of history) {
      if (h.toLowerCase().includes(q) && h.toLowerCase() !== q) suggestions.push({ label: h, value: h });
    }
    for (const c of contacts) {
      if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) {
        suggestions.push({ label: c.name, sub: c.email, value: c.email });
      }
    }
  }
  // de-dup by value, keep order
  const seen = new Set<string>();
  const top = suggestions.filter((s) => (seen.has(s.value.toLowerCase()) ? false : seen.add(s.value.toLowerCase()))).slice(0, 6);

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => { setFocused(true); loadContactsOnce(); }}
        onBlur={() => { if (value.trim()) rememberAssignee(value); setTimeout(() => setFocused(false), 180); }}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={style}
      />
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
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: 8, marginTop: 4, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
});
