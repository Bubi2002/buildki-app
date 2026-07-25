import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToQueue, getQueue } from "../lib/offline-queue";

const { storage } = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  },
}));

vi.mock("expo-network", () => ({
  getNetworkStateAsync: vi.fn(async () => ({ isInternetReachable: true })),
}));

beforeEach(() => storage.clear());

describe("offline recording project context", () => {
  it("persists project id and name with the queued recording", async () => {
    await addToQueue({
      id: "recording-1",
      fileUri: "file:///recording-1.m4a",
      mimeType: "audio/m4a",
      templateId: "construction-diary",
      projectId: "project-1",
      projectName: "Musterprojekt",
      photos: [],
      duration: 42,
      recordingMode: "audio",
      createdAt: "2026-07-24T22:00:00.000Z",
    });

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: "recording-1",
      projectId: "project-1",
      projectName: "Musterprojekt",
    });
  });
});
