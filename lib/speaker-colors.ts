/**
 * Speaker Identification Colors
 * Maps speakers to distinct colors for visual differentiation
 */

export const SPEAKER_COLORS = [
  { name: "Blau", bg: "#3B82F620", text: "#3B82F6", border: "#3B82F6" },
  { name: "Grün", bg: "#22C55E20", text: "#22C55E", border: "#22C55E" },
  { name: "Lila", bg: "#8B5CF620", text: "#8B5CF6", border: "#8B5CF6" },
  { name: "Orange", bg: "#F97316 20", text: "#F97316", border: "#F97316" },
  { name: "Pink", bg: "#EC489920", text: "#EC4899", border: "#EC4899" },
  { name: "Türkis", bg: "#06B6D420", text: "#06B6D4", border: "#06B6D4" },
];

export type SpeakerSegment = {
  speaker: string;
  text: string;
  startIndex: number;
};

export function getSpeakerColor(speakerName: string, allSpeakers: string[]) {
  const index = allSpeakers.indexOf(speakerName);
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

export function getUniqueSpeakers(segments: SpeakerSegment[]): string[] {
  const seen = new Set<string>();
  return segments.filter(s => {
    if (seen.has(s.speaker)) return false;
    seen.add(s.speaker);
    return true;
  }).map(s => s.speaker);
}
