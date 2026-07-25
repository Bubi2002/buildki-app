import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");

describe("active project delete affordance", () => {
  it("renders a dedicated delete button in the active project header", () => {
    const selectorStart = source.indexOf('<View style={styles.projectSelector}>');
    const deleteButton = source.indexOf("styles.activeProjectDeleteButton", selectorStart);
    const dropdownStart = source.indexOf("{/* Project Picker Dropdown */}", selectorStart);

    expect(selectorStart).toBeGreaterThanOrEqual(0);
    expect(deleteButton).toBeGreaterThan(selectorStart);
    expect(deleteButton).toBeLessThan(dropdownStart);
  });

  it("routes the active project button through the existing confirmed deletion flow", () => {
    expect(source).toContain("onPress={() => confirmDeleteProject(selectedProject)}");
    expect(source).toContain("Aktives Projekt ${selectedProject.name} löschen");
    expect(source).toContain("Öffnet eine Sicherheitsabfrage vor dem Löschen");
  });

  it("keeps project selection and deletion as separate touch targets", () => {
    expect(source).toContain("styles.projectSelectorToggle");
    expect(source).toContain("styles.activeProjectDeleteButton");
    expect(source).toContain("borderLeftWidth: 1");
    expect(source).toContain("width: 52");
  });
});
