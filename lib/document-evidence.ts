import {
  formatEvidenceTimecode,
  getEvidenceByIds,
  isEvidenceDocumentReady,
  type EvidenceItem,
  type EvidenceMeasurement,
} from "@/lib/evidence-store";

export type DocumentEvidenceMeasurementSnapshot = Pick<
  EvidenceMeasurement,
  | "id"
  | "kind"
  | "value"
  | "unit"
  | "method"
  | "accuracy"
  | "tolerance"
  | "toleranceUnit"
  | "note"
  | "measuredAt"
>;

export type DocumentEvidenceSnapshot = {
  evidenceId: string;
  sourceType: EvidenceItem["sourceType"];
  mediaUri: string;
  findingText?: string;
  sourceLabel: string;
  sourceFilename?: string;
  videoTimeSeconds?: number;
  videoTimecode?: string;
  capturedAt?: string;
  room?: string;
  trade?: string;
  pixelWidth?: number;
  pixelHeight?: number;
  measurements: DocumentEvidenceMeasurementSnapshot[];
  capturedForDocumentAt: string;
};

export type DocumentEvidenceSelection = {
  evidenceIds: string[];
  snapshots: DocumentEvidenceSnapshot[];
  createdAt: string;
};

function getSourceLabel(item: EvidenceItem): string {
  switch (item.sourceType) {
    case "video_frame":
      return item.sourceVideoName
        ? `Videostandbild aus ${item.sourceVideoName}`
        : "Videostandbild";
    case "photo":
      return "Originalfoto";
    case "plan":
      return "Planbeleg";
    case "manual_document":
      return "Dokumentbeleg";
  }
}

export function createDocumentEvidenceSnapshot(
  item: EvidenceItem,
  capturedForDocumentAt = new Date().toISOString(),
): DocumentEvidenceSnapshot {
  return {
    evidenceId: item.id,
    sourceType: item.sourceType,
    mediaUri: item.previewUri || item.originalUri,
    findingText: item.findingText,
    sourceLabel: getSourceLabel(item),
    sourceFilename: item.sourceVideoName || item.sourceFilename,
    videoTimeSeconds: item.videoTimeSeconds,
    videoTimecode: formatEvidenceTimecode(item.videoTimeSeconds),
    capturedAt: item.capturedAt,
    room: item.room,
    trade: item.trade,
    pixelWidth: item.pixelWidth,
    pixelHeight: item.pixelHeight,
    measurements: (item.measurements || []).map((measurement) => ({
      id: measurement.id,
      kind: measurement.kind,
      value: measurement.value,
      unit: measurement.unit,
      method: measurement.method,
      accuracy: measurement.accuracy,
      tolerance: measurement.tolerance,
      toleranceUnit: measurement.toleranceUnit,
      note: measurement.note,
      measuredAt: measurement.measuredAt,
    })),
    capturedForDocumentAt,
  };
}

export async function createDocumentEvidenceSelection(
  evidenceIds: string[],
): Promise<DocumentEvidenceSelection> {
  const selectedAt = new Date().toISOString();
  const items = await getEvidenceByIds(evidenceIds);
  const ready = items.filter(isEvidenceDocumentReady);
  return {
    evidenceIds: ready.map((item) => item.id),
    snapshots: ready.map((item) => createDocumentEvidenceSnapshot(item, selectedAt)),
    createdAt: selectedAt,
  };
}

export function formatMeasurementForDocument(
  measurement: DocumentEvidenceMeasurementSnapshot,
): string {
  const tolerance =
    measurement.tolerance != null && measurement.toleranceUnit
      ? ` ± ${measurement.tolerance} ${measurement.toleranceUnit}`
      : "";
  const quality =
    measurement.accuracy === "verified"
      ? "verifiziert"
      : measurement.accuracy === "calibrated"
        ? "kalibriert"
        : "Schätzung";
  return `${measurement.value} ${measurement.unit}${tolerance} (${quality})`;
}
