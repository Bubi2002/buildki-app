import { describe, expect, it } from "vitest";

import {
  getCustomTemplateGenerationInput,
  mergeCustomProtocolTemplates,
  normalizeCustomProtocolTemplates,
  normalizeProtocolTemplate,
  normalizeProtocolTemplateCategory,
} from "../lib/protocol-template-store";
import { PROTOCOL_TEMPLATES } from "../shared/templates";

const marketplaceTemplate = {
  id: "imported-legal",
  name: "Rechtliche Dokumentation",
  icon: "gavel",
  description: "Protokoll für rechtlich relevante Besprechungen",
  systemPrompt: "Erstelle ein rechtlich relevantes Protokoll mit Sachverhalt und Fristen.",
  author: "JuraDoc",
  category: "recht",
  createdAt: "2026-07-31T00:00:00.000Z",
  isCustom: true,
};

describe("protocol template store contract", () => {
  it("maps marketplace categories into the protocol taxonomy", () => {
    expect(normalizeProtocolTemplateCategory("baustelle")).toBe("bau");
    expect(normalizeProtocolTemplateCategory("technik")).toBe("bau");
    expect(normalizeProtocolTemplateCategory("buero")).toBe("meeting");
    expect(normalizeProtocolTemplateCategory("recht")).toBe("gutachten");
    expect(normalizeProtocolTemplateCategory("allgemein")).toBe("allgemein");
  });

  it("normalizes an imported marketplace template into a selectable protocol template", () => {
    const normalized = normalizeProtocolTemplate(marketplaceTemplate);

    expect(normalized).toMatchObject({
      id: "imported-legal",
      name: "Rechtliche Dokumentation",
      category: "gutachten",
      source: "marketplace",
      sourceCategory: "recht",
    });
  });

  it("rejects malformed imports and removes exact duplicates", () => {
    const normalized = normalizeCustomProtocolTemplates([
      marketplaceTemplate,
      { ...marketplaceTemplate, id: "another-id" },
      { id: "missing-prompt", name: "Ungültig" },
    ]);

    expect(normalized).toHaveLength(1);
  });

  it("preserves distinct templates when imported IDs collide", () => {
    const merged = mergeCustomProtocolTemplates(
      [marketplaceTemplate],
      [{ ...marketplaceTemplate, name: "Andere Vorlage", systemPrompt: "Anderer Prompt" }],
    );

    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((template) => template.id)).size).toBe(2);
  });

  it("sends a prompt only for custom templates", () => {
    const custom = normalizeProtocolTemplate(marketplaceTemplate);
    expect(custom).not.toBeNull();
    expect(getCustomTemplateGenerationInput(custom!)).toEqual({
      customSystemPrompt: marketplaceTemplate.systemPrompt,
      customTemplateName: marketplaceTemplate.name,
    });
    expect(getCustomTemplateGenerationInput(PROTOCOL_TEMPLATES[0])).toEqual({});
  });
});
