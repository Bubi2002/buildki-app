import { describe, expect, it } from "vitest";

import {
  EXPORT_CENTER_OPTIONS,
  getExportCenterAction,
} from "../lib/export-center-options";

describe("Export center options", () => {
  it("exposes only export paths backed by real project or protocol data", () => {
    expect(EXPORT_CENTER_OPTIONS.map((option) => option.id)).toEqual([
      "protocol",
      "defects",
      "photos",
    ]);
  });

  it("opens the real project-specific defect export", () => {
    expect(getExportCenterAction("defects", "project-42")).toEqual({
      kind: "navigate",
      pathname: "/defect-export",
      params: { projectId: "project-42" },
    });
  });

  it("does not open a project export without a selected project", () => {
    const action = getExportCenterAction("defects");

    expect(action.kind).toBe("unavailable");
    if (action.kind === "unavailable") {
      expect(action.reason).toContain("Projekt");
    }
  });

  it.each(["protocol", "photos"] as const)(
    "routes %s exports through the existing protocol-backed flow",
    (type) => {
      const action = getExportCenterAction(type, "project-42");

      expect(action.kind).toBe("navigate");
      if (action.kind === "navigate") {
        expect(action.pathname).toBe("/(tabs)/protocols");
        expect(action.dialogMessage).toContain("tatsäch");
      }
    },
  );
});
