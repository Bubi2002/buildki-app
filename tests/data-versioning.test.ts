import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] || null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

describe("Data Versioning", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("should detect fresh install as version 1", async () => {
    const { getStoredSchemaVersion } = await import("../lib/data-versioning");
    const version = await getStoredSchemaVersion();
    expect(version).toBe(1);
  });

  it("should run migrations from v1 to current", async () => {
    // Set up v1 defects without new fields
    mockStorage["defects"] = JSON.stringify([
      { id: "d1", title: "Test", status: "offen", priority: "hoch" },
    ]);
    mockStorage["protocols"] = JSON.stringify([
      { id: "p1", title: "Protocol 1" },
    ]);

    const { runMigrations, CURRENT_SCHEMA_VERSION } = await import("../lib/data-versioning");
    const result = await runMigrations();

    expect(result.ran).toBeGreaterThan(0);
    expect(result.errors).toBe(0);

    // Verify version was updated
    expect(mockStorage["buildki_schema_version"]).toBe(
      CURRENT_SCHEMA_VERSION.toString()
    );
  });

  it("should add missing signatures array to defects", async () => {
    mockStorage["defects"] = JSON.stringify([
      { id: "d1", title: "Test", status: "offen" },
    ]);

    const { runMigrations } = await import("../lib/data-versioning");
    await runMigrations();

    const migrated = JSON.parse(mockStorage["defects"]);
    expect(migrated[0].signatures).toEqual([]);
    expect(migrated[0].aiSummary).toBeNull();
  });

  it("should add synced field to protocols", async () => {
    mockStorage["protocols"] = JSON.stringify([
      { id: "p1", title: "Test Protocol" },
    ]);

    const { runMigrations } = await import("../lib/data-versioning");
    await runMigrations();

    const migrated = JSON.parse(mockStorage["protocols"]);
    expect(migrated[0].synced).toBe(false);
  });

  it("should not re-run migrations if already at current version", async () => {
    const { CURRENT_SCHEMA_VERSION, runMigrations } = await import("../lib/data-versioning");
    mockStorage["buildki_schema_version"] = CURRENT_SCHEMA_VERSION.toString();

    const result = await runMigrations();
    expect(result.ran).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("should create backup before migration", async () => {
    mockStorage["defects"] = JSON.stringify([{ id: "d1", title: "Test" }]);

    const { runMigrations } = await import("../lib/data-versioning");
    await runMigrations();

    // Backup should exist
    expect(mockStorage["buildki_backup_v2"]).toBeDefined();
    const backup = JSON.parse(mockStorage["buildki_backup_v2"]);
    expect(backup.defects).toBeDefined();
  });

  it("should validate store integrity correctly", async () => {
    const { validateStoreIntegrity } = await import("../lib/data-versioning");

    // Valid array
    mockStorage["defects"] = JSON.stringify([{ id: "d1" }]);
    const valid = await validateStoreIntegrity("defects");
    expect(valid.valid).toBe(true);

    // Invalid: not an array
    mockStorage["defects"] = JSON.stringify({ id: "d1" });
    const invalid = await validateStoreIntegrity("defects");
    expect(invalid.valid).toBe(false);

    // Invalid: item without id
    mockStorage["defects"] = JSON.stringify([{ title: "no id" }]);
    const noId = await validateStoreIntegrity("defects");
    expect(noId.valid).toBe(false);
  });

  it("should handle corrupted JSON gracefully", async () => {
    const { validateStoreIntegrity } = await import("../lib/data-versioning");
    mockStorage["defects"] = "not valid json{{{";
    const result = await validateStoreIntegrity("defects");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Parse error");
  });
});

describe("Offline Sync Manager - Exponential Backoff", () => {
  it("should have exponential backoff constant defined", async () => {
    // Read the file to verify the constant exists
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/protokoll-app/lib/offline-sync-manager.ts", "utf-8");
    expect(content).toContain("BASE_RETRY_DELAY_MS");
    expect(content).toContain("Math.pow(2,");
    expect(content).toContain("Backoff");
  });
});

describe("Migration Log", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("should log successful migrations", async () => {
    mockStorage["defects"] = JSON.stringify([{ id: "d1" }]);

    const { runMigrations, getMigrationLog } = await import("../lib/data-versioning");
    await runMigrations();

    const log = await getMigrationLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].success).toBe(true);
    expect(log[0].fromVersion).toBe(1);
    expect(log[0].toVersion).toBe(2);
  });
});
