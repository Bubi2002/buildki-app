import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Modal, FlatList, ActivityIndicator, Alert } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { loadPhoneContactEmails, type PhoneContactEmail } from "@/lib/phone-contacts";

/**
 * Bottom-sheet modal to pick one or more email addresses from the phone's
 * contacts (searchable, multi-select). Returns the chosen emails via onSelect.
 */
export function ContactPickerModal({
  visible,
  onClose,
  onSelect,
  multi = true,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (emails: string[]) => void;
  multi?: boolean;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<PhoneContactEmail[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setSelected(new Set());
    setLoading(true);
    void (async () => {
      const res = await loadPhoneContactEmails();
      setLoading(false);
      if (res.ok) {
        setContacts(res.contacts);
        return;
      }
      // Nothing to show: explain why, then close.
      const msg =
        res.reason === "denied" ? t("msg_zugriff_auf_kontakte_wurde_verweigert")
        : res.reason === "web" ? t("msg_kontaktimport_ist_nur_auf_dem")
        : res.reason === "empty" ? t("contacts_none_with_email" as any)
        : `${t("alert_fehler")}: ${res.message || ""}`;
      Alert.alert(t("contacts_pick_title" as any), msg);
      onClose();
    })();
  }, [visible]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : contacts;

  const toggle = (email: string) => {
    if (!multi) {
      onSelect([email]);
      onClose();
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const apply = () => {
    onSelect(Array.from(selected));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "85%", paddingBottom: 16 }}>
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
              keyExtractor={(item) => item.email}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => {
                const isSel = selected.has(item.email);
                return (
                  <Pressable
                    onPress={() => toggle(item.email)}
                    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{item.email}</Text>
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
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{t("contacts_none_with_email" as any)}</Text>
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
