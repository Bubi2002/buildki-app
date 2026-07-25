import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAsyncInvocationGuard } from "../lib/async-invocation-guard";

const videoUploadSource = readFileSync(resolve(process.cwd(), "app/video-upload.tsx"), "utf8");

describe("file picker single-flight guard", () => {
  it("ignores a second invocation while the first picker is open", async () => {
    const guard = createAsyncInvocationGuard();
    let release: ((value: string) => void) | undefined;
    const pending = new Promise<string>((resolvePending) => {
      release = resolvePending;
    });
    const secondOperation = vi.fn(async () => "second");

    const first = guard.run(() => pending);
    const second = await guard.run(secondOperation);

    expect(guard.isRunning()).toBe(true);
    expect(second).toEqual({ started: false });
    expect(secondOperation).not.toHaveBeenCalled();

    release?.("first");
    await expect(first).resolves.toEqual({ started: true, value: "first" });
    expect(guard.isRunning()).toBe(false);
  });

  it("releases the guard after cancellation-like completion and after errors", async () => {
    const guard = createAsyncInvocationGuard();

    await expect(guard.run(async () => ({ canceled: true }))).resolves.toEqual({
      started: true,
      value: { canceled: true },
    });
    expect(guard.isRunning()).toBe(false);

    await expect(guard.run(async () => {
      throw new Error("picker failed");
    })).rejects.toThrow("picker failed");
    expect(guard.isRunning()).toBe(false);

    await expect(guard.run(async () => "retry allowed")).resolves.toEqual({
      started: true,
      value: "retry allowed",
    });
  });

  it("wires the Dropbox-capable file picker to one guarded native invocation", () => {
    expect(videoUploadSource.match(/DocumentPicker\.getDocumentAsync/g)).toHaveLength(1);
    expect(videoUploadSource).toContain("filePickerGuard.current.run");
    expect(videoUploadSource).toContain("disabled={isFilePickerOpen}");
    expect(videoUploadSource).toContain("setIsFilePickerOpen(false)");
    expect(videoUploadSource).toContain("Dateiauswahl ist bereits geöffnet");
  });
});
