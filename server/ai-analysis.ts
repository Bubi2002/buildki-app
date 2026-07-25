/**
 * protoKI – Modulare KI-Analyse-Engine
 * 
 * Zentrale Analyse-Pipeline für verschiedene Datenquellen:
 * - Fotos (Baustellenfotos, Mängelfotos)
 * - Sprache (via Transkription → Text-Analyse)
 * - Dokumente (PDFs, Pläne) [Phase 2]
 * - Matterport (Panoramen) [nach Produktionsfreigabe]
 * - IFC/BIM [Phase 3]
 * 
 * Alle Quellen nutzen dieselbe strukturierte JSON-Ausgabe.
 */

import { invokeLLM } from "./_core/llm";
import { storagePut , storageGetSignedUrl } from "./storage";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AnalysisSource = "photo" | "audio" | "document" | "matterport" | "ifc";

export type SeverityLevel = "critical" | "major" | "minor" | "cosmetic";
export type DefectStatus = "open" | "confirmed" | "in_progress" | "resolved" | "rejected";
export type TaskPriority = "high" | "medium" | "low";

export interface DetectedDefect {
  id: string;
  title: string;
  description: string;
  severity: SeverityLevel;
  trade: string;
  location: string;
  suggestedAction: string;
  confidence: number;
}

export interface DetectedTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  trade: string;
  estimatedDuration: string;
  deadline: string | null;
}

export interface ProgressAssessment {
  overallPercent: number;
  phase: string;
  completedTrades: string[];
  activeTrades: string[];
  pendingTrades: string[];
}

export interface AnalysisResult {
  id: string;
  source: AnalysisSource;
  timestamp: string;
  projectId: string;
  summary: string;
  progress: ProgressAssessment;
  defects: DetectedDefect[];
  tasks: DetectedTask[];
  observations: string[];
  rawResponse?: string;
}

// ─── JSON Schema for structured LLM output ───────────────────────────────────

const CONSTRUCTION_ANALYSIS_SCHEMA = {
  type: "object" as const,
  properties: {
    summary: {
      type: "string" as const,
      description: "Kurze Zusammenfassung der Analyse (2-3 Sätze)",
    },
    progress: {
      type: "object" as const,
      properties: {
        overallPercent: { type: "number" as const, description: "Geschätzter Baufortschritt in Prozent (0-100)" },
        phase: { type: "string" as const, description: "Aktuelle Bauphase (z.B. Rohbau, Ausbau, Feinarbeiten)" },
        completedTrades: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Abgeschlossene Gewerke",
        },
        activeTrades: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Aktuell aktive Gewerke",
        },
        pendingTrades: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Noch ausstehende Gewerke",
        },
      },
      required: ["overallPercent", "phase", "completedTrades", "activeTrades", "pendingTrades"] as const,
      additionalProperties: false as const,
    },
    defects: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          title: { type: "string" as const, description: "Kurzer Titel des Mangels" },
          description: { type: "string" as const, description: "Detaillierte Beschreibung" },
          severity: { type: "string" as const, enum: ["critical", "major", "minor", "cosmetic"] },
          trade: { type: "string" as const, description: "Zuständiges Gewerk" },
          location: { type: "string" as const, description: "Ort/Raum des Mangels" },
          suggestedAction: { type: "string" as const, description: "Empfohlene Maßnahme" },
          confidence: { type: "number" as const, description: "Konfidenz 0.0-1.0" },
        },
        required: ["id", "title", "description", "severity", "trade", "location", "suggestedAction", "confidence"] as const,
        additionalProperties: false as const,
      },
      description: "Erkannte Mängel",
    },
    tasks: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          title: { type: "string" as const },
          description: { type: "string" as const },
          priority: { type: "string" as const, enum: ["high", "medium", "low"] },
          trade: { type: "string" as const },
          estimatedDuration: { type: "string" as const, description: "Geschätzte Dauer (z.B. '2 Stunden', '1 Tag')" },
          deadline: { type: ["string", "null"] as const, description: "Empfohlene Frist oder null" },
        },
        required: ["id", "title", "description", "priority", "trade", "estimatedDuration", "deadline"] as const,
        additionalProperties: false as const,
      },
      description: "Abgeleitete Aufgaben",
    },
    observations: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Allgemeine Beobachtungen und Hinweise",
    },
  },
  required: ["summary", "progress", "defects", "tasks", "observations"] as const,
  additionalProperties: false as const,
};

// ─── System Prompt ───────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT = `Du bist ein erfahrener Bauleiter und KI-Assistent für Baustellenanalyse.

Deine Aufgabe ist es, Baustellenfotos zu analysieren und strukturierte Informationen zu liefern.

Analysiere das Bild und identifiziere:
1. **Baufortschritt**: Schätze den Gesamtfortschritt und identifiziere aktive/abgeschlossene/ausstehende Gewerke
2. **Mängel**: Erkenne sichtbare Mängel, Schäden oder Qualitätsprobleme
3. **Aufgaben**: Leite notwendige Maßnahmen und Aufgaben ab
4. **Beobachtungen**: Notiere allgemeine Beobachtungen zur Baustelle

Wichtige Regeln:
- Sei präzise und fachlich korrekt
- Verwende deutsche Fachbegriffe aus dem Bauwesen
- Schätze den Baufortschritt realistisch ein
- Bewerte Mängel nach Schweregrad (critical, major, minor, cosmetic)
- Gib für jeden Mangel das zuständige Gewerk an
- Generiere eindeutige IDs im Format "def_001", "task_001" etc.
- Konfidenz-Werte zwischen 0.0 und 1.0 angeben
- Wenn etwas nicht erkennbar ist, lieber weglassen als raten

Kontext zum Projekt (falls vorhanden):
`;

// ─── Core Analysis Function ──────────────────────────────────────────────────

export interface AnalyzePhotoInput {
  imageUrls: string[];  // Storage URLs (relative /manus-storage/... or absolute)
  projectId: string;
  projectName?: string;
  roomName?: string;
  additionalContext?: string;
}

export async function analyzeConstructionPhoto(input: AnalyzePhotoInput): Promise<AnalysisResult> {
  const { imageUrls, projectId, projectName, roomName, additionalContext } = input;

  // Resolve storage URLs to signed URLs for LLM access
  const resolvedUrls: string[] = [];
  for (const url of imageUrls) {
    if (url.startsWith("/manus-storage/")) {
      // Get a signed URL that the LLM can access
      const key = url.replace("/manus-storage/", "");
      const signedUrl = await storageGetSignedUrl(key);
      resolvedUrls.push(signedUrl);
    } else if (url.startsWith("data:image/")) {
      // Base64 data URL - pass directly
      resolvedUrls.push(url);
    } else {
      resolvedUrls.push(url);
    }
  }

  // Build context string
  let context = "";
  if (projectName) context += `Projekt: ${projectName}\n`;
  if (roomName) context += `Raum/Bereich: ${roomName}\n`;
  if (additionalContext) context += `Zusätzlicher Kontext: ${additionalContext}\n`;

  // Build message content with images
  const content: any[] = [
    {
      type: "text",
      text: `Analysiere ${imageUrls.length > 1 ? "diese Baustellenfotos" : "dieses Baustellenfoto"} und liefere eine strukturierte Analyse.${context ? `\n\nKontext:\n${context}` : ""}`,
    },
    ...resolvedUrls.map((url) => ({
      type: "image_url",
      image_url: { url, detail: "high" as const },
    })),
  ];

  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT + context },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "construction_analysis",
        strict: true,
        schema: CONSTRUCTION_ANALYSIS_SCHEMA,
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
    // Fallback: try to extract JSON from markdown code block
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error("KI-Antwort konnte nicht als JSON geparst werden");
    }
  }

  const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: analysisId,
    source: "photo",
    timestamp: new Date().toISOString(),
    projectId,
    summary: parsed.summary || "Keine Zusammenfassung verfügbar",
    progress: parsed.progress || {
      overallPercent: 0,
      phase: "Unbekannt",
      completedTrades: [],
      activeTrades: [],
      pendingTrades: [],
    },
    defects: (parsed.defects || []).map((d: any) => ({
      ...d,
      confidence: Math.min(1, Math.max(0, d.confidence || 0.5)),
    })),
    tasks: parsed.tasks || [],
    observations: parsed.observations || [],
    rawResponse: rawContent as string,
  };
}

// ─── Upload helper for photos from the app ───────────────────────────────────

export async function uploadAnalysisPhoto(
  base64: string,
  mimeType: string,
  filename: string,
): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const sizeMB = buffer.length / (1024 * 1024);
  
  if (sizeMB > 20) {
    throw new Error(`Foto zu groß: ${sizeMB.toFixed(1)}MB (max 20MB)`);
  }

  const key = `analysis-photos/${Date.now()}-${filename}`;
  const { url } = await storagePut(key, buffer, mimeType);
  return url;
}
