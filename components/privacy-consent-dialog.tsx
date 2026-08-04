import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import {
  CURRENT_CONSENT_VERSION,
  DEFAULT_PRIVACY_CHOICES,
  saveConsent,
  type OptionalPurpose,
  type PrivacyChoices,
} from "@/lib/privacy-consent";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_DRAFT_MARKER,
  LEGAL_DRAFT_NOTICE,
} from "@/lib/legal-draft";

interface Props {
  visible: boolean;
  onAccept: (choices: PrivacyChoices) => void;
}

interface PurposeItem {
  key: OptionalPurpose;
  label: string;
  description: string;
  transmittedData: string;
  appendMarker?: boolean;
}

const PURPOSE_ITEMS: PurposeItem[] = [
  {
    key: "aiProcessing",
    label: "privacy_consent_dialog_ai_label",
    description: "privacy_consent_dialog_ai_description",
    transmittedData: "privacy_consent_dialog_ai_transmitted",
    appendMarker: true,
  },
  {
    key: "cloudSync",
    label: "privacy_consent_dialog_cloud_label",
    description: "privacy_consent_dialog_cloud_description",
    transmittedData: "privacy_consent_dialog_cloud_transmitted",
    appendMarker: true,
  },
  {
    key: "gpsTracking",
    label: "privacy_consent_dialog_gps_label",
    description: "privacy_consent_dialog_gps_description",
    transmittedData: "privacy_consent_dialog_gps_transmitted",
  },
];

export function PrivacyConsentDialog({ visible, onAccept }: Props) {
  const colors = useColors();
  const { t } = useTranslation();
  const [choices, setChoices] = useState<PrivacyChoices>({
    ...DEFAULT_PRIVACY_CHOICES,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      void Promise.resolve().then(() => {
        setChoices({ ...DEFAULT_PRIVACY_CHOICES });
        setSaving(false);
      });
    }
  }, [visible]);

  const togglePurpose = (purpose: OptionalPurpose) => {
    setChoices((previous) => ({
      ...previous,
      [purpose]: !previous[purpose],
    }));
  };

  const handleContinue = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await saveConsent(choices, "first-run");
      onAccept(saved.choices);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <MaterialIcons name="privacy-tip" size={28} color={colors.primary} />
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('privacy_consent_dialog_title' as any)}</Text>
            <Text style={[styles.version, { color: colors.muted }]}>{t('privacy_consent_dialog_version' as any)} {CURRENT_CONSENT_VERSION}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.warningBox, { borderColor: colors.error }]}>
            <Text style={[styles.warningTitle, { color: colors.error }]}>{t('privacy_consent_dialog_draft_warning' as any)}</Text>
            <Text style={[styles.warningText, { color: colors.foreground }]}>{LEGAL_DRAFT_NOTICE}</Text>
          </View>

          <Text style={[styles.intro, { color: colors.foreground }]}>
            {t('privacy_consent_dialog_intro' as any)}
          </Text>
          <Text style={[styles.subIntro, { color: colors.muted }]}>
            {t('privacy_consent_dialog_sub_intro' as any)}
          </Text>

          {PURPOSE_ITEMS.map((item) => {
            const enabled = choices[item.key];
            return (
              <Pressable
                key={item.key}
                accessibilityRole="switch"
                accessibilityState={{ checked: enabled }}
                accessibilityLabel={t(item.label as any)}
                onPress={() => togglePurpose(item.key)}
                style={({ pressed }) => [
                  styles.purposeItem,
                  {
                    backgroundColor: enabled ? colors.primary + "10" : colors.surface,
                    borderColor: enabled ? colors.primary : colors.border,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
              >
                <View style={styles.purposeHeader}>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: enabled ? colors.primary : "transparent",
                        borderColor: enabled ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    {enabled && <MaterialIcons name="check" size={15} color="#FFF" />}
                  </View>
                  <Text style={[styles.purposeLabel, { color: colors.foreground }]}>{t(item.label as any)}</Text>
                  <Text style={[styles.optionalBadge, { color: colors.muted }]}>{t('privacy_consent_dialog_optional' as any)}</Text>
                </View>
                <Text style={[styles.description, { color: colors.foreground }]}>{t(item.description as any)}</Text>
                <Text style={[styles.dataDetail, { color: colors.muted }]}>{t(item.transmittedData as any)}{item.appendMarker ? LEGAL_DRAFT_MARKER : ""}</Text>
              </Pressable>
            );
          })}

          <View style={[styles.rightsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.rightsTitle, { color: colors.foreground }]}>{t('privacy_consent_dialog_your_decision' as any)}</Text>
            <Text style={[styles.rightsText, { color: colors.muted }]}>
              {t('privacy_consent_dialog_rights_text' as any)}{LEGAL_CONTACT_EMAIL}
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleContinue}
            disabled={saving}
            style={({ pressed }) => [
              styles.continueButton,
              {
                backgroundColor: saving ? colors.border : colors.primary,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <Text style={styles.continueButtonText}>
              {saving ? t('privacy_consent_dialog_saving' as any) : "Auswahl speichern und fortfahren"}
            </Text>
          </Pressable>
          <Text style={[styles.footerNote, { color: colors.muted }]}>
            Fortfahren ist auch mit allen optionalen Schaltern auf „Aus“ möglich.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  version: { fontSize: 11, marginTop: 2 },
  scrollArea: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  warningBox: { borderWidth: 2, padding: 14, marginBottom: 18 },
  warningTitle: { fontSize: 13, fontWeight: "800", marginBottom: 6 },
  warningText: { fontSize: 12, lineHeight: 18 },
  intro: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  subIntro: { fontSize: 13, lineHeight: 18, marginBottom: 20 },
  purposeItem: { padding: 16, borderWidth: 1, marginBottom: 12 },
  purposeHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  purposeLabel: { fontSize: 15, fontWeight: "700", flex: 1 },
  optionalBadge: { fontSize: 11, fontWeight: "700" },
  description: { fontSize: 13, lineHeight: 19 },
  dataDetail: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  rightsBox: { padding: 16, borderWidth: 1, marginTop: 8 },
  rightsTitle: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  rightsText: { fontSize: 12, lineHeight: 18 },
  footer: { padding: 20, borderTopWidth: 1 },
  continueButton: { paddingVertical: 16, alignItems: "center" },
  continueButtonText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  footerNote: { fontSize: 11, textAlign: "center", marginTop: 8 },
});
