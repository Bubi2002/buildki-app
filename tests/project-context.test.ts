import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELETED_PROJECT_IDS_KEY,
  LAST_SELECTED_PROJECT_KEY,
  PROJECTS_STORAGE_KEY,
  PROTOCOLS_STORAGE_KEY,
  UNASSIGNED_PROJECT_ID,
  deleteProjectLocally,
  detachProtocolsFromProject,
  filterProtocolsByProject,
  isProtocolUnassigned,
  resolveSelectedProject,
} from "../lib/project-context";

const { storage } = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
    multiSet: vi.fn(async (entries: [string, string][]) => {
      entries.forEach(([key, value]) => storage.set(key, value));
    }),
  },
}));

const projects = [
  { id: "project-a", name: "Projekt A", color: "#f00" },
  { id: "project-b", name: "Projekt B", color: "#0f0" },
];

beforeEach(() => storage.clear());

describe("resolveSelectedProject", () => {
  it("restores the requested project and otherwise falls back to the first project", () => {
    expect(resolveSelectedProject(projects, "project-b")?.id).toBe("project-b");
    expect(resolveSelectedProject(projects, "missing")?.id).toBe("project-a");
    expect(resolveSelectedProject([], "project-a")).toBeNull();
  });
});

describe("protocol project visibility", () => {
  const protocols = [
    { id: "protocol-a", projectId: "project-a", projectName: "Projekt A" },
    { id: "protocol-b", projectId: "project-b", projectName: "Projekt B" },
    { id: "protocol-old", projectId: "deleted-project", projectName: "Altprojekt" },
    { id: "protocol-free" },
  ];

  it("shows only the selected project's protocols", () => {
    expect(filterProtocolsByProject(protocols, projects, "project-a", false).map((item) => item.id)).toEqual(["protocol-a"]);
  });

  it("keeps missing or stale project assignments visible under 'Ohne Projekt'", () => {
    expect(filterProtocolsByProject(protocols, projects, UNASSIGNED_PROJECT_ID, false).map((item) => item.id)).toEqual([
      "protocol-old",
      "protocol-free",
    ]);
    expect(isProtocolUnassigned(protocols[0], projects)).toBe(false);
    expect(isProtocolUnassigned(protocols[2], projects)).toBe(true);
  });

  it("shows all protocols without changing their project assignment", () => {
    expect(filterProtocolsByProject(protocols, projects, "project-a", true)).toEqual(protocols);
  });
});

describe("project deletion", () => {
  it("removes only the project, preserves its protocols unassigned and selects the next project", async () => {
    const storedProtocols = [
      { id: "protocol-a", title: "A", projectId: "project-a", projectName: "Projekt A" },
      { id: "protocol-b", title: "B", projectId: "project-b", projectName: "Projekt B" },
    ];
    storage.set(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    storage.set(PROTOCOLS_STORAGE_KEY, JSON.stringify(storedProtocols));
    storage.set(LAST_SELECTED_PROJECT_KEY, "project-a");
    storage.set("active_project", JSON.stringify(projects[0]));

    const result = await deleteProjectLocally("project-a");

    expect(result.removedProject?.id).toBe("project-a");
    expect(result.remainingProjects.map((project) => project.id)).toEqual(["project-b"]);
    expect(result.nextProject?.id).toBe("project-b");
    expect(result.detachedProtocolCount).toBe(1);
    expect(JSON.parse(storage.get(PROTOCOLS_STORAGE_KEY) || "[]")).toEqual([
      { id: "protocol-a", title: "A" },
      { id: "protocol-b", title: "B", projectId: "project-b", projectName: "Projekt B" },
    ]);
    expect(storage.get(LAST_SELECTED_PROJECT_KEY)).toBe("project-b");
    expect(storage.has("active_project")).toBe(false);
    expect(JSON.parse(storage.get(DELETED_PROJECT_IDS_KEY) || "[]")).toEqual(["project-a"]);
  });

  it("detaches every matching protocol without deleting unrelated protocols", () => {
    const result = detachProtocolsFromProject(
      [
        { id: "one", projectId: "project-a", projectName: "Projekt A" },
        { id: "two", projectId: "project-a", projectName: "Projekt A" },
        { id: "three", projectId: "project-b", projectName: "Projekt B" },
      ],
      "project-a",
    );
    expect(result.detachedCount).toBe(2);
    expect(result.protocols).toEqual([
      { id: "one" },
      { id: "two" },
      { id: "three", projectId: "project-b", projectName: "Projekt B" },
    ]);
  });
});
