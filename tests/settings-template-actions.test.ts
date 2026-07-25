import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const settings = readFileSync(resolve(process.cwd(), "app/(tabs)/settings.tsx"), "utf8");
const editor = readFileSync(resolve(process.cwd(), "app/template-editor.tsx"), "utf8");

describe("funktionsfähige Vorlagenaktionen", () => {
  it("öffnet den vorhandenen Vorlageneditor über eine eindeutige Aktion", () => {
    expect(settings).toContain('accessibilityLabel="Eigene Vorlage erstellen"');
    expect(settings).toContain("onPress={openTemplateEditor}");
    expect(settings).toContain('pathname: "/template-editor"');
    expect(editor).toContain("export default function TemplateEditorScreen");
  });

  it("speichert jede Standard-Vorlagenauswahl unmittelbar und meldet sie sichtbar zurück", () => {
    expect(settings).toContain("const selectProtocolTemplate = async");
    expect(settings).toContain('AsyncStorage.setItem("protokoll-settings", JSON.stringify(updated))');
    expect(settings).toContain("ist jetzt die Standard-Vorlage");
    expect(settings).toContain("accessibilityState={{ selected: isSelected }}");
    expect(settings).toContain('isSelected ? "AUSGEWÄHLT" : "AUSWÄHLEN"');
  });

  it("trennt Auswahl, Bearbeitung und bestätigtes Löschen eigener Vorlagen", () => {
    expect(settings).toContain("als Standard-Vorlage auswählen");
    expect(settings).toContain("bearbeiten`}");
    expect(settings).toContain('Alert.alert("Vorlage löschen"');
    expect(settings).toContain("deleteCustomTemplate(template.id)");
  });

  it("hält zusätzliche Protokollwerkzeuge außerhalb der Vorlagenkarten erreichbar", () => {
    const templateStart = settings.indexOf("{/* Template Selection */}");
    const toolsStart = settings.indexOf("{/* Additional protocol tools", templateStart);
    const recipientsStart = settings.indexOf("{/* Recipients Section */}", toolsStart);
    expect(templateStart).toBeGreaterThan(-1);
    expect(toolsStart).toBeGreaterThan(templateStart);
    expect(recipientsStart).toBeGreaterThan(toolsStart);
    const templateSection = settings.slice(templateStart, toolsStart);
    expect(templateSection).not.toContain("/kanban");
    expect(templateSection).not.toContain("/recurring-meetings");
    const toolsSection = settings.slice(toolsStart, recipientsStart);
    expect(toolsSection).toContain("/template-marketplace");
    expect(toolsSection).toContain("/agenda-preparation");
    expect(toolsSection).toContain("/kanban");
    expect(toolsSection).toContain("/recurring-meetings");
  });
});
