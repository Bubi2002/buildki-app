/**
 * ProgressCard – Wiederverwendbare Baufortschritts-Karte
 * 
 * Zeigt Baufortschritt mit Prozent, Phase und aktiven Gewerken.
 * Nutzbar für: Foto-Analyse, Matterport, IFC, AI Site Assistant
 */

import { View, Text, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";

export interface ProgressData {
  overallPercent: number;
  phase: string;
  completedTrades: string[];
  activeTrades: string[];
  pendingTrades: string[];
}

interface ProgressCardProps {
  progress: ProgressData;
  /** Optional: Quelle der Analyse (z.B. "Foto", "Matterport", "IFC") */
  source?: string;
}

export function ProgressCard({ progress, source }: ProgressCardProps) {
  const colors = useColors();

  const getProgressColor = (percent: number) => {
    if (percent >= 80) return colors.success;
    if (percent >= 50) return colors.warning;
    return colors.primary;
  };

  const progressColor = getProgressColor(progress.overallPercent);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <MaterialIcons name="trending-up" size={20} color={colors.success} />
        <Text style={[styles.title, { color: colors.foreground }]}>Baufortschritt</Text>
        {source && (
          <View style={[styles.sourceBadge, { backgroundColor: colors.primary + "15" }]}>
            <Text style={[styles.sourceText, { color: colors.primary }]}>{source}</Text>
          </View>
        )}
        <View style={[styles.percentBadge, { backgroundColor: progressColor + "20" }]}>
          <Text style={[styles.percentText, { color: progressColor }]}>
            {progress.overallPercent}%
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${Math.min(progress.overallPercent, 100)}%`, backgroundColor: progressColor },
          ]}
        />
      </View>

      <Text style={[styles.phaseText, { color: colors.muted }]}>
        Phase: {progress.phase}
      </Text>

      {/* Active Trades */}
      {progress.activeTrades.length > 0 && (
        <View style={styles.tradesSection}>
          <Text style={[styles.tradesLabel, { color: colors.muted }]}>Aktive Gewerke:</Text>
          <View style={styles.tradesChips}>
            {progress.activeTrades.map((trade, i) => (
              <View key={i} style={[styles.chip, { backgroundColor: colors.primary + "15" }]}>
                <Text style={[styles.chipText, { color: colors.primary }]}>{trade}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Completed Trades */}
      {progress.completedTrades.length > 0 && (
        <View style={styles.tradesSection}>
          <Text style={[styles.tradesLabel, { color: colors.muted }]}>Abgeschlossen:</Text>
          <View style={styles.tradesChips}>
            {progress.completedTrades.map((trade, i) => (
              <View key={i} style={[styles.chip, { backgroundColor: colors.success + "15" }]}>
                <Text style={[styles.chipText, { color: colors.success }]}>{trade}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Pending Trades */}
      {progress.pendingTrades.length > 0 && (
        <View style={styles.tradesSection}>
          <Text style={[styles.tradesLabel, { color: colors.muted }]}>Ausstehend:</Text>
          <View style={styles.tradesChips}>
            {progress.pendingTrades.map((trade, i) => (
              <View key={i} style={[styles.chip, { backgroundColor: colors.muted + "20" }]}>
                <Text style={[styles.chipText, { color: colors.muted }]}>{trade}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sourceText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  percentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  percentText: {
    fontSize: 14,
    fontWeight: "700",
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    marginBottom: 10,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  phaseText: {
    fontSize: 13,
    marginBottom: 12,
  },
  tradesSection: {
    marginTop: 8,
  },
  tradesLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  tradesChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
