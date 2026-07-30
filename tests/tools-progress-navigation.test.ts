import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSelectedProject } from "../lib/project-context";

const root = join(import.meta.dirname, "..");
const toolsSource = readFileSync(join(root, "app", "(tabs)", "index.tsx"), "utf8");
const progressSource = readFileSync(join(root, "app", "progress.tsx"), "utf8");

function getToolsBlock(): string {
  const match = toolsSource.match(/const TOOLS: ToolItem\[\] = \[([\s\S]*?)\n\];/);
  if (!match) throw new Error("TOOLS-Konfiguration nicht gefunden");
  return match[1];
}

describe("Werkzeugraster und Fortschrittsnavigation", () => {
  it("entfernt Statistik, Cloud und den allgemeinen Export vollständig aus dem Werkzeugraster", () => {
    const block = getToolsBlock();

    expect(block).not.toContain('label: "Statistik"');
    expect(block).not.toContain('label: "Cloud"');
    expect(block).not.toContain('label: "Export"');
    expect(block).not.toContain('route: "/dashboard-stats"');
    expect(block).not.toContain('route: "/cloud-import"');
    expect(block).not.toContain('route: "/export-center"');
    expect(block).toContain('label: "Fortschritt"');
    expect(block).toContain('label: "Mängel-PDF"');
  });

  it("hinterlässt im Dreispaltenraster keine einzelne verwaiste Schlusskachel", () => {
    const toolCount = (getToolsBlock().match(/\{ key:/g) || []).length;

    expect(toolCount).toBeGreaterThan(0);
    expect(toolCount % 3).not.toBe(1);
  });

  it("übergibt das ausgewählte Projekt an Fortschritt und verwendet dort den kanonischen Projektstore", () => {
    expect(toolsSource).toContain('router.push(`${route}?projectId=${selectedProject.id}');
    expect(progressSource).toContain("useLocalSearchParams");
    expect(progressSource).toContain("PROJECTS_STORAGE_KEY");
    expect(progressSource).toContain("LAST_SELECTED_PROJECT_KEY");
    expect(progressSource).toContain("resolveSelectedProject");
    expect(progressSource).not.toContain('getItem("buildki_active_project")');
  });

  it("bevorzugt die übergebene Projekt-ID und fällt sonst auf die letzte beziehungsweise erste Auswahl zurück", () => {
    const projects = [
      { id: "project-a", name: "Projekt A" },
      { id: "project-b", name: "Projekt B" },
    ];

    expect(resolveSelectedProject(projects, "project-b")?.id).toBe("project-b");
    expect(resolveSelectedProject(projects, "missing")?.id).toBe("project-a");
    expect(resolveSelectedProject([], "project-b")).toBeNull();
  });
});
