/**
 * Protocol Timeline - Chronological view with timestamps and audio markers
 * Parses protocol text into timestamped segments for timeline display
 */

export type TimelineEntry = {
  id: string;
  timestamp: number; // seconds from start
  formattedTime: string; // "00:05:30"
  speaker?: string;
  text: string;
  type: "speech" | "marker" | "action" | "decision";
  isHighlight: boolean;
};

export type TimelineMarker = {
  id: string;
  timestamp: number;
  label: string;
  color: string;
};

/**
 * Generate timeline entries from protocol text and duration
 */
export function generateTimeline(
  protocolText: string,
  duration: number,
  speakers?: { speaker: string; text: string }[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  
  if (speakers && speakers.length > 0) {
    // Use speaker segments for timeline
    const segmentDuration = duration / speakers.length;
    speakers.forEach((seg, idx) => {
      const timestamp = Math.round(idx * segmentDuration);
      entries.push({
        id: `timeline-${idx}`,
        timestamp,
        formattedTime: formatTimestamp(timestamp),
        speaker: seg.speaker,
        text: seg.text.slice(0, 200),
        type: "speech",
        isHighlight: false,
      });
    });
  } else {
    // Parse protocol text into paragraphs
    const paragraphs = protocolText.split(/\n\n+/).filter(p => p.trim().length > 0);
    const segmentDuration = duration / Math.max(paragraphs.length, 1);
    
    paragraphs.forEach((para, idx) => {
      const timestamp = Math.round(idx * segmentDuration);
      const trimmed = para.trim();
      
      // Detect type
      let type: TimelineEntry["type"] = "speech";
      if (trimmed.startsWith("Beschluss") || trimmed.startsWith("Entscheidung") || trimmed.includes("beschlossen")) {
        type = "decision";
      } else if (trimmed.startsWith("Aufgabe") || trimmed.startsWith("TODO") || trimmed.includes("Aktion:")) {
        type = "action";
      }
      
      entries.push({
        id: `timeline-${idx}`,
        timestamp,
        formattedTime: formatTimestamp(timestamp),
        text: trimmed.slice(0, 200),
        type,
        isHighlight: type === "decision" || type === "action",
      });
    });
  }
  
  return entries;
}

/**
 * Format seconds to HH:MM:SS
 */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Get type icon for timeline entry
 */
export function getTimelineIcon(type: TimelineEntry["type"]): string {
  switch (type) {
    case "speech": return "💬";
    case "marker": return "📌";
    case "action": return "✅";
    case "decision": return "⚖️";
    default: return "•";
  }
}

/**
 * Get type color for timeline entry
 */
export function getTimelineColor(type: TimelineEntry["type"]): string {
  switch (type) {
    case "speech": return "#0a7ea4";
    case "marker": return "#F59E0B";
    case "action": return "#22C55E";
    case "decision": return "#8B5CF6";
    default: return "#687076";
  }
}
