export type ProjectScopedItem = {
  projectId?: string | null;
};

export function normalizeDashboardProjectId(projectId?: string | null): string | null {
  if (typeof projectId !== "string") return null;
  const normalized = projectId.trim();
  return normalized.length > 0 ? normalized : null;
}

export function filterDashboardItemsByProject<T extends ProjectScopedItem>(
  items: T[],
  projectId?: string | null,
): T[] {
  const activeProjectId = normalizeDashboardProjectId(projectId);
  if (!activeProjectId) return [];
  return items.filter((item) => item.projectId === activeProjectId);
}
