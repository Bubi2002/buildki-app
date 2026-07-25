/**
 * KI-Bautagebuch Engine
 * 
 * Generates professional daily construction reports (Bautagebuch) using LLM.
 * Combines: weather, attendance, defects, protocols, photos into a single
 * structured daily report that reads like it was written by an experienced Bauleiter.
 */
import { invokeLLM } from "./_core/llm";

export interface BautagebuchInput {
  projectName: string;
  projectAddress?: string;
  date: string; // YYYY-MM-DD
  weather?: {
    temperature: number;
    description: string;
    humidity: number;
    windSpeed: number;
  };
  attendance: {
    name: string;
    firma: string;
    gewerk: string;
    arrivalTime: string;
    departureTime: string;
    notes?: string;
  }[];
  defects: {
    title: string;
    description?: string;
    gewerk?: string;
    room?: string;
    status: string;
    priority?: string;
    responsible?: string;
    dueDate?: string;
    photos?: string[];
    aiSummary?: string;
    positionCode?: string;
  }[];
  protocols: {
    title: string;
    createdAt: string;
    transcription?: string;
    templateName?: string;
  }[];
  activities?: string[]; // Manual notes from the day
  photos?: string[]; // General site photos
  previousDayNotes?: string; // Carry-over from yesterday
}

export interface BautagebuchOutput {
  title: string;
  date: string;
  projectName: string;
  weather: string;
  workingConditions: string;
  attendanceSummary: string;
  attendanceByTrade: {
    trade: string;
    workers: number;
    firms: string[];
    hours: string;
  }[];
  workPerformed: {
    trade: string;
    description: string;
    location?: string;
    progress?: string;
  }[];
  defectsSummary: {
    newToday: number;
    resolvedToday: number;
    totalOpen: number;
    critical: string[];
  };
  incidents: string[];
  deliveries: string[];
  decisions: string[];
  nextDayPlanning: string[];
  notes: string;
  fullReport: string; // Complete Markdown report
}

const BAUTAGEBUCH_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const, description: "Titel: 'Bautagebuch [Projekt] – [Datum]'" },
    weather: { type: "string" as const, description: "Wetterbedingungen in einem Satz" },
    workingConditions: { type: "string" as const, description: "Arbeitsbedingungen (z.B. 'Gute Bedingungen für Außenarbeiten', 'Arbeiten im Innenbereich aufgrund von Regen')" },
    attendanceSummary: { type: "string" as const, description: "Zusammenfassung Anwesenheit (z.B. '12 Personen von 4 Firmen, 3 Gewerke aktiv')" },
    attendanceByTrade: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          trade: { type: "string" as const },
          workers: { type: "number" as const },
          firms: { type: "array" as const, items: { type: "string" as const } },
          hours: { type: "string" as const, description: "Durchschnittliche Arbeitszeit" },
        },
        required: ["trade", "workers", "firms", "hours"] as const,
      },
    },
    workPerformed: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          trade: { type: "string" as const },
          description: { type: "string" as const },
          location: { type: "string" as const },
          progress: { type: "string" as const },
        },
        required: ["trade", "description"] as const,
      },
    },
    defectsSummary: {
      type: "object" as const,
      properties: {
        newToday: { type: "number" as const },
        resolvedToday: { type: "number" as const },
        totalOpen: { type: "number" as const },
        critical: { type: "array" as const, items: { type: "string" as const } },
      },
      required: ["newToday", "resolvedToday", "totalOpen", "critical"] as const,
    },
    incidents: { type: "array" as const, items: { type: "string" as const }, description: "Besondere Vorkommnisse" },
    deliveries: { type: "array" as const, items: { type: "string" as const }, description: "Lieferungen und Materialannahmen" },
    decisions: { type: "array" as const, items: { type: "string" as const }, description: "Entscheidungen und Anweisungen" },
    nextDayPlanning: { type: "array" as const, items: { type: "string" as const }, description: "Planung für den nächsten Tag" },
    notes: { type: "string" as const, description: "Sonstige Bemerkungen" },
  },
  required: ["title", "weather", "workingConditions", "attendanceSummary", "attendanceByTrade", "workPerformed", "defectsSummary", "incidents", "deliveries", "decisions", "nextDayPlanning", "notes"] as const,
};

export async function generateBautagebuch(input: BautagebuchInput): Promise<BautagebuchOutput> {
  const systemPrompt = `Du bist ein erfahrener Bauleiter und Projektleiter mit über 20 Jahren Erfahrung in der Dokumentation von Großbauprojekten (Wohnungsbau, Gewerbebau, Sanierung). Du erstellst Bautagebucher, die den Anforderungen der VOB/B §12 und HOAI entsprechen und als rechtssichere Dokumentation vor Gericht Bestand haben.

STIL UND SPRACHE:
- Schreibe sachlich, präzise und vollständig – wie ein erfahrener Bauleiter
- Verwende korrekte Baufachsprache (VOB-Terminologie, DIN-Referenzen)
- Formuliere im Präsens für Zustände, Perfekt für abgeschlossene Arbeiten
- Jeder Satz muss eine dokumentarisch relevante Information enthalten
- Keine Füllwörter, keine Vermutungen, keine Wertungen

STRUKTUR:
- Dokumentiere ALLE relevanten Vorgänge des Tages lückenlos
- Gruppiere Arbeiten konsequent nach Gewerken
- Nenne konkrete Orte: Geschoss + Raum + Bauteil (z.B. "2. OG, Whg. 2.3, Bad")
- Vermerke Abweichungen vom Bauablaufplan mit Begründung
- Dokumentiere Witterung und deren konkreten Einfluss auf Arbeiten
- Halte Entscheidungen mit Verantwortlichem und Datum fest
- Plane vorausschauend: Was muss morgen passieren, welche Abhängigkeiten bestehen?
- Benenne kritische Pfade und Verzögerungsrisiken

QUALITÄTSKONTROLLE:
- NIEMALS Informationen erfinden – wenn Daten fehlen: "Keine Angaben" oder weglassen
- Zeiten im 24h-Format (z.B. "07:00–16:30")
- Verwende Positionsnummern wenn vorhanden (z.B. "[1.2.3]")
- Mengen und Flächen nur angeben wenn aus Daten ableitbar
- Lieferungen mit Menge und Lieferant dokumentieren`;

  const attendanceText = input.attendance.length > 0
    ? input.attendance.map(w => `- ${w.name} (${w.firma}, ${w.gewerk}): ${w.arrivalTime}–${w.departureTime}${w.notes ? ` [${w.notes}]` : ""}`).join("\n")
    : "Keine Anwesenheitsdaten erfasst.";

  const defectsText = input.defects.length > 0
    ? input.defects.map(d => `- ${d.positionCode ? `[${d.positionCode}] ` : ""}${d.title}${d.gewerk ? ` (${d.gewerk})` : ""}${d.room ? ` in ${d.room}` : ""} – Status: ${d.status}${d.priority ? `, Priorität: ${d.priority}` : ""}${d.responsible ? `, Verantwortlich: ${d.responsible}` : ""}${d.dueDate ? `, Frist: ${d.dueDate}` : ""}${d.aiSummary ? `\n  KI-Zusammenfassung: ${d.aiSummary}` : ""}`).join("\n")
    : "Keine Mängel erfasst.";

  const protocolsText = input.protocols.length > 0
    ? input.protocols.map(p => `- ${p.title} (${p.templateName || "Freitext"}, erstellt ${new Date(p.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })})`).join("\n")
    : "Keine Protokolle erstellt.";

  const weatherText = input.weather
    ? `${input.weather.description}, ${input.weather.temperature}°C, Luftfeuchtigkeit ${input.weather.humidity}%, Wind ${input.weather.windSpeed} km/h`
    : "Keine Wetterdaten verfügbar.";

  const userPrompt = `Erstelle ein professionelles Bautagebuch für den folgenden Tag:

PROJEKT: ${input.projectName}${input.projectAddress ? `\nADRESSE: ${input.projectAddress}` : ""}
DATUM: ${new Date(input.date).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}

WETTER:
${weatherText}

ANWESENHEIT:
${attendanceText}

MÄNGEL (aktueller Stand):
${defectsText}

PROTOKOLLE/AUFNAHMEN DES TAGES:
${protocolsText}

${input.activities && input.activities.length > 0 ? `MANUELLE NOTIZEN:\n${input.activities.join("\n")}` : ""}
${input.previousDayNotes ? `HINWEISE VOM VORTAG:\n${input.previousDayNotes}` : ""}

Erstelle daraus ein vollständiges, professionelles Bautagebuch im JSON-Format.
Leite aus den Protokollen und Mängeln die durchgeführten Arbeiten ab.
Gruppiere nach Gewerken und dokumentiere den Fortschritt.`;

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
          name: "bautagebuch",
          strict: true,
          schema: BAUTAGEBUCH_SCHEMA,
        },
      },
      max_tokens: 8192,
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

    // Generate full Markdown report
    const fullReport = generateMarkdownReport(parsed, input);

    return {
      title: parsed.title || `Bautagebuch ${input.projectName} – ${input.date}`,
      date: input.date,
      projectName: input.projectName,
      weather: parsed.weather || weatherText,
      workingConditions: parsed.workingConditions || "",
      attendanceSummary: parsed.attendanceSummary || "",
      attendanceByTrade: parsed.attendanceByTrade || [],
      workPerformed: parsed.workPerformed || [],
      defectsSummary: parsed.defectsSummary || { newToday: 0, resolvedToday: 0, totalOpen: 0, critical: [] },
      incidents: parsed.incidents || [],
      deliveries: parsed.deliveries || [],
      decisions: parsed.decisions || [],
      nextDayPlanning: parsed.nextDayPlanning || [],
      notes: parsed.notes || "",
      fullReport,
    };
  } catch (error: any) {
    throw new Error(`Bautagebuch-Generierung fehlgeschlagen: ${error.message}`);
  }
}

function generateMarkdownReport(parsed: any, input: BautagebuchInput): string {
  const dateFormatted = new Date(input.date).toLocaleDateString("de-DE", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });

  let md = `# Bautagebuch\n\n`;
  md += `**Projekt:** ${input.projectName}\n`;
  if (input.projectAddress) md += `**Adresse:** ${input.projectAddress}\n`;
  md += `**Datum:** ${dateFormatted}\n`;
  md += `**Erstellt:** ${new Date().toLocaleString("de-DE")}\n\n`;
  md += `---\n\n`;

  // Weather
  md += `## 1. Witterung\n\n`;
  md += `${parsed.weather || "Keine Angaben"}\n\n`;
  md += `**Arbeitsbedingungen:** ${parsed.workingConditions || "Keine Angaben"}\n\n`;

  // Attendance
  md += `## 2. Anwesenheit\n\n`;
  md += `${parsed.attendanceSummary || "Keine Angaben"}\n\n`;
  if (parsed.attendanceByTrade && parsed.attendanceByTrade.length > 0) {
    md += `| Gewerk | Personen | Firmen | Arbeitszeit |\n`;
    md += `|--------|----------|--------|-------------|\n`;
    for (const t of parsed.attendanceByTrade) {
      md += `| ${t.trade} | ${t.workers} | ${t.firms.join(", ")} | ${t.hours} |\n`;
    }
    md += `\n`;
  }

  // Work performed
  md += `## 3. Durchgeführte Arbeiten\n\n`;
  if (parsed.workPerformed && parsed.workPerformed.length > 0) {
    for (const w of parsed.workPerformed) {
      md += `### ${w.trade}\n`;
      md += `${w.description}\n`;
      if (w.location) md += `*Ort:* ${w.location}\n`;
      if (w.progress) md += `*Fortschritt:* ${w.progress}\n`;
      md += `\n`;
    }
  } else {
    md += `Keine Arbeiten dokumentiert.\n\n`;
  }

  // Defects
  md += `## 4. Mängel\n\n`;
  const ds = parsed.defectsSummary || {};
  md += `- Neu heute: ${ds.newToday || 0}\n`;
  md += `- Behoben heute: ${ds.resolvedToday || 0}\n`;
  md += `- Gesamt offen: ${ds.totalOpen || 0}\n`;
  if (ds.critical && ds.critical.length > 0) {
    md += `\n**Kritische Mängel:**\n`;
    for (const c of ds.critical) {
      md += `- ⚠️ ${c}\n`;
    }
  }
  md += `\n`;

  // Incidents
  if (parsed.incidents && parsed.incidents.length > 0) {
    md += `## 5. Besondere Vorkommnisse\n\n`;
    for (const i of parsed.incidents) {
      md += `- ${i}\n`;
    }
    md += `\n`;
  }

  // Deliveries
  if (parsed.deliveries && parsed.deliveries.length > 0) {
    md += `## 6. Lieferungen / Material\n\n`;
    for (const d of parsed.deliveries) {
      md += `- ${d}\n`;
    }
    md += `\n`;
  }

  // Decisions
  if (parsed.decisions && parsed.decisions.length > 0) {
    md += `## 7. Entscheidungen / Anweisungen\n\n`;
    for (const d of parsed.decisions) {
      md += `- ${d}\n`;
    }
    md += `\n`;
  }

  // Next day
  md += `## 8. Planung nächster Tag\n\n`;
  if (parsed.nextDayPlanning && parsed.nextDayPlanning.length > 0) {
    for (const n of parsed.nextDayPlanning) {
      md += `- ${n}\n`;
    }
  } else {
    md += `Keine Planung erfasst.\n`;
  }
  md += `\n`;

  // Notes
  if (parsed.notes) {
    md += `## 9. Sonstige Bemerkungen\n\n`;
    md += `${parsed.notes}\n\n`;
  }

  md += `---\n\n`;
  md += `*Erstellt mit BuildKI – KI-gestütztes Bautagebuch*\n`;

  return md;
}
