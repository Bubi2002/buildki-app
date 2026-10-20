import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Modal, FlatList, ActivityIndicator, Alert } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { loadPhoneContactEmails, loadPhoneContacts, type PhoneContactEmail } from "@/lib/phone-contacts";

type PickerContact = { name: string; email: string; phone?: string; key: string };

/**
 * Bottom-sheet modal to pick one or more email addresses from the phone's
 * contacts (searchable, multi-select). Returns the chosen emails via onSelect.
 */
export function ContactPickerModal({
  visible,
  onClose,
  onSelect,
  onSelectContacts,
  multi = true,
  includeNoEmail = false,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (emails: string[]) => void;
  /** Optional: also receive the full picked contacts (name + email + phone). */
  onSelectContacts?: (contacts: { name: string; email: string; phone?: string }[]) => void;
  multi?: boolean;
  /** Show ALL contacts, not only those with an email (e.g. the team contact book). */
  includeNoEmail?: boolean;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<PickerContact[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setSelected(new Set());
    setLoading(true);
    void (async () => {
      const res = includeNoEmail ? await loadPhoneContacts() : await loadPhoneContactEmails();
      setLoading(false);
      if (res.ok) {
        const list: PickerContact[] = res.contacts.map((c: any, i: number) => ({
          name: c.name,
          email: (c.email || "").trim(),
          phone: (c as any).phone,
          key: (c.email || (c as any).phone || `${c.name}-${i}`).toLowerCase(),
        }));
        setContacts(list);
        return;
      }
      // Nothing to show: explain why, then close.
      const msg =
        res.reason === "denied" ? t("msg_zugriff_auf_kontakte_wurde_verweigert")
        : res.reason === "web" ? t("msg_kontaktimport_ist_nur_auf_dem")
        : res.reason === "empty" ? (includeNoEmail ? t("contacts_none" as any) : t("contacts_none_with_email" as any))
        : `${t("alert_fehler")}: ${res.message || ""}`;
      Alert.alert(t("contacts_pick_title" as any), msg);
      onClose();
    })();
  }, [visible]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q))
    : contacts;

  const toggle = (c: PickerContact) => {
    if (!multi) {
      onSelect(c.email ? [c.email] : []);
      onSelectContacts?.([{ name: c.name, email: c.email, phone: c.phone }]);
      onClose();
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c.key)) next.delete(c.key);
      else next.add(c.key);
      return next;
    });
  };

  const apply = () => {
    const chosen = contacts.filter((c) => selected.has(c.key));
    onSelect(chosen.map((c) => c.email).filter(Boolean));
    onSelectContacts?.(chosen.map((c) => ({ name: c.name, email: c.email, phone: c.phone })));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center" }}>
        <View style={{ backgroundColor: colors.background, borderRadius: 18, maxHeight: "85%", paddingBottom: 16 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 8 }}>
            <MaterialIcons name="contacts" size={20} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground }}>{t("contacts_pick_title" as any)}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {/* Search */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface }}>
            <MaterialIcons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("contacts_search_placeholder" as any)}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={{ flex: 1, paddingVertical: 10, fontSize: 15, color: colors.foreground }}
            />
          </View>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => {
                const isSel = selected.has(item.key);
                return (
                  <Pressable
                    onPress={() => toggle(item)}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{item.email || item.phone || ""}</Text>
                    </View>
                    {multi ? (
                      <MaterialIcons name={isSel ? "check-box" : "check-box-outline-blank"} size={22} color={isSel ? colors.primary : colors.border} />
                    ) : (
                      <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={{ paddingVertical: 30, alignItems: "center" }}>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{t((includeNoEmail ? "contacts_none" : "contacts_none_with_email") as any)}</Text>
                </View>
              }
            />
          )}

          {multi && !loading && (
            <Pressable
              onPress={apply}
              disabled={selected.size === 0}
              style={{ marginHorizontal: 16, marginTop: 10, backgroundColor: selected.size > 0 ? colors.primary : colors.border, borderRadius: 10, paddingVertical: 14, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                {t("contacts_apply" as any)}{selected.size > 0 ? ` (${selected.size})` : ""}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
