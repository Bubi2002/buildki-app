import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  PROTOCOL_TEMPLATES,
  type ProtocolTemplate,
  type TemplateCategory,
} from "@/shared/templates";

export const CUSTOM_PROTOCOL_TEMPLATES_KEY = "custom-templates";

export type StoredProtocolTemplate = ProtocolTemplate & {
  isCustom: true;
  createdAt: string;
  source: "custom" | "import" | "marketplace";
  sourceCategory?: string;
  author?: string;
  tags?: string[];
};

const CATEGORY_ALIASES: Record<string, TemplateCategory> = {
  bau: "bau",
  baustelle: "bau",
  construction: "bau",
  technik: "bau",
  technical: "bau",
  meeting: "meeting",
  meetings: "meeting",
  besprechung: "meeting",
  buero: "meeting",
  büro: "meeting",
  office: "meeting",
  gutachten: "gutachten",
  bewertung: "gutachten",
  recht: "gutachten",
  legal: "gutachten",
  allgemein: "allgemein",
  general: "allgemein",
};

let templateStoreQueue: Promise<void> = Promise.resolve();

function runSerialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = templateStoreQueue.then(operation, operation);
  templateStoreQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeProtocolTemplateCategory(
  value: unknown,
  context = "",
): TemplateCategory {
  const rawCategory = normalizeToken(value);
  if (CATEGORY_ALIASES[rawCategory]) return CATEGORY_ALIASES[rawCategory];

  const searchable = `${rawCategory} ${context}`.toLowerCase();
  if (/recht|juristisch|gutachten|sachverständ|bewertung/.test(searchable)) return "gutachten";
  if (/meeting|besprech|sitzung|kunde|büro|buero|retro/.test(searchable)) return "meeting";
  if (/bau|technik|wartung|inspektion|abnahme|mängel|maengel/.test(searchable)) return "bau";
  return "allgemein";
}

function getTemplateCollection(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray((input as { templates?: unknown[] }).templates)) {
    return (input as { templates: unknown[] }).templates;
  }
  return [];
}

function getTemplateSignature(template: Pick<ProtocolTemplate, "name" | "systemPrompt">): string {
  return `${template.name.trim().toLowerCase()}|${template.systemPrompt.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

export function isBuiltInProtocolTemplate(templateId: string): boolean {
  return PROTOCOL_TEMPLATES.some((template) => template.id === templateId);
}

export function normalizeProtocolTemplate(
  input: unknown,
  index = 0,
): StoredProtocolTemplate | null {
  if (!input || typeof input !== "object") return null;

  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const systemPrompt = typeof raw.systemPrompt === "string" ? raw.systemPrompt.trim() : "";
  if (!name || !systemPrompt) return null;

  const rawId = typeof raw.id === "string" ? raw.id.trim() : "";
  const hash = stableHash(`${name}|${systemPrompt}|${index}`);
  const candidateId = rawId || `custom-${hash}`;
  const id = isBuiltInProtocolTemplate(candidateId)
    ? `custom-${candidateId}-${hash}`
    : candidateId;
  const sourceCategory = typeof raw.category === "string" ? raw.category : undefined;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string")
    : undefined;
  const author = typeof raw.author === "string" ? raw.author.trim() : undefined;
  const inferredSource = author || candidateId.startsWith("imported-")
    ? "marketplace"
    : rawId
      ? "import"
      : "custom";
  const source = raw.source === "marketplace" || raw.source === "import" || raw.source === "custom"
    ? raw.source
    : inferredSource;
  const context = [name, raw.description, author, ...(tags || [])]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return {
    id,
    name,
    icon: typeof raw.icon === "string" && raw.icon.trim() ? raw.icon.trim() : "description",
    description:
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : "Benutzerdefinierte Protokollvorlage",
    category: normalizeProtocolTemplateCategory(raw.category, context),
    systemPrompt,
    isCustom: true,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.trim()
        ? raw.createdAt
        : new Date(0).toISOString(),
    source,
    ...(sourceCategory ? { sourceCategory } : {}),
    ...(author ? { author } : {}),
    ...(tags ? { tags } : {}),
  };
}

export function normalizeCustomProtocolTemplates(input: unknown): StoredProtocolTemplate[] {
  const normalized: StoredProtocolTemplate[] = [];
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();

  getTemplateCollection(input).forEach((item, index) => {
    const template = normalizeProtocolTemplate(item, index);
    if (!template) return;

    const signature = getTemplateSignature(template);
    if (seenIds.has(template.id) || seenSignatures.has(signature)) return;
    seenIds.add(template.id);
    seenSignatures.add(signature);
    normalized.push(template);
  });

  return normalized;
}

export function mergeCustomProtocolTemplates(
  existingInput: unknown,
  incomingInput: unknown,
): StoredProtocolTemplate[] {
  const merged = normalizeCustomProtocolTemplates(existingInput);
  const signatures = new Set(merged.map(getTemplateSignature));
  const ids = new Set(merged.map((template) => template.id));

  normalizeCustomProtocolTemplates(incomingInput).forEach((incoming) => {
    const signature = getTemplateSignature(incoming);
    if (signatures.has(signature)) return;

    let template = incoming;
    if (ids.has(template.id)) {
      template = {
        ...template,
        id: `${template.id}-${stableHash(signature)}`,
      };
    }
    signatures.add(signature);
    ids.add(template.id);
    merged.push(template);
  });

  return merged;
}

async function readCustomTemplates(): Promise<{ raw: unknown; normalized: StoredProtocolTemplate[] }> {
  const stored = await AsyncStorage.getItem(CUSTOM_PROTOCOL_TEMPLATES_KEY);
  if (!stored) return { raw: [], normalized: [] };

  const raw = JSON.parse(stored) as unknown;
  return { raw, normalized: normalizeCustomProtocolTemplates(raw) };
}

export async function loadCustomProtocolTemplates(): Promise<StoredProtocolTemplate[]> {
  return runSerialized(async () => {
    const { raw, normalized } = await readCustomTemplates();
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await AsyncStorage.setItem(CUSTOM_PROTOCOL_TEMPLATES_KEY, JSON.stringify(normalized));
    }
    return normalized;
  });
}

export async function saveCustomProtocolTemplates(input: unknown): Promise<StoredProtocolTemplate[]> {
  return runSerialized(async () => {
    const normalized = normalizeCustomProtocolTemplates(input);
    await AsyncStorage.setItem(CUSTOM_PROTOCOL_TEMPLATES_KEY, JSON.stringify(normalized));
    return normalized;
  });
}

export async function importProtocolTemplates(input: unknown): Promise<StoredProtocolTemplate[]> {
  return runSerialized(async () => {
    const { normalized: existing } = await readCustomTemplates();
    const merged = mergeCustomProtocolTemplates(existing, input);
    await AsyncStorage.setItem(CUSTOM_PROTOCOL_TEMPLATES_KEY, JSON.stringify(merged));
    return merged;
  });
}

export async function upsertCustomProtocolTemplate(input: unknown): Promise<StoredProtocolTemplate> {
  return runSerialized(async () => {
    const normalized = normalizeProtocolTemplate(input);
    if (!normalized) throw new Error("Ungültige Protokollvorlage");

    const { normalized: existing } = await readCustomTemplates();
    const index = existing.findIndex((template) => template.id === normalized.id);
    if (index >= 0) existing[index] = normalized;
    else existing.push(normalized);
    const cleaned = normalizeCustomProtocolTemplates(existing);
    await AsyncStorage.setItem(CUSTOM_PROTOCOL_TEMPLATES_KEY, JSON.stringify(cleaned));
    return cleaned.find((template) => template.id === normalized.id) || normalized;
  });
}

export async function removeCustomProtocolTemplate(templateId: string): Promise<StoredProtocolTemplate[]> {
  return runSerialized(async () => {
    const { normalized: existing } = await readCustomTemplates();
    const updated = existing.filter((template) => template.id !== templateId);
    await AsyncStorage.setItem(CUSTOM_PROTOCOL_TEMPLATES_KEY, JSON.stringify(updated));
    return updated;
  });
}

export async function getAllProtocolTemplates(): Promise<ProtocolTemplate[]> {
  const customTemplates = await loadCustomProtocolTemplates();
  return [...PROTOCOL_TEMPLATES, ...customTemplates];
}

export async function resolveProtocolTemplate(templateId?: string | null): Promise<ProtocolTemplate> {
  const templates = await getAllProtocolTemplates();
  return (
    templates.find((template) => template.id === templateId) ||
    PROTOCOL_TEMPLATES[PROTOCOL_TEMPLATES.length - 1]
  );
}

export function getCustomTemplateGenerationInput(template: ProtocolTemplate): {
  customSystemPrompt?: string;
  customTemplateName?: string;
} {
  if (isBuiltInProtocolTemplate(template.id)) return {};
  return {
    customSystemPrompt: template.systemPrompt,
    customTemplateName: template.name,
  };
}
