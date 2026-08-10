/**
 * protoKI – Smart Progress Engine
 * 
 * Berechnet den Baufortschritt automatisch aus allen Quellen:
 * - Knowledge Layer (Mängel, Aufgaben, Beobachtungen)
 * - Timeline Events
 * - Matterport Scans
 * 
 * Der Fortschritt wird NICHT manuell eingegeben, sondern aus den
 * vorhandenen Daten abgeleitet.
 */
import { knowledgeLayer } from "./knowledge-layer";
import { timelineEngine } from "./timeline-engine";
import { getAllRooms } from "./room-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProgressSnapshot {
  id: string;
  projectId: string;
  timestamp: string;
  overallPercent: number;
  phase: ConstructionPhase;
  roomProgress: RoomProgress[];
  tradeProgress: TradeProgress[];
  floorProgress: FloorProgress[];
  dataPoints: number;
  confidence: number;
  sources: ProgressSource[];
}

export interface RoomProgress {
  room: string;
  floor?: string;
  percent: number;
  status: "not_started" | "in_progress" | "completed" | "blocked";
  openDefects: number;
  openTasks: number;
  lastActivity: string;
}

export interface TradeProgress {
  trade: string;
  percent: number;
  status: "not_started" | "in_progress" | "completed" | "blocked";
  totalTasks: number;
  completedTasks: number;
  openDefects: number;
  criticalIssues: number;
}

export interface FloorProgress {
  floor: string;
  percent: number;
  rooms: number;
  completedRooms: number;
}

export type ConstructionPhase =
  | "rohbau"
  | "ausbau_1"
  | "ausbau_2"
  | "ausbau_3"
  | "fertigstellung"
  | "abnahme"
  | "unknown";

export interface ProgressSource {
  type: "timeline" | "knowledge" | "matterport" | "photo" | "speech" | "document";
  count: number;
  lastUpdate: string;
}

export interface ProgressTrend {
  date: string;
  percent: number;
}

// ─── Phase Detection ────────────────────────────────────────────────────────

const PHASE_TRADES: Record<ConstructionPhase, string[]> = {
  rohbau: ["rohbau", "zimmerer", "dachdecker", "maurer"],
  ausbau_1: ["elektro", "sanitär", "heizung", "lüftung", "klima"],
  ausbau_2: ["trockenbau", "estrich", "putz", "fenster"],
  ausbau_3: ["fliesen", "maler", "bodenbelag", "tischler", "schlosser"],
  fertigstellung: ["reinigung", "außenanlage", "aufzug"],
  abnahme: [],
  unknown: [],
};

function detectPhase(activeTrades: string[]): ConstructionPhase {
  const lower = activeTrades.map(t => t.toLowerCase());
  const phases: ConstructionPhase[] = ["fertigstellung", "ausbau_3", "ausbau_2", "ausbau_1", "rohbau"];
  for (const phase of phases) {
    const phaseTrades = PHASE_TRADES[phase];
    if (phaseTrades.some(t => lower.some(l => l.includes(t)))) {
      return phase;
    }
  }
  return "unknown";
}

function extractFloor(room: string): string {
  const lower = room.toLowerCase();
  if (lower.includes("ug") || lower.includes("keller")) return "UG";
  if (lower.includes("eg") || lower.includes("erdgeschoss")) return "EG";
  if (lower.includes("1. og") || lower.includes("1.og") || lower.includes("1og")) return "1. OG";
  if (lower.includes("2. og") || lower.includes("2.og") || lower.includes("2og")) return "2. OG";
  if (lower.includes("3. og") || lower.includes("3.og") || lower.includes("3og")) return "3. OG";
  if (lower.includes("dg") || lower.includes("dachgeschoss")) return "DG";
  return "EG";
}

// ─── Progress Engine ────────────────────────────────────────────────────────

const STORAGE_KEY = "buildki_progress_snapshots";

class ProgressEngine {
  private snapshots: ProgressSnapshot[] = [];
  private loaded = false;

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this.snapshots = raw ? JSON.parse(raw) : [];
    } catch {
      this.snapshots = [];
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshots));
  }

  /**
   * Calculate current progress from all available data sources.
   */
  async calculateProgress(projectId: string): Promise<ProgressSnapshot> {
    await this.load();

    // 1. Gather data from Knowledge Layer
    const rooms = await knowledgeLayer.getProjectRooms(projectId);
    const trades = await knowledgeLayer.getProjectTrades(projectId);
    const openDefects = await knowledgeLayer.getOpenDefects(projectId, {});
    const openTasks = await knowledgeLayer.getOpenTasks(projectId, {});

    // 1b. Manueller Raum-Status aus dem Raumbuch (Räume & Geschosse). Dieser
    // vom Nutzer explizit gesetzte Status hat Vorrang vor der aus Signalen
    // abgeleiteten Schätzung – "Raum auf fertig tippen" bewegt so den Fortschritt.
    const manualRoomStatus = new Map<string, "nicht_begonnen" | "in_arbeit" | "fertig" | "abgenommen">();
    try {
      const structureRooms = await getAllRooms(projectId);
      for (const structureRoom of structureRooms) {
        if (structureRoom.status) {
          manualRoomStatus.set(structureRoom.name.trim().toLowerCase(), structureRoom.status);
        }
      }
    } catch {}

    // 2. Gather timeline events
    const events = await timelineEngine.query({ projectId, limit: 500 });

    // 3. Calculate room progress
    const roomProgress: RoomProgress[] = [];
    for (const room of rooms) {
      const roomEntries = await knowledgeLayer.getByRoom(projectId, room);
      const roomDefects = roomEntries.filter(e => e.type === "defect");
      const roomTasks = roomEntries.filter(e => e.type === "task");
      const observations = roomEntries.filter(e => e.type === "observation");
      
      const openDefectsInRoom = roomDefects.filter(d => 
        d.metadata?.status === "open" || !d.metadata?.status
      ).length;
      const openTasksInRoom = roomTasks.filter(t => 
        t.metadata?.status === "open" || !t.metadata?.status
      ).length;
      const totalSignals = observations.length + roomDefects.length + roomTasks.length;
      
      let percent = 0;
      let status: RoomProgress["status"] = "not_started";
      
      if (totalSignals === 0) {
        percent = 0;
        status = "not_started";
      } else if (openDefectsInRoom === 0 && openTasksInRoom === 0 && observations.length > 2) {
        percent = 100;
        status = "completed";
      } else if (openDefectsInRoom > 3) {
        percent = Math.min(60, observations.length * 10);
        status = "blocked";
      } else {
        const resolvedRatio = totalSignals > 0 
          ? (totalSignals - openDefectsInRoom - openTasksInRoom) / totalSignals 
          : 0;
        percent = Math.min(95, Math.round(resolvedRatio * 100));
        status = "in_progress";
      }

      // Manuellen Raum-Status anwenden (Vorrang vor der Signal-Schätzung):
      // fertig/abgenommen = 100 %, in Arbeit = mind. 50 %. "nicht begonnen"
      // bzw. kein manueller Status -> abgeleitete Werte bleiben unveraendert,
      // damit dokumentierte (aber nicht abgehakte) Raeume weiter Fortschritt zeigen.
      const roomManualStatus = manualRoomStatus.get(room.trim().toLowerCase());
      if (roomManualStatus === "fertig" || roomManualStatus === "abgenommen") {
        percent = 100;
        status = "completed";
      } else if (roomManualStatus === "in_arbeit") {
        percent = Math.max(percent, 50);
        if (status === "not_started") status = "in_progress";
      }

      const lastEntry = roomEntries.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];

      roomProgress.push({
        room,
        floor: extractFloor(room),
        percent,
        status,
        openDefects: openDefectsInRoom,
        openTasks: openTasksInRoom,
        lastActivity: lastEntry?.timestamp || new Date().toISOString(),
      });
    }

    // 4. Calculate trade progress
    const tradeProgress: TradeProgress[] = [];
    for (const trade of trades) {
      const tradeEntries = await knowledgeLayer.getByTrade(projectId, trade);
      const tradeDefects = tradeEntries.filter(e => e.type === "defect");
      const tradeTasks = tradeEntries.filter(e => e.type === "task");
      
      const openTradeDefects = tradeDefects.filter(d => 
        d.metadata?.status === "open" || !d.metadata?.status
      ).length;
      const openTradeTasks = tradeTasks.filter(t => 
        t.metadata?.status === "open" || !t.metadata?.status
      ).length;
      const completedTradeTasks = tradeTasks.length - openTradeTasks;
      
      let percent = 0;
      let status: TradeProgress["status"] = "not_started";
      
      if (tradeEntries.length === 0) {
        status = "not_started";
      } else if (openTradeDefects === 0 && openTradeTasks === 0 && tradeEntries.length > 1) {
        percent = 100;
        status = "completed";
      } else if (openTradeDefects > 5) {
        percent = Math.min(50, completedTradeTasks * 15);
        status = "blocked";
      } else {
        percent = tradeTasks.length > 0
          ? Math.round((completedTradeTasks / tradeTasks.length) * 100)
          : Math.min(80, tradeEntries.length * 10);
        status = "in_progress";
      }

      tradeProgress.push({
        trade,
        percent,
        status,
        totalTasks: tradeTasks.length,
        completedTasks: completedTradeTasks,
        openDefects: openTradeDefects,
        criticalIssues: tradeDefects.filter(d => 
          d.metadata?.severity === "critical" || d.metadata?.severity === "high"
        ).length,
      });
    }

    // 5. Calculate floor progress
    const floorMap = new Map<string, RoomProgress[]>();
    for (const rp of roomProgress) {
      const floor = rp.floor || "EG";
      const existing = floorMap.get(floor) || [];
      existing.push(rp);
      floorMap.set(floor, existing);
    }
    
    const floorProgress: FloorProgress[] = Array.from(floorMap.entries()).map(([floor, rps]) => ({
      floor,
      percent: rps.length > 0 ? Math.round(rps.reduce((sum, r) => sum + r.percent, 0) / rps.length) : 0,
      rooms: rps.length,
      completedRooms: rps.filter(r => r.status === "completed").length,
    }));

    // 6. Calculate overall progress
    const overallPercent = roomProgress.length > 0
      ? Math.round(roomProgress.reduce((sum, r) => sum + r.percent, 0) / roomProgress.length)
      : tradeProgress.length > 0
        ? Math.round(tradeProgress.reduce((sum, t) => sum + t.percent, 0) / tradeProgress.length)
        : 0;

    // 7. Detect current phase
    const activeTrades = tradeProgress
      .filter(t => t.status === "in_progress" || t.status === "blocked")
      .map(t => t.trade);
    const phase = detectPhase(activeTrades);

    // 8. Calculate confidence
    const dataPoints = openDefects.length + openTasks.length + events.length;
    const confidence = Math.min(95, Math.round((dataPoints / 50) * 100));

    // 9. Determine sources
    const sources: ProgressSource[] = [];
    const now = new Date().toISOString();
    if (events.length > 0) sources.push({ type: "timeline", count: events.length, lastUpdate: now });
    if (openDefects.length + openTasks.length > 0) sources.push({ type: "knowledge", count: openDefects.length + openTasks.length, lastUpdate: now });
    // Add matterport source if knowledge-layer has matterport entries
    try {
      const matterportEntries = await knowledgeLayer.getBySource(projectId, "matterport");
      if (matterportEntries.length > 0) {
        sources.push({ type: "matterport", count: matterportEntries.length, lastUpdate: now });
      }
    } catch {}

    // 10. Create snapshot
    const snapshot: ProgressSnapshot = {
      id: `progress_${Date.now()}`,
      projectId,
      timestamp: now,
      overallPercent,
      phase,
      roomProgress,
      tradeProgress,
      floorProgress,
      dataPoints,
      confidence,
      sources,
    };

    // Vorherigen Prozentsatz merken (VOR dem Hinzufuegen des neuen Snapshots).
    const previousPercent = this.snapshots
      .filter(s => s.projectId === projectId)
      .slice(-1)[0]?.overallPercent;

    // Save snapshot
    this.snapshots.push(snapshot);
    // Cap this project's history to 100 without discarding other projects' snapshots
    const otherProjectSnapshots = this.snapshots.filter(s => s.projectId !== projectId);
    const thisProjectSnapshots = this.snapshots.filter(s => s.projectId === projectId).slice(-100);
    this.snapshots = [...otherProjectSnapshots, ...thisProjectSnapshots];
    await this.save();

    // Timeline-Ereignis NUR bei tatsaechlicher Aenderung des Prozentsatzes.
    // Verhindert das Fluten mit identischen "Baufortschritt: X%"-Eintraegen bei
    // jeder Neuberechnung (z. B. beim Oeffnen des Screens).
    if (previousPercent !== overallPercent) {
      timelineEngine.emit({
        projectId,
        eventType: "progress_updated",
        title: `Baufortschritt: ${overallPercent}%`,
        description: `Phase: ${phase}, ${roomProgress.length} Räume, ${tradeProgress.length} Gewerke`,
        source: "system",
      });
    }

    return snapshot;
  }

  /**
   * Get progress trend over time.
   */
  async getProgressTrend(projectId: string): Promise<ProgressTrend[]> {
    await this.load();
    return this.snapshots
      .filter(s => s.projectId === projectId)
      .map(s => ({ date: s.timestamp, percent: s.overallPercent }));
  }

  /**
   * Get the latest snapshot.
   */
  async getLatestSnapshot(projectId: string): Promise<ProgressSnapshot | null> {
    await this.load();
    const projectSnapshots = this.snapshots.filter(s => s.projectId === projectId);
    return projectSnapshots.length > 0 ? projectSnapshots[projectSnapshots.length - 1] : null;
  }

  /**
   * Compare two snapshots.
   */
  compareSnapshots(older: ProgressSnapshot, newer: ProgressSnapshot) {
    const overallChange = newer.overallPercent - older.overallPercent;
    const newlyCompleted: string[] = [];
    const newlyBlocked: string[] = [];

    for (const newRoom of newer.roomProgress) {
      const oldRoom = older.roomProgress.find(r => r.room === newRoom.room);
      if (!oldRoom) continue;
      if (newRoom.status === "completed" && oldRoom.status !== "completed") newlyCompleted.push(newRoom.room);
      if (newRoom.status === "blocked" && oldRoom.status !== "blocked") newlyBlocked.push(newRoom.room);
    }

    return { overallChange, newlyCompleted, newlyBlocked };
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const progressEngine = new ProgressEngine();
export default progressEngine;
