/**
 * protoKI – Construction Brain
 * 
 * Zentraler Projektassistent. Arbeitet AUSSCHLIESSLICH auf dem Knowledge Layer.
 * Analysiert niemals direkt Bilder, Dateien oder Rohdaten.
 * 
 * Architektur:
 * 1. Intent-Erkennung (lokal, ohne LLM)
 * 2. Knowledge Layer Query (strukturierte Daten)
 * 3. Antwort-Formatierung (lokal oder via LLM für natürliche Sprache)
 * 
 * Unterstützte Fragen:
 * - Welche Mängel sind offen?
 * - Welche Räume sind fertig?
 * - Welche Gewerke sind kritisch?
 * - Was hat sich diese Woche geändert?
 * - Welche Aufgaben sind überfällig?
 * - Welche Dokumente betreffen Raum X?
 * - Welche Fotos zeigen Y?
 * - Tageszusammenfassung
 * - Wochenbericht
 */

import { knowledgeLayer } from "./knowledge-layer";
import { t as tr, type Language } from "@/lib/i18n";

// Response texts are localized. The current language is set per ask() call
// (calls are sequential, so a module-level value is safe).
let BRAIN_LANG: Language = "de";
function T(key: string, vars?: Record<string, string | number>): string {
  let s = tr(key as any, BRAIN_LANG);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return s;
}

// ─── Intent Types ───────────────────────────────────────────────────────────

export type BrainIntent =
  | "open_defects"
  | "open_tasks"
  | "overdue_tasks"
  | "critical_trades"
  | "room_status"
  | "weekly_changes"
  | "daily_summary"
  | "weekly_report"
  | "room_query"
  | "trade_query"
  | "photo_query"
  | "document_query"
  | "project_summary"
  | "progress_status"
  | "matterport_status"
  | "scan_comparison"
  | "unknown";

export interface BrainQuery {
  intent: BrainIntent;
  params: {
    room?: string;
    trade?: string;
    timeRange?: "today" | "week" | "month";
    severity?: string;
    keyword?: string;
  };
  originalText: string;
}

export interface BrainResponse {
  intent: BrainIntent;
  title: string;
  summary: string;
  details: BrainResponseDetail[];
  stats?: Record<string, number | string>;
  suggestions?: string[];
}

export interface BrainResponseDetail {
  type: "defect" | "task" | "observation" | "progress" | "info";
  content: string;
  metadata?: Record<string, unknown>;
}

// ─── Intent Detection (local, no LLM) ──────────────────────────────────────

const INTENT_PATTERNS: { intent: BrainIntent; patterns: RegExp[] }[] = [
  {
    intent: "open_defects",
    patterns: [
      /m[aä]ngel.*offen/i,
      /offene.*m[aä]ngel/i,
      /welche.*m[aä]ngel/i,
      /m[aä]ngel.*status/i,
      /m[aä]ngelliste/i,
      /unerledigte.*m[aä]ngel/i,
    ],
  },
  {
    intent: "overdue_tasks",
    patterns: [
      /[uü]berf[aä]llig/i,
      /aufgaben.*[uü]berf[aä]llig/i,
      /versp[aä]t/i,
      /frist.*abgelaufen/i,
      /deadline.*[uü]berschritten/i,
    ],
  },
  {
    intent: "open_tasks",
    patterns: [
      /aufgaben.*offen/i,
      /offene.*aufgaben/i,
      /welche.*aufgaben/i,
      /to.?do/i,
      /was.*zu tun/i,
      /was.*erledigen/i,
    ],
  },
  {
    intent: "critical_trades",
    patterns: [
      /kritisch.*gewerk/i,
      /gewerk.*kritisch/i,
      /gewerk.*problem/i,
      /welche.*gewerk/i,
      /problem.*gewerk/i,
      /blockiert/i,
    ],
  },
  {
    intent: "room_status",
    patterns: [
      /r[aä]um.*fertig/i,
      /fertige.*r[aä]um/i,
      /welche.*r[aä]um.*fertig/i,
      /raumstatus/i,
      /status.*r[aä]um/i,
    ],
  },
  {
    intent: "weekly_changes",
    patterns: [
      /diese.*woche.*ge[aä]ndert/i,
      /woche.*[aä]nderung/i,
      /was.*neu.*woche/i,
      /wochenupdate/i,
      /was.*passiert.*woche/i,
    ],
  },
  {
    intent: "daily_summary",
    patterns: [
      /tageszusammenfassung/i,
      /heute.*zusammenfassung/i,
      /was.*heute/i,
      /tages[uü]bersicht/i,
      /status.*heute/i,
    ],
  },
  {
    intent: "weekly_report",
    patterns: [
      /wochenbericht/i,
      /wochen[uü]bersicht/i,
      /bericht.*woche/i,
      /woche.*bericht/i,
      /weekly.*report/i,
    ],
  },
  {
    intent: "room_query",
    patterns: [
      /raum\s+\w+/i,
      /zimmer\s+\w+/i,
      /was.*raum/i,
      /dokument.*raum/i,
      /raum.*betrifft/i,
      /betreff.*raum/i,
    ],
  },
  {
    intent: "trade_query",
    patterns: [
      /gewerk\s+\w+/i,
      /trockenbau/i,
      /fliesen/i,
      /elektro/i,
      /sanit[aä]r/i,
      /heizung/i,
      /maler/i,
      /estrich/i,
      /rohbau/i,
    ],
  },
  {
    intent: "photo_query",
    patterns: [
      /foto.*zeig/i,
      /bild.*zeig/i,
      /welche.*foto/i,
      /fotos.*von/i,
      /bilder.*von/i,
    ],
  },
  {
    intent: "document_query",
    patterns: [
      /dokument.*betrifft/i,
      /welche.*dokument/i,
      /unterlagen/i,
      /plan.*f[uü]r/i,
    ],
  },
  {
    intent: "progress_status",
    patterns: [
      /fortschritt/i,
      /baufortschritt/i,
      /wie.*weit/i,
      /status.*projekt/i,
      /fertigstellung/i,
      /prozent.*fertig/i,
    ],
  },
  {
    intent: "project_summary",
    patterns: [
      /projekt[uü]bersicht/i,
      /zusammenfassung.*projekt/i,
      /projekt.*status/i,
      /[uü]berblick/i,
    ],
  },
  {
    intent: "matterport_status",
    patterns: [
      /matterport/i,
      /3d.*scan/i,
      /scan.*status/i,
      /modell.*status/i,
      /r[aä]um.*scan/i,
    ],
  },
  {
    intent: "scan_comparison",
    patterns: [
      /scan.*vergleich/i,
      /vergleich.*scan/i,
      /[aä]nderung.*scan/i,
      /vorher.*nachher/i,
    ],
  },
];

// ─── Room/Trade Extraction ──────────────────────────────────────────────────

const KNOWN_ROOMS_PATTERN = /(?:raum|zimmer|bad|k[uü]che|flur|wohnzimmer|schlafzimmer|keller|dachgeschoss|eg|og|ug|dg)\s*\d*/i;
const KNOWN_TRADES = [
  "trockenbau", "fliesen", "elektro", "sanitär", "heizung",
  "maler", "estrich", "rohbau", "dachdecker", "zimmerer",
  "schlosser", "tischler", "bodenbelag", "putz", "fenster",
];

function extractRoom(text: string): string | undefined {
  const match = text.match(KNOWN_ROOMS_PATTERN);
  if (match) return match[0].trim();
  // Try "Raum EG 03" pattern
  const roomPattern = text.match(/(?:raum|zimmer)\s+([A-Za-z0-9\s]+)/i);
  if (roomPattern) return roomPattern[1].trim();
  return undefined;
}

function extractTrade(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const trade of KNOWN_TRADES) {
    if (lower.includes(trade)) return trade;
  }
  // Try "Gewerk X" pattern
  const tradePattern = text.match(/gewerk\s+([A-Za-zäöüÄÖÜß]+)/i);
  if (tradePattern) return tradePattern[1].trim();
  return undefined;
}

// ─── Construction Brain Class ───────────────────────────────────────────────

class ConstructionBrain {

  /**
   * Detect intent from user query (local, no LLM needed).
   */
  detectIntent(text: string): BrainQuery {
    const lower = text.toLowerCase();

    for (const { intent, patterns } of INTENT_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(lower)) {
          return {
            intent,
            params: {
              room: extractRoom(text),
              trade: extractTrade(text),
              timeRange: lower.includes("heute") ? "today" : lower.includes("woche") ? "week" : lower.includes("monat") ? "month" : undefined,
              keyword: undefined,
            },
            originalText: text,
          };
        }
      }
    }

    return {
      intent: "unknown",
      params: {
        room: extractRoom(text),
        trade: extractTrade(text),
      },
      originalText: text,
    };
  }

  /**
   * Execute a query against the Knowledge Layer.
   * Returns structured data – NO raw file analysis.
   */
  async executeQuery(projectId: string, query: BrainQuery): Promise<BrainResponse> {
    switch (query.intent) {
      case "open_defects":
        return this.handleOpenDefects(projectId, query);
      case "open_tasks":
        return this.handleOpenTasks(projectId, query);
      case "overdue_tasks":
        return this.handleOverdueTasks(projectId, query);
      case "critical_trades":
        return this.handleCriticalTrades(projectId);
      case "room_status":
        return this.handleRoomStatus(projectId);
      case "weekly_changes":
        return this.handleWeeklyChanges(projectId);
      case "daily_summary":
        return this.handleDailySummary(projectId);
      case "weekly_report":
        return this.handleWeeklyReport(projectId);
      case "room_query":
        return this.handleRoomQuery(projectId, query);
      case "trade_query":
        return this.handleTradeQuery(projectId, query);
      case "photo_query":
        return this.handlePhotoQuery(projectId, query);
      case "document_query":
        return this.handleDocumentQuery(projectId, query);
      case "progress_status":
        return this.handleProgressStatus(projectId);
      case "project_summary":
        return this.handleProjectSummary(projectId);
      case "matterport_status":
        return this.handleMatterportStatus(projectId);
      case "scan_comparison":
        return this.handleScanComparison(projectId);
      default:
        return this.handleUnknown(projectId, query);
    }
  }

  /**
   * Full pipeline: detect intent → query knowledge layer → format response.
   */
  async ask(projectId: string, question: string, lang?: Language): Promise<BrainResponse> {
    BRAIN_LANG = lang || "de";
    const query = this.detectIntent(question);
    return this.executeQuery(projectId, query);
  }

  // ─── Intent Handlers ────────────────────────────────────────────────────────

  private async handleOpenDefects(projectId: string, query: BrainQuery): Promise<BrainResponse> {
    const entries = await knowledgeLayer.getOpenDefects(projectId, {
      room: query.params.room,
      trade: query.params.trade,
    });

    const details: BrainResponseDetail[] = entries.slice(0, 10).map(e => ({
      type: "defect" as const,
      content: e.content,
      metadata: {
        room: e.metadata.location,
        trade: e.metadata.trade,
        severity: e.metadata.severity,
        date: e.timestamp,
      },
    }));

    const bySeverity: Record<string, number> = {};
    for (const e of entries) {
      const sev = (e.metadata.severity as string) || "unbekannt";
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    }

    return {
      intent: "open_defects",
      title: T('brain_open_defects_title'),
      summary: entries.length === 0
        ? T('brain_defects_none')
        : `${T('brain_defects_count', { n: entries.length })}${query.params.room ? ` · ${query.params.room}` : ""}${query.params.trade ? ` · ${query.params.trade}` : ""}`,
      details,
      stats: { [T('brain_stat_total')]: entries.length, ...bySeverity },
      suggestions: entries.length > 0
        ? ["Welche Gewerke sind kritisch?", "Welche Aufgaben sind überfällig?"]
        : ["Wie ist der Baufortschritt?"],
    };
  }

  private async handleOpenTasks(projectId: string, query: BrainQuery): Promise<BrainResponse> {
    const entries = await knowledgeLayer.getOpenTasks(projectId, {
      trade: query.params.trade,
    });

    const details: BrainResponseDetail[] = entries.slice(0, 10).map(e => ({
      type: "task" as const,
      content: e.content,
      metadata: {
        trade: e.metadata.trade,
        priority: e.metadata.priority,
        deadline: e.metadata.deadline,
      },
    }));

    return {
      intent: "open_tasks",
      title: T('brain_open_tasks_title'),
      summary: entries.length === 0
        ? T('brain_tasks_none')
        : `${T('brain_tasks_count', { n: entries.length })}${query.params.trade ? ` · ${query.params.trade}` : ""}`,
      details,
      stats: { [T('brain_stat_total')]: entries.length },
      suggestions: ["Welche Aufgaben sind überfällig?", "Welche Mängel sind offen?"],
    };
  }

  private async handleOverdueTasks(projectId: string, query: BrainQuery): Promise<BrainResponse> {
    const entries = await knowledgeLayer.getOpenTasks(projectId, {
      overdue: true,
      trade: query.params.trade,
    });

    const details: BrainResponseDetail[] = entries.slice(0, 10).map(e => ({
      type: "task" as const,
      content: e.content,
      metadata: {
        trade: e.metadata.trade,
        deadline: e.metadata.deadline,
        daysOverdue: e.metadata.deadline
          ? Math.floor((Date.now() - new Date(e.metadata.deadline as string).getTime()) / (1000 * 60 * 60 * 24))
          : undefined,
      },
    }));

    return {
      intent: "overdue_tasks",
      title: T('brain_overdue_tasks_title'),
      summary: entries.length === 0
        ? T('brain_overdue_none')
        : T('brain_overdue_count', { n: entries.length }),
      details,
      stats: { [T('brain_stat_total')]: entries.length },
      suggestions: ["Welche Gewerke sind kritisch?", "Wochenbericht erstellen"],
    };
  }

  private async handleCriticalTrades(projectId: string): Promise<BrainResponse> {
    const { getDefects } = await import("@/lib/defect-store");
    const defects = await getDefects(projectId);
    const OPEN = new Set(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
    const byTrade: Record<string, { defects: number; high: number }> = {};
    for (const d of defects) {
      if (!OPEN.has(d.status)) continue;
      const trade = (d as any).gewerk || d.category || "Sonstiges";
      if (!byTrade[trade]) byTrade[trade] = { defects: 0, high: 0 };
      byTrade[trade].defects++;
      if (d.priority === "hoch") byTrade[trade].high++;
    }
    const trades = Object.entries(byTrade)
      .map(([trade, v]) => ({ trade, defects: v.defects, high: v.high, severity: v.high > 0 ? "hoch" : v.defects >= 3 ? "mittel" : "niedrig" }))
      .sort((a, b) => (b.high - a.high) || (b.defects - a.defects));

    const details: BrainResponseDetail[] = trades.slice(0, 20).map(tr2 => ({
      type: "info" as const,
      content: `${T('brain_trade_line', { trade: tr2.trade, n: tr2.defects })}${tr2.high ? ` · ${T('brain_trade_high', { n: tr2.high })}` : ""}`,
      metadata: { trade: tr2.trade, severity: tr2.severity },
    }));

    return {
      intent: "critical_trades",
      title: T('brain_critical_trades_title'),
      summary: trades.length === 0
        ? T('brain_trades_none')
        : T('brain_trades_count', { n: trades.length }),
      details,
      stats: { [T('brain_stat_trades')]: trades.length },
      suggestions: ["Welche Mängel sind offen?", "Welche Aufgaben sind überfällig?"],
    };
  }

  private async handleRoomStatus(projectId: string): Promise<BrainResponse> {
    const { getProjectStructure } = await import("@/lib/room-store");
    const { getDefects } = await import("@/lib/defect-store");
    const structure = await getProjectStructure(projectId);
    const defects = await getDefects(projectId);
    const OPEN = new Set(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
    const statusLabel = (s?: string) =>
      s === "fertig" ? T('brain_room_status_done') : s === "abgenommen" ? T('brain_room_status_accepted') : s === "in_arbeit" ? T('brain_room_status_in_progress') : T('brain_room_status_not_started');
    const done = structure.rooms.filter(r => r.status === "fertig" || r.status === "abgenommen").length;

    const details: BrainResponseDetail[] = structure.rooms.slice(0, 25).map(r => {
      const floorName = structure.floors.find(f => f.id === r.floorId)?.name || "";
      const openDefects = defects.filter(d => (d.room || "").trim().toLowerCase() === r.name.trim().toLowerCase() && OPEN.has(d.status)).length;
      return {
        type: "info" as const,
        content: `${floorName ? floorName + " · " : ""}${r.name} — ${statusLabel(r.status)}${openDefects ? ` · ${T('brain_room_open_defects', { n: openDefects })}` : ""}`,
        metadata: { room: r.name },
      };
    });

    return {
      intent: "room_status",
      title: T('brain_room_status_title'),
      summary: structure.rooms.length === 0
        ? T('brain_rooms_none')
        : T('brain_rooms_done', { done, total: structure.rooms.length }),
      details,
      stats: { [T('brain_stat_rooms')]: structure.rooms.length, [T('brain_stat_done')]: done },
      suggestions: ["Welche Mängel sind offen?", "Wie ist der Baufortschritt?"],
    };
  }

  private async handleWeeklyChanges(projectId: string): Promise<BrainResponse> {
    const changes = await knowledgeLayer.getWeeklyChanges(projectId);

    const details: BrainResponseDetail[] = changes.entries.slice(0, 10).map(e => ({
      type: e.type === "defect" ? "defect" : e.type === "task" ? "task" : "observation",
      content: e.content,
      metadata: { source: e.source, date: e.timestamp },
    }));

    return {
      intent: "weekly_changes",
      title: "Änderungen diese Woche",
      summary: `Diese Woche: ${changes.newDefects} neue Mängel, ${changes.newTasks} neue Aufgaben, ${changes.newObservations} Beobachtungen.`,
      details,
      stats: {
        neueMängel: changes.newDefects,
        neueAufgaben: changes.newTasks,
        neueBeobachtungen: changes.newObservations,
      },
      suggestions: ["Welche Gewerke sind kritisch?", "Tageszusammenfassung"],
    };
  }

  private async handleDailySummary(projectId: string): Promise<BrainResponse> {
    const { getDefects } = await import("@/lib/defect-store");
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const defects = await getDefects(projectId);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const startMs = dayStart.getTime();
    const isToday = (v?: string | number) => {
      if (!v) return false;
      const t = new Date(v).getTime();
      return !isNaN(t) && t >= startMs;
    };
    const OPEN = new Set(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
    const newDefects = defects.filter(d => isToday((d as any).createdAt)).length;
    const openDefects = defects.filter(d => OPEN.has(d.status)).length;

    let newTasks = 0;
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      if (raw) newTasks = (JSON.parse(raw) as any[]).filter(tk => tk.projectId === projectId && isToday(tk.createdAt)).length;
    } catch {}

    const details: BrainResponseDetail[] = [
      { type: "defect", content: T('brain_daily_new_defects', { n: newDefects }), metadata: {} },
      { type: "task", content: T('brain_daily_new_tasks', { n: newTasks }), metadata: {} },
      { type: "info", content: T('brain_room_open_defects', { n: openDefects }), metadata: {} },
    ];

    const total = newDefects + newTasks;
    return {
      intent: "daily_summary",
      title: T('brain_daily_title'),
      summary: total === 0 ? T('brain_daily_none') : T('brain_daily_summary', { defects: newDefects, tasks: newTasks }),
      details,
      stats: { [T('brain_stat_new')]: total, [T('brain_stat_total')]: openDefects },
      suggestions: ["Offene Mängel?", "Wochenbericht erstellen"],
    };
  }

  private async handleWeeklyReport(projectId: string): Promise<BrainResponse> {
    const { getDefects } = await import("@/lib/defect-store");
    const { progressEngine } = await import("@/lib/progress-engine");
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const defects = await getDefects(projectId);
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceMs = since.getTime();
    const inWeek = (v?: string | number) => {
      if (!v) return false;
      const t = new Date(v).getTime();
      return !isNaN(t) && t >= sinceMs;
    };
    const OPEN = new Set(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
    const newDefects = defects.filter(d => inWeek((d as any).createdAt)).length;
    const openDefs = defects.filter(d => OPEN.has(d.status));
    const byTrade = new Map<string, number>();
    openDefs.forEach(d => { const g = ((d as any).gewerk || "—") as string; byTrade.set(g, (byTrade.get(g) || 0) + 1); });
    const criticalCount = byTrade.size;

    let newTasks = 0;
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      if (raw) newTasks = (JSON.parse(raw) as any[]).filter(tk => tk.projectId === projectId && inWeek(tk.createdAt)).length;
    } catch {}

    const snap = await progressEngine.calculateProgress(projectId);

    const details: BrainResponseDetail[] = [
      { type: "defect", content: T('brain_weekly_defects', { n: newDefects }), metadata: {} },
      { type: "task", content: T('brain_weekly_tasks', { n: newTasks }), metadata: {} },
      { type: "progress", content: T('brain_weekly_progress', { p: snap.overallPercent }), metadata: { progress: snap } },
    ];
    if (criticalCount > 0) {
      details.push({ type: "info", content: T('brain_trades_count', { n: criticalCount }), metadata: {} });
    }

    return {
      intent: "weekly_report",
      title: T('brain_weekly_title'),
      summary: T('brain_weekly_summary', { defects: newDefects, tasks: newTasks }),
      details,
      stats: { [T('brain_stat_new')]: newDefects + newTasks, [T('brain_stat_trades')]: criticalCount, [T('brain_stat_progress')]: `${snap.overallPercent}%` },
      suggestions: ["Welche Gewerke sind kritisch?", "Überfällige Aufgaben?"],
    };
  }

  private async handleRoomQuery(projectId: string, query: BrainQuery): Promise<BrainResponse> {
    const room = query.params.room || extractRoom(query.originalText) || "";
    if (!room) {
      const rooms = await knowledgeLayer.getProjectRooms(projectId);
      return {
        intent: "room_query",
        title: "Räume im Projekt",
        summary: rooms.length > 0 ? `${rooms.length} Räume erfasst: ${rooms.slice(0, 10).join(", ")}` : "Keine Räume erfasst.",
        details: [],
        suggestions: rooms.slice(0, 3).map(r => `Was betrifft Raum ${r}?`),
      };
    }

    const entries = await knowledgeLayer.getByRoom(projectId, room);
    const details: BrainResponseDetail[] = entries.slice(0, 10).map(e => ({
      type: e.type === "defect" ? "defect" : e.type === "task" ? "task" : "observation",
      content: e.content,
      metadata: { source: e.source, date: e.timestamp },
    }));

    return {
      intent: "room_query",
      title: `Raum: ${room}`,
      summary: `${entries.length} Einträge für ${room} (${entries.filter(e => e.type === "defect").length} Mängel, ${entries.filter(e => e.type === "task").length} Aufgaben).`,
      details,
      stats: {
        einträge: entries.length,
        mängel: entries.filter(e => e.type === "defect").length,
        aufgaben: entries.filter(e => e.type === "task").length,
      },
      suggestions: [`Mängel in ${room}?`, "Raumstatus alle Räume"],
    };
  }

  private async handleTradeQuery(projectId: string, query: BrainQuery): Promise<BrainResponse> {
    const trade = query.params.trade || extractTrade(query.originalText) || "";
    if (!trade) {
      const trades = await knowledgeLayer.getProjectTrades(projectId);
      return {
        intent: "trade_query",
        title: "Gewerke im Projekt",
        summary: trades.length > 0 ? `${trades.length} Gewerke: ${trades.join(", ")}` : "Keine Gewerke erfasst.",
        details: [],
        suggestions: trades.slice(0, 3).map(t => `Status ${t}?`),
      };
    }

    const entries = await knowledgeLayer.getByTrade(projectId, trade);
    const details: BrainResponseDetail[] = entries.slice(0, 10).map(e => ({
      type: e.type === "defect" ? "defect" : e.type === "task" ? "task" : "observation",
      content: e.content,
      metadata: { date: e.timestamp, room: e.metadata.location },
    }));

    return {
      intent: "trade_query",
      title: `Gewerk: ${trade}`,
      summary: `${entries.length} Einträge für ${trade} (${entries.filter(e => e.type === "defect").length} Mängel, ${entries.filter(e => e.type === "task").length} Aufgaben).`,
      details,
      stats: {
        einträge: entries.length,
        mängel: entries.filter(e => e.type === "defect").length,
        aufgaben: entries.filter(e => e.type === "task").length,
      },
      suggestions: [`Mängel ${trade}?`, "Kritische Gewerke?"],
    };
  }

  private async handlePhotoQuery(projectId: string, query: BrainQuery): Promise<BrainResponse> {
    const entries = await knowledgeLayer.getBySource(projectId, "photo");
    const keyword = query.params.room || query.params.trade || "";

    let filtered = entries;
    if (keyword) {
      const lower = keyword.toLowerCase();
      filtered = entries.filter(e => e.content.toLowerCase().includes(lower) || (e.metadata.location as string || "").toLowerCase().includes(lower));
    }

    const details: BrainResponseDetail[] = filtered.slice(0, 10).map(e => ({
      type: "observation",
      content: e.content,
      metadata: { date: e.timestamp, room: e.metadata.location },
    }));

    return {
      intent: "photo_query",
      title: "Foto-Analysen",
      summary: `${filtered.length} Foto-Einträge${keyword ? ` zu "${keyword}"` : ""}.`,
      details,
      stats: { fotoEinträge: filtered.length },
      suggestions: ["Offene Mängel?", "Baufortschritt?"],
    };
  }

  private async handleDocumentQuery(projectId: string, query: BrainQuery): Promise<BrainResponse> {
    const entries = await knowledgeLayer.getBySource(projectId, "document");
    const keyword = query.params.room || query.params.trade || "";

    let filtered = entries;
    if (keyword) {
      const lower = keyword.toLowerCase();
      filtered = entries.filter(e => e.content.toLowerCase().includes(lower));
    }

    const details: BrainResponseDetail[] = filtered.slice(0, 10).map(e => ({
      type: "observation",
      content: e.content,
      metadata: { date: e.timestamp },
    }));

    return {
      intent: "document_query",
      title: "Dokument-Einträge",
      summary: `${filtered.length} Dokument-Einträge${keyword ? ` zu "${keyword}"` : ""}.`,
      details,
      stats: { dokumentEinträge: filtered.length },
      suggestions: ["Projektübersicht?", "Offene Aufgaben?"],
    };
  }

  private async handleProgressStatus(projectId: string): Promise<BrainResponse> {
    const { progressEngine } = await import("@/lib/progress-engine");
    const { getProjectStructure } = await import("@/lib/room-store");
    const { getDefects } = await import("@/lib/defect-store");
    const snap = await progressEngine.calculateProgress(projectId);
    const structure = await getProjectStructure(projectId);
    const defects = await getDefects(projectId);
    const OPEN = new Set(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
    const roomsDone = structure.rooms.filter(r => r.status === "fertig" || r.status === "abgenommen").length;
    const openDefects = defects.filter(d => OPEN.has(d.status)).length;

    const details: BrainResponseDetail[] = [
      { type: "progress", content: T('brain_progress_line', { p: snap.overallPercent, phase: snap.phase || "-" }), metadata: { progress: snap } },
      { type: "info", content: T('brain_rooms_done', { done: roomsDone, total: structure.rooms.length }), metadata: {} },
      { type: "info", content: T('brain_room_open_defects', { n: openDefects }), metadata: {} },
    ];

    return {
      intent: "progress_status",
      title: T('brain_progress_title'),
      summary: T('brain_progress_summary', { p: snap.overallPercent, phase: snap.phase || "-" }),
      details,
      stats: { [T('brain_stat_progress')]: `${snap.overallPercent}%`, [T('brain_stat_rooms')]: structure.rooms.length, [T('brain_stat_total')]: openDefects },
      suggestions: ["Welche Gewerke sind kritisch?", "Wochenbericht erstellen"],
    };
  }

  private async handleProjectSummary(projectId: string): Promise<BrainResponse> {
    const { getDefects } = await import("@/lib/defect-store");
    const { getProjectStructure } = await import("@/lib/room-store");
    const { progressEngine } = await import("@/lib/progress-engine");
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const defects = await getDefects(projectId);
    const structure = await getProjectStructure(projectId);
    const snap = await progressEngine.calculateProgress(projectId);
    const OPEN = new Set(["offen", "zugewiesen", "in_bearbeitung", "nachbesserung", "pruefung"]);
    const openDefects = defects.filter(d => OPEN.has(d.status)).length;
    const roomsDone = structure.rooms.filter(r => r.status === "fertig" || r.status === "abgenommen").length;

    let openTasks = 0;
    try {
      const raw = await AsyncStorage.getItem("project-tasks");
      if (raw) openTasks = (JSON.parse(raw) as any[]).filter(tk => tk.projectId === projectId && tk.status !== "erledigt" && tk.status !== "done").length;
    } catch {}

    const details: BrainResponseDetail[] = [
      { type: "info", content: T('brain_overview_defects', { open: openDefects, total: defects.length }), metadata: {} },
      { type: "info", content: T('brain_overview_tasks', { n: openTasks }), metadata: {} },
      { type: "info", content: T('brain_rooms_done', { done: roomsDone, total: structure.rooms.length }), metadata: {} },
      { type: "progress", content: T('brain_weekly_progress', { p: snap.overallPercent }), metadata: { progress: snap } },
    ];

    return {
      intent: "project_summary",
      title: T('brain_overview_title'),
      summary: T('brain_overview_summary', { defects: openDefects, tasks: openTasks, rooms: structure.rooms.length }),
      details,
      stats: { [T('brain_stat_total')]: defects.length, [T('brain_stat_rooms')]: structure.rooms.length, [T('brain_stat_done')]: roomsDone, [T('brain_stat_progress')]: `${snap.overallPercent}%` },
      suggestions: ["Offene Mängel?", "Baufortschritt?", "Wochenbericht"],
    };
  }

  private async handleUnknown(projectId: string, query: BrainQuery): Promise<BrainResponse> {
    // Fallback: try general search in Knowledge Layer
    const searchResults = await knowledgeLayer.searchKnowledge(projectId, query.originalText);

    if (searchResults.length > 0) {
      const details: BrainResponseDetail[] = searchResults.slice(0, 5).map(e => ({
        type: e.type === "defect" ? "defect" : e.type === "task" ? "task" : "observation",
        content: e.content,
        metadata: { source: e.source, date: e.timestamp },
      }));

      return {
        intent: "unknown",
        title: "Suchergebnisse",
        summary: `${searchResults.length} relevante Einträge gefunden.`,
        details,
        suggestions: [
          "Offene Mängel?",
          "Welche Gewerke sind kritisch?",
          "Tageszusammenfassung",
        ],
      };
    }

    return {
      intent: "unknown",
      title: "Keine Ergebnisse",
      summary: "Zu dieser Frage liegen keine Daten im Knowledge Layer vor. Bitte Fotos, Sprache oder Dokumente analysieren, um die Wissensbasis zu füllen.",
      details: [],
      suggestions: [
        "Projektübersicht",
        "Offene Mängel?",
        "Was hat sich diese Woche geändert?",
      ],
    };
  }

  private async handleMatterportStatus(projectId: string): Promise<BrainResponse> {
    const entries = await knowledgeLayer.getBySource(projectId, "matterport");
    const rooms = entries.filter(e => e.metadata.type === "room");
    const tags = entries.filter(e => e.metadata.type === "tag");

    return {
      intent: "matterport_status",
      title: "Matterport Status",
      summary: entries.length === 0
        ? "Noch kein Matterport-Modell verknüpft. Bitte im Werkzeuge-Tab verbinden."
        : `${rooms.length} Räume und ${tags.length} Tags aus Matterport erfasst.`,
      details: entries.slice(0, 10).map(e => ({
        type: "info" as const,
        content: e.content,
        metadata: { date: e.timestamp },
      })),
      stats: { räume: rooms.length, tags: tags.length, gesamt: entries.length },
      suggestions: ["Raumstatus?", "Baufortschritt?"],
    };
  }

  private async handleScanComparison(projectId: string): Promise<BrainResponse> {
    const entries = await knowledgeLayer.getBySource(projectId, "matterport");
    const scans = entries.filter(e => e.metadata.type === "scan");

    if (scans.length < 2) {
      return {
        intent: "scan_comparison",
        title: "Scan-Vergleich",
        summary: "Für einen Vergleich werden mindestens 2 Scans benötigt. Bitte weitere Scans im Matterport-Viewer synchronisieren.",
        details: [],
        suggestions: ["Matterport Status?", "Baufortschritt?"],
      };
    }

    return {
      intent: "scan_comparison",
      title: "Scan-Vergleich",
      summary: `${scans.length} Scans verfügbar. Vergleich zeigt Änderungen zwischen Zeitpunkten.`,
      details: scans.slice(0, 5).map(s => ({
        type: "progress" as const,
        content: `Scan vom ${new Date(s.timestamp).toLocaleDateString("de-DE")}`,
        metadata: { date: s.timestamp },
      })),
      stats: { scans: scans.length },
      suggestions: ["Baufortschritt?", "Welche Räume sind fertig?"],
    };
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const constructionBrain = new ConstructionBrain();
export default constructionBrain;
