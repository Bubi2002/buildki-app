/**
 * protoKI – KI-Baustellenassistent
 * 
 * Intelligente Analyse von Protokollen und Projektdaten.
 * Erkennt fehlende Gewerke, fehlende Fotos, fehlende Prüfungen,
 * macht automatische Vorschläge und fasst offene Punkte zusammen.
 */
import { invokeLLM } from "./_core/llm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProtocolAnalysisInput {
  protocolText: string;
  projectName: string;
  roomName?: string;
  existingDefects?: string[];
  existingPhotos?: number;
  existingTrades?: string[];
  previousProtocols?: string[];
  projectPhase?: string;
}

export interface MissingItem {
  category: "gewerk" | "foto" | "pruefung" | "dokument" | "sicherheit";
  title: string;
  description: string;
  priority: "hoch" | "mittel" | "niedrig";
  suggestedAction: string;
}

export interface AIRecommendation {
  type: "warnung" | "empfehlung" | "erinnerung" | "risiko";
  title: string;
  description: string;
  priority: "hoch" | "mittel" | "niedrig";
  relatedTrade?: string;
}

export interface OpenPoint {
  title: string;
  description: string;
  source: string; // Which protocol it came from
  daysOpen: number;
  priority: "hoch" | "mittel" | "niedrig";
}

export interface ConstructionAssistantResult {
  missingItems: MissingItem[];
  recommendations: AIRecommendation[];
  openPoints: OpenPoint[];
  summary: string;
  riskLevel: "niedrig" | "mittel" | "hoch" | "kritisch";
  nextSteps: string[];
  completenessScore: number; // 0-100
}

// ─── Standard Checklists ─────────────────────────────────────────────────────

const STANDARD_TRADES = [
  "Rohbau", "Mauerwerk", "Beton", "Zimmerer", "Dachdecker",
  "Fenster/Türen", "Fassade", "Trockenbau", "Estrich", "Fliesen",
  "Maler", "Bodenbelag", "Elektro", "Sanitär", "Heizung",
  "Lüftung/Klima", "Aufzug", "Brandschutz", "Außenanlagen",
];

const STANDARD_INSPECTIONS = [
  "Bewehrungsabnahme", "Rohinstallation Elektro", "Rohinstallation Sanitär",
  "Rohinstallation Heizung", "Dichtheitsprüfung", "Brandschutzabnahme",
  "Schallschutzprüfung", "Blower-Door-Test", "Estrich-Belegreife",
  "Aufmaß", "Zwischenabnahme", "Endabnahme", "TÜV-Prüfung",
  "Druckprüfung Heizung", "Funktionsprüfung Lüftung",
];

// ─── Analysis Schema ─────────────────────────────────────────────────────────

const ASSISTANT_SCHEMA = {
  type: "object" as const,
  properties: {
    missingItems: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          category: { type: "string" as const, enum: ["gewerk", "foto", "pruefung", "dokument", "sicherheit"] },
          title: { type: "string" as const },
          description: { type: "string" as const },
          priority: { type: "string" as const, enum: ["hoch", "mittel", "niedrig"] },
          suggestedAction: { type: "string" as const },
        },
        required: ["category", "title", "description", "priority", "suggestedAction"] as const,
        additionalProperties: false as const,
      },
    },
    recommendations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          type: { type: "string" as const, enum: ["warnung", "empfehlung", "erinnerung", "risiko"] },
          title: { type: "string" as const },
          description: { type: "string" as const },
          priority: { type: "string" as const, enum: ["hoch", "mittel", "niedrig"] },
          relatedTrade: { type: "string" as const },
        },
        required: ["type", "title", "description", "priority", "relatedTrade"] as const,
        additionalProperties: false as const,
      },
    },
    openPoints: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          title: { type: "string" as const },
          description: { type: "string" as const },
          source: { type: "string" as const },
          daysOpen: { type: "number" as const },
          priority: { type: "string" as const, enum: ["hoch", "mittel", "niedrig"] },
        },
        required: ["title", "description", "source", "daysOpen", "priority"] as const,
        additionalProperties: false as const,
      },
    },
    summary: { type: "string" as const },
    riskLevel: { type: "string" as const, enum: ["niedrig", "mittel", "hoch", "kritisch"] },
    nextSteps: {
      type: "array" as const,
      items: { type: "string" as const },
    },
    completenessScore: { type: "number" as const },
  },
  required: ["missingItems", "recommendations", "openPoints", "summary", "riskLevel", "nextSteps", "completenessScore"] as const,
  additionalProperties: false as const,
};

// ─── System Prompt ───────────────────────────────────────────────────────────

const ASSISTANT_SYSTEM_PROMPT = `Du bist ein erfahrener Bauleiter-Assistent mit 20+ Jahren Erfahrung.
Deine Aufgabe ist es, Baustellenprotokolle intelligent zu analysieren und proaktiv auf Probleme hinzuweisen.

Du analysierst:
1. **Fehlende Gewerke**: Welche Gewerke wurden im Protokoll erwähnt, welche fehlen für die aktuelle Bauphase?
2. **Fehlende Fotos**: Wurden kritische Bereiche fotografisch dokumentiert? Fehlen Beweisfotos?
3. **Fehlende Prüfungen**: Welche Abnahmen/Prüfungen stehen an oder wurden vergessen?
4. **Sicherheitsrisiken**: Gibt es Hinweise auf Sicherheitsprobleme?
5. **Dokumentationslücken**: Fehlen wichtige Dokumente oder Nachweise?

Empfehlungen:
- Gib konkrete, umsetzbare Empfehlungen
- Priorisiere nach Dringlichkeit (hoch/mittel/niedrig)
- Weise auf Risiken hin, die aus dem Protokoll ableitbar sind
- Schlage nächste Schritte vor
- Bewerte die Vollständigkeit der Dokumentation (0-100%)

Risikolevel:
- niedrig: Alles dokumentiert, keine offenen Punkte
- mittel: Kleinere Lücken, aber nichts Kritisches
- hoch: Wichtige Prüfungen/Dokumentation fehlt
- kritisch: Sicherheitsrelevante Mängel oder gravierende Dokumentationslücken

Standard-Gewerke im Hochbau: ${STANDARD_TRADES.join(", ")}
Standard-Prüfungen: ${STANDARD_INSPECTIONS.join(", ")}

Antworte IMMER auf Deutsch. Sei fachlich präzise und verwende Bau-Fachbegriffe.`;

// ─── Core Analysis Function ──────────────────────────────────────────────────

export async function analyzeProtocol(input: ProtocolAnalysisInput): Promise<ConstructionAssistantResult> {
  const { protocolText, projectName, roomName, existingDefects, existingPhotos, existingTrades, previousProtocols, projectPhase } = input;

  let contextInfo = `Projekt: ${projectName}\n`;
  if (roomName) contextInfo += `Raum/Bereich: ${roomName}\n`;
  if (projectPhase) contextInfo += `Aktuelle Bauphase: ${projectPhase}\n`;
  if (existingPhotos !== undefined) contextInfo += `Vorhandene Fotos: ${existingPhotos}\n`;
  if (existingTrades && existingTrades.length > 0) contextInfo += `Bereits dokumentierte Gewerke: ${existingTrades.join(", ")}\n`;
  if (existingDefects && existingDefects.length > 0) contextInfo += `Bekannte offene Mängel: ${existingDefects.join("; ")}\n`;
  if (previousProtocols && previousProtocols.length > 0) {
    contextInfo += `\nVorherige Protokolle (Zusammenfassungen):\n`;
    previousProtocols.forEach((p, i) => {
      contextInfo += `- Protokoll ${i + 1}: ${p.slice(0, 200)}...\n`;
    });
  }

  const userMessage = `Analysiere folgendes Baustellenprotokoll und identifiziere fehlende Gewerke, fehlende Fotos, fehlende Prüfungen, Risiken und offene Punkte.

Kontext:
${contextInfo}

Protokolltext:
${protocolText}`;

  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    messages: [
      { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "construction_assistant_analysis",
        strict: true,
        schema: ASSISTANT_SCHEMA,
      },
    },
    max_tokens: 4096,
  });

  const messageContent = response.choices?.[0]?.message?.content;
  const rawContent: string = typeof messageContent === "string" ? messageContent : JSON.stringify(messageContent) || "{}";

  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error("KI-Antwort konnte nicht geparst werden");
    }
  }

  return {
    missingItems: parsed.missingItems || [],
    recommendations: parsed.recommendations || [],
    openPoints: parsed.openPoints || [],
    summary: parsed.summary || "Keine Zusammenfassung verfügbar",
    riskLevel: parsed.riskLevel || "mittel",
    nextSteps: parsed.nextSteps || [],
    completenessScore: Math.min(100, Math.max(0, parsed.completenessScore || 50)),
  };
}
