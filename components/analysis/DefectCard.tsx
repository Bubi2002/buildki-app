/**
 * DefectCard – Wiederverwendbare Mangel-Karte
 * 
 * Zeigt einen erkannten Mangel mit Severity, Gewerk, Ort und Maßnahme.
 * Enthält optionalen "Übernehmen"-Button für den Bestätigungs-Flow.
 * Nutzbar für: Foto-Analyse, Matterport, IFC, AI Site Assistant
 */

import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, TextInput } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

export interface DefectData {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "major" | "minor" | "cosmetic";
  trade: string;
  location: string;
  suggestedAction: string;
  confidence: number;
}

interface DefectCardProps {
  defect: DefectData;
  /** Callback wenn "Übernehmen" gedrückt wird */
  onAdopt?: (defect: DefectData) => void;
  /** Callback wenn "Ablehnen" gedrückt wird */
  onDismiss?: (defect: DefectData) => void;
  /** Ob der Mangel bereits übernommen wurde */
  isAdopted?: boolean;
  /** Ob der Mangel abgelehnt wurde */
  isDismissed?: boolean;
  /** Ob Aktions-Buttons angezeigt werden */
  showActions?: boolean;
}

export function DefectCard({
  defect,
  onAdopt,
  onDismiss,
  isAdopted = false,
  isDismissed = false,
  showActions = true,
}: DefectCardProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [checkOpacity] = useState(() => new Animated.Value(0));
  const prevAdopted = useRef(isAdopted);

  // Inline edit mode: lets the user adjust the AI-detected title/description/
  // severity before adopting it into the defect list.
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(defect.title);
  const [editDescription, setEditDescription] = useState(defect.description);
  const [editSeverity, setEditSeverity] = useState<DefectData["severity"]>(defect.severity);
  const effectiveDefect: DefectData = {
    ...defect,
    title: editTitle.trim() || defect.title,
    description: editDescription,
    severity: editSeverity,
  };

  // Erfolgsanimation when adopted state changes to true
  useEffect(() => {
    if (isAdopted && !prevAdopted.current) {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.03, duration: 120, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]),
        Animated.timing(checkOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
    prevAdopted.current = isAdopted;
  }, [isAdopted]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return colors.error;
      case "major": return "#F97316";
      case "minor": return colors.warning;
      case "cosmetic": return colors.muted;
      default: return colors.muted;
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case "critical": return t('DefectCard_severity_critical' as any);
      case "major": return t('DefectCard_severity_major' as any);
      case "minor": return t('DefectCard_severity_minor' as any);
      case "cosmetic": return t('DefectCard_severity_cosmetic' as any);
      default: return severity;
    }
  };

  const severityColor = getSeverityColor(editSeverity);

  return (
    <Animated.View style={[
      styles.card,
      { 
        backgroundColor: colors.surface, 
        borderColor: isAdopted ? colors.success + "50" : isDismissed ? colors.muted + "30" : colors.border,
        opacity: isDismissed ? 0.5 : 1,
        transform: [{ scale: scaleAnim }],
      },
    ]}>
      {/* Header: Severity + Confidence */}
      <View style={styles.header}>
        <View style={[styles.severityBadge, { backgroundColor: severityColor + "20" }]}>
          <Text style={[styles.severityText, { color: severityColor }]}>
            {getSeverityLabel(defect.severity)}
          </Text>
        </View>
        <Text style={[styles.confidence, { color: colors.muted }]}>
          {Math.round(defect.confidence * 100)}% {t('DefectCard_confidence' as any)}
        </Text>
        {isAdopted && (
          <Animated.View style={[styles.adoptedBadge, { backgroundColor: colors.success + "20", opacity: checkOpacity }]}>
            <MaterialIcons name="check-circle" size={14} color={colors.success} />
            <Text style={[styles.adoptedText, { color: colors.success }]}>{t('DefectCard_adopted' as any)}</Text>
          </Animated.View>
        )}
      </View>

      {/* Title & Description */}
      <Text style={[styles.title, { color: colors.foreground }]}>{defect.title}</Text>
      <Text style={[styles.description, { color: colors.muted }]}>{defect.description}</Text>

      {/* Meta: Trade + Location */}
      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <MaterialIcons name="build" size={13} color={colors.muted} />
          <Text style={[styles.metaText, { color: colors.muted }]}>{defect.trade}</Text>
        </View>
        <View style={styles.metaItem}>
          <MaterialIcons name="location-on" size={13} color={colors.muted} />
          <Text style={[styles.metaText, { color: colors.muted }]}>{defect.location}</Text>
        </View>
      </View>

      {/* Suggested Action */}
      <View style={[styles.actionHint, { backgroundColor: colors.primary + "08" }]}>
        <MaterialIcons name="lightbulb" size={14} color={colors.primary} />
        <Text style={[styles.actionHintText, { color: colors.foreground }]}>
          {defect.suggestedAction}
        </Text>
      </View>

      {/* Action Buttons */}
      {showActions && !isAdopted && !isDismissed && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onAdopt?.(defect)}
            style={({ pressed }) => [
              styles.adoptButton,
              { backgroundColor: colors.success, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <MaterialIcons name="add-task" size={16} color="#FFF" />
            <Text style={styles.adoptButtonText}>{t('DefectCard_adopt_button' as any)}</Text>
          </Pressable>
          <Pressable
            onPress={() => onDismiss?.(defect)}
            style={({ pressed }) => [
              styles.dismissButton,
              { borderColor: colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <MaterialIcons name="close" size={16} color={colors.muted} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  confidence: {
    fontSize: 11,
    fontWeight: "500",
    flex: 1,
  },
  adoptedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adoptedText: {
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  meta: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  actionHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  actionHintText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  adoptButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  adoptButtonText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  dismissButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
