import AsyncStorage from "@react-native-async-storage/async-storage";

const CHECKLISTS_KEY = "checklists";
const CHECKLIST_RESULTS_KEY = "checklist-results";

export type ChecklistItem = {
  id: string;
  text: string;
  required: boolean;
};

export type Checklist = {
  id: string;
  name: string;
  description: string;
  category: string;
  items: ChecklistItem[];
  isBuiltIn: boolean;
  createdAt: string;
};

export type ChecklistItemResult = {
  itemId: string;
  checked: boolean;
  note?: string;
  photoUri?: string;
};

export type ChecklistResult = {
  id: string;
  checklistId: string;
  checklistName: string;
  projectId?: string;
  protocolId?: string;
  results: ChecklistItemResult[];
  completedAt?: string;
  createdAt: string;
  inspector: string;
  location?: string;
};

// Built-in checklists for construction
export const BUILT_IN_CHECKLISTS: Omit<Checklist, "createdAt">[] = [
  {
    id: "abnahme-rohbau",
    name: "Rohbau-Abnahme",
    description: "Prüfliste für die Rohbau-Abnahme",
    category: "Abnahme",
    isBuiltIn: true,
    items: [
      { id: "r1", text: "Fundamente und Bodenplatte geprüft", required: true },
      { id: "r2", text: "Mauerwerk lotrecht und fluchtgerecht", required: true },
      { id: "r3", text: "Decken und Unterzüge ohne Risse", required: true },
      { id: "r4", text: "Treppen maßhaltig", required: true },
      { id: "r5", text: "Dachkonstruktion vollständig", required: true },
      { id: "r6", text: "Entwässerung funktionsfähig", required: true },
      { id: "r7", text: "Fenster- und Türöffnungen maßhaltig", required: false },
      { id: "r8", text: "Schornstein/Lüftungsschächte dicht", required: false },
      { id: "r9", text: "Abdichtung Kelleraußenwände", required: true },
      { id: "r10", text: "Dokumentation vollständig", required: true },
    ],
  },
  {
    id: "brandschutz",
    name: "Brandschutz-Prüfung",
    description: "Prüfliste für Brandschutzmaßnahmen",
    category: "Brandschutz",
    isBuiltIn: true,
    items: [
      { id: "b1", text: "Flucht- und Rettungswege frei", required: true },
      { id: "b2", text: "Brandschutztüren schließen selbstständig", required: true },
      { id: "b3", text: "Feuerlöscher vorhanden und geprüft", required: true },
      { id: "b4", text: "Rauchmelder installiert und funktionsfähig", required: true },
      { id: "b5", text: "Brandschutzklappen funktionsfähig", required: true },
      { id: "b6", text: "Kabelschottungen vollständig", required: true },
      { id: "b7", text: "Brandschutzbeschilderung angebracht", required: true },
      { id: "b8", text: "Löschwasserversorgung gewährleistet", required: false },
      { id: "b9", text: "Brandmeldeanlage funktionsfähig", required: false },
      { id: "b10", text: "Feuerwehrzufahrt frei", required: true },
    ],
  },
  {
    id: "elektro-abnahme",
    name: "Elektro-Abnahme",
    description: "Prüfliste für die Elektroinstallation",
    category: "Elektro",
    isBuiltIn: true,
    items: [
      { id: "e1", text: "Schutzleiterprüfung bestanden", required: true },
      { id: "e2", text: "Isolationswiderstand gemessen", required: true },
      { id: "e3", text: "FI-Schutzschalter ausgelöst", required: true },
      { id: "e4", text: "Leitungsschutzschalter korrekt dimensioniert", required: true },
      { id: "e5", text: "Steckdosen funktionsfähig", required: true },
      { id: "e6", text: "Beleuchtung vollständig", required: true },
      { id: "e7", text: "Verteilung beschriftet", required: true },
      { id: "e8", text: "Potentialausgleich hergestellt", required: true },
      { id: "e9", text: "Kabelverlegung ordnungsgemäß", required: false },
      { id: "e10", text: "Prüfprotokoll erstellt", required: true },
    ],
  },
  {
    id: "sanitaer-abnahme",
    name: "Sanitär-Abnahme",
    description: "Prüfliste für Sanitärinstallationen",
    category: "Sanitär",
    isBuiltIn: true,
    items: [
      { id: "s1", text: "Druckprüfung Trinkwasser bestanden", required: true },
      { id: "s2", text: "Dichtheitsprüfung Abwasser bestanden", required: true },
      { id: "s3", text: "Warmwasserbereitung funktionsfähig", required: true },
      { id: "s4", text: "Armaturen dicht und funktionsfähig", required: true },
      { id: "s5", text: "WC-Spülung funktioniert", required: true },
      { id: "s6", text: "Gefälle Entwässerung korrekt", required: true },
      { id: "s7", text: "Rückstausicherung eingebaut", required: false },
      { id: "s8", text: "Isolierung Rohrleitungen vollständig", required: false },
      { id: "s9", text: "Zirkulationsleitung funktioniert", required: false },
      { id: "s10", text: "Dokumentation/Bestandsplan erstellt", required: true },
    ],
  },
  {
    id: "heizung-abnahme",
    name: "Heizung-Abnahme",
    description: "Prüfliste für Heizungsanlagen",
    category: "Heizung",
    isBuiltIn: true,
    items: [
      { id: "h1", text: "Druckprüfung Heizkreis bestanden", required: true },
      { id: "h2", text: "Heizkessel/Wärmepumpe in Betrieb", required: true },
      { id: "h3", text: "Heizkörper werden warm", required: true },
      { id: "h4", text: "Thermostate funktionsfähig", required: true },
      { id: "h5", text: "Hydraulischer Abgleich durchgeführt", required: true },
      { id: "h6", text: "Fußbodenheizung gleichmäßig", required: false },
      { id: "h7", text: "Abgasanlage geprüft", required: true },
      { id: "h8", text: "Ausdehnungsgefäß korrekt", required: true },
      { id: "h9", text: "Regelung eingestellt", required: true },
      { id: "h10", text: "Inbetriebnahmeprotokoll erstellt", required: true },
    ],
  },
  {
    id: "sicherheit-baustelle",
    name: "Baustellensicherheit",
    description: "Tägliche Sicherheitsprüfung der Baustelle",
    category: "Sicherheit",
    isBuiltIn: true,
    items: [
      { id: "si1", text: "Baustellenabsicherung/Bauzaun intakt", required: true },
      { id: "si2", text: "Gerüste standsicher und geprüft", required: true },
      { id: "si3", text: "Absturzsicherungen vorhanden", required: true },
      { id: "si4", text: "Erste-Hilfe-Material vorhanden", required: true },
      { id: "si5", text: "PSA wird getragen", required: true },
      { id: "si6", text: "Verkehrswege frei und beleuchtet", required: true },
      { id: "si7", text: "Elektrische Anlagen gesichert", required: true },
      { id: "si8", text: "Gefahrstoffe ordnungsgemäß gelagert", required: false },
      { id: "si9", text: "Kran-/Hebemittel geprüft", required: false },
      { id: "si10", text: "Unterweisung dokumentiert", required: true },
    ],
  },
];

export async function getChecklists(): Promise<Checklist[]> {
  try {
    const raw = await AsyncStorage.getItem(CHECKLISTS_KEY);
    const custom: Checklist[] = raw ? JSON.parse(raw) : [];
    const builtIn: Checklist[] = BUILT_IN_CHECKLISTS.map((c) => ({
      ...c,
      createdAt: "2024-01-01T00:00:00.000Z",
    }));
    return [...builtIn, ...custom];
  } catch {
    return BUILT_IN_CHECKLISTS.map((c) => ({ ...c, createdAt: "2024-01-01T00:00:00.000Z" }));
  }
}

export async function saveCustomChecklist(checklist: Checklist): Promise<void> {
  const raw = await AsyncStorage.getItem(CHECKLISTS_KEY);
  const custom: Checklist[] = raw ? JSON.parse(raw) : [];
  const idx = custom.findIndex((c) => c.id === checklist.id);
  if (idx >= 0) custom[idx] = checklist;
  else custom.push(checklist);
  await AsyncStorage.setItem(CHECKLISTS_KEY, JSON.stringify(custom));
}

export async function saveModifiedBuiltInChecklist(checklist: Checklist): Promise<void> {
  const key = `checklist-modified-${checklist.id}`;
  await AsyncStorage.setItem(key, JSON.stringify(checklist.items));
}

export async function getModifiedChecklistItems(checklistId: string): Promise<ChecklistItem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`checklist-modified-${checklistId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteCustomChecklist(checklistId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(CHECKLISTS_KEY);
  const custom: Checklist[] = raw ? JSON.parse(raw) : [];
  const filtered = custom.filter((c) => c.id !== checklistId);
  await AsyncStorage.setItem(CHECKLISTS_KEY, JSON.stringify(filtered));
}

// Checklist Results
export async function getChecklistResults(projectId?: string): Promise<ChecklistResult[]> {
  try {
    const raw = await AsyncStorage.getItem(CHECKLIST_RESULTS_KEY);
    const results: ChecklistResult[] = raw ? JSON.parse(raw) : [];
    if (projectId) return results.filter((r) => r.projectId === projectId);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function saveChecklistResult(result: ChecklistResult): Promise<void> {
  const raw = await AsyncStorage.getItem(CHECKLIST_RESULTS_KEY);
  const results: ChecklistResult[] = raw ? JSON.parse(raw) : [];
  const idx = results.findIndex((r) => r.id === result.id);
  if (idx >= 0) results[idx] = result;
  else results.push(result);
  await AsyncStorage.setItem(CHECKLIST_RESULTS_KEY, JSON.stringify(results));
}

export async function deleteChecklistResult(resultId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(CHECKLIST_RESULTS_KEY);
  const results: ChecklistResult[] = raw ? JSON.parse(raw) : [];
  const filtered = results.filter((r) => r.id !== resultId);
  await AsyncStorage.setItem(CHECKLIST_RESULTS_KEY, JSON.stringify(filtered));
}

export function getChecklistCompletionRate(result: ChecklistResult): number {
  if (result.results.length === 0) return 0;
  const checked = result.results.filter((r) => r.checked).length;
  return Math.round((checked / result.results.length) * 100);
}

export function formatChecklistForPDF(result: ChecklistResult, checklist: Checklist): string {
  let text = `CHECKLISTE: ${checklist.name}\n`;
  text += `Prüfer: ${result.inspector}\n`;
  text += `Datum: ${new Date(result.createdAt).toLocaleDateString("de-DE")}\n`;
  if (result.location) text += `Ort: ${result.location}\n`;
  text += "\n";

  checklist.items.forEach((item) => {
    const itemResult = result.results.find((r) => r.itemId === item.id);
    const status = itemResult?.checked ? "✓" : "✗";
    const required = item.required ? " *" : "";
    text += `[${status}] ${item.text}${required}\n`;
    if (itemResult?.note) text += `    Anmerkung: ${itemResult.note}\n`;
  });

  const rate = getChecklistCompletionRate(result);
  text += `\nErgebnis: ${rate}% abgeschlossen\n`;
  return text;
}
