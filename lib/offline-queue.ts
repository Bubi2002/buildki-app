import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";

const OFFLINE_QUEUE_KEY = "offline-recording-queue";

export type QueuedRecording = {
  id: string;
  fileUri: string;
  mimeType: string;
  templateId: string;
  photos: string[];
  duration: number;
  recordingMode: "video" | "audio" | "audio-photo";
  createdAt: string;
  status: "pending" | "processing" | "failed";
  retryCount: number;
  markers?: Array<{ time: number; label: string }>;
  location?: {
    latitude: number;
    longitude: number;
    address: string | null;
    city: string | null;
  } | null;
  weather?: string | null;
  pendingVideoUri?: string | null;
};

/**
 * Check if the device has internet connectivity
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isInternetReachable === true;
  } catch {
    return false;
  }
}

/**
 * Add a recording to the offline queue
 */
export async function addToQueue(recording: Omit<QueuedRecording, "status" | "retryCount">): Promise<void> {
  const queue = await getQueue();
  queue.push({ ...recording, status: "pending", retryCount: 0 });
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Get all queued recordings
 */
export async function getQueue(): Promise<QueuedRecording[]> {
  try {
    const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Update a queued recording's status
 */
export async function updateQueueItem(id: string, updates: Partial<QueuedRecording>): Promise<void> {
  const queue = await getQueue();
  const index = queue.findIndex((item) => item.id === id);
  if (index !== -1) {
    queue[index] = { ...queue[index], ...updates };
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }
}

/**
 * Remove a recording from the queue
 */
export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
}

/**
 * Get count of pending items in queue
 */
export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.filter((item) => item.status === "pending" || item.status === "failed").length;
}
