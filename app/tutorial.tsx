/**
 * Tutorial / Bedienungsanleitung
 * Vollständige Anleitung aller BuildKI-Funktionen mit Schritt-für-Schritt-Erklärungen.
 */
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

interface TutorialSection {
  id: string;
  icon: string;
  title: string;
  steps: string[];
}

const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    id: "start",
    icon: "play-circle-outline",
    title: "Erste Schritte",
    steps: [
      "Projekt anlegen: Tippe auf 'Neues Projekt' und gib Name, Adresse und Beschreibung ein.",
      "Projekt auswählen: Wähle dein aktives Projekt im Dropdown oben auf dem Tools-Tab.",
      "Alle Aufnahmen und Protokolle werden dem aktiven Projekt zugeordnet.",
    ],
  },
  {
    id: "aufnahme",
    icon: "mic",
    title: "Audio-Aufnahme",
    steps: [
      "Wechsle zum Aufnahme-Tab (2. Tab).",
      "Drücke den roten Aufnahme-Button.",
      "Sprich frei – beschreibe Baufortschritt, Mängel, Anwesende.",
      "Setze Gewerk-Marker (z.B. 'Rohbau', 'Elektro') für bessere Strukturierung.",
      "Mache Fotos während der Aufnahme – sie werden dem Protokoll zugeordnet.",
      "Drücke Stopp – die KI erstellt automatisch ein professionelles Protokoll.",
    ],
  },
  {
    id: "video",
    icon: "videocam",
    title: "Video-Import",
    steps: [
      "Öffne Tools → Video-Import.",
      "Wähle eine Quelle: Galerie, Dateien/Downloads oder Kamera.",
      "Du kannst auch mehrere Videos gleichzeitig auswählen (Batch-Import).",
      "Videos aus WhatsApp: Öffne das Video in WhatsApp → Teilen → BuildKI.",
      "Nach dem Upload wird die Audiospur automatisch transkribiert.",
      "Wähle den Dokumenttyp: Besprechungsprotokoll, Zusammenfassung oder Bautagebuch.",
    ],
  },
  {
    id: "foto",
    icon: "camera-alt",
    title: "Foto-Analyse",
    steps: [
      "Öffne Tools → Foto-Analyse.",
      "Fotografiere einen Bereich oder wähle ein Foto aus der Galerie.",
      "Die KI analysiert das Bild und erkennt automatisch Mängel.",
      "Übernimm erkannte Mängel oder füge eigene hinzu.",
      "Exportiere das Ergebnis als PDF mit allen Mängeln.",
    ],
  },
  {
    id: "maengel",
    icon: "warning",
    title: "Mängelmanagement",
    steps: [
      "Öffne Tools → Mängelliste.",
      "Erstelle einen neuen Mangel mit Foto, Beschreibung und Schweregrad.",
      "Weise einen Verantwortlichen zu und setze eine Frist.",
      "Verfolge den Status: Offen → In Bearbeitung → Nachprüfung → Erledigt.",
      "Bei überfälligen Mängeln erhältst du eine Push-Benachrichtigung.",
      "Exportiere die Mängelliste als PDF für Subunternehmer.",
    ],
  },
  {
    id: "matterport",
    icon: "3d-rotation",
    title: "Matterport 3D-Modell",
    steps: [
      "Öffne Tools → Matterport.",
      "Dein 3D-Modell wird automatisch geladen.",
      "Navigiere durch die Räume und setze Pins an Mängelstellen.",
      "Pins werden automatisch mit dem Mängelmanagement verknüpft.",
      "Im PDF-Export erscheint ein Link zum 3D-Modell mit QR-Code.",
    ],
  },
  {
    id: "pdf",
    icon: "picture-as-pdf",
    title: "PDF-Export",
    steps: [
      "Öffne ein Protokoll und tippe auf 'Exportieren'.",
      "Wähle den Berichtstyp: Protokoll, Bautagesbericht, Abnahme oder Mängelliste.",
      "Das PDF enthält: Firmenlogo, Fotos, QR-Code und Matterport-Link.",
      "Teile das PDF per E-Mail, WhatsApp oder speichere es lokal.",
    ],
  },
  {
    id: "ki-assistent",
    icon: "psychology",
    title: "KI-Baustellenassistent",
    steps: [
      "Nach jedem Protokoll analysiert die KI automatisch den Inhalt.",
      "Du erhältst Hinweise auf: fehlende Gewerke, fehlende Fotos, offene Prüfungen.",
      "Öffne den Assistenten über Tools → KI-Assistent.",
      "Die Empfehlungen helfen, nichts zu vergessen und die Dokumentation vollständig zu halten.",
    ],
  },
  {
    id: "offline",
    icon: "cloud-off",
    title: "Offline-Modus",
    steps: [
      "BuildKI funktioniert auch ohne Internet.",
      "Aufnahmen und Fotos werden lokal gespeichert.",
      "Sobald du wieder online bist, wird alles automatisch synchronisiert.",
      "Der Sync-Status wird in den Einstellungen angezeigt.",
    ],
  },
  {
    id: "abo",
    icon: "credit-card",
    title: "Abo & Preise",
    steps: [
      "14 Tage kostenlose Testphase – alle Funktionen uneingeschränkt.",
      "Monatsabo: 10,00 € + MwSt. pro Monat (jederzeit kündbar).",
      "Jahresabo: 100,00 € + MwSt. pro Jahr (2 Monate gratis).",
      "Verwalte dein Abo unter Einstellungen → Abonnement.",
    ],
  },
];

export default function TutorialScreen() {
  const colors = useColors();
  const router = useRouter();
  const [expandedSection, setExpandedSection] = useState<string | null>("start");

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Bedienungsanleitung</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Intro */}
        <View style={[styles.introCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
          <MaterialIcons name="menu-book" size={28} color={colors.primary} />
          <Text style={[styles.introTitle, { color: colors.foreground }]}>Willkommen bei BuildKI</Text>
          <Text style={[styles.introText, { color: colors.muted }]}>
            Die intelligente Baustellendokumentation. Tippe auf einen Abschnitt, um die Schritt-für-Schritt-Anleitung zu sehen.
          </Text>
        </View>

        {/* Sections */}
        {TUTORIAL_SECTIONS.map((section) => (
          <View key={section.id} style={[styles.section, { borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => toggleSection(section.id)}
              style={styles.sectionHeader}
            >
              <MaterialIcons name={section.icon as any} size={22} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
              <MaterialIcons
                name={expandedSection === section.id ? "expand-less" : "expand-more"}
                size={24}
                color={colors.muted}
              />
            </TouchableOpacity>

            {expandedSection === section.id && (
              <View style={styles.stepsContainer}>
                {section.steps.map((step, index) => (
                  <View key={index} style={styles.stepRow}>
                    <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.foreground }]}>{step}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.muted }]}>
            Weitere Fragen? Nutze den KI-Support-Chat oder schreibe an info@iserloh.net
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/support-chat")}
            style={[styles.supportBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialIcons name="support-agent" size={18} color="#fff" />
            <Text style={styles.supportBtnText}>KI-Support öffnen</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 40 },
  introCard: {
    alignItems: "center",
    padding: 20,
    borderWidth: 1,
    marginBottom: 20,
    gap: 8,
  },
  introTitle: { fontSize: 18, fontWeight: "700" },
  introText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  section: {
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "600" },
  stepsContainer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepNumber: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNumberText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
  footer: {
    alignItems: "center",
    marginTop: 24,
    gap: 12,
  },
  footerText: { fontSize: 13, textAlign: "center" },
  supportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  supportBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
