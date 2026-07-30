import AsyncStorage from "@react-native-async-storage/async-storage";
import { importProtocolTemplates } from "./protocol-template-store";

const MARKETPLACE_KEY = "template-marketplace";
const SHARED_TEMPLATES_KEY = "shared-templates";

export type MarketplaceTemplate = {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  author: string;
  downloads: number;
  rating: number;
  category: "baustelle" | "buero" | "allgemein" | "technik" | "recht";
  tags: string[];
  createdAt: string;
  isCustom: true;
};

const SAMPLE_MARKETPLACE: MarketplaceTemplate[] = [
  {
    id: "mp-1",
    name: "Baustellenbegehung",
    icon: "construction",
    description: "Detaillierter Bericht für Baustellenbegehungen mit Mängelerfassung",
    systemPrompt: "Erstelle einen strukturierten Baustellenbegehungsbericht mit: 1. **Allgemeine Informationen** 2. **Baufortschritt** 3. **Festgestellte Mängel** 4. **Sicherheitsaspekte** 5. **Nächste Schritte**",
    author: "BuildKI Team",
    downloads: 1250,
    rating: 4.8,
    category: "baustelle",
    tags: ["Baustelle", "Begehung", "Mängel"],
    createdAt: "2025-01-15",
    isCustom: true,
  },
  {
    id: "mp-2",
    name: "Abnahmeprotokoll Plus",
    icon: "fact-check",
    description: "Erweiterte Abnahme mit Checkliste und Unterschriftenfeld",
    systemPrompt: "Erstelle ein formelles Abnahmeprotokoll mit: 1. **Projektdaten** 2. **Gewerk/Leistung** 3. **Prüfpunkte** 4. **Festgestellte Mängel** 5. **Vereinbarungen** 6. **Unterschriften**",
    author: "Architekturbüro Schmidt",
    downloads: 890,
    rating: 4.6,
    category: "baustelle",
    tags: ["Abnahme", "Formal", "Checkliste"],
    createdAt: "2025-02-20",
    isCustom: true,
  },
  {
    id: "mp-3",
    name: "Kundengespräch",
    icon: "groups",
    description: "Strukturierte Gesprächsnotiz für Kundenmeetings",
    systemPrompt: "Erstelle eine strukturierte Gesprächsnotiz mit: 1. **Teilnehmer** 2. **Besprochene Themen** 3. **Vereinbarungen** 4. **Offene Punkte** 5. **Nächster Termin**",
    author: "Business Templates",
    downloads: 2100,
    rating: 4.9,
    category: "buero",
    tags: ["Kunde", "Meeting", "Vertrieb"],
    createdAt: "2025-03-10",
    isCustom: true,
  },
  {
    id: "mp-4",
    name: "Technische Inspektion",
    icon: "engineering",
    description: "Inspektionsbericht für technische Anlagen und Geräte",
    systemPrompt: "Erstelle einen Inspektionsbericht mit: 1. **Anlage/Gerät** 2. **Zustand** 3. **Messwerte** 4. **Feststellungen** 5. **Empfehlungen** 6. **Nächste Inspektion**",
    author: "TechInspect GmbH",
    downloads: 670,
    rating: 4.5,
    category: "technik",
    tags: ["Inspektion", "Technik", "Wartung"],
    createdAt: "2025-04-05",
    isCustom: true,
  },
  {
    id: "mp-5",
    name: "Rechtliche Dokumentation",
    icon: "gavel",
    description: "Protokoll für rechtlich relevante Besprechungen",
    systemPrompt: "Erstelle ein rechtlich relevantes Protokoll mit: 1. **Sachverhalt** 2. **Beteiligte Parteien** 3. **Besprochene Punkte** 4. **Beschlüsse** 5. **Fristen** 6. **Rechtliche Hinweise**",
    author: "JuraDoc",
    downloads: 430,
    rating: 4.3,
    category: "recht",
    tags: ["Recht", "Dokumentation", "Formal"],
    createdAt: "2025-05-01",
    isCustom: true,
  },
  {
    id: "mp-6",
    name: "Sprint Retrospektive",
    icon: "loop",
    description: "Agile Retrospektive mit What went well / What to improve",
    systemPrompt: "Erstelle eine Sprint-Retrospektive mit: 1. **Sprint-Übersicht** 2. **Was lief gut** 3. **Was können wir verbessern** 4. **Action Items** 5. **Team-Stimmung**",
    author: "Agile Coach",
    downloads: 1800,
    rating: 4.7,
    category: "buero",
    tags: ["Agile", "Scrum", "Retrospektive"],
    createdAt: "2025-03-25",
    isCustom: true,
  },
];

export async function getMarketplaceTemplates(): Promise<MarketplaceTemplate[]> {
  try {
    const stored = await AsyncStorage.getItem(MARKETPLACE_KEY);
    if (stored) return JSON.parse(stored);
    // Initialize with samples
    await AsyncStorage.setItem(MARKETPLACE_KEY, JSON.stringify(SAMPLE_MARKETPLACE));
    return SAMPLE_MARKETPLACE;
  } catch { return SAMPLE_MARKETPLACE; }
}

export async function importTemplate(template: MarketplaceTemplate): Promise<void> {
  const imported = {
    ...template,
    id: `imported-${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: "marketplace" as const,
  };
  await importProtocolTemplates([imported]);
  // Update download count
  const marketplace = await getMarketplaceTemplates();
  const idx = marketplace.findIndex(t => t.id === template.id);
  if (idx >= 0) {
    marketplace[idx].downloads++;
    await AsyncStorage.setItem(MARKETPLACE_KEY, JSON.stringify(marketplace));
  }
}

export async function shareTemplate(template: {
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
}): Promise<MarketplaceTemplate> {
  const marketplace = await getMarketplaceTemplates();
  const shared: MarketplaceTemplate = {
    id: `shared-${Date.now()}`,
    name: template.name,
    icon: template.icon,
    description: template.description,
    systemPrompt: template.systemPrompt,
    author: "Mein Template",
    downloads: 0,
    rating: 0,
    category: "allgemein",
    tags: [],
    createdAt: new Date().toISOString(),
    isCustom: true,
  };
  marketplace.push(shared);
  await AsyncStorage.setItem(MARKETPLACE_KEY, JSON.stringify(marketplace));
  return shared;
}

export async function rateTemplate(templateId: string, rating: number): Promise<void> {
  const marketplace = await getMarketplaceTemplates();
  const idx = marketplace.findIndex(t => t.id === templateId);
  if (idx >= 0) {
    // Simple average simulation
    marketplace[idx].rating = Math.round(((marketplace[idx].rating * 10) + rating) / 11 * 10) / 10;
    await AsyncStorage.setItem(MARKETPLACE_KEY, JSON.stringify(marketplace));
  }
}
