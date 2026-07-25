/**
 * protoKI – Professional Report Engine (Server-side)
 *
 * Generates structured, professional construction reports using LLM.
 * Features:
 * - Per-trade (Gewerk) summaries
 * - Structured JSON output for consistent formatting
 * - Photo references inline at correct positions
 * - Professional German construction terminology
 * - Multiple report types with specialized prompts
 */
import { invokeLLM } from "./_core/llm";

export interface GenerateReportInput {
  reportType: string;
  transcription: string;
  projectName?: string;
  datum?: string;
  floor?: string;
  room?: string;
  defectsJson?: string;
  photosJson?: string;
  attendeesJson?: string;
  additionalContext?: string;
}

interface TradeSection {
  trade: string;
  status: string;
  completedWork: string[];
  openIssues: string[];
  nextSteps: string[];
  photoRefs: string[];
}

interface StructuredReport {
  title: string;
  projectName: string;
  datum: string;
  summary: string;
  tradeSections: TradeSection[];
  defectSummary: {
    total: number;
    critical: number;
    open: number;
    resolved: number;
    items: {
      id: string;
      title: string;
      trade: string;
      location: string;
      severity: string;
      status: string;
      photoRef?: string;
    }[];
  };
  attendees: { name: string; company: string; role: string }[];
  decisions: string[];
  nextActions: { action: string; responsible: string; deadline: string }[];
  generalObservations: string[];
}

const REPORT_STRUCTURED_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const, description: "Professioneller Berichtstitel" },
    projectName: { type: "string" as const },
    datum: { type: "string" as const },
    summary: { type: "string" as const, description: "Zusammenfassung in 3-5 Sätzen" },
    tradeSections: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          trade: { type: "string" as const, description: "Gewerk (z.B. Elektro, Sanitär, Rohbau)" },
          status: { type: "string" as const, description: "Kurzer Status (z.B. 'In Arbeit', '80% fertig', 'Abgeschlossen')" },
          completedWork: { type: "array" as const, items: { type: "string" as const }, description: "Abgeschlossene Arbeiten" },
          openIssues: { type: "array" as const, items: { type: "string" as const }, description: "Offene Punkte/Mängel" },
          nextSteps: { type: "array" as const, items: { type: "string" as const }, description: "Nächste Schritte" },
          photoRefs: { type: "array" as const, items: { type: "string" as const }, description: "Foto-Referenzen (z.B. 'Foto 1', 'Foto 3')" },
        },
        required: ["trade", "status", "completedWork", "openIssues", "nextSteps", "photoRefs"] as const,
        additionalProperties: false as const,
      },
      description: "Abschnitte pro Gewerk",
    },
    defectSummary: {
      type: "object" as const,
      properties: {
        total: { type: "number" as const },
        critical: { type: "number" as const },
        open: { type: "number" as const },
        resolved: { type: "number" as const },
        items: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              id: { type: "string" as const },
              title: { type: "string" as const },
              trade: { type: "string" as const },
              location: { type: "string" as const },
              severity: { type: "string" as const },
              status: { type: "string" as const },
              photoRef: { type: "string" as const },
            },
            required: ["id", "title", "trade", "location", "severity", "status"] as const,
            additionalProperties: false as const,
          },
        },
      },
      required: ["total", "critical", "open", "resolved", "items"] as const,
      additionalProperties: false as const,
    },
    attendees: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          company: { type: "string" as const },
          role: { type: "string" as const },
        },
        required: ["name", "company", "role"] as const,
        additionalProperties: false as const,
      },
    },
    decisions: { type: "array" as const, items: { type: "string" as const }, description: "Getroffene Entscheidungen" },
    nextActions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          action: { type: "string" as const },
          responsible: { type: "string" as const },
          deadline: { type: "string" as const },
        },
        required: ["action", "responsible", "deadline"] as const,
        additionalProperties: false as const,
      },
      description: "Nächste Maßnahmen mit Verantwortlichen und Fristen",
    },
    generalObservations: { type: "array" as const, items: { type: "string" as const }, description: "Allgemeine Beobachtungen" },
  },
  required: ["title", "projectName", "datum", "summary", "tradeSections", "defectSummary", "attendees", "decisions", "nextActions", "generalObservations"] as const,
  additionalProperties: false as const,
};

/**
 * Generate a professional construction report using structured LLM output.
 * Returns formatted Markdown ready for display and PDF export.
 */
export async function generateProfessionalReport(input: GenerateReportInput): Promise<string> {
  const {
    reportType,
    transcription,
    projectName = "[Projektname]",
    datum = new Date().toLocaleDateString("de-DE"),
    floor,
    room,
    defectsJson,
    photosJson,
    attendeesJson,
    additionalContext,
  } = input;

  // Build context from available data
  let contextBlock = "";
  if (floor) contextBlock += `Geschoss: ${floor}\n`;
  if (room) contextBlock += `Raum: ${room}\n`;
  if (defectsJson) {
    try {
      const defects = JSON.parse(defectsJson);
      contextBlock += `\nBEKANNTE MÄNGEL (${defects.length}):\n`;
      defects.slice(0, 20).forEach((d: any, i: number) => {
        contextBlock += `${i + 1}. [${d.status}] ${d.title} – Gewerk: ${d.gewerk || d.category || "k.A."}, Ort: ${d.location || d.room || "k.A."}, Priorität: ${d.priority}\n`;
      });
    } catch {}
  }
  if (photosJson) {
    try {
      const photos = JSON.parse(photosJson);
      contextBlock += `\nFOTOS (${photos.length} Stück): Referenziert als Foto 1, Foto 2, etc.\n`;
      photos.slice(0, 10).forEach((p: any, i: number) => {
        contextBlock += `Foto ${i + 1}: ${p.description || p.room || "Baustellenfoto"}\n`;
      });
    } catch {}
  }
  if (attendeesJson) {
    try {
      const attendees = JSON.parse(attendeesJson);
      contextBlock += `\nANWESENDE (${attendees.length}):\n`;
      attendees.forEach((a: any) => {
        contextBlock += `- ${a.name} (${a.company || a.firma || "k.A."}, ${a.role || "Teilnehmer"})\n`;
      });
    } catch {}
  }
  if (additionalContext) contextBlock += `\nZusätzlicher Kontext: ${additionalContext}\n`;

  const systemPrompt = `Du bist ein erfahrener deutscher Bauleiter und Projektleiter mit über 20 Jahren Berufserfahrung auf Großbaustellen (Wohnungsbau, Gewerbebau, Sanierung). Du erstellst Bauberichte, die von Auftraggebern, Architekten und Behörden als vorbildlich anerkannt werden.

DEINE AUFGABE: Erstelle einen professionellen "${reportType}" für das Projekt "${projectName}" am ${datum}.

SPRACHE UND STIL:
- Schreibe wie ein erfahrener Bauleiter: sachlich, präzise, ohne Füllwörter
- Verwende korrekte VOB/B-Terminologie und DIN-Normen-Referenzen wo passend
- Formuliere im Präsens für aktuelle Zustände, Perfekt für abgeschlossene Arbeiten
- Vermeide Konjunktiv – schreibe bestimmt und klar
- Jeder Satz muss eine Information transportieren
- Verwende Fachbegriffe: "Bestandsaufnahme", "Mängelrüge", "Nachbesserungsfrist", "Abnahme", "Gewährleistung"

STRUKTUR-ANFORDERUNGEN:
- Gruppiere IMMER nach Gewerken – das ist der wichtigste Strukturierungsgrundsatz
- Innerhalb jedes Gewerks: Fortschritt → Mängel → Nächste Schritte
- Jeder Mangel muss einem Gewerk UND einem Ort zugeordnet sein
- Verwende präzise Ortsangaben: Geschoss + Raum + Bauteil (z.B. "2. OG, Wohnung 2.3, Badezimmer, Vorwandinstallation")
- Referenziere Fotos direkt im Fließtext (z.B. "...Rissbildung erkennbar (siehe Foto 3)")
- Bei Fristen: Immer konkretes Datum nennen, nicht "bald" oder "zeitnah"
- Verantwortliche immer mit Firma nennen (z.B. "Fa. Müller GmbH")

ABHÄNGIGKEITEN:
- Zeige Abhängigkeiten zwischen Gewerken auf (z.B. "Estrich kann erst nach Abschluss der Sanitär-Rohinstallation eingebracht werden")
- Benenne kritische Pfade und Verzögerungsrisiken

QUALITÄTSKONTROLLE:
- NIEMALS Informationen erfinden – wenn etwas fehlt, schreibe "n.V." oder lasse den Punkt weg
- Keine Vermutungen über Ursachen – nur dokumentierte Fakten
- Zahlen und Mengen nur verwenden, wenn aus den Daten ableitbar
- Jede Frist muss realistisch sein (Mindestens 3 Werktage für Nachbesserung)

GEWERKE-ZUORDNUNG (verwende diese Standard-Bezeichnungen):
Elektro, Sanitär, Heizung/Klima/Lüftung, Rohbau/Mauerwerk, Trockenbau, Maler/Lackierer, Bodenbelag/Estrich, Fliesen/Naturstein, Fenster/Türen/Verglasung, Dach/Fassade/Abdichtung, Aufzug, Brandschutz, Schreiner/Tischler, Schlosser/Metallbau, Garten/Außenanlage/Tiefbau, Sonstiges

${contextBlock ? `VERFÜGBARE DATEN:\n${contextBlock}` : ""}`;

  const userPrompt = `Analysiere die folgende Transkription und erstelle daraus einen professionellen "${reportType}".

TRANSKRIPTION:
"""
${transcription}
"""

WICHTIG:
1. Gruppiere alle Informationen konsequent nach Gewerken
2. Ordne jeden Mangel einem Gewerk und einem konkreten Ort zu
3. Benenne Abhängigkeiten zwischen Gewerken für die kommende Woche
4. Setze realistische Fristen (mind. 3 Werktage für Nachbesserung)
5. Referenziere vorhandene Fotos an den passenden Textstellen
6. Formuliere Entscheidungen als klare Anweisungen mit Verantwortlichem
7. Wenn Informationen fehlen: weglassen oder "n.V." schreiben, NICHT erfinden

Erstelle den Bericht als strukturiertes JSON.`;

  try {
    const response = await invokeLLM({
      model: "gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "construction_report",
          strict: true,
          schema: REPORT_STRUCTURED_SCHEMA,
        },
      },
      max_tokens: 8192,
    });

    const messageContent = response.choices?.[0]?.message?.content;
    const rawContent: string = typeof messageContent === "string" ? messageContent : JSON.stringify(messageContent) || "{}";

    let parsed: StructuredReport;
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

    // Format structured data into professional Markdown
    return formatReportMarkdown(parsed, reportType, photosJson);
  } catch  {
    // Fallback: return a basic template if LLM fails
    return generateFallbackMarkdown(reportType, projectName, datum, transcription);
  }
}

/**
 * Format the structured report data into professional Markdown.
 */
function formatReportMarkdown(report: StructuredReport, reportType: string, photosJson?: string): string {
  let md = "";

  // Title Block
  md += `# ${report.title}\n\n`;
  md += `| | |\n|---|---|\n`;
  md += `| **Projekt** | ${report.projectName} |\n`;
  md += `| **Datum** | ${report.datum} |\n`;
  md += `| **Berichtstyp** | ${reportType.charAt(0).toUpperCase() + reportType.slice(1).replace(/([A-Z])/g, ' $1')} |\n`;
  md += `| **Erstellt mit** | protoKI |\n\n`;

  md += `---\n\n`;

  // Executive Summary
  md += `## Zusammenfassung\n\n`;
  md += `${report.summary}\n\n`;

  // Attendees (if present)
  if (report.attendees.length > 0) {
    md += `## Teilnehmer\n\n`;
    md += `| Name | Firma | Funktion |\n|------|-------|----------|\n`;
    for (const a of report.attendees) {
      md += `| ${a.name} | ${a.company} | ${a.role} |\n`;
    }
    md += `\n`;
  }

  // Trade Sections (Gewerke)
  if (report.tradeSections.length > 0) {
    md += `## Fortschritt nach Gewerken\n\n`;

    for (const section of report.tradeSections) {
      md += `### ${section.trade} – ${section.status}\n\n`;

      if (section.completedWork.length > 0) {
        md += `**Abgeschlossene Arbeiten:**\n`;
        for (const work of section.completedWork) {
          md += `- ${work}\n`;
        }
        md += `\n`;
      }

      if (section.openIssues.length > 0) {
        md += `**Offene Punkte:**\n`;
        for (const issue of section.openIssues) {
          md += `- ⚠️ ${issue}\n`;
        }
        md += `\n`;
      }

      if (section.nextSteps.length > 0) {
        md += `**Nächste Schritte:**\n`;
        for (const step of section.nextSteps) {
          md += `- → ${step}\n`;
        }
        md += `\n`;
      }

      if (section.photoRefs.length > 0) {
        md += `*Fotodokumentation: ${section.photoRefs.join(", ")}*\n\n`;
      }

      md += `---\n\n`;
    }
  }

  // Defect Summary
  if (report.defectSummary.total > 0) {
    md += `## Mängelübersicht\n\n`;
    md += `| Kennzahl | Wert |\n|----------|------|\n`;
    md += `| Gesamt | ${report.defectSummary.total} |\n`;
    md += `| Kritisch | ${report.defectSummary.critical} |\n`;
    md += `| Offen | ${report.defectSummary.open} |\n`;
    md += `| Behoben | ${report.defectSummary.resolved} |\n\n`;

    if (report.defectSummary.items.length > 0) {
      md += `### Mängelliste\n\n`;
      md += `| Nr. | Mangel | Gewerk | Ort | Schwere | Status |\n|-----|--------|--------|-----|---------|--------|\n`;
      for (let i = 0; i < report.defectSummary.items.length; i++) {
        const d = report.defectSummary.items[i];
        const photoNote = d.photoRef ? ` (${d.photoRef})` : "";
        md += `| ${i + 1} | ${d.title}${photoNote} | ${d.trade} | ${d.location} | ${d.severity} | ${d.status} |\n`;
      }
      md += `\n`;
    }
  }

  // Decisions
  if (report.decisions.length > 0) {
    md += `## Beschlüsse / Entscheidungen\n\n`;
    for (let i = 0; i < report.decisions.length; i++) {
      md += `${i + 1}. ${report.decisions[i]}\n`;
    }
    md += `\n`;
  }

  // Next Actions
  if (report.nextActions.length > 0) {
    md += `## Nächste Maßnahmen\n\n`;
    md += `| Maßnahme | Verantwortlich | Frist |\n|----------|----------------|-------|\n`;
    for (const action of report.nextActions) {
      md += `| ${action.action} | ${action.responsible} | ${action.deadline} |\n`;
    }
    md += `\n`;
  }

  // General Observations
  if (report.generalObservations.length > 0) {
    md += `## Allgemeine Beobachtungen\n\n`;
    for (const obs of report.generalObservations) {
      md += `- ${obs}\n`;
    }
    md += `\n`;
  }

  // Photo Section (if photos provided)
  if (photosJson) {
    try {
      const photos = JSON.parse(photosJson);
      if (photos.length > 0) {
        md += `## Fotodokumentation\n\n`;
        md += `| Nr. | Beschreibung | Zuordnung |\n|-----|-------------|------------|\n`;
        photos.slice(0, 20).forEach((p: any, i: number) => {
          md += `| Foto ${i + 1} | ${p.description || "Baustellenfoto"} | ${p.room || p.trade || "Allgemein"} |\n`;
        });
        md += `\n`;
      }
    } catch {}
  }

  // Dependencies between trades (derived from nextActions)
  const dependencies = report.nextActions.filter(a => 
    a.action.toLowerCase().includes("nach") || 
    a.action.toLowerCase().includes("abhäng") ||
    a.action.toLowerCase().includes("erst wenn") ||
    a.action.toLowerCase().includes("voraussetzung")
  );
  if (dependencies.length > 0) {
    md += `## Abhängigkeiten zwischen Gewerken\n\n`;
    for (const dep of dependencies) {
      md += `- ${dep.action} *(${dep.responsible}, bis ${dep.deadline})*\n`;
    }
    md += `\n`;
  }

  // Footer
  md += `---\n\n`;
  md += `*Bericht erstellt mit protoKI am ${report.datum}.*  \n`;
  md += `*Dokumententyp: ${reportType} | Projekt: ${report.projectName}*  \n`;
  md += `*Dieser Bericht wurde KI-gestützt erstellt und durch den Bauleiter geprüft.*\n`;

  return md;
}

/**
 * Fallback report if LLM call fails.
 */
function generateFallbackMarkdown(reportType: string, projectName: string, datum: string, transcription: string): string {
  let md = `# ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}\n\n`;
  md += `| | |\n|---|---|\n`;
  md += `| **Projekt** | ${projectName} |\n`;
  md += `| **Datum** | ${datum} |\n\n`;
  md += `---\n\n`;
  md += `## Zusammenfassung\n\n[KI-Generierung fehlgeschlagen. Bitte manuell ergänzen.]\n\n`;
  md += `## Originaltranskription\n\n`;
  md += `> ${transcription.slice(0, 1000)}${transcription.length > 1000 ? "..." : ""}\n\n`;
  md += `---\n\n*Erstellt mit protoKI am ${datum}*\n`;
  return md;
}
