import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type Protocol = {
  id: string;
  title: string;
  transcription: string;
  protocol: string;
  duration: number;
  createdAt: string;
  status: "processing" | "ready" | "sent";
};

export default function ProtocolsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [protocols, setProtocols] = useState<Protocol[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadProtocols();
    }, [])
  );

  const loadProtocols = async () => {
    try {
      const stored = await AsyncStorage.getItem("protocols");
      if (stored) {
        setProtocols(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Error loading protocols:", error);
    }
  };

  const deleteProtocol = (id: string) => {
    Alert.alert(
      "Protokoll löschen",
      "Möchtest du dieses Protokoll wirklich löschen?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            const updated = protocols.filter((p) => p.id !== id);
            setProtocols(updated);
            await AsyncStorage.setItem("protocols", JSON.stringify(updated));
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusColor = (status: Protocol["status"]) => {
    switch (status) {
      case "ready":
        return colors.success;
      case "processing":
        return colors.warning;
      case "sent":
        return colors.primary;
      default:
        return colors.muted;
    }
  };

  const getStatusLabel = (status: Protocol["status"]) => {
    switch (status) {
      case "ready":
        return "Fertig";
      case "processing":
        return "Verarbeitung";
      case "sent":
        return "Gesendet";
      default:
        return status;
    }
  };

  const renderItem = ({ item }: { item: Protocol }) => (
    <Pressable
      onPress={() => router.push(`/protocol-detail?id=${item.id}` as any)}
      onLongPress={() => deleteProtocol(item.id)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <MaterialIcons name="description" size={20} color={colors.primary} />
          <Text
            style={[styles.cardTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "20" }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      <Text
        style={[styles.cardPreview, { color: colors.muted }]}
        numberOfLines={2}
      >
        {item.protocol.substring(0, 120)}
      </Text>

      <View style={styles.cardFooter}>
        <View style={styles.cardMeta}>
          <MaterialIcons name="event" size={14} color={colors.muted} />
          <Text style={[styles.cardMetaText, { color: colors.muted }]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <MaterialIcons name="timer" size={14} color={colors.muted} />
          <Text style={[styles.cardMetaText, { color: colors.muted }]}>
            {formatDuration(item.duration)}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons name="videocam-off" size={64} color={colors.border} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        Noch keine Protokolle
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
        Nimm ein Video auf, um dein erstes Protokoll zu erstellen.
      </Text>
    </View>
  );

  return (
    <ScreenContainer className="flex-1">
      <View style={styles.headerContainer}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>
          Protokolle
        </Text>
        <Text style={[styles.screenSubtitle, { color: colors.muted }]}>
          {protocols.length > 0
            ? `${protocols.length} Protokoll${protocols.length !== 1 ? "e" : ""}`
            : ""}
        </Text>
      </View>

      <FlatList
        data={protocols}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  screenSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 0.5,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardPreview: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: "row",
    gap: 16,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardMetaText: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
