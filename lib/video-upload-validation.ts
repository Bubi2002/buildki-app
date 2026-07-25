export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;

export type VideoSizeValidation = {
  allowed: boolean;
  sizeBytes: number | null;
  sizeMB: number | null;
  error?: string;
};

export function validateVideoSizeBytes(
  sizeBytes?: number | null,
): VideoSizeValidation {
  if (
    typeof sizeBytes !== "number" ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0
  ) {
    return {
      allowed: true,
      sizeBytes: null,
      sizeMB: null,
    };
  }

  const sizeMB = sizeBytes / (1024 * 1024);
  if (sizeBytes > MAX_VIDEO_UPLOAD_BYTES) {
    return {
      allowed: false,
      sizeBytes,
      sizeMB,
      error: `Video zu groß: ${sizeMB.toFixed(1)} MB (max. 50 MB)`,
    };
  }

  return {
    allowed: true,
    sizeBytes,
    sizeMB,
  };
}

export function estimateDecodedBase64Bytes(base64: string): number {
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}
