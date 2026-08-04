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
import { useTranslation } from "@/lib/language-provider";

interface TutorialSection {
  id: string;
  icon: string;
  title: string;
  steps: string[];
}

// Titles and steps are stored as translation keys, resolved with t() at render time.
const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    id: "start",
    icon: "play-circle-outline",
    title: "tutorial_start_title",
    steps: [
      "tutorial_start_s1",
      "tutorial_start_s2",
      "tutorial_start_s3",
    ],
  },
  {
    id: "aufnahme",
    icon: "mic",
    title: "tutorial_aufnahme_title",
    steps: [
      "tutorial_aufnahme_s1",
      "tutorial_aufnahme_s2",
      "tutorial_aufnahme_s3",
      "tutorial_aufnahme_s4",
      "tutorial_aufnahme_s5",
      "tutorial_aufnahme_s6",
    ],
  },
  {
    id: "video",
    icon: "videocam",
    title: "tutorial_video_title",
    steps: [
      "tutorial_video_s1",
      "tutorial_video_s2",
      "tutorial_video_s3",
      "tutorial_video_s4",
      "tutorial_video_s5",
      "tutorial_video_s6",
    ],
  },
  {
    id: "foto",
    icon: "camera-alt",
    title: "tutorial_foto_title",
    steps: [
      "tutorial_foto_s1",
      "tutorial_foto_s2",
      "tutorial_foto_s3",
      "tutorial_foto_s4",
      "tutorial_foto_s5",
    ],
  },
  {
    id: "maengel",
    icon: "warning",
    title: "tutorial_maengel_title",
    steps: [
      "tutorial_maengel_s1",
      "tutorial_maengel_s2",
      "tutorial_maengel_s3",
      "tutorial_maengel_s4",
      "tutorial_maengel_s5",
      "tutorial_maengel_s6",
    ],
  },
  {
    id: "matterport",
    icon: "3d-rotation",
    title: "tutorial_matterport_title",
    steps: [
      "tutorial_matterport_s1",
      "tutorial_matterport_s2",
      "tutorial_matterport_s3",
      "tutorial_matterport_s4",
      "tutorial_matterport_s5",
    ],
  },
  {
    id: "pdf",
    icon: "picture-as-pdf",
    title: "tutorial_pdf_title",
    steps: [
      "tutorial_pdf_s1",
      "tutorial_pdf_s2",
      "tutorial_pdf_s3",
      "tutorial_pdf_s4",
    ],
  },
  {
    id: "ki-assistent",
    icon: "psychology",
    title: "tutorial_ki_title",
    steps: [
      "tutorial_ki_s1",
      "tutorial_ki_s2",
      "tutorial_ki_s3",
      "tutorial_ki_s4",
    ],
  },
  {
    id: "offline",
    icon: "cloud-off",
    title: "tutorial_offline_title",
    steps: [
      "tutorial_offline_s1",
      "tutorial_offline_s2",
      "tutorial_offline_s3",
      "tutorial_offline_s4",
    ],
  },
  {
    id: "abo",
    icon: "credit-card",
    title: "tutorial_abo_title",
    steps: [
      "tutorial_abo_s1",
      "tutorial_abo_s2",
      "tutorial_abo_s3",
      "tutorial_abo_s4",
    ],
  },
];

export default function TutorialScreen() {
  const colors = useColors();
  const { t } = useTranslation();
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('tutorial_header_title' as any)}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Intro */}
        <View style={[styles.introCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
          <MaterialIcons name="menu-book" size={28} color={colors.primary} />
          <Text style={[styles.introTitle, { color: colors.foreground }]}>{t('tutorial_welcome' as any)}</Text>
          <Text style={[styles.introText, { color: colors.muted }]}>
            {t('tutorial_intro_text' as any)}
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
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t(section.title as any)}</Text>
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
                    <Text style={[styles.stepText, { color: colors.foreground }]}>{t(step as any)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.muted }]}>
            {t('tutorial_footer_text' as any)}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/support-chat")}
            style={[styles.supportBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialIcons name="support-agent" size={18} color="#fff" />
            <Text style={styles.supportBtnText}>{t('tutorial_support_open' as any)}</Text>
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
