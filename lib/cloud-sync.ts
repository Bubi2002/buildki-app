import AsyncStorage from "@react-native-async-storage/async-storage";

const SYNC_KEY = "cloud-sync-enabled";
const LAST_SYNC_KEY = "last-sync-timestamp";

export async function isSyncEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(SYNC_KEY);
  return val === "true";
}

export async function setSyncEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SYNC_KEY, enabled ? "true" : "false");
}

export async function getLastSyncTime(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

export async function setLastSyncTime(time: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, time);
}

export interface LocalProtocol {
  id: string;
  title: string;
  transcription: string;
  protocol: string;
  templateName: string;
  templateId: string;
  photos: string[];
  todos: Array<{ task: string; assignee: string; priority: string; deadline: string; done: boolean }>;
  markers?: Array<{ time: number; label: string }>;
  duration: number;
  recordingMode: string;
  createdAt: string;
  calendarEventId?: string | null;
  status: string;
  synced?: boolean;
}

export async function getLocalProtocols(): Promise<LocalProtocol[]> {
  const data = await AsyncStorage.getItem("protocols");
  return data ? JSON.parse(data) : [];
}

export async function saveLocalProtocols(protocols: LocalProtocol[]): Promise<void> {
  await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
}

export async function markProtocolSynced(localId: string): Promise<void> {
  const protocols = await getLocalProtocols();
  const updated = protocols.map((p) =>
    p.id === localId ? { ...p, synced: true } : p
  );
  await saveLocalProtocols(updated);
}
