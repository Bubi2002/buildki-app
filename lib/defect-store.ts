import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFECTS_KEY = "defects";

export type DefectStatus = "offen" | "in_bearbeitung" | "erledigt";
export type DefectPriority = "hoch" | "mittel" | "niedrig";

export type Defect = {
  id: string;
  projectId: string;
  planId?: string;
  pinId?: string;
  title: string;
  description: string;
  status: DefectStatus;
  priority: DefectPriority;
  category: string;
  photos: string[];
  assignee?: string;
  dueDate?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  protocolId?: string;
};

export const DEFECT_CATEGORIES = [
  "Riss/Bruch",
  "Feuchtigkeit",
  "Elektrik",
  "Sanitär",
  "Oberfläche",
  "Maßabweichung",
  "Brandschutz",
  "Sicherheit",
  "Sonstiges",
];

export async function getDefects(projectId?: string): Promise<Defect[]> {
  try {
    const raw = await AsyncStorage.getItem(DEFECTS_KEY);
    const defects: Defect[] = raw ? JSON.parse(raw) : [];
    if (projectId) return defects.filter((d) => d.projectId === projectId);
    return defects;
  } catch {
    return [];
  }
}

export async function saveDefect(defect: Defect): Promise<void> {
  const defects = await getDefects();
  const idx = defects.findIndex((d) => d.id === defect.id);
  if (idx >= 0) defects[idx] = { ...defect, updatedAt: new Date().toISOString() };
  else defects.push(defect);
  await AsyncStorage.setItem(DEFECTS_KEY, JSON.stringify(defects));
}

export async function deleteDefect(defectId: string): Promise<void> {
  const defects = await getDefects();
  const filtered = defects.filter((d) => d.id !== defectId);
  await AsyncStorage.setItem(DEFECTS_KEY, JSON.stringify(filtered));
}

export async function updateDefectStatus(defectId: string, status: DefectStatus): Promise<void> {
  const defects = await getDefects();
  const idx = defects.findIndex((d) => d.id === defectId);
  if (idx >= 0) {
    defects[idx].status = status;
    defects[idx].updatedAt = new Date().toISOString();
    if (status === "erledigt") defects[idx].resolvedAt = new Date().toISOString();
    await AsyncStorage.setItem(DEFECTS_KEY, JSON.stringify(defects));
  }
}

export function getDefectStats(defects: Defect[]) {
  return {
    total: defects.length,
    offen: defects.filter((d) => d.status === "offen").length,
    inBearbeitung: defects.filter((d) => d.status === "in_bearbeitung").length,
    erledigt: defects.filter((d) => d.status === "erledigt").length,
    hoch: defects.filter((d) => d.priority === "hoch" && d.status !== "erledigt").length,
  };
}
