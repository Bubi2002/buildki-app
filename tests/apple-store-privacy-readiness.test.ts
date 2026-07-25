import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Apple Store privacy readiness draft", () => {
  it("uses a build-effective Expo privacy manifest as the single source of truth", () => {
    const config = read("app.config.js");

    expect(config).toContain("privacyManifests");
    expect(config).toContain("NSPrivacyTracking: false");
    expect(config).toContain("NSPrivacyTrackingDomains: []");
    expect(config).toContain("NSPrivacyAccessedAPICategoryFileTimestamp");
    expect(config).toContain('NSPrivacyAccessedAPITypeReasons: ["C617.1", "3B52.1"]');
    expect(config).toContain("NSPrivacyAccessedAPICategoryUserDefaults");
    expect(config).toContain('NSPrivacyAccessedAPITypeReasons: ["CA92.1"]');
    expect(fs.existsSync(path.join(root, "ios-privacy-manifest.json"))).toBe(false);
  });

  it("declares the conservative linked app-functionality data categories", () => {
    const config = read("app.config.js");
    const expectedTypes = [
      "NSPrivacyCollectedDataTypeName",
      "NSPrivacyCollectedDataTypeEmailAddress",
      "NSPrivacyCollectedDataTypePhoneNumber",
      "NSPrivacyCollectedDataTypePhysicalAddress",
      "NSPrivacyCollectedDataTypePreciseLocation",
      "NSPrivacyCollectedDataTypePhotosorVideos",
      "NSPrivacyCollectedDataTypeAudioData",
      "NSPrivacyCollectedDataTypeCustomerSupport",
      "NSPrivacyCollectedDataTypeOtherUserContent",
      "NSPrivacyCollectedDataTypeUserID",
    ];

    expectedTypes.forEach((type) => expect(config).toContain(type));
    expect(config.match(/NSPrivacyCollectedDataTypeLinked: true/g)).toHaveLength(expectedTypes.length);
    expect(config.match(/NSPrivacyCollectedDataTypeTracking: false/g)).toHaveLength(expectedTypes.length);
    expect(config).not.toContain("NSPrivacyCollectedDataTypeDeviceID");
    expect(config).not.toContain("NSPrivacyCollectedDataTypePaymentInfo");
    expect(config).not.toContain("NSPrivacyCollectedDataTypePurchaseHistory");
  });

  it("uses specific German purpose strings without unnecessary always-location access", () => {
    const config = read("app.config.js");

    expect(config).not.toContain("Allow $(PRODUCT_NAME)");
    expect(config).toContain("NSCameraUsageDescription");
    expect(config).toContain("NSMicrophoneUsageDescription");
    expect(config).toContain("NSPhotoLibraryUsageDescription");
    expect(config).toContain("NSLocationWhenInUseUsageDescription");
    expect(config).toContain("NSCalendarsFullAccessUsageDescription");
    expect(config).toContain("NSContactsUsageDescription");
    expect(config).toContain("NSFaceIDUsageDescription");
    expect(config).toContain("motionUsagePermission: false");
    expect(config).toContain("locationAlwaysAndWhenInUsePermission: false");
    expect(config).toContain("locationAlwaysPermission: false");
    expect(config).toContain("isIosBackgroundLocationEnabled: false");
    expect(config).toContain("enableBackgroundRecording: false");
    expect(config).toContain("enableBackgroundPlayback: false");
    expect(config).toContain("supportsBackgroundPlayback: false");
    expect(config).toContain("supportsPictureInPicture: false");
    expect(config).toContain("remindersPermission: false");
  });

  it("makes the full account-deletion flow explicitly discoverable from settings", () => {
    const settings = read("app/(tabs)/settings.tsx");
    const legal = read("app/legal.tsx");
    const dataRights = read("components/data-rights-section.tsx");

    expect(settings).toContain("Meine Daten & Konto löschen");
    expect(settings).toContain("Konto endgültig löschen, Datenexport, Auskunft");
    expect(settings).toContain('/legal?section=dsgvo-export');
    expect(legal).toContain('activeSection === "dsgvo-export" && <DataRightsSection />');
    expect(dataRights).toContain('const DELETE_CONFIRMATION = "KONTO ENDGÜLTIG LÖSCHEN"');
    expect(dataRights).toContain("deleteAccount.mutateAsync");
    expect(dataRights).toContain("deleteAllLocalUserData");
  });
});
