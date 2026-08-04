/**
 * protoKI – KI-Baustellenassistent Screen
 * 
 * Zeigt intelligente Analyse-Ergebnisse nach Protokoll-Erstellung:
 * - Fehlende Gewerke, Fotos, Prüfungen
 * - Automatische Vorschläge und Empfehlungen
 * - Offene Punkte Zusammenfassung
 * - Risiko-Bewertung und Vollständigkeits-Score
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ───────────────────────────────────────────────────────────────────

type MissingItem = {
  category: "gewerk" | "foto" | "pruefung" | "dokument" | "sicherheit";
  title: string;
  description: string;
  priority: "hoch" | "mittel" | "niedrig";
  suggestedAction: string;
};

type Recommendation = {
  type: "warnung" | "empfehlung" | "erinnerung" | "risiko";
  title: string;
  description: string;
  priority: "hoch" | "mittel" | "niedrig";
  relatedTrade?: string;
};

type OpenPoint = {
  title: string;
  description: string;
  source: string;
  daysOpen: number;
  priority: "hoch" | "mittel" | "niedrig";
};

type AssistantResult = {
  missingItems: MissingItem[];
  recommendations: Recommendation[];
  openPoints: OpenPoint[];
  summary: string;
  riskLevel: "niedrig" | "mittel" | "hoch" | "kritisch";
  nextSteps: string[];
  completenessScore: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  gewerk: "construction",
  foto: "photo-camera",
  pruefung: "fact-check",
  dokument: "description",
  sicherheit: "security",
};

// Values hold translation KEYs (resolved with t() at render). Keys are logic values.
const CATEGORY_LABELS: Record<string, string> = {
  gewerk: "protocol_assistant_cat_gewerk",
  foto: "foto",
  pruefung: "protocol_assistant_cat_pruefung",
  dokument: "protocol_assistant_cat_dokument",
  sicherheit: "protocol_assistant_cat_sicherheit",
};

const TYPE_ICONS: Record<string, string> = {
  warnung: "warning",
  empfehlung: "lightbulb",
  erinnerung: "notifications",
  risiko: "report-problem",
};

const TYPE_COLORS: Record<string, string> = {
  warnung: "#F59E0B",
  empfehlung: "#3B82F6",
  erinnerung: "#8B5CF6",
  risiko: "#EF4444",
};

const PRIORITY_COLORS: Record<string, string> = {
  hoch: "#EF4444",
  mittel: "#F59E0B",
  niedrig: "#22C55E",
};

const RISK_COLORS: Record<string, string> = {
  niedrig: "#22C55E",
  mittel: "#F59E0B",
  hoch: "#EF4444",
  kritisch: "#DC2626",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProtocolAssistantScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ protocolId?: string; protocolText?: string; projectName?: string; roomName?: string }>();
  const colors = useColors();
  const { t } = useTranslation();
  const assistantMutation = trpc.assistant.analyzeProtocol.useMutation();

  const [result, setResult] = useState<AssistantResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runAnalysis();
  }, []);

  async function runAnalysis() {
    try {
      setIsLoading(true);
      setError(null);

      let protocolText = params.protocolText || "";
      const projectName = params.projectName || "Unbekanntes Projekt";
      const roomName = params.roomName;

      // If no text passed, try to load from storage
      if (!protocolText && params.protocolId) {
        const stored = await AsyncStorage.getItem("protocols");
        if (stored) {
          const protocols = JSON.parse(stored);
          const found = protocols.find((p: any) => p.id === params.protocolId);
          if (found) {
            protocolText = found.protocol || found.transcription || "";
          }
        }
      }

      if (!protocolText) {
        setError(t('protocol_assistant_kein_protokolltext' as any));
        setIsLoading(false);
        return;
      }

      // Get existing defects for context
      const defectsStr = await AsyncStorage.getItem("defects");
      const defects = defectsStr ? JSON.parse(defectsStr) : [];
      const openDefects = defects
        .filter((d: any) => d.status === "offen" || d.status === "in_bearbeitung")
        .map((d: any) => `${d.title} (${d.gewerk || "unbekannt"})`)
        .slice(0, 10);

      // Get existing protocols for context
      const protocolsStr = await AsyncStorage.getItem("protocols");
      const allProtocols = protocolsStr ? JSON.parse(protocolsStr) : [];
      const previousSummaries = allProtocols
        .filter((p: any) => p.id !== params.protocolId)
        .slice(0, 3)
        .map((p: any) => (p.protocol || "").slice(0, 200));

      const analysisResult = await assistantMutation.mutateAsync({
        protocolText: protocolText.slice(0, 8000), // Limit to avoid token overflow
        projectName,
        roomName: roomName || undefined,
        existingDefects: openDefects,
        existingPhotos: 0,
        previousProtocols: previousSummaries,
      });

      setResult(analysisResult);
    } catch (err: any) {
      setError(err.message || t('protocol_assistant_analyse_fehlgeschlagen' as any));
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ScreenContainer className="p-6">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.foreground }]}>
            {t('protocol_assistant_ki_analysiert' as any)}
          </Text>
          <Text style={[styles.loadingSubtext, { color: colors.muted }]}>
            {t('protocol_assistant_pruefe_fehlende' as any)}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer className="p-6">
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>{error}</Text>
          <Pressable
            onPress={runAnalysis}
            style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.retryButtonText}>{t('retry')}</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  if (!result) return null;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface }]}>
          <View style={styles.headerTop}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('protocol_assistant_header_title' as any)}</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Risk Level & Score */}
          <View style={styles.scoreRow}>
            <View style={[styles.riskBadge, { backgroundColor: RISK_COLORS[result.riskLevel] + "20" }]}>
              <MaterialIcons
                name={result.riskLevel === "kritisch" || result.riskLevel === "hoch" ? "warning" : "check-circle"}
                size={16}
                color={RISK_COLORS[result.riskLevel]}
              />
              <Text style={[styles.riskText, { color: RISK_COLORS[result.riskLevel] }]}>
                {t('protocol_assistant_risiko' as any)}: {result.riskLevel.charAt(0).toUpperCase() + result.riskLevel.slice(1)}
              </Text>
            </View>
            <View style={styles.scoreContainer}>
              <Text style={[styles.scoreLabel, { color: colors.muted }]}>{t('protocol_assistant_vollstaendigkeit' as any)}</Text>
              <Text style={[styles.scoreValue, { color: result.completenessScore >= 70 ? "#22C55E" : result.completenessScore >= 40 ? "#F59E0B" : "#EF4444" }]}>
                {result.completenessScore}%
              </Text>
            </View>
          </View>
        </View>

        {/* Summary */}
        <View style={[styles.section, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('zusammenfassung')}</Text>
          <Text style={[styles.summaryText, { color: colors.foreground }]}>{result.summary}</Text>
        </View>

        {/* Missing Items */}
        {result.missingItems.length > 0 && (
          <View style={[styles.section, { borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="search" size={20} color="#EF4444" />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('protocol_assistant_fehlende_dokumentation' as any)} ({result.missingItems.length})
              </Text>
            </View>
            {result.missingItems.map((item, index) => (
              <View key={index} style={[styles.itemCard, { backgroundColor: colors.surface }]}>
                <View style={styles.itemHeader}>
                  <View style={[styles.categoryBadge, { backgroundColor: PRIORITY_COLORS[item.priority] + "15" }]}>
                    <MaterialIcons name={CATEGORY_ICONS[item.category] as any} size={14} color={PRIORITY_COLORS[item.priority]} />
                    <Text style={[styles.categoryText, { color: PRIORITY_COLORS[item.priority] }]}>
                      {t(CATEGORY_LABELS[item.category] as any)}
                    </Text>
                  </View>
                  <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[item.priority] }]} />
                </View>
                <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.title}</Text>
                <Text style={[styles.itemDescription, { color: colors.muted }]}>{item.description}</Text>
                <View style={[styles.actionRow, { backgroundColor: colors.primary + "08" }]}>
                  <MaterialIcons name="lightbulb" size={14} color={colors.primary} />
                  <Text style={[styles.actionText, { color: colors.primary }]}>{item.suggestedAction}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recommendations */}
        {result.recommendations.length > 0 && (
          <View style={[styles.section, { borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('protocol_assistant_ki_empfehlungen' as any)} ({result.recommendations.length})
              </Text>
            </View>
            {result.recommendations.map((rec, index) => (
              <View key={index} style={[styles.recCard, { backgroundColor: TYPE_COLORS[rec.type] + "08", borderLeftColor: TYPE_COLORS[rec.type] }]}>
                <View style={styles.recHeader}>
                  <MaterialIcons name={TYPE_ICONS[rec.type] as any} size={18} color={TYPE_COLORS[rec.type]} />
                  <Text style={[styles.recTitle, { color: colors.foreground }]}>{rec.title}</Text>
                </View>
                <Text style={[styles.recDescription, { color: colors.muted }]}>{rec.description}</Text>
                {rec.relatedTrade && (
                  <Text style={[styles.recTrade, { color: colors.muted }]}>{t('protocol_assistant_cat_gewerk' as any)}: {rec.relatedTrade}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Open Points */}
        {result.openPoints.length > 0 && (
          <View style={[styles.section, { borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="pending-actions" size={20} color="#F59E0B" />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('protocol_assistant_offene_punkte' as any)} ({result.openPoints.length})
              </Text>
            </View>
            {result.openPoints.map((point, index) => (
              <View key={index} style={[styles.openPointCard, { backgroundColor: colors.surface }]}>
                <View style={styles.openPointHeader}>
                  <Text style={[styles.openPointTitle, { color: colors.foreground }]}>{point.title}</Text>
                  <View style={[styles.daysBadge, { backgroundColor: point.daysOpen > 7 ? "#EF4444" + "15" : "#F59E0B" + "15" }]}>
                    <Text style={{ fontSize: 11, color: point.daysOpen > 7 ? "#EF4444" : "#F59E0B", fontWeight: "600" }}>
                      {point.daysOpen} {t('protocol_assistant_tage' as any)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.openPointDesc, { color: colors.muted }]}>{point.description}</Text>
                <Text style={[styles.openPointSource, { color: colors.muted }]}>{t('protocol_assistant_quelle' as any)}: {point.source}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Next Steps */}
        {result.nextSteps.length > 0 && (
          <View style={[styles.section, { borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="checklist" size={20} color="#22C55E" />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('protocol_assistant_naechste_schritte' as any)}</Text>
            </View>
            {result.nextSteps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={[styles.stepNumber, { backgroundColor: "#22C55E" + "15" }]}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#22C55E" }}>{index + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.foreground }]}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <Pressable
            onPress={() => {
              Alert.alert(t('protocol_assistant_uebernommen' as any), t('protocol_assistant_empfehlungen_gespeichert' as any));
            }}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="playlist-add-check" size={20} color="#FFF" />
            <Text style={styles.actionButtonText}>{t('protocol_assistant_empfehlungen_uebernehmen' as any)}</Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="arrow-back" size={20} color={colors.foreground} />
            <Text style={[styles.actionButtonText, { color: colors.foreground }]}>{t('protocol_assistant_zurueck_protokoll' as any)}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  loadingText: { fontSize: 18, fontWeight: "600", marginTop: 8 },
  loadingSubtext: { fontSize: 14 },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  errorText: { fontSize: 16, textAlign: "center" },
  retryButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryButtonText: { color: "#FFF", fontWeight: "600", fontSize: 15 },

  header: { padding: 16, paddingTop: 12 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerTitle: { fontSize: 18, fontWeight: "700" },

  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  riskBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  riskText: { fontSize: 13, fontWeight: "600" },
  scoreContainer: { alignItems: "flex-end" },
  scoreLabel: { fontSize: 11 },
  scoreValue: { fontSize: 24, fontWeight: "800" },

  section: { padding: 16, borderBottomWidth: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  summaryText: { fontSize: 14, lineHeight: 22 },

  itemCard: { padding: 12, borderRadius: 8, marginBottom: 10 },
  itemHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  categoryBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  categoryText: { fontSize: 11, fontWeight: "600" },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  itemTitle: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  itemDescription: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 6 },
  actionText: { fontSize: 12, flex: 1 },

  recCard: { padding: 12, borderRadius: 8, marginBottom: 10, borderLeftWidth: 3 },
  recHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  recTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
  recDescription: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  recTrade: { fontSize: 11, fontStyle: "italic" },

  openPointCard: { padding: 12, borderRadius: 8, marginBottom: 10 },
  openPointHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  openPointTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
  daysBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  openPointDesc: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  openPointSource: { fontSize: 11, fontStyle: "italic" },

  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  stepNumber: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 14, flex: 1, lineHeight: 20 },

  actionsSection: { padding: 16, gap: 10 },
  actionButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 8 },
  actionButtonText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
});
