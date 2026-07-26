import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLocalId } from "@/lib/id";

export const EVIDENCE_STORAGE_KEY = "buildki-evidence-v1";

export type EvidenceSourceType =
  | "photo"
  | "video_frame"
  | "plan"
  | "manual_document";

export type EvidenceReviewStatus = "pending" | "approved" | "rejected";
export type EvidenceMediaQuality = "review_required" | "suitable" | "insufficient";

export type MeasurementKind = "distance" | "area" | "angle" | "count";

export type MeasurementMethod =
  | "manual_on_site"
  | "reference_scale"
  | "ar"
  | "lidar"
  | "plan_scale"
  | "image_estimate";

export type MeasurementAccuracy = "verified" | "calibrated" | "estimated";

export type EvidencePoint = {
  /** Normalized horizontal coordinate in the range 0..1. */
  x: number;
  /** Normalized vertical coordinate in the range 0..1. */
  y: number;
};

export type EvidenceMeasurement = {
  id: string;
  kind: MeasurementKind;
  value: number;
  unit: "mm" | "cm" | "m" | "m²" | "°" | "Stk.";
  method: MeasurementMethod;
  accuracy: MeasurementAccuracy;
  tolerance?: number;
  toleranceUnit?: "mm" | "cm" | "m" | "%" | "°";
  geometry?: {
    points: EvidencePoint[];
  };
  referenceValue?: number;
  referenceUnit?: "mm" | "cm" | "m";
  note?: string;
  measuredAt: string;
};

export type EvidenceItem = {
  id: string;
  projectId: string;
  protocolId?: string;
  defectId?: string;
  sourceType: EvidenceSourceType;
  originalUri: string;
  previewUri?: string;
  sourceFilename?: string;
  sourceVideoUri?: string;
  sourceVideoName?: string;
  videoTimeSeconds?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  mediaQuality?: EvidenceMediaQuality;
  mediaQualityNote?: string;
  capturedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Plain text only. Document renderers display this text in bold near media. */
  findingText?: string;
  room?: string;
  trade?: string;
  tags?: string[];
  reviewStatus: EvidenceReviewStatus;
  reviewNote?: string;
  measurements?: EvidenceMeasurement[];
  /** Stable key for idempotent migration from legacy photo arrays. */
  legacySourceKey?: string;
};

export type NewEvidenceItem = Omit<EvidenceItem, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

function normalizeText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function normalizePoint(point: EvidencePoint): EvidencePoint {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  };
}

function normalizeMeasurement(measurement: EvidenceMeasurement): EvidenceMeasurement {
  return {
    ...measurement,
    value: Number.isFinite(measurement.value) ? measurement.value : 0,
    tolerance:
      measurement.tolerance != null && Number.isFinite(measurement.tolerance)
        ? Math.max(0, measurement.tolerance)
        : undefined,
    geometry: measurement.geometry
      ? { points: measurement.geometry.points.map(normalizePoint) }
      : undefined,
    note: normalizeText(measurement.note),
  };
}

function normalizeEvidence(item: EvidenceItem): EvidenceItem {
  return {
    ...item,
    findingText: normalizeText(item.findingText),
    room: normalizeText(item.room),
    trade: normalizeText(item.trade),
    reviewNote: normalizeText(item.reviewNote),
    mediaQualityNote: normalizeText(item.mediaQualityNote),
    pixelWidth:
      item.pixelWidth != null && Number.isFinite(item.pixelWidth)
        ? Math.max(0, Math.round(item.pixelWidth))
        : undefined,
    pixelHeight:
      item.pixelHeight != null && Number.isFinite(item.pixelHeight)
        ? Math.max(0, Math.round(item.pixelHeight))
        : undefined,
    tags: item.tags?.map((tag) => tag.trim()).filter(Boolean),
    videoTimeSeconds:
      item.videoTimeSeconds != null && Number.isFinite(item.videoTimeSeconds)
        ? Math.max(0, item.videoTimeSeconds)
        : undefined,
    measurements: item.measurements?.map(normalizeMeasurement),
  };
}

export function createEvidenceItem(input: NewEvidenceItem): EvidenceItem {
  const now = new Date().toISOString();
  return normalizeEvidence({
    ...input,
    id: input.id || createLocalId("evidence"),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  });
}

export function createEvidenceMeasurement(
  input: Omit<EvidenceMeasurement, "id" | "measuredAt"> & {
    id?: string;
    measuredAt?: string;
  },
): EvidenceMeasurement {
  return normalizeMeasurement({
    ...input,
    id: input.id || createLocalId("measurement"),
    measuredAt: input.measuredAt || new Date().toISOString(),
  });
}

export async function getEvidence(projectId?: string): Promise<EvidenceItem[]> {
  try {
    const raw = await AsyncStorage.getItem(EVIDENCE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const items: EvidenceItem[] = Array.isArray(parsed)
      ? parsed.map((item) => normalizeEvidence(item as EvidenceItem))
      : [];
    return projectId ? items.filter((item) => item.projectId === projectId) : items;
  } catch {
    return [];
  }
}

export async function getEvidenceByIds(ids: string[]): Promise<EvidenceItem[]> {
  const order = new Map(ids.map((id, index) => [id, index]));
  return (await getEvidence())
    .filter((item) => order.has(item.id))
    .sort((left, right) => (order.get(left.id) || 0) - (order.get(right.id) || 0));
}

export async function saveEvidence(item: EvidenceItem): Promise<void> {
  const items = await getEvidence();
  const normalized = normalizeEvidence({
    ...item,
    updatedAt: new Date().toISOString(),
  });
  const index = items.findIndex((existing) => existing.id === normalized.id);
  if (index >= 0) items[index] = normalized;
  else items.push(normalized);
  await AsyncStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(items));
}

export async function saveEvidenceBatch(input: NewEvidenceItem[]): Promise<EvidenceItem[]> {
  const items = await getEvidence();
  const byId = new Map(items.map((item) => [item.id, item]));
  const byLegacyKey = new Map(
    items
      .filter((item) => item.legacySourceKey)
      .map((item) => [item.legacySourceKey as string, item]),
  );
  const saved: EvidenceItem[] = [];

  for (const candidate of input) {
    const existing =
      (candidate.id ? byId.get(candidate.id) : undefined) ||
      (candidate.legacySourceKey ? byLegacyKey.get(candidate.legacySourceKey) : undefined);
    const next = createEvidenceItem({
      ...existing,
      ...candidate,
      id: existing?.id || candidate.id,
      createdAt: existing?.createdAt || candidate.createdAt,
    });
    byId.set(next.id, next);
    if (next.legacySourceKey) byLegacyKey.set(next.legacySourceKey, next);
    saved.push(next);
  }

  await AsyncStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(Array.from(byId.values())));
  return saved;
}

export async function updateEvidence(
  evidenceId: string,
  patch: Partial<Omit<EvidenceItem, "id" | "createdAt">>,
): Promise<EvidenceItem | null> {
  const items = await getEvidence();
  const index = items.findIndex((item) => item.id === evidenceId);
  if (index < 0) return null;
  const updated = normalizeEvidence({
    ...items[index],
    ...patch,
    id: items[index].id,
    createdAt: items[index].createdAt,
    updatedAt: new Date().toISOString(),
  });
  items[index] = updated;
  await AsyncStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(items));
  return updated;
}

export async function deleteEvidence(evidenceId: string): Promise<void> {
  const items = await getEvidence();
  await AsyncStorage.setItem(
    EVIDENCE_STORAGE_KEY,
    JSON.stringify(items.filter((item) => item.id !== evidenceId)),
  );
}

export async function migrateLegacyProtocolPhotos(input: {
  projectId: string;
  protocolId: string;
  photos?: string[];
  photoTimestamps?: number[];
  photoCaptions?: string[];
  capturedAt?: string;
}): Promise<EvidenceItem[]> {
  const photos = input.photos || [];
  if (photos.length === 0) return [];

  return saveEvidenceBatch(
    photos.map((uri, index) => ({
      projectId: input.projectId,
      protocolId: input.protocolId,
      sourceType: "photo" as const,
      originalUri: uri,
      capturedAt: input.capturedAt,
      findingText: input.photoCaptions?.[index],
      videoTimeSeconds: input.photoTimestamps?.[index],
      reviewStatus: "approved" as const,
      legacySourceKey: `${input.protocolId}:photo:${index}:${uri}`,
    })),
  );
}

export function formatEvidenceTimecode(seconds?: number): string | undefined {
  if (seconds == null || !Number.isFinite(seconds)) return undefined;
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

export function isEvidenceDocumentReady(item: EvidenceItem): boolean {
  return (
    item.reviewStatus === "approved" &&
    item.mediaQuality !== "insufficient" &&
    Boolean(item.originalUri)
  );
}
