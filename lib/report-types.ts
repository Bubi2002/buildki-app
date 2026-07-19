/**
 * protoKI – KI-Berichtssystem
 * 
 * 10 professionelle Berichtstypen für Bauprojekte.
 * Jeder Typ hat einen eigenen LLM-Prompt, Strukturerkennung und PDF-Layout.
 */

export type ReportType =
  | "baustellenbericht"      // Täglicher Baustellenbericht
  | "besprechungsprotokoll"  // Besprechungs-/Sitzungsprotokoll
  | "abnahmeprotokoll"       // Abnahmeprotokoll mit Mängelliste
  | "maengelbericht"         // Mängelbericht/Mängelrüge
  | "tagesbericht"           // Bautagebuch-Eintrag
  | "wochenbericht"          // Wöchentliche Zusammenfassung
  | "fortschrittsbericht"    // Baufortschrittsbericht
  | "sicherheitsbericht"     // Arbeitssicherheit/SiGe-Bericht
  | "begehungsprotokoll"     // Begehungs-/Inspektionsprotokoll
  | "uebergabeprotokoll";    // Übergabeprotokoll

export interface ReportTypeConfig {
  id: ReportType;
  label: string;
  description: string;
  icon: string;
  color: string;
  sections: string[];
  requiredFields: string[];
  optionalFields: string[];
  promptTemplate: string;
}

export const REPORT_TYPES: ReportTypeConfig[] = [
  {
    id: "baustellenbericht",
    label: "Baustellenbericht",
    description: "Täglicher Bericht über Baustellenaktivitäten, Wetter, Personal und Fortschritt",
    icon: "construction",
    color: "#FF6D00",
    sections: ["Allgemein", "Wetter", "Personal", "Arbeiten", "Material", "Besonderheiten", "Nächste Schritte"],
    requiredFields: ["datum", "projekt", "wetter", "arbeiten"],
    optionalFields: ["personal", "material", "maengel", "fotos", "unterschriften"],
    promptTemplate: `Erstelle einen professionellen Baustellenbericht. Strukturiere die Informationen in folgende Abschnitte:
1. ALLGEMEIN: Datum, Projekt, Bauherr, Auftragnehmer
2. WETTER: Temperatur, Niederschlag, Wind, Arbeitsfähigkeit
3. PERSONAL: Anwesende Firmen, Personenzahl pro Gewerk
4. AUSGEFÜHRTE ARBEITEN: Detailliert nach Gewerk und Geschoss
5. MATERIAL: Lieferungen, Engpässe
6. BESONDERHEITEN: Störungen, Verzögerungen, Unfälle
7. NÄCHSTE SCHRITTE: Geplante Arbeiten für morgen/nächste Woche`,
  },
  {
    id: "besprechungsprotokoll",
    label: "Besprechungsprotokoll",
    description: "Protokoll einer Baubesprechung mit Teilnehmern, Themen und Aufgaben",
    icon: "groups",
    color: "#1E88E5",
    sections: ["Teilnehmer", "Tagesordnung", "Beschlüsse", "Aufgaben", "Nächster Termin"],
    requiredFields: ["datum", "teilnehmer", "themen"],
    optionalFields: ["ort", "verteiler", "anlagen"],
    promptTemplate: `Erstelle ein professionelles Besprechungsprotokoll. Strukturiere:
1. KOPFDATEN: Datum, Ort, Beginn/Ende, Protokollführer
2. TEILNEHMER: Name, Firma, Funktion (Tabelle)
3. TAGESORDNUNG: Nummerierte Punkte
4. BESPRECHUNGSINHALTE: Pro TOP die Diskussion und Ergebnisse
5. BESCHLÜSSE: Klare Entscheidungen mit Verantwortlichen
6. AUFGABEN: Wer macht was bis wann (Tabelle)
7. NÄCHSTER TERMIN: Datum, Uhrzeit, Ort`,
  },
  {
    id: "abnahmeprotokoll",
    label: "Abnahmeprotokoll",
    description: "Förmliche Abnahme mit Mängelliste, Vorbehalten und Unterschriften",
    icon: "verified",
    color: "#43A047",
    sections: ["Objekt", "Beteiligte", "Prüfung", "Mängel", "Ergebnis", "Unterschriften"],
    requiredFields: ["datum", "objekt", "beteiligte", "ergebnis"],
    optionalFields: ["maengel", "vorbehalte", "fristen", "fotos"],
    promptTemplate: `Erstelle ein förmliches Abnahmeprotokoll nach VOB/B §12. Strukturiere:
1. OBJEKT: Bauvorhaben, Adresse, Gewerk/Leistung
2. BETEILIGTE: Auftraggeber, Auftragnehmer, Sachverständige
3. GEGENSTAND DER ABNAHME: Was wird abgenommen
4. PRÜFUNG: Durchgeführte Prüfungen und Feststellungen
5. MÄNGELLISTE: Nummeriert mit Beschreibung, Ort, Frist (Tabelle)
6. ERGEBNIS: Abnahme erfolgt / mit Vorbehalt / verweigert
7. VORBEHALTE: Gewährleistung, Vertragsstrafe, bekannte Mängel
8. UNTERSCHRIFTEN: Alle Beteiligten`,
  },
  {
    id: "maengelbericht",
    label: "Mängelbericht",
    description: "Detaillierte Mängelrüge mit Fotos, Fristen und Verantwortlichen",
    icon: "warning",
    color: "#EF4444",
    sections: ["Mängel", "Fotos", "Fristen", "Verantwortliche"],
    requiredFields: ["datum", "projekt", "maengel"],
    optionalFields: ["fotos", "fristen", "rechtsgrundlage"],
    promptTemplate: `Erstelle einen professionellen Mängelbericht/Mängelrüge. Strukturiere:
1. ABSENDER/EMPFÄNGER: Auftraggeber an Auftragnehmer
2. BEZUG: Vertrag, Bauvorhaben, Gewerk
3. MÄNGELLISTE: Nummeriert mit:
   - Beschreibung des Mangels
   - Ort (Geschoss, Raum, Bauteil)
   - Fotoverweis
   - Bewertung (Schwere)
4. FRISTSETZUNG: Angemessene Frist zur Mängelbeseitigung
5. RECHTSFOLGEN: Hinweis auf Ersatzvornahme, Minderung
6. FOTOS: Referenzierte Fotodokumentation`,
  },
  {
    id: "tagesbericht",
    label: "Tagesbericht",
    description: "Bautagebuch-Eintrag mit Arbeitszeiten, Gewerken und Fortschritt",
    icon: "today",
    color: "#7B1FA2",
    sections: ["Datum", "Wetter", "Arbeitszeiten", "Gewerke", "Fortschritt", "Bemerkungen"],
    requiredFields: ["datum", "arbeiten"],
    optionalFields: ["wetter", "personal", "material", "stoerungen"],
    promptTemplate: `Erstelle einen Bautagebuch-Eintrag gemäß VOB/B. Strukturiere:
1. DATUM UND WETTER: Temperatur, Niederschlag, Arbeitsfähigkeit
2. ARBEITSZEITEN: Beginn, Ende, Unterbrechungen
3. ANWESENDE FIRMEN: Firma, Gewerk, Personenzahl (Tabelle)
4. AUSGEFÜHRTE ARBEITEN: Nach Gewerk und Geschoss detailliert
5. MATERIALLIEFERUNGEN: Was wurde angeliefert
6. BESONDERE VORKOMMNISSE: Störungen, Unfälle, Behinderungen
7. BAUFORTSCHRITT: Prozentuale Einschätzung pro Gewerk`,
  },
  {
    id: "wochenbericht",
    label: "Wochenbericht",
    description: "Wöchentliche Zusammenfassung aller Aktivitäten und Fortschritte",
    icon: "date-range",
    color: "#00897B",
    sections: ["Zeitraum", "Zusammenfassung", "Gewerke", "Mängel", "Verzögerungen", "Ausblick"],
    requiredFields: ["zeitraum", "projekt"],
    optionalFields: ["gewerke", "maengel", "kosten", "termine"],
    promptTemplate: `Erstelle einen Wochenbericht für die Bauleitung. Strukturiere:
1. BERICHTSZEITRAUM: KW, Datum von-bis
2. ZUSAMMENFASSUNG: 3-5 Sätze Überblick
3. FORTSCHRITT PRO GEWERK: Gewerk, Soll vs. Ist, Status (Tabelle)
4. ABGESCHLOSSENE ARBEITEN: Was wurde fertiggestellt
5. OFFENE MÄNGEL: Neue und bestehende Mängel
6. VERZÖGERUNGEN: Ursachen und Auswirkungen
7. AUSBLICK NÄCHSTE WOCHE: Geplante Arbeiten, Abhängigkeiten`,
  },
  {
    id: "fortschrittsbericht",
    label: "Fortschrittsbericht",
    description: "Baufortschritt nach Gewerk, Geschoss und Zeitplan mit Soll/Ist-Vergleich",
    icon: "trending-up",
    color: "#4CAF50",
    sections: ["Gesamtfortschritt", "Pro Gewerk", "Pro Geschoss", "Zeitplan", "Risiken"],
    requiredFields: ["projekt", "zeitraum"],
    optionalFields: ["gewerke", "geschosse", "kosten", "fotos"],
    promptTemplate: `Erstelle einen Baufortschrittsbericht. Strukturiere:
1. GESAMTFORTSCHRITT: Prozent, Ampelstatus (grün/gelb/rot)
2. FORTSCHRITT PRO GEWERK: Gewerk, Soll-%, Ist-%, Abweichung (Tabelle)
3. FORTSCHRITT PRO GESCHOSS: Geschoss, Status, offene Arbeiten
4. TERMINPLAN: Soll vs. Ist, kritischer Pfad
5. KOSTENENTWICKLUNG: Budget vs. Ist (wenn Daten vorhanden)
6. RISIKEN UND MASSNAHMEN: Identifizierte Risiken, Gegenmaßnahmen
7. FOTODOKUMENTATION: Fortschrittsfotos mit Beschreibung`,
  },
  {
    id: "sicherheitsbericht",
    label: "Sicherheitsbericht",
    description: "Arbeitssicherheit, SiGe-Koordination, Gefährdungen und Maßnahmen",
    icon: "health-and-safety",
    color: "#F44336",
    sections: ["Begehung", "Feststellungen", "Gefährdungen", "Maßnahmen", "Schulungen"],
    requiredFields: ["datum", "projekt", "feststellungen"],
    optionalFields: ["teilnehmer", "fotos", "fristen"],
    promptTemplate: `Erstelle einen Arbeitssicherheitsbericht (SiGe-Bericht). Strukturiere:
1. BEGEHUNGSDATEN: Datum, Uhrzeit, Teilnehmer, Bereich
2. POSITIVE FESTSTELLUNGEN: Was gut umgesetzt wird
3. MÄNGEL/GEFÄHRDUNGEN: Nummeriert mit Beschreibung, Ort, Foto, Priorität
4. SOFORTMASSNAHMEN: Was wurde sofort veranlasst
5. OFFENE MASSNAHMEN: Verantwortlicher, Frist (Tabelle)
6. SCHULUNGSBEDARF: Erkannter Schulungsbedarf
7. NÄCHSTE BEGEHUNG: Termin`,
  },
  {
    id: "begehungsprotokoll",
    label: "Begehungsprotokoll",
    description: "Protokoll einer Baustellenbegehung oder Inspektion",
    icon: "directions-walk",
    color: "#5C6BC0",
    sections: ["Route", "Feststellungen", "Mängel", "Fotos", "Maßnahmen"],
    requiredFields: ["datum", "projekt", "route"],
    optionalFields: ["teilnehmer", "fotos", "maengel"],
    promptTemplate: `Erstelle ein Begehungsprotokoll. Strukturiere:
1. BEGEHUNGSDATEN: Datum, Uhrzeit, Anlass, Teilnehmer
2. ROUTE: Besichtigte Bereiche (Geschoss, Räume)
3. FESTSTELLUNGEN PRO BEREICH: Was wurde vorgefunden
4. MÄNGEL: Nummeriert mit Ort, Beschreibung, Foto-Ref, Verantwortlicher
5. POSITIVE ASPEKTE: Was gut läuft
6. MASSNAHMEN: Wer macht was bis wann
7. FOTODOKUMENTATION: Fotos mit Beschreibung und Zuordnung`,
  },
  {
    id: "uebergabeprotokoll",
    label: "Übergabeprotokoll",
    description: "Dokumentation der Übergabe von Räumen, Wohnungen oder Gebäudeteilen",
    icon: "key",
    color: "#795548",
    sections: ["Objekt", "Beteiligte", "Zustand", "Zählerstände", "Schlüssel", "Unterschriften"],
    requiredFields: ["datum", "objekt", "beteiligte"],
    optionalFields: ["zaehlerstaende", "schluessel", "maengel", "fotos"],
    promptTemplate: `Erstelle ein Übergabeprotokoll. Strukturiere:
1. OBJEKT: Adresse, Einheit, Fläche
2. BETEILIGTE: Übergeber, Übernehmer, Zeugen
3. ZUSTAND: Beschreibung des Zustands pro Raum
4. ZÄHLERSTÄNDE: Strom, Gas, Wasser, Heizung (Tabelle)
5. SCHLÜSSELÜBERGABE: Art, Anzahl, Nummern
6. MÄNGEL/SCHÄDEN: Vorhandene Mängel mit Fotos
7. VEREINBARUNGEN: Sondervereinbarungen
8. UNTERSCHRIFTEN: Alle Beteiligten`,
  },
];

// ─── Structure Recognition ─────────────────────────────────────────────────────

export interface RecognizedStructure {
  datum?: string;
  projekt?: string;
  gebaeude?: string;
  geschoss?: string;
  raum?: string;
  personen: string[];
  firmen: string[];
  arbeiten: string[];
  fortschritt?: string;
  maengel: string[];
  fristen: string[];
  wetter?: string;
  temperatur?: string;
}

/**
 * Build the LLM prompt for structure recognition from transcription text.
 * The LLM extracts structured data from free-form audio transcription.
 */
export function buildStructureRecognitionPrompt(transcription: string, reportType: ReportType): string {
  return `Du bist ein KI-Assistent für Baustellendokumentation. Analysiere den folgenden transkribierten Text und extrahiere die strukturierten Informationen.

TRANSKRIPTION:
"""
${transcription}
"""

Extrahiere folgende Informationen als JSON:
{
  "datum": "Erkanntes Datum (ISO-Format oder deutsch)",
  "projekt": "Projektname falls erwähnt",
  "gebaeude": "Gebäude/Bauteil falls erwähnt",
  "geschoss": "Geschoss/Etage falls erwähnt (z.B. EG, 1.OG, UG)",
  "raum": "Raum falls erwähnt",
  "personen": ["Liste erkannter Personennamen"],
  "firmen": ["Liste erkannter Firmennamen"],
  "arbeiten": ["Liste der erwähnten Arbeiten/Tätigkeiten"],
  "fortschritt": "Erwähnter Fortschritt (z.B. '80% fertig')",
  "maengel": ["Liste erkannter Mängel/Probleme"],
  "fristen": ["Liste erkannter Termine/Fristen"],
  "wetter": "Wetterbeschreibung falls erwähnt",
  "temperatur": "Temperatur falls erwähnt"
}

Antworte NUR mit dem JSON-Objekt, keine Erklärungen.`;
}

/**
 * Build the full report generation prompt for a specific report type.
 */
export function buildReportPrompt(
  reportType: ReportType,
  transcription: string,
  recognizedStructure: RecognizedStructure,
  metadata: {
    datum: string;
    projekt?: string;
    wetter?: string;
    location?: string;
  }
): string {
  const config = REPORT_TYPES.find(r => r.id === reportType);
  if (!config) throw new Error(`Unknown report type: ${reportType}`);

  const structureContext = `
ERKANNTE STRUKTUR:
- Datum: ${metadata.datum}
- Projekt: ${metadata.projekt || recognizedStructure.projekt || "Nicht angegeben"}
- Personen: ${recognizedStructure.personen.join(", ") || "Keine erkannt"}
- Firmen: ${recognizedStructure.firmen.join(", ") || "Keine erkannt"}
- Arbeiten: ${recognizedStructure.arbeiten.join(", ") || "Keine erkannt"}
- Mängel: ${recognizedStructure.maengel.join(", ") || "Keine erkannt"}
- Wetter: ${metadata.wetter || recognizedStructure.wetter || "Nicht angegeben"}
- Ort: ${metadata.location || "Nicht angegeben"}
`;

  return `Du bist ein professioneller Bauleiter und erstellst einen "${config.label}".

${config.promptTemplate}

${structureContext}

TRANSKRIPTION (Originalaufnahme):
"""
${transcription}
"""

WICHTIGE REGELN:
- Verwende das heutige Datum: ${metadata.datum}
- Schreibe professionell und sachlich
- Verwende Fachbegriffe korrekt
- Strukturiere mit Überschriften und Nummerierung
- Wenn Informationen fehlen, schreibe "[Bitte ergänzen]" statt zu erfinden
- Formatiere als Markdown mit Tabellen wo sinnvoll

Erstelle jetzt den vollständigen ${config.label}:`;
}

/**
 * Get the report type config by ID
 */
export function getReportTypeConfig(type: ReportType): ReportTypeConfig {
  const config = REPORT_TYPES.find(r => r.id === type);
  if (!config) throw new Error(`Unknown report type: ${type}`);
  return config;
}
