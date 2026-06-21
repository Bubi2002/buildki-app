import { getDefects } from "@/lib/defect-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ProjectProgress {
  totalDefects: number;
  resolvedDefects: number;
  totalTasks: number;
  completedTasks: number;
  totalProtocols: number;
  progressPercent: number;
}

export async function getProjectProgress(projectId: string): Promise<ProjectProgress> {
  // Get defects for this project
  const defects = await getDefects(projectId);
  const totalDefects = defects.length;
  const resolvedDefects = defects.filter((d) => d.status === "erledigt").length;

  // Get protocols for this project
  let totalProtocols = 0;
  let totalTasks = 0;
  let completedTasks = 0;

  try {
    const protocolsJson = await AsyncStorage.getItem("protocols");
    if (protocolsJson) {
      const allProtocols = JSON.parse(protocolsJson);
      const projectProtocols = allProtocols.filter(
        (p: any) => p.projectId === projectId
      );
      totalProtocols = projectProtocols.length;

      // Count tasks from protocols
      for (const protocol of projectProtocols) {
        if (protocol.todos && Array.isArray(protocol.todos)) {
          totalTasks += protocol.todos.length;
          completedTasks += protocol.todos.filter((t: any) => t.done).length;
        }
      }
    }
  } catch {
    // ignore
  }

  // Calculate overall progress
  const totalItems = totalDefects + totalTasks;
  const completedItems = resolvedDefects + completedTasks;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return {
    totalDefects,
    resolvedDefects,
    totalTasks,
    completedTasks,
    totalProtocols,
    progressPercent,
  };
}
