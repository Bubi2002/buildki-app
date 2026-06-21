/**
 * Protocol Versioning
 * 
 * Tracks changes to protocols over time, allowing users to view
 * previous versions and restore them if needed.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const VERSIONS_KEY = "protocol_versions";

export type ProtocolVersion = {
  id: string;
  protocolId: string;
  version: number;
  title: string;
  content: string; // The protocol text at this version
  templateName?: string;
  createdAt: string;
  changeNote?: string; // What changed
  isAutoSave: boolean; // true = automatic, false = manual save
};

/**
 * Save a new version of a protocol
 */
export async function saveProtocolVersion(
  protocolId: string,
  title: string,
  content: string,
  templateName?: string,
  changeNote?: string,
  isAutoSave: boolean = false
): Promise<ProtocolVersion> {
  const versions = await getProtocolVersions(protocolId);
  const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;

  const newVersion: ProtocolVersion = {
    id: `ver_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    protocolId,
    version: nextVersion,
    title,
    content,
    templateName,
    createdAt: new Date().toISOString(),
    changeNote: changeNote || (isAutoSave ? "Automatisch gespeichert" : `Version ${nextVersion}`),
    isAutoSave,
  };

  // Keep max 20 versions per protocol (remove oldest auto-saves first)
  let allVersions = [...versions, newVersion];
  if (allVersions.length > 20) {
    // Remove oldest auto-saves first
    const autoSaves = allVersions.filter(v => v.isAutoSave).sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    while (allVersions.length > 20 && autoSaves.length > 0) {
      const oldest = autoSaves.shift()!;
      allVersions = allVersions.filter(v => v.id !== oldest.id);
    }
    // If still too many, remove oldest regardless
    if (allVersions.length > 20) {
      allVersions = allVersions.slice(-20);
    }
  }

  // Save all versions
  const allData = await getAllVersions();
  const otherProtocolVersions = allData.filter(v => v.protocolId !== protocolId);
  const combined = [...otherProtocolVersions, ...allVersions];
  await AsyncStorage.setItem(VERSIONS_KEY, JSON.stringify(combined));

  return newVersion;
}

/**
 * Get all versions of a specific protocol
 */
export async function getProtocolVersions(protocolId: string): Promise<ProtocolVersion[]> {
  const allVersions = await getAllVersions();
  return allVersions
    .filter(v => v.protocolId === protocolId)
    .sort((a, b) => b.version - a.version); // Newest first
}

/**
 * Get a specific version
 */
export async function getProtocolVersion(versionId: string): Promise<ProtocolVersion | null> {
  const allVersions = await getAllVersions();
  return allVersions.find(v => v.id === versionId) || null;
}

/**
 * Get all versions across all protocols
 */
async function getAllVersions(): Promise<ProtocolVersion[]> {
  try {
    const raw = await AsyncStorage.getItem(VERSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Delete all versions of a protocol (when protocol is deleted)
 */
export async function deleteProtocolVersions(protocolId: string): Promise<void> {
  const allVersions = await getAllVersions();
  const filtered = allVersions.filter(v => v.protocolId !== protocolId);
  await AsyncStorage.setItem(VERSIONS_KEY, JSON.stringify(filtered));
}

/**
 * Generate a simple diff between two text versions
 * Returns lines that were added/removed
 */
export function generateSimpleDiff(oldText: string, newText: string): {
  added: string[];
  removed: string[];
  unchanged: number;
} {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  
  const added = newLines.filter(line => !oldSet.has(line) && line.trim().length > 0);
  const removed = oldLines.filter(line => !newSet.has(line) && line.trim().length > 0);
  const unchanged = newLines.filter(line => oldSet.has(line)).length;

  return { added, removed, unchanged };
}

/**
 * Format version date for display
 */
export function formatVersionDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Gerade eben";
  if (diffMin < 60) return `Vor ${diffMin} Min.`;
  if (diffHours < 24) return `Vor ${diffHours} Std.`;
  if (diffDays < 7) return `Vor ${diffDays} Tagen`;
  
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + 
    " " + date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
