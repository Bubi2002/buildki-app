/**
 * ProtoKI – Audit-Log System
 * 
 * Manipulationssichere Protokollierung aller relevanten Aktionen.
 * Verwendet SHA-256 Hash-Chain für Unveränderbarkeit.
 * Jeder Eintrag referenziert den Hash des vorherigen Eintrags.
 * 
 * Erfüllt:
 * - Beweissicherung (§ 650g BGB, VOB/B §12)
 * - DSGVO Art. 30 (Verzeichnis der Verarbeitungstätigkeiten)
 * - KI-Recht (Nachvollziehbarkeit von KI-Entscheidungen)
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "defect.created"
  | "defect.updated"
  | "defect.statusChanged"
  | "defect.deleted"
  | "defect.photoAdded"
  | "defect.signatureAdded"
  | "defect.followUpSet"
  | "defect.followUpCompleted"
  | "protocol.created"
  | "protocol.completed"
  | "protocol.exported"
  | "report.generated"
  | "report.exported"
  | "bautagebuch.generated"
  | "bautagebuch.exported"
  | "sync.pushed"
  | "sync.pulled"
  | "sync.conflict"
  | "matterport.pinCreated"
  | "matterport.pinLinked"
  | "user.login"
  | "user.logout"
  | "user.dataExport"
  | "user.dataDelete"
  | "settings.changed"
  | "signature.captured"
  | "pdf.generated"
  | "ai.invoked"
  | "ai.resultAccepted"
  | "ai.resultRejected";

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO 8601
  action: AuditAction;
  entityType: string; // "defect", "protocol", "report", etc.
  entityId?: string;
  userId?: string;
  details: Record<string, any>;
  metadata: {
    deviceId: string;
    platform: string;
    appVersion: string;
    gpsLat?: number;
    gpsLon?: number;
  };
  previousHash: string; // Hash of the previous entry (chain)
  hash: string; // SHA-256 hash of this entry (without hash field)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIT_LOG_KEY = "protoki_audit_log";
const AUDIT_META_KEY = "protoki_audit_meta";
const MAX_LOCAL_ENTRIES = 5000; // Keep last 5000 entries locally
const APP_VERSION = "1.0.0";

// ─── Hash Function ────────────────────────────────────────────────────────────

/**
 * Simple SHA-256 hash using Web Crypto API (available in React Native).
 * Falls back to a deterministic string hash if crypto is unavailable.
 */
async function sha256(message: string): Promise<string> {
  try {
    if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {}
  
  // Fallback: deterministic hash for environments without Web Crypto
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}

// ─── Device ID ────────────────────────────────────────────────────────────────

let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  
  try {
    const stored = await AsyncStorage.getItem("protoki_device_id");
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }
  } catch {}
  
  // Generate a new device ID
  const newId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await AsyncStorage.setItem("protoki_device_id", newId);
  } catch {}
  cachedDeviceId = newId;
  return newId;
}

// ─── Audit Meta (last hash for chain) ─────────────────────────────────────────

interface AuditMeta {
  lastHash: string;
  totalEntries: number;
  createdAt: string;
}

async function getAuditMeta(): Promise<AuditMeta> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_META_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { lastHash: "GENESIS", totalEntries: 0, createdAt: new Date().toISOString() };
}

async function setAuditMeta(meta: AuditMeta): Promise<void> {
  try {
    await AsyncStorage.setItem(AUDIT_META_KEY, JSON.stringify(meta));
  } catch {}
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Log an action to the audit trail.
 * Creates a hash-chained entry that cannot be tampered with.
 */
export async function logAudit(
  action: AuditAction,
  entityType: string,
  entityId?: string,
  details: Record<string, any> = {},
  gps?: { lat: number; lon: number }
): Promise<AuditEntry> {
  const meta = await getAuditMeta();
  const deviceId = await getDeviceId();
  
  const entry: Omit<AuditEntry, "hash"> & { hash?: string } = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action,
    entityType,
    entityId,
    details,
    metadata: {
      deviceId,
      platform: Platform.OS,
      appVersion: APP_VERSION,
      gpsLat: gps?.lat,
      gpsLon: gps?.lon,
    },
    previousHash: meta.lastHash,
  };
  
  // Compute hash of the entry (without the hash field itself)
  const hashInput = JSON.stringify(entry);
  const hash = await sha256(hashInput);
  
  const finalEntry: AuditEntry = { ...entry, hash } as AuditEntry;
  
  // Store entry
  try {
    const raw = await AsyncStorage.getItem(AUDIT_LOG_KEY);
    let entries: AuditEntry[] = raw ? JSON.parse(raw) : [];
    entries.push(finalEntry);
    
    // Trim to max entries (keep newest)
    if (entries.length > MAX_LOCAL_ENTRIES) {
      entries = entries.slice(-MAX_LOCAL_ENTRIES);
    }
    
    await AsyncStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(entries));
  } catch {}
  
  // Update meta
  await setAuditMeta({
    lastHash: hash,
    totalEntries: meta.totalEntries + 1,
    createdAt: meta.createdAt,
  });
  
  return finalEntry;
}

/**
 * Get all audit log entries, optionally filtered.
 */
export async function getAuditLog(filter?: {
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  since?: string; // ISO date
  limit?: number;
}): Promise<AuditEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_LOG_KEY);
    if (!raw) return [];
    
    let entries: AuditEntry[] = JSON.parse(raw);
    
    if (filter?.action) {
      entries = entries.filter((e) => e.action === filter.action);
    }
    if (filter?.entityType) {
      entries = entries.filter((e) => e.entityType === filter.entityType);
    }
    if (filter?.entityId) {
      entries = entries.filter((e) => e.entityId === filter.entityId);
    }
    if (filter?.since) {
      const sinceDate = new Date(filter.since).getTime();
      entries = entries.filter((e) => new Date(e.timestamp).getTime() >= sinceDate);
    }
    if (filter?.limit) {
      entries = entries.slice(-filter.limit);
    }
    
    return entries;
  } catch {
    return [];
  }
}

/**
 * Verify the integrity of the audit log chain.
 * Returns true if the chain is intact, false if tampered.
 */
export async function verifyAuditChain(): Promise<{
  valid: boolean;
  totalEntries: number;
  brokenAt?: number;
}> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_LOG_KEY);
    if (!raw) return { valid: true, totalEntries: 0 };
    
    const entries: AuditEntry[] = JSON.parse(raw);
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      // Verify hash chain linkage
      if (i > 0 && entry.previousHash !== entries[i - 1].hash) {
        return { valid: false, totalEntries: entries.length, brokenAt: i };
      }
      
      // Verify entry hash
      const { hash, ...withoutHash } = entry;
      const computedHash = await sha256(JSON.stringify(withoutHash));
      if (computedHash !== hash) {
        return { valid: false, totalEntries: entries.length, brokenAt: i };
      }
    }
    
    return { valid: true, totalEntries: entries.length };
  } catch {
    return { valid: false, totalEntries: 0 };
  }
}

/**
 * Export the audit log as a JSON string for DSGVO data export.
 */
export async function exportAuditLog(): Promise<string> {
  const entries = await getAuditLog();
  const meta = await getAuditMeta();
  
  return JSON.stringify({
    exportDate: new Date().toISOString(),
    meta,
    entries,
    chainValid: (await verifyAuditChain()).valid,
  }, null, 2);
}

/**
 * Get audit statistics for display.
 */
export async function getAuditStats(): Promise<{
  totalEntries: number;
  chainValid: boolean;
  firstEntry?: string;
  lastEntry?: string;
  actionCounts: Record<string, number>;
}> {
  const entries = await getAuditLog();
  const chainResult = await verifyAuditChain();
  
  const actionCounts: Record<string, number> = {};
  for (const entry of entries) {
    actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
  }
  
  return {
    totalEntries: entries.length,
    chainValid: chainResult.valid,
    firstEntry: entries.length > 0 ? entries[0].timestamp : undefined,
    lastEntry: entries.length > 0 ? entries[entries.length - 1].timestamp : undefined,
    actionCounts,
  };
}
