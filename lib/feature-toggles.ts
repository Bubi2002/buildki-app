import AsyncStorage from "@react-native-async-storage/async-storage";

const FEATURE_TOGGLES_KEY = "feature-toggles";

export type FeatureKey =
  | "protocolPreview"
  | "photoAnnotation"
  | "signature"
  | "multiSignature"
  | "protocolCompare"
  | "taskReminders"
  | "csvExport"
  | "backup"
  | "watermark"
  | "protocolNumbering"
  | "weatherIntegration"
  | "locationTracking"
  | "voiceCommands"
  | "calendarIntegration"
  | "cloudSync"
  | "biometricLock"
  | "offlineMode"
  | "statistics"
  | "tags"
  | "quickNotes";

export type FeatureToggle = {
  key: FeatureKey;
  label: string;
  description: string;
  enabled: boolean;
  category: "Kernfunktionen" | "Aufnahme" | "Protokoll" | "Export & Teilen" | "Sicherheit" | "Erweitert";
};

const DEFAULT_TOGGLES: FeatureToggle[] = [
  // Kernfunktionen
  { key: "protocolPreview", label: "Protokoll-Vorschau", description: "Vorschau vor dem Speichern anzeigen", enabled: false, category: "Kernfunktionen" },
  { key: "protocolNumbering", label: "Automatische Nummerierung", description: "Fortlaufende Nummern pro Projekt", enabled: true, category: "Kernfunktionen" },
  { key: "quickNotes", label: "Schnellnotizen", description: "Sprach-zu-Text ohne Video", enabled: true, category: "Kernfunktionen" },
  { key: "statistics", label: "Statistik-Dashboard", description: "Protokoll- und Aufgaben-Statistiken", enabled: true, category: "Kernfunktionen" },

  // Aufnahme
  { key: "voiceCommands", label: "Sprachbefehle", description: "Foto/Markierung per Sprachbefehl", enabled: true, category: "Aufnahme" },
  { key: "locationTracking", label: "GPS-Standort", description: "Automatische Standort-Ermittlung", enabled: true, category: "Aufnahme" },
  { key: "weatherIntegration", label: "Wetter-Daten", description: "Wetter automatisch zum Protokoll hinzufügen", enabled: true, category: "Aufnahme" },
  { key: "calendarIntegration", label: "Kalender-Verknüpfung", description: "Protokolle mit Kalendereinträgen verknüpfen", enabled: false, category: "Aufnahme" },

  // Protokoll
  { key: "photoAnnotation", label: "Foto-Annotation", description: "Auf Fotos zeichnen und beschriften", enabled: true, category: "Protokoll" },
  { key: "signature", label: "Unterschrift", description: "Digitale Signatur im Protokoll", enabled: true, category: "Protokoll" },
  { key: "multiSignature", label: "Mehrere Unterschriften", description: "Rollen-basierte Signaturen", enabled: false, category: "Protokoll" },
  { key: "protocolCompare", label: "Protokoll-Vergleich", description: "Zwei Protokolle vergleichen", enabled: false, category: "Protokoll" },
  { key: "tags", label: "Tags & Labels", description: "Protokolle mit Farb-Tags versehen", enabled: true, category: "Protokoll" },

  // Export & Teilen
  { key: "csvExport", label: "CSV-Export", description: "Aufgabenliste als CSV exportieren", enabled: true, category: "Export & Teilen" },
  { key: "watermark", label: "Wasserzeichen", description: "Firmenstempel auf PDF-Seiten", enabled: false, category: "Export & Teilen" },
  { key: "backup", label: "Datensicherung", description: "Backup erstellen und wiederherstellen", enabled: true, category: "Export & Teilen" },

  // Sicherheit
  { key: "biometricLock", label: "Biometrische Sperre", description: "App-Sperre per Face ID/Fingerabdruck", enabled: false, category: "Sicherheit" },
  { key: "cloudSync", label: "Cloud-Sync", description: "Geräteübergreifende Synchronisation", enabled: false, category: "Sicherheit" },

  // Erweitert
  { key: "taskReminders", label: "Aufgaben-Erinnerungen", description: "Push-Benachrichtigungen bei Fristablauf", enabled: true, category: "Erweitert" },
  { key: "offlineMode", label: "Offline-Modus", description: "Netzwerk-Status und Sync-Anzeige", enabled: true, category: "Erweitert" },
];

let cachedToggles: FeatureToggle[] | null = null;

export async function getFeatureToggles(): Promise<FeatureToggle[]> {
  if (cachedToggles) return cachedToggles;

  try {
    const stored = await AsyncStorage.getItem(FEATURE_TOGGLES_KEY);
    if (stored) {
      const savedMap: Record<string, boolean> = JSON.parse(stored);
      
      // Migration v1.0.6: Force protocolPreview to false for existing users
      // who had it enabled by the old default. This prevents confusion where
      // the protocol appears to be lost after processing.
      const migrationKey = "feature-toggles-migration-v106";
      const migrated = await AsyncStorage.getItem(migrationKey);
      if (!migrated && savedMap["protocolPreview"] === true) {
        savedMap["protocolPreview"] = false;
        await AsyncStorage.setItem(FEATURE_TOGGLES_KEY, JSON.stringify(savedMap));
        await AsyncStorage.setItem(migrationKey, "done");
      }
      
      // Merge saved state with defaults (handles new features)
      cachedToggles = DEFAULT_TOGGLES.map((toggle) => ({
        ...toggle,
        enabled: savedMap[toggle.key] !== undefined ? savedMap[toggle.key] : toggle.enabled,
      }));
    } else {
      cachedToggles = [...DEFAULT_TOGGLES];
    }
  } catch {
    cachedToggles = [...DEFAULT_TOGGLES];
  }

  return cachedToggles;
}

export async function setFeatureEnabled(key: FeatureKey, enabled: boolean): Promise<void> {
  const toggles = await getFeatureToggles();
  const toggle = toggles.find((t) => t.key === key);
  if (toggle) {
    toggle.enabled = enabled;
  }
  cachedToggles = toggles;

  // Persist as a simple key->boolean map
  const map: Record<string, boolean> = {};
  for (const t of toggles) {
    map[t.key] = t.enabled;
  }
  await AsyncStorage.setItem(FEATURE_TOGGLES_KEY, JSON.stringify(map));
}

export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  const toggles = await getFeatureToggles();
  const toggle = toggles.find((t) => t.key === key);
  return toggle?.enabled ?? true;
}

// Synchronous check (uses cache, call getFeatureToggles first)
export function isFeatureEnabledSync(key: FeatureKey): boolean {
  if (!cachedToggles) return true; // Default to enabled if not loaded
  const toggle = cachedToggles.find((t) => t.key === key);
  return toggle?.enabled ?? true;
}

export function getFeatureTogglesByCategory(): Record<string, FeatureToggle[]> {
  const toggles = cachedToggles || DEFAULT_TOGGLES;
  const grouped: Record<string, FeatureToggle[]> = {};
  for (const toggle of toggles) {
    if (!grouped[toggle.category]) grouped[toggle.category] = [];
    grouped[toggle.category].push(toggle);
  }
  return grouped;
}
