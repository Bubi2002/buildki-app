import { describe, expect, it } from "vitest";

import {
  MAX_VIDEO_UPLOAD_BYTES,
  estimateDecodedBase64Bytes,
  validateVideoSizeBytes,
} from "../lib/video-upload-validation";

describe("Video upload size validation", () => {
  it("accepts a file exactly at the 50 MB limit", () => {
    expect(validateVideoSizeBytes(MAX_VIDEO_UPLOAD_BYTES)).toMatchObject({
      allowed: true,
      sizeBytes: MAX_VIDEO_UPLOAD_BYTES,
      sizeMB: 50,
    });
  });

  it("rejects an oversized file before it is read as base64", () => {
    const result = validateVideoSizeBytes(MAX_VIDEO_UPLOAD_BYTES + 1);

    expect(result.allowed).toBe(false);
    expect(result.error).toContain("Video zu groß");
    expect(result.error).toContain("50 MB");
  });

  it("allows an unknown size so the native file information fallback can run", () => {
    expect(validateVideoSizeBytes(undefined)).toEqual({
      allowed: true,
      sizeBytes: null,
      sizeMB: null,
    });
  });

  it("estimates decoded bytes while respecting base64 padding", () => {
    expect(estimateDecodedBase64Bytes("TWFu")).toBe(3);
    expect(estimateDecodedBase64Bytes("TWE=")).toBe(2);
    expect(estimateDecodedBase64Bytes("TQ==")).toBe(1);
  });
});
