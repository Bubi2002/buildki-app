export type VideoImportResultLike = {
  status: "pending" | "processing" | "done" | "error";
  transcription?: string;
};

export type VideoImportResultSummary<T extends VideoImportResultLike> = {
  totalCount: number;
  successfulCount: number;
  failedCount: number;
  pendingCount: number;
  successfulItems: T[];
};

export function createVideoImportProtocolId() {
  return `video_${Date.now()}`;
}

const hasUsableTranscription = (item: VideoImportResultLike) =>
  item.status === "done" &&
  typeof item.transcription === "string" &&
  item.transcription.trim().length > 0;

export function summarizeVideoImportResults<T extends VideoImportResultLike>(
  items: T[],
): VideoImportResultSummary<T> {
  const successfulItems = items.filter(hasUsableTranscription);
  const failedCount = items.filter(
    (item) => item.status === "error" || (item.status === "done" && !hasUsableTranscription(item)),
  ).length;
  const pendingCount = items.filter(
    (item) => item.status === "pending" || item.status === "processing",
  ).length;

  return {
    totalCount: items.length,
    successfulCount: successfulItems.length,
    failedCount,
    pendingCount,
    successfulItems,
  };
}

export function getVideoImportCompletionDecision<T extends VideoImportResultLike>(
  items: T[],
) {
  const summary = summarizeVideoImportResults(items);

  if (summary.successfulCount > 0) {
    return {
      ...summary,
      canFinalize: true,
      nextStep: "choose_type" as const,
      errorMessage: "",
    };
  }

  const errorMessage =
    summary.totalCount === 0
      ? "Es wurde kein Video zur Verarbeitung ausgewählt."
      : "Keines der ausgewählten Videos konnte verarbeitet werden. Prüfen Sie Dateiformat, Dateigröße und Internetverbindung und versuchen Sie es erneut.";

  return {
    ...summary,
    canFinalize: false,
    nextStep: "error" as const,
    errorMessage,
  };
}
