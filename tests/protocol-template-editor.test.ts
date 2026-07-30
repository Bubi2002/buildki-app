import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const editorSource = fs.readFileSync(path.join(root, "app/template-editor.tsx"), "utf8");
const recordSource = fs.readFileSync(path.join(root, "app/(tabs)/record.tsx"), "utf8");

describe("protocol template editor", () => {
  it("uses the canonical template store for loading and saving", () => {
    expect(editorSource).toContain("loadCustomProtocolTemplates()");
    expect(editorSource).toContain("upsertCustomProtocolTemplate({");
    expect(editorSource).not.toContain('AsyncStorage.getItem(CUSTOM_TEMPLATES_KEY)');
  });

  it("persists a canonical template category", () => {
    expect(editorSource).toContain('useState<TemplateCategory>("allgemein")');
    expect(editorSource).toContain("category,");
    expect(editorSource).toContain("TEMPLATE_CATEGORIES.map");
  });

  it("keeps the full-screen editor usable with the mobile keyboard", () => {
    expect(editorSource).toContain("<KeyboardAvoidingView");
    expect(editorSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(editorSource).toContain('keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}');
  });

  it("renders section numbers as one React Native text expression", () => {
    expect(editorSource).toContain('{`${index + 1}.`}');
    expect(editorSource).not.toMatch(/^\s*\{index \+ 1\}\.\s*$/m);
  });

  it("gives the recording bottom sheet a real height instead of a collapsed flex scroll view", () => {
    expect(recordSource).toContain("styles.templateEditorModalContent");
    expect(recordSource).toMatch(/templateEditorModalContent:\s*\{[\s\S]*?height:\s*"84%"[\s\S]*?maxHeight:\s*"84%"/);
    expect(recordSource).toContain("contentContainerStyle={styles.templateEditorScrollContent}");
  });
});
