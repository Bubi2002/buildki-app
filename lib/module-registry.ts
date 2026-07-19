/**
 * protoKI – Modular Architecture Registry
 * 
 * Zentrales Modul-Register für alle KI- und Tool-Module.
 * Ermöglicht dynamische Registrierung, Aktivierung/Deaktivierung
 * und Dependency-Management zwischen Modulen.
 * 
 * Zukünftige Module (Smart Timeline, Matterport, Document AI)
 * registrieren sich hier und werden über die AI Workbench angezeigt.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ModuleCategory = "ai" | "analysis" | "export" | "integration" | "automation";

export type ModuleStatus = "active" | "inactive" | "coming_soon" | "beta";

export interface ModuleCapability {
  id: string;
  label: string;
  description: string;
}

export interface ModuleDependency {
  moduleId: string;
  required: boolean;
  reason: string;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  category: ModuleCategory;
  status: ModuleStatus;
  version: string;
  icon: string;
  color: string;
  route?: string;
  capabilities: ModuleCapability[];
  dependencies: ModuleDependency[];
  requiresAuth?: boolean;
  requiresServer?: boolean;
  settings?: Record<string, { type: "boolean" | "string" | "number"; default: any; label: string }>;
}

export interface ModuleState {
  moduleId: string;
  enabled: boolean;
  settings: Record<string, any>;
  lastUsed?: string;
  usageCount: number;
}

// ─── Registry ────────────────────────────────────────────────────────────────

const REGISTRY_KEY = "module-registry-state";

class ModuleRegistry {
  private modules: Map<string, ModuleDefinition> = new Map();
  private states: Map<string, ModuleState> = new Map();
  private initialized = false;

  /**
   * Register a module definition.
   */
  register(module: ModuleDefinition): void {
    this.modules.set(module.id, module);
  }

  /**
   * Get all registered modules.
   */
  getAll(): ModuleDefinition[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get modules by category.
   */
  getByCategory(category: ModuleCategory): ModuleDefinition[] {
    return this.getAll().filter(m => m.category === category);
  }

  /**
   * Get active modules.
   */
  getActive(): ModuleDefinition[] {
    return this.getAll().filter(m => {
      const state = this.states.get(m.id);
      return state?.enabled !== false && m.status !== "coming_soon";
    });
  }

  /**
   * Get module by ID.
   */
  get(moduleId: string): ModuleDefinition | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Get module state.
   */
  getState(moduleId: string): ModuleState {
    return this.states.get(moduleId) || {
      moduleId,
      enabled: true,
      settings: {},
      usageCount: 0,
    };
  }

  /**
   * Enable/disable a module.
   */
  async setEnabled(moduleId: string, enabled: boolean): Promise<void> {
    const state = this.getState(moduleId);
    state.enabled = enabled;
    this.states.set(moduleId, state);
    await this.saveStates();
  }

  /**
   * Update module settings.
   */
  async updateSettings(moduleId: string, settings: Record<string, any>): Promise<void> {
    const state = this.getState(moduleId);
    state.settings = { ...state.settings, ...settings };
    this.states.set(moduleId, state);
    await this.saveStates();
  }

  /**
   * Track module usage.
   */
  async trackUsage(moduleId: string): Promise<void> {
    const state = this.getState(moduleId);
    state.usageCount += 1;
    state.lastUsed = new Date().toISOString();
    this.states.set(moduleId, state);
    await this.saveStates();
  }

  /**
   * Check if all dependencies are satisfied.
   */
  checkDependencies(moduleId: string): { satisfied: boolean; missing: string[] } {
    const module = this.modules.get(moduleId);
    if (!module) return { satisfied: false, missing: ["Module not found"] };

    const missing: string[] = [];
    for (const dep of module.dependencies) {
      if (dep.required) {
        const depModule = this.modules.get(dep.moduleId);
        const depState = this.getState(dep.moduleId);
        if (!depModule || !depState.enabled) {
          missing.push(`${dep.moduleId}: ${dep.reason}`);
        }
      }
    }

    return { satisfied: missing.length === 0, missing };
  }

  /**
   * Initialize registry and load saved states.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Register built-in modules
    this.registerBuiltinModules();
    
    // Load saved states
    await this.loadStates();
    this.initialized = true;
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  private registerBuiltinModules(): void {
    // Photo Analysis
    this.register({
      id: "photo-analysis",
      name: "KI-Bildanalyse",
      description: "Erkennt Mängel, Aufgaben und Fortschritt aus Baustellenfotos",
      category: "ai",
      status: "active",
      version: "2.0.0",
      icon: "image-search",
      color: "#0EA5E9",
      route: "/photo-analysis",
      capabilities: [
        { id: "defect-detection", label: "Mängelerkennung", description: "Erkennt Baumängel automatisch" },
        { id: "task-extraction", label: "Aufgabenextraktion", description: "Leitet Aufgaben aus Bildern ab" },
        { id: "progress-tracking", label: "Fortschrittserkennung", description: "Schätzt Baufortschritt" },
      ],
      dependencies: [],
      requiresServer: true,
    });

    // Batch Analysis
    this.register({
      id: "batch-analysis",
      name: "Batch-Analyse",
      description: "Analysiert mehrere Fotos gleichzeitig mit Raum-/Zeit-Gruppierung",
      category: "ai",
      status: "active",
      version: "1.0.0",
      icon: "photo-library",
      color: "#8B5CF6",
      route: "/batch-analysis",
      capabilities: [
        { id: "multi-photo", label: "Multi-Foto", description: "Bis zu 20 Fotos gleichzeitig" },
        { id: "auto-grouping", label: "Auto-Gruppierung", description: "Gruppiert nach Raum oder Zeit" },
        { id: "bulk-review", label: "Bulk-Review", description: "Alle Ergebnisse auf einmal prüfen" },
      ],
      dependencies: [{ moduleId: "photo-analysis", required: true, reason: "Nutzt die Bildanalyse-Engine" }],
      requiresServer: true,
    });

    // AI Site Assistant
    this.register({
      id: "ai-assistant",
      name: "AI Site Assistant",
      description: "Beantwortet Fragen zum Projekt basierend auf dem Knowledge Layer",
      category: "ai",
      status: "active",
      version: "1.0.0",
      icon: "smart-toy",
      color: "#10B981",
      route: "/ai-assistant",
      capabilities: [
        { id: "knowledge-query", label: "Wissensabfrage", description: "Fragt den Knowledge Layer" },
        { id: "conversation-memory", label: "Gesprächsgedächtnis", description: "Behält Kontext über Nachrichten" },
        { id: "project-context", label: "Projektkontext", description: "Kennt alle Projektdaten" },
      ],
      dependencies: [{ moduleId: "knowledge-layer", required: true, reason: "Benötigt Wissensbasis" }],
      requiresServer: true,
    });

    // Knowledge Layer
    this.register({
      id: "knowledge-layer",
      name: "Knowledge Layer",
      description: "Zentrale Wissensbasis für alle KI-Module",
      category: "ai",
      status: "active",
      version: "1.0.0",
      icon: "psychology",
      color: "#F59E0B",
      capabilities: [
        { id: "ingest", label: "Datenaufnahme", description: "Nimmt Analyse-Ergebnisse auf" },
        { id: "search", label: "Suche", description: "Durchsucht die Wissensbasis" },
        { id: "context-gen", label: "Kontextgenerierung", description: "Erstellt KI-Kontext" },
      ],
      dependencies: [],
    });

    // Export
    this.register({
      id: "export",
      name: "Multi-Format Export",
      description: "Exportiert Daten als PDF, CSV, Excel oder JSON",
      category: "export",
      status: "active",
      version: "1.0.0",
      icon: "file-download",
      color: "#EC4899",
      route: "/export",
      capabilities: [
        { id: "pdf", label: "PDF", description: "Professionelle PDF-Berichte" },
        { id: "csv", label: "CSV", description: "Tabellenformat" },
        { id: "xlsx", label: "Excel", description: "Excel-Arbeitsmappen" },
        { id: "json", label: "JSON", description: "Strukturierte Daten" },
      ],
      dependencies: [],
    });

    // Analysis History
    this.register({
      id: "analysis-history",
      name: "Analyse-Historie",
      description: "Durchsuchbare Historie aller durchgeführten Analysen",
      category: "analysis",
      status: "active",
      version: "2.0.0",
      icon: "history",
      color: "#6366F1",
      route: "/analysis-history",
      capabilities: [
        { id: "search", label: "Volltextsuche", description: "Suche in allen Analysen" },
        { id: "filter", label: "Filter", description: "Nach Quelle, Datum, Projekt" },
        { id: "detail", label: "Detailansicht", description: "Einzelne Analyse-Details" },
      ],
      dependencies: [],
    });

    // Smart Timeline
    this.register({
      id: "smart-timeline",
      name: "Smart Timeline",
      description: "Intelligente Projektchronik – erkennt Zusammenhänge aus allen Quellen",
      category: "ai",
      status: "active",
      version: "1.0.0",
      icon: "timeline",
      color: "#14B8A6",
      route: "/smart-timeline",
      capabilities: [
        { id: "event-tracking", label: "Event-Tracking", description: "Erfasst alle Projektereignisse" },
        { id: "source-correlation", label: "Quellen-Korrelation", description: "Verknüpft Ereignisse aus verschiedenen Quellen" },
        { id: "timeline-filter", label: "Filter & Suche", description: "Filtert nach Gewerk, Raum, Quelle" },
      ],
      dependencies: [{ moduleId: "knowledge-layer", required: true, reason: "Nutzt Projektdaten" }],
    });

    // Matterport Integration (Beta – Interfaces prepared)
    this.register({
      id: "matterport",
      name: "Matterport 3D",
      description: "3D-Scan-Integration für räumliche Mängelerkennung (Schnittstellen vorbereitet)",
      category: "integration",
      status: "beta",
      version: "0.5.0",
      icon: "view-in-ar",
      color: "#7C3AED",
      capabilities: [
        { id: "scan-import", label: "Scan-Import", description: "Importiert Matterport-Scans" },
        { id: "spatial-defects", label: "Räumliche Mängel", description: "Verortet Mängel im 3D-Raum" },
        { id: "progress-compare", label: "Fortschrittsvergleich", description: "Vergleicht Zeitpunkte" },
        { id: "tag-management", label: "Tag-Verwaltung", description: "Erstellt und verwaltet 3D-Tags" },
      ],
      dependencies: [{ moduleId: "knowledge-layer", required: true, reason: "Speichert 3D-Erkenntnisse" }],
    });

    // Document AI
    this.register({
      id: "document-ai",
      name: "Document AI",
      description: "Analysiert PDF, DOCX, XLSX und Bilder – extrahiert Räume, Gewerke, Termine, Aufgaben",
      category: "ai",
      status: "active",
      version: "1.0.0",
      icon: "description",
      color: "#F97316",
      route: "/document-ai",
      capabilities: [
        { id: "entity-extraction", label: "Entitäten-Extraktion", description: "Räume, Gewerke, Personen, Firmen" },
        { id: "task-extraction", label: "Aufgaben-Extraktion", description: "Erkennt Aufgaben in Dokumenten" },
        { id: "appointment-extraction", label: "Termin-Extraktion", description: "Findet Termine und Fristen" },
        { id: "knowledge-feed", label: "Knowledge Feed", description: "Speist Ergebnisse in Knowledge Layer" },
      ],
      dependencies: [{ moduleId: "knowledge-layer", required: true, reason: "Speichert Dokumentdaten" }],
      requiresServer: true,
    });

    // Timeline Engine (internal, no route)
    this.register({
      id: "timeline-engine",
      name: "Timeline Engine",
      description: "Zentraler Event-Bus – alle Module senden Ereignisse hierher",
      category: "ai",
      status: "active",
      version: "1.0.0",
      icon: "hub",
      color: "#06B6D4",
      capabilities: [
        { id: "event-bus", label: "Event-Bus", description: "Empfängt Ereignisse von allen Modulen" },
        { id: "query", label: "Abfrage", description: "Filtert und gruppiert Ereignisse" },
        { id: "stats", label: "Statistiken", description: "Aggregiert Projektstatistiken" },
      ],
      dependencies: [],
    });

    // Entity System (internal, no route)
    this.register({
      id: "entity-system",
      name: "Entity System",
      description: "Einheitliches Datenmodell für alle Module (14 Entitätstypen)",
      category: "ai",
      status: "active",
      version: "1.0.0",
      icon: "account-tree",
      color: "#64748B",
      capabilities: [
        { id: "entity-types", label: "14 Entitätstypen", description: "Projekt bis Firma" },
        { id: "relations", label: "Relationen", description: "Verknüpfungen zwischen Entitäten" },
      ],
      dependencies: [],
    });
  }

  private async loadStates(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(REGISTRY_KEY);
      if (stored) {
        const states: ModuleState[] = JSON.parse(stored);
        for (const state of states) {
          this.states.set(state.moduleId, state);
        }
      }
    } catch {}
  }

  private async saveStates(): Promise<void> {
    try {
      const states = Array.from(this.states.values());
      await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(states));
    } catch {}
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const moduleRegistry = new ModuleRegistry();
export default moduleRegistry;
