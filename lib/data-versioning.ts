/**
 * Data Versioning & Migration System
 * 
 * Tracks schema versions for all AsyncStorage data stores.
 * Runs migrations automatically on app startup when version changes.
 * Ensures no data loss during app updates.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

// Current schema version - increment when data format changes
export const CURRENT_SCHEMA_VERSION = 2;
const SCHEMA_VERSION_KEY = "protoki_schema_version";
const MIGRATION_LOG_KEY = "protoki_migration_log";

export type MigrationLogEntry = {
  fromVersion: number;
  toVersion: number;
  timestamp: string;
  success: boolean;
  error?: string;
  keysAffected: string[];
};

type MigrationFn = () => Promise<{ keysAffected: string[] }>;

/**
 * Registry of migrations: version number → migration function
 * Each migration upgrades from (version-1) to (version)
 */
const MIGRATIONS: Record<number, MigrationFn> = {
  // v1 → v2: Add schema metadata to defects, normalize followUpDate format
  2: async () => {
    const keysAffected: string[] = [];

    // Migrate defects: ensure all defects have required fields
    try {
      const raw = await AsyncStorage.getItem("defects");
      if (raw) {
        const defects = JSON.parse(raw);
        let changed = false;
        const migrated = defects.map((d: any) => {
          const updates: any = {};
          // Ensure matterport3D field exists
          if (!d.matterport3D && d.matterportPinId) {
            updates.matterport3D = { sweepId: "", position: { x: 0, y: 0, z: 0 }, floorIndex: 0 };
            changed = true;
          }
          // Ensure signatures array exists
          if (!d.signatures) {
            updates.signatures = [];
            changed = true;
          }
          // Normalize followUpDate to ISO string
          if (d.followUpDate && !d.followUpDate.includes("T")) {
            updates.followUpDate = new Date(d.followUpDate).toISOString();
            changed = true;
          }
          // Ensure aiSummary field exists
          if (d.aiSummary === undefined) {
            updates.aiSummary = null;
            changed = true;
          }
          return Object.keys(updates).length > 0 ? { ...d, ...updates } : d;
        });
        if (changed) {
          await AsyncStorage.setItem("defects", JSON.stringify(migrated));
          keysAffected.push("defects");
        }
      }
    } catch (e) {
      console.warn("[Migration v2] defects migration error:", e);
    }

    // Migrate protocols: ensure synced field exists
    try {
      const raw = await AsyncStorage.getItem("protocols");
      if (raw) {
        const protocols = JSON.parse(raw);
        let changed = false;
        const migrated = protocols.map((p: any) => {
          if (p.synced === undefined) {
            changed = true;
            return { ...p, synced: false };
          }
          return p;
        });
        if (changed) {
          await AsyncStorage.setItem("protocols", JSON.stringify(migrated));
          keysAffected.push("protocols");
        }
      }
    } catch (e) {
      console.warn("[Migration v2] protocols migration error:", e);
    }

    // Migrate timeline-events: ensure type field exists
    try {
      const raw = await AsyncStorage.getItem("timeline-events");
      if (raw) {
        const events = JSON.parse(raw);
        let changed = false;
        const migrated = events.map((e: any) => {
          if (!e.type) {
            changed = true;
            return { ...e, type: "general" };
          }
          return e;
        });
        if (changed) {
          await AsyncStorage.setItem("timeline-events", JSON.stringify(migrated));
          keysAffected.push("timeline-events");
        }
      }
    } catch (e) {
      console.warn("[Migration v2] timeline-events migration error:", e);
    }

    return { keysAffected };
  },
};

/**
 * Get current stored schema version
 */
export async function getStoredSchemaVersion(): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
    return stored ? parseInt(stored, 10) : 1; // Default to v1 for existing installs
  } catch {
    return 1;
  }
}

/**
 * Get migration log
 */
export async function getMigrationLog(): Promise<MigrationLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MIGRATION_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Run all pending migrations
 * Called at app startup before any data access
 */
export async function runMigrations(): Promise<{ ran: number; errors: number }> {
  const storedVersion = await getStoredSchemaVersion();
  
  if (storedVersion >= CURRENT_SCHEMA_VERSION) {
    return { ran: 0, errors: 0 };
  }

  console.log(`[DataVersioning] Migrating from v${storedVersion} to v${CURRENT_SCHEMA_VERSION}...`);
  
  let ran = 0;
  let errors = 0;
  const log = await getMigrationLog();

  for (let version = storedVersion + 1; version <= CURRENT_SCHEMA_VERSION; version++) {
    const migrationFn = MIGRATIONS[version];
    if (!migrationFn) {
      console.warn(`[DataVersioning] No migration function for v${version}, skipping`);
      continue;
    }

    const entry: MigrationLogEntry = {
      fromVersion: version - 1,
      toVersion: version,
      timestamp: new Date().toISOString(),
      success: false,
      keysAffected: [],
    };

    try {
      // Create backup before migration
      await createBackup(version);
      
      const result = await migrationFn();
      entry.success = true;
      entry.keysAffected = result.keysAffected;
      ran++;
      
      // Update stored version after each successful migration
      await AsyncStorage.setItem(SCHEMA_VERSION_KEY, version.toString());
      console.log(`[DataVersioning] Migration to v${version} successful. Keys affected: ${result.keysAffected.join(", ") || "none"}`);
    } catch (error: any) {
      entry.success = false;
      entry.error = error?.message || String(error);
      errors++;
      console.error(`[DataVersioning] Migration to v${version} FAILED:`, error);
      
      // Attempt rollback from backup
      await restoreBackup(version);
      break; // Stop migrations on failure
    }

    log.push(entry);
  }

  await AsyncStorage.setItem(MIGRATION_LOG_KEY, JSON.stringify(log));
  return { ran, errors };
}

/**
 * Create a backup of critical data before migration
 */
async function createBackup(targetVersion: number): Promise<void> {
  const criticalKeys = ["defects", "protocols", "timeline-events", "attendance_records", "checklists"];
  const backupKey = `protoki_backup_v${targetVersion}`;
  
  const backup: Record<string, string | null> = {};
  for (const key of criticalKeys) {
    try {
      backup[key] = await AsyncStorage.getItem(key);
    } catch {
      backup[key] = null;
    }
  }
  
  await AsyncStorage.setItem(backupKey, JSON.stringify(backup));
}

/**
 * Restore from backup if migration fails
 */
async function restoreBackup(targetVersion: number): Promise<void> {
  const backupKey = `protoki_backup_v${targetVersion}`;
  
  try {
    const raw = await AsyncStorage.getItem(backupKey);
    if (!raw) return;
    
    const backup = JSON.parse(raw);
    for (const [key, value] of Object.entries(backup)) {
      if (value !== null) {
        await AsyncStorage.setItem(key, value as string);
      }
    }
    console.log(`[DataVersioning] Restored backup for v${targetVersion}`);
  } catch (e) {
    console.error("[DataVersioning] Backup restore failed:", e);
  }
}

/**
 * Validate data integrity for a given store key
 * Returns true if data is valid, false if corrupted
 */
export async function validateStoreIntegrity(key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return { valid: true }; // Empty is valid
    
    const parsed = JSON.parse(raw);
    
    // Check if it's an array (most stores are arrays)
    if (key === "defects" || key === "protocols" || key === "timeline-events" || key === "attendance_records") {
      if (!Array.isArray(parsed)) {
        return { valid: false, error: `Expected array for ${key}, got ${typeof parsed}` };
      }
      // Check each item has an id
      for (let i = 0; i < parsed.length; i++) {
        if (!parsed[i].id) {
          return { valid: false, error: `Item at index ${i} in ${key} has no id` };
        }
      }
    }
    
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: `Parse error for ${key}: ${e?.message}` };
  }
}

/**
 * Run integrity check on all critical stores
 */
export async function runIntegrityCheck(): Promise<{ results: Record<string, boolean>; errors: string[] }> {
  const criticalKeys = ["defects", "protocols", "timeline-events", "attendance_records", "checklists", "construction-diary"];
  const results: Record<string, boolean> = {};
  const errors: string[] = [];

  for (const key of criticalKeys) {
    const { valid, error } = await validateStoreIntegrity(key);
    results[key] = valid;
    if (!valid && error) {
      errors.push(error);
    }
  }

  return { results, errors };
}

/**
 * Get data store statistics (for debugging/diagnostics)
 */
export async function getStoreStats(): Promise<Record<string, { count: number; sizeKB: number }>> {
  const keys = ["defects", "protocols", "timeline-events", "attendance_records", "checklists", "construction-diary", "time-entries"];
  const stats: Record<string, { count: number; sizeKB: number }> = {};

  for (const key of keys) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        stats[key] = {
          count: Array.isArray(parsed) ? parsed.length : 1,
          sizeKB: Math.round((raw.length * 2) / 1024), // Approximate UTF-16 size
        };
      } else {
        stats[key] = { count: 0, sizeKB: 0 };
      }
    } catch {
      stats[key] = { count: -1, sizeKB: 0 };
    }
  }

  return stats;
}
