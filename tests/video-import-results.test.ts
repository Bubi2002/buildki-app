import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVideoImportCompletionDecision,
  summarizeVideoImportResults,
} from "../lib/video-import-results";

const videoUploadSource = readFileSync(
  resolve(process.cwd(), "app/video-upload.tsx"),
  "utf8",
);

describe("video import completion results", () => {
  it("never finalizes an empty selection", () => {
    const decision = getVideoImportCompletionDecision([]);

    expect(decision.canFinalize).toBe(false);
    expect(decision.nextStep).toBe("error");
    expect(decision.errorMessage).toContain("kein Video");
  });

  it("never finalizes when every video failed", () => {
    const decision = getVideoImportCompletionDecision([
      { status: "error" as const },
      { status: "error" as const },
    ]);

    expect(decision).toMatchObject({
      canFinalize: false,
      nextStep: "error",
      totalCount: 2,
      successfulCount: 0,
      failedCount: 2,
    });
  });

  it("allows a partial result but counts only videos with usable transcriptions", () => {
    const successfulItem = {
      status: "done" as const,
      transcription: "[00:00] Prüffähige Aussage",
      name: "erfolg.mp4",
    };
    const decision = getVideoImportCompletionDecision([
      successfulItem,
      { status: "error" as const, transcription: "" },
      { status: "done" as const, transcription: "   " },
    ]);

    expect(decision).toMatchObject({
      canFinalize: true,
      nextStep: "choose_type",
      totalCount: 3,
      successfulCount: 1,
      failedCount: 2,
    });
    expect(decision.successfulItems).toEqual([successfulItem]);
  });

  it("summarizes a complete success without false failures", () => {
    expect(
      summarizeVideoImportResults([
        { status: "done" as const, transcription: "Video eins" },
        { status: "done" as const, transcription: "Video zwei" },
      ]),
    ).toMatchObject({
      totalCount: 2,
      successfulCount: 2,
      failedCount: 0,
      pendingCount: 0,
    });
  });

  it("wires both the processing and finalization guards into the screen", () => {
    expect(videoUploadSource).toContain("getVideoImportCompletionDecision(results)");
    expect(videoUploadSource).toContain("if (!completion.canFinalize)");
    expect(videoUploadSource).toContain("setCreatedProtocolId(protocolId)");
    expect(videoUploadSource).toContain("/protocol-detail?id=${createdProtocolId}");
  });
});
