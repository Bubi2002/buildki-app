import { useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { getPdfBranding, savePdfBranding, type PdfBranding } from "@/lib/pdf-branding-store";

type Mode = "off" | "prepare" | "auto";

export default function SendAutomationScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [branding, setBranding] = useState<PdfBranding | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    void (async () => setBranding(await getPdfBranding()))();
  }, []);

  const update = (patch: Partial<PdfBranding>) => {
    setBranding((prev) => (prev ? { ...prev, ...patch } : prev));
    setHasChanges(true);
  };
  const setMode = (mode: Mode) => update({ autoSendMode: mode, autoSendEmail: mode === "auto" });

  const save = async () => {
    if (!branding) return;
    await savePdfBranding(branding);
    setHasChanges(false);
    Alert.alert(t("alert_gespeichert"), t("msg_pdfbranding_wurde_aktualisiert"));
  };

  const mode: Mode = (branding?.autoSendMode as Mode) || "off";

  const MODES: { key: Mode; icon: string; titleKey: string; descKey: string; tint: string }[] = [
    { key: "off", icon: "block", titleKey: "send_mode_off", descKey: "send_mode_off_desc", tint: colors.muted },
    { key: "prepare", icon: "fact-check", titleKey: "send_mode_prepare", descKey: "send_mode_prepare_desc", tint: "#34D399" },
    { key: "auto", icon: "send", titleKey: "send_mode_auto", descKey: "send_mode_auto_desc", tint: "#F59E0B" },
  ];

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("send_auto_title" as any)}</Text>
        <Pressable onPress={save} disabled={!hasChanges} hitSlop={8}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: hasChanges ? colors.primary : colors.muted }}>{t("btn_speichern")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Text style={[styles.intro, { color: colors.muted }]}>{t("send_auto_intro" as any)}</Text>

        {/* Mode */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("send_mode_label" as any)}</Text>
        <View style={{ gap: 10 }}>
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => setMode(m.key)}
                style={({ pressed }) => [styles.modeCard, { borderColor: active ? m.tint : colors.border, backgroundColor: active ? m.tint + "14" : colors.surface, opacity: pressed ? 0.9 : 1 }]}
              >
                <MaterialIcons name={m.icon as any} size={22} color={active ? m.tint : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: active ? m.tint : colors.foreground }}>{t(m.titleKey as any)}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{t(m.descKey as any)}</Text>
                </View>
                <MaterialIcons name={active ? "radio-button-checked" : "radio-button-unchecked"} size={20} color={active ? m.tint : colors.border} />
              </Pressable>
            );
          })}
        </View>

        {mode !== "off" && (
          <>
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="info-outline" size={18} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 12, color: colors.muted, lineHeight: 18 }}>{t("send_auto_info" as any)}</Text>
            </View>

            {/* Recipients */}
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>{t("send_recipients_label" as any)}</Text>
            <TextInput
              value={branding?.defaultEmailAddress || ""}
              onChangeText={(v) => update({ defaultEmailAddress: v })}
              placeholder={t("pdf_branding_email_addresses_placeholder" as any)}
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              multiline
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, minHeight: 44 }]}
            />
            <Text style={styles.hint}>{t("mehrere_adressen_mit_komma")}</Text>

            <Text style={[styles.fieldHint, { color: colors.muted }]}>{t("pdf_branding_email_betreff_hint" as any)}</Text>
            <TextInput
              value={branding?.emailSubjectTemplate || ""}
              onChangeText={(v) => update({ emailSubjectTemplate: v })}
              placeholder={t("pdf_branding_email_betreff_placeholder" as any)}
              placeholderTextColor={colors.muted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />

            <Text style={[styles.fieldHint, { color: colors.muted }]}>{t("pdf_branding_email_text_hint" as any)}</Text>
            <TextInput
              value={branding?.emailBodyTemplate || ""}
              onChangeText={(v) => update({ emailBodyTemplate: v })}
              placeholder={t("pdf_branding_email_text_placeholder" as any)}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, minHeight: 80, textAlignVertical: "top" }]}
            />

            <Text style={[styles.fieldHint, { color: colors.muted }]}>{t("cc_kommagetrennt")}</Text>
            <TextInput
              value={branding?.emailCc || ""}
              onChangeText={(v) => update({ emailCc: v })}
              placeholder={t("pdf_branding_cc_placeholder" as any)}
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />

            <Text style={[styles.fieldHint, { color: colors.muted }]}>{t("bcc_kommagetrennt")}</Text>
            <TextInput
              value={branding?.emailBcc || ""}
              onChangeText={(v) => update({ emailBcc: v })}
              placeholder={t("pdf_branding_bcc_placeholder" as any)}
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800", flex: 1, marginHorizontal: 12 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10 },
  modeCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, marginBottom: 2 },
  hint: { fontSize: 10, color: "#888", marginTop: 2, marginBottom: 6 },
  fieldHint: { fontSize: 12, marginTop: 12, marginBottom: 4 },
});
