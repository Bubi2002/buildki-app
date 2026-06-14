import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useNetworkStatus } from "@/hooks/use-network-status";

export function NetworkBanner() {
  const colors = useColors();
  const { isConnected, pendingSyncCount, isSyncing, lastSyncedAt, triggerSync } = useNetworkStatus();
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setShowBanner(true);
      setWasOffline(true);
    } else if (wasOffline && isConnected) {
      // Just came back online - show sync message briefly
      setShowBanner(true);
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
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [pendingSyncCount, isSyncing]);

  if (!showBanner) return null;

  return (
    <View
      style={[
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
          ? "Offline – Änderungen werden lokal gespeichert"
          : isSyncing
          ? `Synchronisiere ${pendingSyncCount} Änderung${pendingSyncCount !== 1 ? "en" : ""}...`
          : "Verbunden – Alles synchronisiert"}
      </Text>
      {isConnected && pendingSyncCount > 0 && !isSyncing && (
        <Pressable onPress={triggerSync} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
          <MaterialIcons name="refresh" size={16} color={colors.primary} />
        </Pressable>
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
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
  },
});
