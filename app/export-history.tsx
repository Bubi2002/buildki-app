import { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, Pressable, Alert, StyleSheet } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getExportHistory, clearExportHistory, type PdfExportEntry } from "@/lib/pdf-export-history";
import { useFocusEffect } from "expo-router";

export default function ExportHistoryScreen() {
  const colors = useColors();
  const [history, setHistory] = useState<PdfExportEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    const h = await getExportHistory();
    setHistory(h);
  };

  const handleClear = () => {
    Alert.alert(
      "Verlauf löschen",
      "Möchten Sie den gesamten Export-Verlauf löschen?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            await clearExportHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  const getMethodIcon = (method: string): string => {
    switch (method) {
      case "email": return "email";
      case "share": return "share";
      case "whatsapp": return "chat";
      case "auto": return "send";
      default: return "description";
    }
  };

  const getMethodLabel = (method: string): string => {
    switch (method) {
      case "email": return "E-Mail";
      case "share": return "Geteilt";
      case "whatsapp": return "WhatsApp";
      case "auto": return "Auto-Versand";
      default: return "Export";
    }
  };

  const formatDate = (timestamp: number): string => {
    const d = new Date(timestamp);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderItem = ({ item }: { item: PdfExportEntry }) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.methodBadge, { backgroundColor: colors.primary + "15" }]}>
          <MaterialIcons name={getMethodIcon(item.method) as any} size={16} color={colors.primary} />
          <Text style={[styles.methodText, { color: colors.primary }]}>{getMethodLabel(item.method)}</Text>
        </View>
        <Text style={[styles.dateText, { color: colors.muted }]}>{formatDate(item.timestamp)}</Text>
      </View>

      <Text style={[styles.titleText, { color: colors.foreground }]} numberOfLines={1}>
        {item.protocolTitle || item.templateName}
      </Text>

      {item.projectName ? (
        <Text style={[styles.projectText, { color: colors.muted }]} numberOfLines={1}>
          Projekt: {item.projectName}
        </Text>
      ) : null}

      <Text style={[styles.filenameText, { color: colors.muted }]} numberOfLines={1}>
        {item.filename}
      </Text>

      {item.recipients.length > 0 && (
        <View style={styles.recipientRow}>
          <MaterialIcons name="person" size={12} color={colors.muted} />
          <Text style={[styles.recipientText, { color: colors.muted }]} numberOfLines={1}>
            {item.recipients.join(", ")}
          </Text>
        </View>
      )}

      {item.ccRecipients.length > 0 && (
        <View style={styles.recipientRow}>
          <Text style={[styles.ccLabel, { color: colors.muted }]}>CC:</Text>
          <Text style={[styles.recipientText, { color: colors.muted }]} numberOfLines={1}>
            {item.ccRecipients.join(", ")}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 8 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Export-Verlauf</Text>
        {history.length > 0 ? (
          <Pressable onPress={handleClear} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 8 }]}>
            <MaterialIcons name="delete-outline" size={22} color={colors.error} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="history" size={64} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Kein Export-Verlauf</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Hier werden alle PDF-Exporte protokolliert.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  methodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  methodText: {
    fontSize: 11,
    fontWeight: "600",
  },
  dateText: {
    fontSize: 11,
  },
  titleText: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  projectText: {
    fontSize: 12,
    marginBottom: 2,
  },
  filenameText: {
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 4,
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  ccLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  recipientText: {
    fontSize: 11,
    flex: 1,
  },
});
