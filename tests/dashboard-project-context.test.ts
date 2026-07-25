import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterDashboardItemsByProject,
  normalizeDashboardProjectId,
} from "../lib/dashboard-project-context";

const dashboardSource = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");

describe("dashboard project context", () => {
  it("treats missing or blank project ids as no active project", () => {
    expect(normalizeDashboardProjectId()).toBeNull();
    expect(normalizeDashboardProjectId(null)).toBeNull();
    expect(normalizeDashboardProjectId("")).toBeNull();
    expect(normalizeDashboardProjectId("   ")).toBeNull();
    expect(normalizeDashboardProjectId(" project-a ")).toBe("project-a");
  });

  it("returns no dashboard items when no project is active", () => {
    const items = [
      { id: "a", projectId: "project-a" },
      { id: "orphan" },
    ];

    expect(filterDashboardItemsByProject(items)).toEqual([]);
    expect(filterDashboardItemsByProject(items, null)).toEqual([]);
  });

  it("returns only records assigned to the active project", () => {
    const items = [
      { id: "a", projectId: "project-a" },
      { id: "b", projectId: "project-b" },
      { id: "orphan" },
    ];

    expect(filterDashboardItemsByProject(items, "project-a")).toEqual([
      { id: "a", projectId: "project-a" },
    ]);
  });

  it("resets before reading any aggregate storage when no project is active", () => {
    const loaderStart = dashboardSource.indexOf("const loadLiveStats");
    const contextGuard = dashboardSource.indexOf("if (!activeProjectId)", loaderStart);
    const firstStorageRead = dashboardSource.indexOf('AsyncStorage.getItem("projects")', loaderStart);

    expect(loaderStart).toBeGreaterThanOrEqual(0);
    expect(contextGuard).toBeGreaterThan(loaderStart);
    expect(contextGuard).toBeLessThan(firstStorageRead);
    expect(dashboardSource).not.toContain("projectId || undefined");
    expect(dashboardSource).not.toContain(": allProtocols");
  });

  it("renders a clear no-project state instead of metric and activity cards", () => {
    expect(dashboardSource).toContain("Keine Projektdaten");
    expect(dashboardSource).toContain("Alte Aufgaben, Mängel und Protokolle werden hier nicht projektübergreifend angezeigt.");
    expect(dashboardSource).toContain("{selectedProject ? (");
    expect(dashboardSource).toContain("{selectedProject && stats.recentEvents.length > 0 && (");
  });
});
