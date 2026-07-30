import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("custom protocol template end-to-end wiring", () => {
  it("reloads normalized custom templates when recording gains focus", () => {
    const source = readSource("app/(tabs)/record.tsx");
    expect(source).toContain("useFocusEffect(");
    expect(source).toContain("loadCustomProtocolTemplates()");
    expect(source).toContain("const allAvailable = [...PROTOCOL_TEMPLATES, ...templates]");
    expect(source).toContain("setCustomTemplates(templates)");
  });

  it("carries the custom prompt through online and offline processing", () => {
    const recordSource = readSource("app/(tabs)/record.tsx");
    const queueSource = readSource("lib/offline-queue.ts");
    const processorSource = readSource("lib/background-processor.ts");
    const offlineSyncSource = readSource("lib/offline-sync-manager.ts");

    expect(recordSource).toContain("getCustomTemplateGenerationInput(selectedTemplate)");
    expect(recordSource).toContain("templateSystemPrompt: customTemplateInput.customSystemPrompt");
    expect(queueSource).toContain("templateSystemPrompt?: string");
    expect(processorSource).toContain("job.templateSystemPrompt");
    expect(offlineSyncSource).toContain("customSystemPrompt, customTemplateName");
  });

  it("lets the server use and name a custom prompt instead of falling back to freitext", () => {
    const source = readSource("server/routers.ts");
    expect(source).toContain("customSystemPrompt: z.string().trim().min(1).max(12000).optional()");
    expect(source).toContain("const templatePrompt = input.customSystemPrompt || template.systemPrompt");
    expect(source).toContain("templateName: input.customTemplateName || template.name");
  });

  it("uses the same normalized template collection for protocol regeneration", () => {
    const source = readSource("app/protocol-detail.tsx");
    expect(source).toContain("setAvailableTemplates(await getAllProtocolTemplates())");
    expect(source).toContain("getCustomTemplateGenerationInput(selectedTemplate)");
    expect(source).toContain("...customTemplateInput");
  });
});
