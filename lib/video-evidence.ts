import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import {
  createEvidenceItem,
  saveEvidence,
  type EvidenceItem,
} from "@/lib/evidence-store";

const EVIDENCE_FRAME_DIRECTORY = `${FileSystem.documentDirectory || ""}evidence/video-frames/`;
const MIN_SUITABLE_EDGE_PX = 720;

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type ExtractVideoEvidenceFrameInput = {
  projectId: string;
  protocolId?: string;
  videoUri: string;
  sourceVideoName?: string;
  timeSeconds: number;
  findingText?: string;
  capturedAt?: string;
};

async function ensureEvidenceDirectory(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    throw new Error("Lokale Belegablage ist auf diesem Gerät nicht verfügbar.");
  }
  const info = await FileSystem.getInfoAsync(EVIDENCE_FRAME_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(EVIDENCE_FRAME_DIRECTORY, {
      intermediates: true,
    });
  }
}

export function selectEvidenceCandidateSegments(
  segments: TranscriptSegment[],
  maximum = 12,
): TranscriptSegment[] {
  const candidates = segments.filter((segment) => {
    const text = segment.text.replace(/\s+/g, " ").trim();
    return text.length >= 12 && segment.end > segment.start;
  });
  if (candidates.length <= maximum) return candidates;

  const step = candidates.length / maximum;
  return Array.from({ length: maximum }, (_, index) => {
    return candidates[Math.min(candidates.length - 1, Math.floor(index * step))];
  });
}

export async function extractVideoEvidenceFrame(
  input: ExtractVideoEvidenceFrameInput,
): Promise<EvidenceItem> {
  await ensureEvidenceDirectory();

  const timeSeconds = Math.max(0, input.timeSeconds);
  const thumbnail = await VideoThumbnails.getThumbnailAsync(input.videoUri, {
    time: Math.round(timeSeconds * 1000),
    quality: 0.95,
  });
  const evidence = createEvidenceItem({
    projectId: input.projectId,
    protocolId: input.protocolId,
    sourceType: "video_frame",
    originalUri: thumbnail.uri,
    sourceVideoUri: input.videoUri,
    sourceVideoName: input.sourceVideoName,
    sourceFilename: input.sourceVideoName,
    videoTimeSeconds: timeSeconds,
    capturedAt: input.capturedAt,
    findingText: input.findingText,
    pixelWidth: thumbnail.width,
    pixelHeight: thumbnail.height,
    mediaQuality:
      Math.min(thumbnail.width, thumbnail.height) >= MIN_SUITABLE_EDGE_PX
        ? "suitable"
        : "review_required",
    mediaQualityNote:
      Math.min(thumbnail.width, thumbnail.height) >= MIN_SUITABLE_EDGE_PX
        ? "Standbild erfüllt die Mindestauflösung für die Dokumentvorschau."
        : "Standbild vor Verwendung im Dokument visuell auf Schärfe und Lesbarkeit prüfen.",
    reviewStatus: "pending",
  });

  const destination = `${EVIDENCE_FRAME_DIRECTORY}${evidence.id}.jpg`;
  await FileSystem.copyAsync({ from: thumbnail.uri, to: destination });
  const savedEvidence = {
    ...evidence,
    originalUri: destination,
    previewUri: destination,
  };
  await saveEvidence(savedEvidence);
  return savedEvidence;
}

export async function extractCandidateFramesFromSegments(input: {
  projectId: string;
  protocolId?: string;
  videoUri: string;
  sourceVideoName?: string;
  segments: TranscriptSegment[];
  maximum?: number;
}): Promise<EvidenceItem[]> {
  const selected = selectEvidenceCandidateSegments(
    input.segments,
    input.maximum ?? 12,
  );
  const frames: EvidenceItem[] = [];

  for (const segment of selected) {
    const midpoint = segment.start + (segment.end - segment.start) / 2;
    frames.push(
      await extractVideoEvidenceFrame({
        projectId: input.projectId,
        protocolId: input.protocolId,
        videoUri: input.videoUri,
        sourceVideoName: input.sourceVideoName,
        timeSeconds: midpoint,
        findingText: segment.text,
      }),
    );
  }

  return frames;
}
