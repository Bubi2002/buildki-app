import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/defects.tsx"), "utf8");

describe("mobile defect create form", () => {
  it("keeps the long form scrollable while the iPhone keyboard is open", () => {
    const modalStart = source.indexOf("{/* Create Modal */}");
    const keyboardAvoider = source.indexOf("<KeyboardAvoidingView", modalStart);
    const verticalScroll = source.indexOf("keyboardShouldPersistTaps=\"handled\"", keyboardAvoider);
    const formEnd = source.indexOf("</KeyboardAvoidingView>", verticalScroll);

    expect(modalStart).toBeGreaterThanOrEqual(0);
    expect(keyboardAvoider).toBeGreaterThan(modalStart);
    expect(verticalScroll).toBeGreaterThan(keyboardAvoider);
    expect(formEnd).toBeGreaterThan(verticalScroll);
    expect(source).toContain('behavior={Platform.OS === "ios" ? "padding" : "height"}');
    expect(source).toContain('keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}');
    expect(source).toContain('modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 24, maxHeight: "92%" }');
  });

  it("offers camera and multi-select gallery actions before the remaining fields", () => {
    const photoSection = source.indexOf("{/* Fotos direkt beim Erfassen */}");
    const floorSection = source.indexOf("{/* Geschoss / Raum Picker */}", photoSection);

    expect(photoSection).toBeGreaterThanOrEqual(0);
    expect(floorSection).toBeGreaterThan(photoSection);
    expect(source).toContain("onPress={addNewDefectCameraPhoto}");
    expect(source).toContain("requestCameraPermissionsAsync");
    expect(source).toContain("launchCameraAsync");
    expect(source).toContain("onPress={addNewDefectLibraryPhotos}");
    expect(source).toContain("requestMediaLibraryPermissionsAsync");
    expect(source).toContain("allowsMultipleSelection: true");
    expect(source).toContain("selectionLimit: 5");
  });

  it("previews, removes, saves and resets newly captured photos", () => {
    expect(source).toContain("newPhotos.map((photo, index) => (");
    expect(source).toContain("onPress={() => removeNewDefectPhoto(index)}");
    expect(source).toContain("photos: [...newPhotos]");
    expect(source).toContain("photoIndex < newPhotos.length");
    expect(source).toContain("await recordPhotoAdded(defect.id)");
    expect(source.match(/setNewPhotos\(\[\]\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
