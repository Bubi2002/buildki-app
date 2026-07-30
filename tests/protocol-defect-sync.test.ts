import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const root = path.resolve(__dirname, "..");
const mockStorage: Record<string, string> = {};

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] || null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

vi.mock("@/lib/timeline-engine", () => ({
  timelineEngine: { emit: vi.fn(() => Promise.resolve()) },
}));

function protocolWithDefects(id: string, projectId: string, rows: string[]) {
  return {
    id,
    projectId,
    createdAt: "2026-07-30T10:00:00.000Z",
    transcription: rows.map((row) => row.split("|")[3]?.trim()).filter(Boolean).join(". "),
    protocol: [
      "# Baustellenprotokoll",
      "",
      "## Festgestellte Mängel",
      "",
      "| Nr. | Ort / Raum | Mangelbeschreibung | Gewerk | Priorität | Frist |",
      "|---|---|---|---|---|---|",
      ...rows,
    ].join("\n"),
  };
}

describe("protocol defect synchronization", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
  });

  it("extracts every defect row with location, trade, priority and exact date", async () => {
    const { extractProtocolDefectCandidates } = await import("../lib/protocol-defect-sync");
    const protocol = protocolWithDefects("protocol-a", "project-a", [
      "| 1 | EG, Raum 1 | Fenster fehlt | Fensterbau | Hoch | 05.08.2026 |",
      "| 2 | EG, Raum 2 | Tür ist beschädigt | Schreiner | Mittel | 08.08.2026 |",
    ]);

    const candidates = extractProtocolDefectCandidates(protocol.protocol, protocol.transcription);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      title: "Fenster fehlt",
      location: "EG, Raum 1",
      trade: "Fensterbau",
      priority: "hoch",
      dueDate: "2026-08-05",
    });
    expect(candidates[1]).toMatchObject({ title: "Tür ist beschädigt", priority: "mittel" });
  });

  it("does not duplicate table defects when the transcription uses a different word order", async () => {
    const { extractProtocolDefectCandidates } = await import("../lib/protocol-defect-sync");
    const protocol = protocolWithDefects("protocol-a", "project-a", [
      "| 1 | EG | Fenster fehlt | Fensterbau | Hoch | 05.08.2026 |",
      "| 2 | OG | Tür ist beschädigt | Schreiner | Mittel | 08.08.2026 |",
    ]);
    protocol.transcription = "Im Erdgeschoss fehlt das Fenster. Im Obergeschoss ist die Tür beschädigt.";

    const candidates = extractProtocolDefectCandidates(protocol.protocol, protocol.transcription);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.title)).toEqual(["Fenster fehlt", "Tür ist beschädigt"]);
  });

  it("stores defects from two protocols without losing either concurrent write", async () => {
    const { getDefects, getDefectStats } = await import("../lib/defect-store");
    const { syncProtocolDefects } = await import("../lib/protocol-defect-sync");
    const first = protocolWithDefects("protocol-1", "project-a", [
      "| 1 | EG | Fenster fehlt | Fensterbau | Hoch | 05.08.2026 |",
    ]);
    const second = protocolWithDefects("protocol-2", "project-a", [
      "| 1 | OG | Tür ist beschädigt | Schreiner | Mittel | 08.08.2026 |",
    ]);

    await Promise.all([syncProtocolDefects(first), syncProtocolDefects(second)]);
    const defects = await getDefects("project-a");

    expect(defects).toHaveLength(2);
    expect(new Set(defects.map((defect) => defect.protocolId))).toEqual(new Set(["protocol-1", "protocol-2"]));
    expect(defects.every((defect) => defect.source === "speech" && defect.analysisId === `protocol:${defect.protocolId}`)).toBe(true);
    expect(getDefectStats(defects).offen).toBe(2);
  });

  it("keeps equal defect titles from different protocols as separate source records", async () => {
    const { getDefects } = await import("../lib/defect-store");
    const { syncProtocolDefects } = await import("../lib/protocol-defect-sync");
    const first = protocolWithDefects("protocol-1", "project-a", [
      "| 1 | EG | Fenster fehlt | Fensterbau | Hoch | 05.08.2026 |",
    ]);
    const second = protocolWithDefects("protocol-2", "project-a", [
      "| 1 | EG | Fenster fehlt | Fensterbau | Hoch | 05.08.2026 |",
    ]);

    await syncProtocolDefects(first);
    await syncProtocolDefects(second);
    const defects = await getDefects("project-a");

    expect(defects).toHaveLength(2);
    expect(defects[0].id).not.toBe(defects[1].id);
  });

  it("is idempotent for repeated synchronization of the same protocol", async () => {
    const { getDefects } = await import("../lib/defect-store");
    const { syncProtocolDefects } = await import("../lib/protocol-defect-sync");
    const protocol = protocolWithDefects("protocol-1", "project-a", [
      "| 1 | EG | Fenster fehlt | Fensterbau | Hoch | 05.08.2026 |",
      "| 2 | OG | Tür ist beschädigt | Schreiner | Mittel | 08.08.2026 |",
    ]);

    const first = await syncProtocolDefects(protocol);
    const second = await syncProtocolDefects(protocol);

    expect(first.added).toBe(2);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(2);
    expect(await getDefects("project-a")).toHaveLength(2);
  });

  it("associates one matching legacy defect once and does not swallow the same title from a second protocol", async () => {
    const { getDefects, saveDefect } = await import("../lib/defect-store");
    const { syncProtocolDefects } = await import("../lib/protocol-defect-sync");
    await saveDefect({
      id: "legacy-defect",
      projectId: "project-a",
      title: "Fenster fehlt",
      description: "Fenster fehlt",
      status: "offen",
      priority: "hoch",
      category: "Sonstiges",
      photos: [],
      location: "EG",
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
      source: "manual",
    });

    const first = await syncProtocolDefects(protocolWithDefects("protocol-1", "project-a", [
      "| 1 | EG | Fenster fehlt | Fensterbau | Hoch | 05.08.2026 |",
    ]));
    const second = await syncProtocolDefects(protocolWithDefects("protocol-2", "project-a", [
      "| 1 | EG | Fenster fehlt | Fensterbau | Hoch | 05.08.2026 |",
    ]));
    const defects = await getDefects("project-a");

    expect(first.migrated).toBe(1);
    expect(second.added).toBe(1);
    expect(defects).toHaveLength(2);
    expect(defects.find((defect) => defect.id === "legacy-defect")?.protocolId).toBe("protocol-1");
  });

  it("backfills only protocols of the requested project", async () => {
    const { getDefects } = await import("../lib/defect-store");
    const { syncStoredProtocolDefects } = await import("../lib/protocol-defect-sync");
    mockStorage.protocols = JSON.stringify([
      protocolWithDefects("protocol-a", "project-a", ["| 1 | EG | Fenster fehlt | Fensterbau | Hoch | 05.08.2026 |"]),
      protocolWithDefects("protocol-b", "project-b", ["| 1 | OG | Tür ist beschädigt | Schreiner | Mittel | 08.08.2026 |"]),
    ]);

    await syncStoredProtocolDefects("project-a");

    expect(await getDefects("project-a")).toHaveLength(1);
    expect(await getDefects("project-b")).toHaveLength(0);
  });

  it("wires background creation, preview save, dashboard and defect list to the same sync module", () => {
    const backgroundSource = fs.readFileSync(path.join(root, "lib/background-processor.ts"), "utf8");
    const recordSource = fs.readFileSync(path.join(root, "app/(tabs)/record.tsx"), "utf8");
    const dashboardSource = fs.readFileSync(path.join(root, "app/(tabs)/index.tsx"), "utf8");
    const defectsSource = fs.readFileSync(path.join(root, "app/defects.tsx"), "utf8");

    expect(backgroundSource).toContain("await syncProtocolDefects(protocols[idx])");
    expect(recordSource).toContain("await syncProtocolDefects(newProtocol)");
    expect(dashboardSource).toContain("await syncStoredProtocolDefects(activeProjectId)");
    expect(defectsSource).toContain("await syncStoredProtocolDefects(projectId)");
  });
});
