import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useNetworkStatus } from "@/hooks/use-network-status";

export function NetworkBanner() {
  const colors = useColors();
  const { isConnected, pendingSyncCount, isSyncing, lastSyncedAt, triggerSync } = useNetworkStatus();
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      void Promise.resolve().then(() => {
        setShowBanner(true);
        setWasOffline(true);
      });
    } else if (wasOffline && isConnected) {
      void Promise.resolve().then(() => {
        setShowBanner(true);
      });
      triggerSync();
      const timer = setTimeout(() => {
        if (pendingSyncCount === 0) setShowBanner(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  useEffect(() => {
    if (isConnected && pendingSyncCount === 0 && !isSyncing && wasOffline) {
      const timer = setTimeout(() => {
        setShowBanner(false);
        setWasOffline(false);
        setShowDetails(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [pendingSyncCount, isSyncing]);

  if (!showBanner) return null;

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Noch nie";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Gerade eben";
    if (diffMin < 60) return `Vor ${diffMin} Min.`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Vor ${diffH} Std.`;
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <View style={{ marginHorizontal: 16, marginTop: 4 }}>
      <Pressable
        onPress={() => setShowDetails(!showDetails)}
        style={({ pressed }) => [
          styles.banner,
          {
            backgroundColor: !isConnected
              ? colors.error + "15"
              : isSyncing
              ? colors.warning + "15"
              : colors.success + "15",
            borderColor: !isConnected
              ? colors.error + "40"
              : isSyncing
              ? colors.warning + "40"
              : colors.success + "40",
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <MaterialIcons
          name={!isConnected ? "cloud-off" : isSyncing ? "sync" : "cloud-done"}
          size={16}
          color={!isConnected ? colors.error : isSyncing ? colors.warning : colors.success}
        />
        <Text
          style={[
            styles.bannerText,
            {
              color: !isConnected ? colors.error : isSyncing ? colors.warning : colors.success,
            },
          ]}
        >
          {!isConnected
            ? "Offline \u2013 \u00c4nderungen werden lokal gespeichert"
            : isSyncing
            ? `Synchronisiere ${pendingSyncCount} \u00c4nderung${pendingSyncCount !== 1 ? "en" : ""}...`
            : "Verbunden \u2013 Alles synchronisiert"}
        </Text>
        {pendingSyncCount > 0 && (
          <View style={{ backgroundColor: !isConnected ? colors.error + "30" : colors.warning + "30", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: !isConnected ? colors.error : colors.warning }}>{pendingSyncCount}</Text>
          </View>
        )}
        {isConnected && pendingSyncCount > 0 && !isSyncing && (
          <Pressable onPress={triggerSync} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginLeft: 4 }]}>
            <MaterialIcons name="refresh" size={16} color={colors.primary} />
          </Pressable>
        )}
      </Pressable>

      {/* Details Panel */}
      {showDetails && (
        <View style={[styles.detailsPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Status</Text>
            <Text style={[styles.detailValue, { color: isConnected ? colors.success : colors.error }]}>
              {isConnected ? "Verbunden" : "Offline"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Warteschlange</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>
              {pendingSyncCount} {pendingSyncCount === 1 ? "\u00c4nderung" : "\u00c4nderungen"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Letzte Sync</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>
              {formatLastSync(lastSyncedAt)}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 8, fontStyle: "italic" }}>
            Alle Daten werden automatisch synchronisiert sobald eine Verbindung besteht.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
  },
  detailsPanel: {
    marginTop: 4,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 12,
    fontWeight: "600",
  },
});
