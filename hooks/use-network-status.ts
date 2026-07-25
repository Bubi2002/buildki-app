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
const OFFLINE_QUEUE_KEY = "offline-recording-queue";

/**
 * Hook to monitor network connectivity and manage sync queue.
 * Integrates with the offline-sync-manager for recording queue status.
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
    intervalRef.current = setInterval(() => {
      checkConnectivity();
      loadSyncState(); // Also refresh queue count
    }, 10000); // every 10s

    // Subscribe to sync manager updates on native
    let unsubscribe: (() => void) | null = null;
    if (Platform.OS !== "web") {
      try {
        const { onSyncStatusChange } = require("@/lib/offline-sync-manager");
        unsubscribe = onSyncStatusChange((status: any) => {
          setIsConnected(status.isOnline);
          setIsSyncing(status.isSyncing);
          setPendingSyncCount(status.pendingCount);
          if (status.lastSyncAt) setLastSyncedAt(status.lastSyncAt);
        });
      } catch {}
    }

    // Web: listen to online/offline events
    if (Platform.OS === "web") {
      const handleOnline = () => {
        setIsConnected(true);
        triggerSync();
      };
      const handleOffline = () => setIsConnected(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      void Promise.resolve().then(() => {
        setIsConnected(navigator.onLine);
      });
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (unsubscribe) unsubscribe();
      };
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  async function checkConnectivity() {
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
  }

  async function loadSyncState() {
    try {
      // Count from both general sync queue and offline recording queue
      const queue = await AsyncStorage.getItem(PENDING_SYNC_KEY);
      const generalItems = queue ? JSON.parse(queue) : [];
      
      const offlineQueue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const offlineItems = offlineQueue ? JSON.parse(offlineQueue) : [];
      const pendingOffline = offlineItems.filter((i: any) => i.status === "pending" || i.status === "failed");
      
      const totalPending = generalItems.length + pendingOffline.length;
      setPendingSyncCount(totalPending);
      
      const lastSync = await AsyncStorage.getItem(LAST_SYNCED_KEY);
      setLastSyncedAt(lastSync);
    } catch { /* ignore */ }
  }

  const addToSyncQueue = async (item: any) => {
    try {
      const queue = JSON.parse((await AsyncStorage.getItem(PENDING_SYNC_KEY)) || "[]");
      queue.push({ ...item, queuedAt: new Date().toISOString() });
      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
      setPendingSyncCount(prev => prev + 1);
    } catch { /* ignore */ }
  };

  async function triggerSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // Trigger the offline sync manager on native
      if (Platform.OS !== "web") {
        try {
          const { triggerSync: triggerOfflineSync } = require("@/lib/offline-sync-manager");
          await triggerOfflineSync();
        } catch {}
      }

      // Process general sync queue
      const queue = JSON.parse((await AsyncStorage.getItem(PENDING_SYNC_KEY)) || "[]");
      if (queue.length > 0) {
        await AsyncStorage.setItem(PENDING_SYNC_KEY, "[]");
        const now = new Date().toISOString();
        await AsyncStorage.setItem(LAST_SYNCED_KEY, now);
        setLastSyncedAt(now);
      }
      
      // Reload counts
      await loadSyncState();
    } catch { /* ignore */ }
    setIsSyncing(false);
  }

  return {
    isConnected,
    pendingSyncCount,
    lastSyncedAt,
    isSyncing,
    addToSyncQueue,
    triggerSync,
  };
}
