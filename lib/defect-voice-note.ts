import * as FileSystem from "expo-file-system/legacy";

const VOICE_NOTE_DIRECTORY = `${FileSystem.documentDirectory || ""}defect-voice-notes/`;

export function formatVoiceNoteDuration(durationMillis: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMillis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export async function persistDefectVoiceNote(sourceUri: string, defectId: string): Promise<string> {
  if (!FileSystem.documentDirectory) return sourceUri;
  await FileSystem.makeDirectoryAsync(VOICE_NOTE_DIRECTORY, { intermediates: true });
  const extension = sourceUri.split("?")[0].split(".").pop() || "m4a";
  const destination = `${VOICE_NOTE_DIRECTORY}${defectId}-${Date.now()}.${extension}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}

export async function removePersistedDefectVoiceNote(uri: string | undefined): Promise<void> {
  if (!uri || !FileSystem.documentDirectory || !uri.startsWith(VOICE_NOTE_DIRECTORY)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
