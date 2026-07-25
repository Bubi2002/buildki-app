import AsyncStorage from "@react-native-async-storage/async-storage";

export const PROJECTS_STORAGE_KEY = "projects";
export const PROTOCOLS_STORAGE_KEY = "protocols";
export const LAST_SELECTED_PROJECT_KEY = "last-selected-project-id";
export const DELETED_PROJECT_IDS_KEY = "deleted-project-ids";
export const UNASSIGNED_PROJECT_ID = "__unassigned__";

export type ProjectContextItem = {
  id: string;
  name: string;
  color?: string;
  [key: string]: unknown;
};

export type ProjectLinkedProtocol = {
  projectId?: string;
  projectName?: string;
  [key: string]: unknown;
};

export function resolveSelectedProject<T extends ProjectContextItem>(
  projects: T[],
  requestedProjectId?: string | null,
): T | null {
  if (requestedProjectId) {
    const requested = projects.find((project) => project.id === requestedProjectId);
    if (requested) return requested;
  }
  return projects[0] ?? null;
}

export function isProtocolUnassigned(
  protocol: ProjectLinkedProtocol,
  projects: ProjectContextItem[],
): boolean {
  if (!protocol.projectId) return true;
  return !projects.some((project) => project.id === protocol.projectId);
}

export function filterProtocolsByProject<T extends ProjectLinkedProtocol>(
  protocols: T[],
  projects: ProjectContextItem[],
  activeProjectId: string | null,
  showAllProjects: boolean,
): T[] {
  if (!activeProjectId || showAllProjects) return protocols;
  if (activeProjectId === UNASSIGNED_PROJECT_ID) {
    return protocols.filter((protocol) => isProtocolUnassigned(protocol, projects));
  }
  return protocols.filter((protocol) => protocol.projectId === activeProjectId);
}

export function detachProtocolsFromProject<T extends ProjectLinkedProtocol>(
  protocols: T[],
  projectId: string,
): { protocols: T[]; detachedCount: number } {
  let detachedCount = 0;
  const updated = protocols.map((protocol) => {
    if (protocol.projectId !== projectId) return protocol;
    detachedCount += 1;
    const { projectId: _projectId, projectName: _projectName, ...unassigned } = protocol;
    return unassigned as T;
  });
  return { protocols: updated, detachedCount };
}

export async function getDeletedProjectIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(DELETED_PROJECT_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function clearDeletedProjectIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const deletedIds = await getDeletedProjectIds();
  const remaining = deletedIds.filter((id) => !ids.includes(id));
  if (remaining.length === 0) {
    await AsyncStorage.removeItem(DELETED_PROJECT_IDS_KEY);
  } else {
    await AsyncStorage.setItem(DELETED_PROJECT_IDS_KEY, JSON.stringify(remaining));
  }
}

export type LocalProjectDeletionResult<T extends ProjectContextItem> = {
  removedProject: T | null;
  remainingProjects: T[];
  nextProject: T | null;
  detachedProtocolCount: number;
};

export async function deleteProjectLocally<T extends ProjectContextItem>(
  projectId: string,
): Promise<LocalProjectDeletionResult<T>> {
  const [projectsRaw, protocolsRaw, selectedProjectId, legacyActiveProjectRaw, deletedIds] = await Promise.all([
    AsyncStorage.getItem(PROJECTS_STORAGE_KEY),
    AsyncStorage.getItem(PROTOCOLS_STORAGE_KEY),
    AsyncStorage.getItem(LAST_SELECTED_PROJECT_KEY),
    AsyncStorage.getItem("active_project"),
    getDeletedProjectIds(),
  ]);

  const projects: T[] = projectsRaw ? JSON.parse(projectsRaw) : [];
  const protocols: ProjectLinkedProtocol[] = protocolsRaw ? JSON.parse(protocolsRaw) : [];
  const removedProject = projects.find((project) => project.id === projectId) ?? null;
  const remainingProjects = projects.filter((project) => project.id !== projectId);
  const { protocols: updatedProtocols, detachedCount } = detachProtocolsFromProject(protocols, projectId);
  const nextProject = resolveSelectedProject(
    remainingProjects,
    selectedProjectId === projectId ? null : selectedProjectId,
  );
  const nextDeletedIds = Array.from(new Set([...deletedIds, projectId]));

  await AsyncStorage.multiSet([
    [PROJECTS_STORAGE_KEY, JSON.stringify(remainingProjects)],
    [PROTOCOLS_STORAGE_KEY, JSON.stringify(updatedProtocols)],
    [DELETED_PROJECT_IDS_KEY, JSON.stringify(nextDeletedIds)],
  ]);

  if (nextProject) {
    await AsyncStorage.setItem(LAST_SELECTED_PROJECT_KEY, nextProject.id);
  } else {
    await AsyncStorage.removeItem(LAST_SELECTED_PROJECT_KEY);
  }

  if (legacyActiveProjectRaw) {
    let legacyProjectId: string | null = legacyActiveProjectRaw;
    try {
      const parsed = JSON.parse(legacyActiveProjectRaw);
      legacyProjectId = typeof parsed === "string" ? parsed : parsed?.id ?? null;
    } catch {
      // Legacy value can be the raw project id.
    }
    if (legacyProjectId === projectId) {
      await AsyncStorage.removeItem("active_project");
    }
  }

  return {
    removedProject,
    remainingProjects,
    nextProject,
    detachedProtocolCount: detachedCount,
  };
}
