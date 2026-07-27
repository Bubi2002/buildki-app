import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  linkPlanPinToProtocol,
  normalizePlanPinText,
  parseProjectProtocolReferences,
  updatePlanPinText,
} from "../lib/floor-plan-pin-actions";
import type { PlanPin } from "../lib/floor-plan-store";

const basePin: PlanPin = {
  id: "pin-protocol-1",
  planId: "plan-1",
  projectId: "project-a",
  x: 0.35,
  y: 0.62,
  type: "protocol",
  label: "Test",
  description: "Erster Text",
  color: "#4CAF50",
  createdAt: "2026-07-27T12:00:00.000Z",
};

describe("floor-plan protocol pin actions", () => {
  it("normalizes visible legacy escapes in stored pin content", () => {
    const normalized = normalizePlanPinText({
      ...basePin,
      label: String.raw`Pr\u00fcfung`,
      description: String.raw`Punkt \u2022 erledigt`,
      protocolTitle: String.raw`T\u00fcrenprotokoll`,
    });

    expect(normalized.label).toBe("Prüfung");
    expect(normalized.description).toBe("Punkt • erledigt");
    expect(normalized.protocolTitle).toBe("Türenprotokoll");
  });

  it("edits and trims title and protocol text without losing pin metadata", () => {
    const updated = updatePlanPinText(
      basePin,
      String.raw`  Pr\u00fcfprotokoll  `,
      String.raw`  T\u00fcr kontrolliert  `,
    );

    expect(updated).toMatchObject({
      id: basePin.id,
      planId: basePin.planId,
      type: "protocol",
      label: "Prüfprotokoll",
      description: "Tür kontrolliert",
      x: basePin.x,
      y: basePin.y,
    });
  });

  it("links a real project protocol to the existing marker", () => {
    const linked = linkPlanPinToProtocol(basePin, {
      id: "protocol-42",
      title: String.raw`Baustellenbegehung \u2022 KG`,
    });

    expect(linked.protocolId).toBe("protocol-42");
    expect(linked.protocolTitle).toBe("Baustellenbegehung • KG");
    expect(linked.label).toBe(basePin.label);
  });

  it("offers only protocols from the same project, newest first", () => {
    const parsed = parseProjectProtocolReferences(JSON.stringify([
      {
        id: "old",
        projectId: "project-a",
        title: String.raw`Alt \u2022 KG`,
        createdAt: "2026-07-20T10:00:00.000Z",
        protocolNumber: "BST-001",
      },
      {
        id: "other-project",
        projectId: "project-b",
        title: "Fremdes Projekt",
        createdAt: "2026-07-27T10:00:00.000Z",
      },
      {
        id: "new",
        projectId: "project-a",
        title: String.raw`Neu Pr\u00fcfung`,
        createdAt: "2026-07-27T09:00:00.000Z",
        protocolNumber: "BST-002",
      },
    ]), "project-a");

    expect(parsed.map((protocol) => protocol.id)).toEqual(["new", "old"]);
    expect(parsed.map((protocol) => protocol.title)).toEqual(["Neu Prüfung", "Alt • KG"]);
  });

  it("keeps edit, link, create and open actions wired in the floor-plan flow", () => {
    const floorPlanSource = readFileSync(
      fileURLToPath(new URL("../app/floor-plan.tsx", import.meta.url)),
      "utf8",
    );
    const recordSource = readFileSync(
      fileURLToPath(new URL("../app/(tabs)/record.tsx", import.meta.url)),
      "utf8",
    );

    expect(floorPlanSource).toContain("saveEditedPin");
    expect(floorPlanSource).toContain("showProtocolsForPin");
    expect(floorPlanSource).toContain("linkProtocolToPin");
    expect(floorPlanSource).toContain("createProtocolForPin");
    expect(floorPlanSource).toContain("openLinkedProtocol");
    expect(floorPlanSource).toContain("t('protokoll_hinzufuegen')");
    expect(floorPlanSource).toContain("t('markierung_bearbeiten')");
    expect(floorPlanSource).toContain("t('fotos_hinzufuegen')");
    expect(recordSource).toContain("planPinId: routePlanPinId");
    expect(recordSource).toContain("linkStoredPlanPinToProtocol(routePlanPinId");
  });
});
