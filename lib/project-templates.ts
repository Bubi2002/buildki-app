/**
 * Projekt-Vorlagen (Project Templates)
 * 
 * Predefined project configurations for common use cases.
 * Each template provides default settings, suggested protocol templates,
 * and checklist categories.
 */

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string; // MaterialIcons name
  color: string;
  defaultPrefix: string;
  suggestedTemplates: string[]; // Protocol template IDs
  defaultChecklist: string[];
  defaultGewerke: string[];
  settings: {
    autoNumbering: boolean;
    includeWeather: boolean;
    includeLocation: boolean;
    defaultPhotoSize: "klein" | "mittel" | "groß";
    pdfTemplate: "standard" | "compact" | "detailed" | "no_photos";
  };
};

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "baustelle",
    name: "Baustelle",
    description: "Für Neubau, Umbau und Sanierung. Inkl. Mängelmanagement, Gewerke-Zuweisung und Bautagebuch.",
    icon: "construction",
    color: "#D97706",
    defaultPrefix: "BST",
    suggestedTemplates: ["baustellenbericht", "maengelliste", "tagesbericht", "abnahmeprotokoll"],
    defaultChecklist: [
      "Baustelleneinrichtung geprüft",
      "Sicherheitsunterweisung durchgeführt",
      "Materiallieferung kontrolliert",
      "Arbeitsergebnis dokumentiert",
      "Aufräumarbeiten erledigt",
      "Nächste Schritte besprochen",
    ],
    defaultGewerke: [
      "Rohbau", "Elektro", "Sanitär", "Heizung/Klima", "Trockenbau",
      "Maler/Lackierer", "Bodenbelag", "Fliesen", "Dachdecker", "Fenster/Türen",
    ],
    settings: {
      autoNumbering: true,
      includeWeather: true,
      includeLocation: true,
      defaultPhotoSize: "mittel",
      pdfTemplate: "standard",
    },
  },
  {
    id: "buero",
    name: "Büro / Meeting",
    description: "Für Besprechungen, Meetings und Büro-Protokolle. Fokus auf Aufgaben und Entscheidungen.",
    icon: "business",
    color: "#1E40AF",
    defaultPrefix: "MTG",
    suggestedTemplates: ["besprechungsnotiz", "freitext", "zusammenfassung"],
    defaultChecklist: [
      "Agenda vorbereitet",
      "Teilnehmer eingeladen",
      "Protokoll erstellt",
      "Aufgaben verteilt",
      "Folgetermin vereinbart",
    ],
    defaultGewerke: [],
    settings: {
      autoNumbering: true,
      includeWeather: false,
      includeLocation: false,
      defaultPhotoSize: "klein",
      pdfTemplate: "compact",
    },
  },
  {
    id: "gutachten",
    name: "Gutachten",
    description: "Für Sachverständige und Gutachter. Strukturierte Befundaufnahme mit Bewertung und Empfehlung.",
    icon: "gavel",
    color: "#7C3AED",
    defaultPrefix: "GA",
    suggestedTemplates: ["gutachten", "abnahmeprotokoll", "maengelliste"],
    defaultChecklist: [
      "Ortstermin durchgeführt",
      "Fotos dokumentiert",
      "Messungen vorgenommen",
      "Befunde erfasst",
      "Bewertung erstellt",
      "Empfehlung formuliert",
    ],
    defaultGewerke: [
      "Rohbau", "Feuchtigkeit", "Statik", "Brandschutz", "Schadstoffe", "Energetik",
    ],
    settings: {
      autoNumbering: true,
      includeWeather: true,
      includeLocation: true,
      defaultPhotoSize: "groß",
      pdfTemplate: "detailed",
    },
  },
  {
    id: "wartung",
    name: "Wartung / Instandhaltung",
    description: "Für regelmäßige Wartungsarbeiten, Inspektionen und technische Prüfungen.",
    icon: "build",
    color: "#059669",
    defaultPrefix: "WTG",
    suggestedTemplates: ["tagesbericht", "baustellenbericht", "maengelliste"],
    defaultChecklist: [
      "Sichtprüfung durchgeführt",
      "Funktionsprüfung bestanden",
      "Verschleißteile geprüft",
      "Messwerte dokumentiert",
      "Mängel erfasst",
      "Nächster Wartungstermin festgelegt",
    ],
    defaultGewerke: [
      "Elektro", "Sanitär", "Heizung/Klima", "Aufzug", "Brandschutz", "Sicherheit",
    ],
    settings: {
      autoNumbering: true,
      includeWeather: false,
      includeLocation: true,
      defaultPhotoSize: "mittel",
      pdfTemplate: "standard",
    },
  },
  {
    id: "abnahme",
    name: "Abnahme",
    description: "Für Bauabnahmen, Wohnungsübergaben und Schlussbegehungen mit Mängelliste.",
    icon: "check-circle",
    color: "#DC2626",
    defaultPrefix: "ABN",
    suggestedTemplates: ["abnahmeprotokoll", "maengelliste"],
    defaultChecklist: [
      "Vollständigkeit der Leistung geprüft",
      "Mängel dokumentiert",
      "Fristen für Nachbesserung festgelegt",
      "Zählerstände abgelesen",
      "Schlüsselübergabe dokumentiert",
      "Unterschriften eingeholt",
    ],
    defaultGewerke: [
      "Rohbau", "Elektro", "Sanitär", "Heizung/Klima", "Trockenbau",
      "Maler/Lackierer", "Bodenbelag", "Fliesen", "Fenster/Türen",
    ],
    settings: {
      autoNumbering: true,
      includeWeather: false,
      includeLocation: true,
      defaultPhotoSize: "groß",
      pdfTemplate: "detailed",
    },
  },
];

/**
 * Get a project template by ID
 */
export function getProjectTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(t => t.id === id);
}

/**
 * Apply template settings to a new project
 */
export function applyTemplateDefaults(templateId: string): {
  prefix: string;
  color: string;
  gewerke: string[];
  checklist: string[];
} | null {
  const template = getProjectTemplate(templateId);
  if (!template) return null;
  return {
    prefix: template.defaultPrefix,
    color: template.color,
    gewerke: template.defaultGewerke,
    checklist: template.defaultChecklist,
  };
}
