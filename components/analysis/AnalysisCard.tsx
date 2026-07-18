/**
 * AnalysisCard – Wiederverwendbare Analyse-Zusammenfassungs-Karte
 * 
 * Zeigt eine Zusammenfassung eines Analyse-Ergebnisses mit Quelle, Zeitstempel und Beobachtungen.
 * Nutzbar für: Foto-Analyse, Matterport, IFC, AI Site Assistant
 */

import { View, Text, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";

export interface AnalysisData {
  id: string;
  source: string;
  timestamp: string;
  summary: string;
  observations: string[];
  /** Anzahl erkannter Mängel */
  defectCount: number;
  /** Anzahl erkannter Aufgaben */
  taskCount: number;
  /** Baufortschritt in Prozent */
  progressPercent: number;
}

interface AnalysisCardProps {
  analysis: AnalysisData;
  /** Optional: Projekt-Name */
  projectName?: string;
}

export function AnalysisCard({ analysis, projectName }: AnalysisCardProps) {
  const colors = useColors();

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return ts;
    }
  };

  const getSourceIcon = (source: string): string => {
    switch (source) {
      case "photo": return "photo-camera";
      case "matterport": return "view-in-ar";
      case "ifc": return "architecture";
      case "document": return "description";
      default: return "auto-awesome";
    }
  };

  const getSourceLabel = (source: string): string => {
    switch (source) {
      case "photo": return "Foto-Analyse";
      case "matterport": return "Matterport";
      case "ifc": return "IFC-Modell";
      case "document": return "Dokument";
      default: return "KI-Analyse";
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.sourceIcon, { backgroundColor: colors.primary + "15" }]}>
          <MaterialIcons name={getSourceIcon(analysis.source) as any} size={18} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.sourceLabel, { color: colors.foreground }]}>
            {getSourceLabel(analysis.source)}
          </Text>
          <Text style={[styles.timestamp, { color: colors.muted }]}>
            {formatTimestamp(analysis.timestamp)}
          </Text>
        </View>
        {projectName && (
          <View style={[styles.projectBadge, { backgroundColor: colors.primary + "10" }]}>
            <Text style={[styles.projectText, { color: colors.primary }]}>{projectName}</Text>
          </View>
        )}
      </View>

      {/* Summary */}
      <Text style={[styles.summary, { color: colors.foreground }]}>{analysis.summary}</Text>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.primary }]}>{analysis.progressPercent}%</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Fortschritt</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.error }]}>{analysis.defectCount}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Mängel</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.warning }]}>{analysis.taskCount}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Aufgaben</Text>
        </View>
      </View>

      {/* Observations */}
      {analysis.observations.length > 0 && (
        <View style={styles.observations}>
          <Text style={[styles.observationsTitle, { color: colors.muted }]}>Beobachtungen:</Text>
          {analysis.observations.slice(0, 3).map((obs, i) => (
            <View key={i} style={styles.observationItem}>
              <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
              <Text style={[styles.observationText, { color: colors.foreground }]}>{obs}</Text>
            </View>
          ))}
          {analysis.observations.length > 3 && (
            <Text style={[styles.moreText, { color: colors.muted }]}>
              +{analysis.observations.length - 3} weitere
            </Text>
          )}
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
    gap: 12,
    marginBottom: 14,
  },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  sourceLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  timestamp: {
    fontSize: 12,
    marginTop: 1,
  },
  projectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  projectText: {
    fontSize: 11,
    fontWeight: "600",
  },
  summary: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 12,
    marginBottom: 14,
  },
  stat: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  statDivider: {
    width: 1,
    height: 30,
  },
  observations: {
    gap: 4,
  },
  observationsTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  observationItem: {
    flexDirection: "row",
    gap: 8,
  },
  bullet: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  observationText: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  moreText: {
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
});
