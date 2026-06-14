import { useState, useEffect, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type NetworkStatus = {
  isConnected: boolean;
  pendingSyncCount: number;
  lastSyncedAt: string | null;
  isSyncing: boolean;
};

const PENDING_SYNC_KEY = "pending-sync-queue";
const LAST_SYNCED_KEY = "last-synced-at";

/**
 * Hook to monitor network connectivity and manage sync queue
 */
export function useNetworkStatus(): NetworkStatus & { addToSyncQueue: (item: any) => Promise<void>; triggerSync: () => Promise<void> } {
  const [isConnected, setIsConnected] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Load initial state
    loadSyncState();

    // Check connectivity periodically
    checkConnectivity();
    intervalRef.current = setInterval(checkConnectivity, 10000); // every 10s

    // Web: listen to online/offline events
    if (Platform.OS === "web") {
      const handleOnline = () => {
        setIsConnected(true);
        triggerSync();
      };
      const handleOffline = () => setIsConnected(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      setIsConnected(navigator.onLine);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const checkConnectivity = async () => {
    try {
      if (Platform.OS === "web") {
        setIsConnected(navigator.onLine);
      } else {
        // On native, try a lightweight fetch
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          await fetch("https://clients3.google.com/generate_204", { signal: controller.signal, method: "HEAD" });
          clearTimeout(timeout);
          setIsConnected(true);
        } catch {
          clearTimeout(timeout);
          setIsConnected(false);
        }
      }
    } catch {
      setIsConnected(false);
    }
  };

  const loadSyncState = async () => {
    try {
      const queue = await AsyncStorage.getItem(PENDING_SYNC_KEY);
      const items = queue ? JSON.parse(queue) : [];
      setPendingSyncCount(items.length);
      const lastSync = await AsyncStorage.getItem(LAST_SYNCED_KEY);
      setLastSyncedAt(lastSync);
    } catch { /* ignore */ }
  };

  const addToSyncQueue = async (item: any) => {
    try {
      const queue = JSON.parse((await AsyncStorage.getItem(PENDING_SYNC_KEY)) || "[]");
      queue.push({ ...item, queuedAt: new Date().toISOString() });
      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
      setPendingSyncCount(queue.length);
    } catch { /* ignore */ }
  };

  const triggerSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const queue = JSON.parse((await AsyncStorage.getItem(PENDING_SYNC_KEY)) || "[]");
      if (queue.length === 0) {
        setIsSyncing(false);
        return;
      }

      // Process sync queue (in a real app, this would send to server)
      // For now, we just clear the queue and mark as synced
      await AsyncStorage.setItem(PENDING_SYNC_KEY, "[]");
      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNCED_KEY, now);
      setPendingSyncCount(0);
      setLastSyncedAt(now);
    } catch { /* ignore */ }
    setIsSyncing(false);
  };

  return {
    isConnected,
    pendingSyncCount,
    lastSyncedAt,
    isSyncing,
    addToSyncQueue,
    triggerSync,
  };
}
