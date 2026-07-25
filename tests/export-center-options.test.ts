import { describe, expect, it } from "vitest";

import {
  EXPORT_CENTER_OPTIONS,
  getExportCenterAction,
} from "../lib/export-center-options";

describe("Export center options", () => {
  it("marks only export paths backed by real project or protocol data as available", () => {
    const available = EXPORT_CENTER_OPTIONS
      .filter((option) => option.available)
      .map((option) => option.id);

    expect(available).toEqual(["protocol", "defects", "photos"]);
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

  it.each(["diary", "report", "attendance"] as const)(
    "disables the unsupported %s PDF instead of creating placeholder content",
    (type) => {
      const action = getExportCenterAction(type, "project-42");

      expect(action.kind).toBe("unavailable");
      if (action.kind === "unavailable") {
        expect(action.reason).toContain("nicht implementiert");
        expect(action.reason).toContain("kein Platzhalterdokument");
      }
    },
  );

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
