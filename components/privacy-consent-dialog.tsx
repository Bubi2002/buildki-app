/**
 * BuildKI – Privacy Consent Dialog
 * 
 * Shows on first launch (or after policy update) to collect DSGVO-compliant consent.
 * Required consents: auditLog (Beweissicherung)
 * Optional consents: analytics, cloudSync, aiProcessing, gpsTracking, photoPersons
 */
import { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Modal } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { saveConsent, type PrivacyConsent } from "@/lib/privacy-consent";

interface Props {
  visible: boolean;
  onAccept: () => void;
}

type ConsentKey = keyof PrivacyConsent["consents"];

interface ConsentItem {
  key: ConsentKey;
  label: string;
  description: string;
  required: boolean;
}

const CONSENT_ITEMS: ConsentItem[] = [
  {
    key: "auditLog",
    label: "Beweissicherungs-Protokoll",
    description: "Manipulationssichere Dokumentation aller Änderungen für die Beweissicherung auf Baustellen. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).",
    required: true,
  },
  {
    key: "aiProcessing",
    label: "KI-Verarbeitung",
    description: "Nutzung von KI zur Berichterstellung und Analyse. Texte werden vor der Verarbeitung anonymisiert (keine Namen, Adressen, Telefonnummern an KI-Dienste).",
    required: false,
  },
  {
    key: "cloudSync",
    label: "Cloud-Synchronisation",
    description: "Synchronisation Ihrer Daten über mehrere Geräte hinweg. Daten werden verschlüsselt auf EU-Servern gespeichert (Frankfurt am Main).",
    required: false,
  },
  {
    key: "gpsTracking",
    label: "GPS-Erfassung",
    description: "Speicherung von GPS-Koordinaten bei Mängeln und Fotos für die Beweissicherung und Zuordnung auf Baustellen.",
    required: false,
  },
  {
    key: "photoPersons",
    label: "Fotos mit Personen",
    description: "Erfassung und Speicherung von Fotos, auf denen Personen erkennbar sind. Relevant für Baustellendokumentation mit Arbeitern.",
    required: false,
  },
  {
    key: "analytics",
    label: "Nutzungsanalyse",
    description: "Anonymisierte Analyse der App-Nutzung zur Verbesserung der Funktionen. Keine personenbezogenen Daten werden übermittelt.",
    required: false,
  },
];

export function PrivacyConsentDialog({ visible, onAccept }: Props) {
  const colors = useColors();
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({
    auditLog: true,
    aiProcessing: true,
    cloudSync: false,
    gpsTracking: true,
    photoPersons: false,
    analytics: false,
  });

  const toggleConsent = (key: ConsentKey, required: boolean) => {
    if (required) return; // Can't toggle required consents
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allRequiredAccepted = CONSENT_ITEMS
    .filter((i) => i.required)
    .every((i) => consents[i.key]);

  const handleAccept = async () => {
    await saveConsent(consents as PrivacyConsent["consents"]);
    onAccept();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <MaterialIcons name="privacy-tip" size={28} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Datenschutz & Einwilligung
          </Text>
        </View>

        {/* Intro */}
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.intro, { color: colors.foreground }]}>
            BuildKI verarbeitet Ihre Projektdaten lokal und optional in der Cloud.
            Bitte lesen Sie die folgenden Punkte und erteilen Sie Ihre Einwilligung.
          </Text>
          <Text style={[styles.subIntro, { color: colors.muted }]}>
            * Pflichtfelder sind für die Nutzung der App erforderlich.
            Optionale Einwilligungen können jederzeit in den Einstellungen widerrufen werden.
          </Text>

          {/* Consent Items */}
          {CONSENT_ITEMS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => toggleConsent(item.key, item.required)}
              style={({ pressed }) => [
                styles.consentItem,
                {
                  backgroundColor: consents[item.key] ? colors.primary + "08" : colors.surface,
                  borderColor: consents[item.key] ? colors.primary : colors.border,
                  opacity: pressed && !item.required ? 0.8 : 1,
                },
              ]}
            >
              <View style={styles.consentHeader}>
                <View style={[
                  styles.checkbox,
                  {
                    backgroundColor: consents[item.key] ? colors.primary : "transparent",
                    borderColor: consents[item.key] ? colors.primary : colors.border,
                  },
                ]}>
                  {consents[item.key] && (
                    <MaterialIcons name="check" size={14} color="#FFF" />
                  )}
                </View>
                <View style={styles.consentLabelRow}>
                  <Text style={[styles.consentLabel, { color: colors.foreground }]}>
                    {item.label}
                  </Text>
                  {item.required && (
                    <Text style={[styles.requiredBadge, { color: colors.error }]}>
                      Pflicht
                    </Text>
                  )}
                </View>
              </View>
              <Text style={[styles.consentDesc, { color: colors.muted }]}>
                {item.description}
              </Text>
            </Pressable>
          ))}

          {/* Legal References */}
          <View style={[styles.legalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.legalTitle, { color: colors.foreground }]}>
              Ihre Rechte (DSGVO Art. 15-21)
            </Text>
            <Text style={[styles.legalText, { color: colors.muted }]}>
              • Auskunft über gespeicherte Daten{"\n"}
              • Berichtigung unrichtiger Daten{"\n"}
              • Löschung Ihrer Daten ("Recht auf Vergessenwerden"){"\n"}
              • Einschränkung der Verarbeitung{"\n"}
              • Datenübertragbarkeit (Export){"\n"}
              • Widerspruch gegen die Verarbeitung{"\n"}
              • Widerruf erteilter Einwilligungen{"\n\n"}
              Verantwortlicher: Iserloh Bau GmbH{"\n"}
              Kontakt: info@iserloh.net{"\n"}
              Datenschutzbeauftragter: datenschutz@iserloh.net
            </Text>
          </View>
        </ScrollView>

        {/* Accept Button */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleAccept}
            disabled={!allRequiredAccepted}
            style={({ pressed }) => [
              styles.acceptBtn,
              {
                backgroundColor: allRequiredAccepted ? colors.primary : colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.acceptBtnText}>
              Einwilligung erteilen & App nutzen
            </Text>
          </Pressable>
          <Text style={[styles.footerNote, { color: colors.muted }]}>
            Sie können Ihre Einwilligungen jederzeit unter Einstellungen → Rechtliches widerrufen.
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
  headerTitle: { fontSize: 20, fontWeight: "700" },
  scrollArea: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  intro: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  subIntro: { fontSize: 13, lineHeight: 18, marginBottom: 20 },
  consentItem: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 0,
    marginBottom: 12,
  },
  consentHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  consentLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  consentLabel: { fontSize: 15, fontWeight: "600" },
  requiredBadge: { fontSize: 11, fontWeight: "700" },
  consentDesc: { fontSize: 13, lineHeight: 18, marginLeft: 34 },
  legalBox: { padding: 16, borderWidth: 1, borderRadius: 0, marginTop: 16 },
  legalTitle: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  legalText: { fontSize: 12, lineHeight: 18 },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  acceptBtn: {
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 0,
  },
  acceptBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  footerNote: { fontSize: 11, textAlign: "center", marginTop: 8 },
});
