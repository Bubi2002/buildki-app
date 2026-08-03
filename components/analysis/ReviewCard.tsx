/**
 * ReviewCard – Wiederverwendbare Bestätigungs-Karte für KI-Vorschläge
 * 
 * Zeigt eine Batch-Aktion zum Übernehmen/Ablehnen aller KI-Vorschläge.
 * Nutzbar für: Foto-Analyse, Matterport, IFC, AI Site Assistant
 */

import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";

interface ReviewCardProps {
  /** Typ der Elemente (z.B. "Mängel", "Aufgaben") */
  itemType: string;
  /** Gesamtanzahl der Elemente */
  totalCount: number;
  /** Anzahl bereits übernommener Elemente */
  adoptedCount: number;
  /** Anzahl abgelehnter Elemente */
  dismissedCount: number;
  /** Callback: Alle übernehmen */
  onAdoptAll?: () => void;
  /** Callback: Alle ablehnen */
  onDismissAll?: () => void;
}

export function ReviewCard({
  itemType,
  totalCount,
  adoptedCount,
  dismissedCount,
  onAdoptAll,
  onDismissAll,
}: ReviewCardProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const pendingCount = totalCount - adoptedCount - dismissedCount;
  const allProcessed = pendingCount === 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <MaterialIcons name="rate-review" size={20} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>
          {itemType} {t('ReviewCard_pruefen')}
        </Text>
        <Text style={[styles.count, { color: colors.muted }]}>
          {totalCount} {t('ReviewCard_erkannt')}
        </Text>
      </View>

      {/* Progress */}
      <View style={styles.progressRow}>
        {adoptedCount > 0 && (
          <View style={styles.progressItem}>
            <MaterialIcons name="check-circle" size={14} color={colors.success} />
            <Text style={[styles.progressText, { color: colors.success }]}>
              {adoptedCount} {t('ReviewCard_uebernommen')}
            </Text>
          </View>
        )}
        {dismissedCount > 0 && (
          <View style={styles.progressItem}>
            <MaterialIcons name="cancel" size={14} color={colors.muted} />
            <Text style={[styles.progressText, { color: colors.muted }]}>
              {dismissedCount} {t('ReviewCard_abgelehnt')}
            </Text>
          </View>
        )}
        {pendingCount > 0 && (
          <View style={styles.progressItem}>
            <MaterialIcons name="pending" size={14} color={colors.warning} />
            <Text style={[styles.progressText, { color: colors.warning }]}>
              {pendingCount} {t('ReviewCard_offen')}
            </Text>
          </View>
        )}
      </View>

      {/* Batch Actions */}
      {!allProcessed && (
        <View style={styles.actions}>
          <Pressable
            onPress={onAdoptAll}
            style={({ pressed }) => [
              styles.adoptAllButton,
              { backgroundColor: colors.success, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <MaterialIcons name="done-all" size={16} color="#FFF" />
            <Text style={styles.actionText}>{t('ReviewCard_alle_uebernehmen')}</Text>
          </Pressable>
          <Pressable
            onPress={onDismissAll}
            style={({ pressed }) => [
              styles.dismissAllButton,
              { borderColor: colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <Text style={[styles.dismissText, { color: colors.muted }]}>{t('ReviewCard_alle_ablehnen')}</Text>
          </Pressable>
        </View>
      )}

      {/* All processed message */}
      {allProcessed && (
        <View style={[styles.doneMessage, { backgroundColor: colors.success + "10" }]}>
          <MaterialIcons name="check-circle" size={16} color={colors.success} />
          <Text style={[styles.doneText, { color: colors.success }]}>
            {t('ReviewCard_alle')} {itemType} {t('ReviewCard_wurden_geprueft')}
          </Text>
        </View>
      )}
    </View>
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
    gap: 10,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  count: {
    fontSize: 13,
    fontWeight: "600",
  },
  progressRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
  },
  progressItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  adoptAllButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  dismissAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  dismissText: {
    fontSize: 13,
    fontWeight: "600",
  },
  doneMessage: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  doneText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
