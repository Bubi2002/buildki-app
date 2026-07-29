import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const root = path.resolve(__dirname, "..");
const mockStorage: Record<string, string> = {};
const copyAsync = vi.fn(() => Promise.resolve());
const deleteAsync = vi.fn(() => Promise.resolve());
const makeDirectoryAsync = vi.fn(() => Promise.resolve());

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] || null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

vi.mock("@/lib/timeline-engine", () => ({
  timelineEngine: { emit: vi.fn(() => Promise.resolve()) },
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  makeDirectoryAsync,
  copyAsync,
  deleteAsync,
}));

const baseDefect = {
  id: "defect-flow-qa",
  projectId: "project-flow-qa",
  title: "Fugen prüfen",
  description: "",
  status: "offen" as const,
  priority: "hoch" as const,
  category: "Sonstiges",
  photos: [],
  createdAt: "2026-07-29T10:00:00.000Z",
  updatedAt: "2026-07-29T10:00:00.000Z",
};

describe("defect deadline, voice note and follow-up flow", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
  });

  it("parses exact German dates and rejects impossible dates", async () => {
    const {
      formatDateOnly,
      isDateOnOrAfter,
      parseDateOnly,
      parseGermanDateInput,
    } = await import("../lib/date-only");

    expect(parseGermanDateInput("17.09.2026")).toBe("2026-09-17");
    expect(parseGermanDateInput("29.02.2028")).toBe("2028-02-29");
    expect(parseGermanDateInput("31.02.2026")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
    expect(formatDateOnly("2026-09-17")).toBe("17.09.2026");
    expect(isDateOnOrAfter("2026-09-17", "2026-09-17")).toBe(true);
    expect(isDateOnOrAfter("2026-09-16", "2026-09-17")).toBe(false);
  });

  it("adds date-only presets without UTC day shifts", async () => {
    const { addDaysToDateOnly } = await import("../lib/date-only");

    expect(addDaysToDateOnly("2026-07-29", 7)).toBe("2026-08-05");
    expect(addDaysToDateOnly("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("persists an exact due date unchanged", async () => {
    const { getDefects, saveDefect } = await import("../lib/defect-store");

    await saveDefect({ ...baseDefect, dueDate: "2026-09-17" });
    const [stored] = await getDefects(baseDefect.projectId);

    expect(stored.dueDate).toBe("2026-09-17");
  });

  it("persists follow-up date, note and inspection status in one store path", async () => {
    const { getDefects, saveDefect } = await import("../lib/defect-store");
    const { requestReinspection } = await import("../lib/defect-comments");

    await saveDefect(baseDefect);
    await requestReinspection(baseDefect.id, "2026-09-21", "Fugen und Abdichtung kontrollieren");
    const [stored] = await getDefects(baseDefect.projectId);

    expect(stored.status).toBe("pruefung");
    expect(stored.followUpDate).toBe("2026-09-21");
    expect(stored.followUpNote).toBe("Fugen und Abdichtung kontrollieren");
  });

  it("attaches and removes durable voice-note metadata", async () => {
    const { getDefects, saveDefect, setVoiceNote } = await import("../lib/defect-store");

    await saveDefect(baseDefect);
    await setVoiceNote(baseDefect.id, {
      uri: "file:///documents/defect-voice-notes/qa.m4a",
      durationMillis: 42_500,
      recordedAt: "2026-07-29T12:00:00.000Z",
    });

    let [stored] = await getDefects(baseDefect.projectId);
    expect(stored.voiceNoteUri).toBe("file:///documents/defect-voice-notes/qa.m4a");
    expect(stored.voiceNoteDurationMillis).toBe(42_500);
    expect(stored.voiceNoteRecordedAt).toBe("2026-07-29T12:00:00.000Z");

    await setVoiceNote(baseDefect.id, null);
    [stored] = await getDefects(baseDefect.projectId);
    expect(stored.voiceNoteUri).toBeUndefined();
    expect(stored.voiceNoteDurationMillis).toBeUndefined();
    expect(stored.voiceNoteRecordedAt).toBeUndefined();
  });

  it("copies voice notes into durable app storage and removes only managed files", async () => {
    const {
      formatVoiceNoteDuration,
      persistDefectVoiceNote,
      removePersistedDefectVoiceNote,
    } = await import("../lib/defect-voice-note");

    const destination = await persistDefectVoiceNote("file:///tmp/source.m4a", baseDefect.id);
    expect(destination).toMatch(/^file:\/\/\/documents\/defect-voice-notes\/defect-flow-qa-\d+\.m4a$/);
    expect(makeDirectoryAsync).toHaveBeenCalledWith("file:///documents/defect-voice-notes/", { intermediates: true });
    expect(copyAsync).toHaveBeenCalledWith({ from: "file:///tmp/source.m4a", to: destination });
    expect(formatVoiceNoteDuration(65_400)).toBe("01:05");

    await removePersistedDefectVoiceNote(destination);
    expect(deleteAsync).toHaveBeenCalledWith(destination, { idempotent: true });
    deleteAsync.mockClear();
    await removePersistedDefectVoiceNote("file:///tmp/external.m4a");
    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it("contains the complete direct UI contracts without the old recording dead end", () => {
    const defectsScreen = fs.readFileSync(path.join(root, "app/defects.tsx"), "utf8");
    const followUpScreen = fs.readFileSync(path.join(root, "app/follow-up.tsx"), "utf8");

    expect(defectsScreen).toContain('testID="defect-due-date-picker"');
    expect(defectsScreen).toContain("useAudioRecorder(RecordingPresets.HIGH_QUALITY)");
    expect(defectsScreen).toContain("Sprachnotiz speichern");
    expect(defectsScreen).toContain("Aufnahme fortsetzen");
    expect(defectsScreen).toContain("Sprachnotiz abspielen");
    expect(defectsScreen).not.toContain("Nutze die Aufnahme-Funktion im Protokoll-Tab");
    expect(defectsScreen).toContain("&defectId=${selectedDefect.id}");

    expect(followUpScreen).toContain('testID="follow-up-date-picker"');
    expect(followUpScreen).toContain("followUpNote");
    expect(followUpScreen).toContain("params.defectId");
    expect(followUpScreen).toContain("Offenen Mangel auswählen");
    expect(followUpScreen).toContain("&defectId=${item.id}");
  });

  it("decodes the reported status heading without a visible escape", async () => {
    const { decodeUnicodeEscapes } = await import("../lib/display-text");
    expect(decodeUnicodeEscapes(String.raw`STATUS \u00E4NDERN`).toLocaleUpperCase("de-DE")).toBe("STATUS ÄNDERN");
  });
});
