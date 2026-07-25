import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Privacy-by-default and purpose gates", () => {
  it("keeps every optional purpose disabled by default", () => {
    const source = read("lib/privacy-consent.ts");
    expect(source).toContain("aiProcessing: false");
    expect(source).toContain("cloudSync: false");
    expect(source).toContain("gpsTracking: false");
    expect(source).toContain("CURRENT_CONSENT_VERSION = 2");
    expect(source).not.toContain("photoPersons");
    expect(source).not.toContain("analytics");
  });

  it("allows continuing without an optional grant and does not present required checkboxes", () => {
    const source = read("components/privacy-consent-dialog.tsx");
    expect(source).toContain("Auswahl speichern und fortfahren");
    expect(source).toContain("Fortfahren ist auch mit allen optionalen Schaltern");
    expect(source).toContain("DEFAULT_PRIVACY_CHOICES");
    expect(source).not.toContain("required: true");
    expect(source).not.toContain("useState<ConsentState>({");
  });

  it("persists account-level choices and append-only consent events", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read("drizzle/0004_privacy_purpose_consents.sql");
    expect(schema).toContain('mysqlTable("privacy_consents"');
    expect(schema).toContain('mysqlTable("privacy_consent_events"');
    expect(migration).toContain("CREATE TABLE `privacy_consents`");
    expect(migration).toContain("CREATE TABLE `privacy_consent_events`");
  });

  it("enforces AI and cloud purposes at the tRPC boundary", () => {
    const trpc = read("server/_core/trpc.ts");
    const routers = read("server/routers.ts");
    expect(trpc).toContain('requirePurpose("aiProcessing")');
    expect(trpc).toContain('requirePurpose("cloudSync")');
    expect(routers).toContain("transcribe: aiProcedure");
    expect(routers).toContain("generate: aiProcedure");
    expect(routers).toContain("pushProtocol: cloudProcedure");
    expect(routers).toContain("fullSync: cloudProcedure");
    expect(routers).toContain("uploadPhoto: cloudProcedure");
  });

  it("requires a per-recording information confirmation and stores local raw audio when processing is off", () => {
    const source = read("app/(tabs)/record.tsx");
    expect(source).toContain("Personen vor Aufnahme informieren");
    expect(source).toContain("Bestätigt – Aufnahme starten");
    expect(source).toContain("const canProcessWithServer = privacyChoices.aiProcessing && privacyChoices.cloudSync");
    expect(source).toContain("Lokale Aufnahme – Verarbeitung deaktiviert");
    expect(source).toContain("sourceAudioUri: fileUri");
    expect(source.indexOf("if (!canProcessWithServer)")).toBeLessThan(
      source.indexOf("startBackgroundProcessing("),
    );
  });

  it("requests location only behind the GPS purpose and blocks video before reading Base64", () => {
    const location = read("lib/location-service.ts");
    const video = read("app/video-upload.tsx");
    expect(location.indexOf('requireConsent("gpsTracking")')).toBeLessThan(
      location.indexOf("Location.requestForegroundPermissionsAsync()"),
    );
    expect(video.indexOf("getPrivacyChoices()")).toBeLessThan(
      video.indexOf("FileSystem.readAsStringAsync(video.uri"),
    );
  });

  it("does not start optional sync while either cloud or AI consent is absent", () => {
    const source = read("lib/offline-sync-manager.ts");
    expect(source).toContain("const transferAllowed = choices.cloudSync && choices.aiProcessing");
    expect(source).toContain("blockedByConsent: true");
    expect(source).toContain("Cloud- und KI-Verarbeitung sind in den Datenschutzoptionen deaktiviert");
  });
});
