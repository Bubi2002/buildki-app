import AsyncStorage from '@react-native-async-storage/async-storage';

type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  protocolPrefix?: string;
  protocolCounter?: number;
};

/**
 * Generate the next protocol number for a project.
 * Returns formatted string like "BST-001" or null if project has no prefix.
 * Also increments and saves the counter.
 */
export async function getNextProtocolNumber(projectId: string): Promise<string | null> {
  try {
    const projectsData = await AsyncStorage.getItem('projects');
    if (!projectsData) return null;

    const projects: Project[] = JSON.parse(projectsData);
    const project = projects.find((p) => p.id === projectId);
    if (!project || !project.protocolPrefix) return null;

    const currentCounter = project.protocolCounter || 0;
    const nextCounter = currentCounter + 1;
    const formattedNumber = `${project.protocolPrefix}-${String(nextCounter).padStart(3, '0')}`;

    // Update counter in storage
    const updatedProjects = projects.map((p) =>
      p.id === projectId ? { ...p, protocolCounter: nextCounter } : p
    );
    await AsyncStorage.setItem('projects', JSON.stringify(updatedProjects));

    return formattedNumber;
  } catch (e) {
    console.error('Error generating protocol number:', e);
    return null;
  }
}

/**
 * Get the current counter value for a project (without incrementing).
 */
export async function getCurrentProtocolCounter(projectId: string): Promise<number> {
  try {
    const projectsData = await AsyncStorage.getItem('projects');
    if (!projectsData) return 0;

    const projects: Project[] = JSON.parse(projectsData);
    const project = projects.find((p) => p.id === projectId);
    return project?.protocolCounter || 0;
  } catch {
    return 0;
  }
}

/**
 * Reset the protocol counter for a project.
 */
export async function resetProtocolCounter(projectId: string): Promise<void> {
  try {
    const projectsData = await AsyncStorage.getItem('projects');
    if (!projectsData) return;

    const projects: Project[] = JSON.parse(projectsData);
    const updatedProjects = projects.map((p) =>
      p.id === projectId ? { ...p, protocolCounter: 0 } : p
    );
    await AsyncStorage.setItem('projects', JSON.stringify(updatedProjects));
  } catch (e) {
    console.error('Error resetting protocol counter:', e);
  }
}
