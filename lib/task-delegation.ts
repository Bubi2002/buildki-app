/**
 * Task Delegation - Send assigned tasks as push notifications
 * Integrates with the server notification system
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const DELEGATIONS_KEY = "task-delegations";

export type TaskDelegation = {
  id: string;
  taskText: string;
  assignee: string;
  assigneeEmail?: string;
  priority: "hoch" | "mittel" | "niedrig";
  deadline?: string;
  protocolId: string;
  protocolTitle: string;
  status: "pending" | "sent" | "acknowledged" | "completed";
  sentAt?: number;
  createdAt: number;
};

export async function getDelegations(): Promise<TaskDelegation[]> {
  try {
    const data = await AsyncStorage.getItem(DELEGATIONS_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error("Error loading delegations:", e);
  }
  return [];
}

export async function saveDelegation(delegation: Omit<TaskDelegation, "id" | "createdAt">): Promise<TaskDelegation> {
  const delegations = await getDelegations();
  const newDelegation: TaskDelegation = {
    ...delegation,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: Date.now(),
  };
  delegations.push(newDelegation);
  await AsyncStorage.setItem(DELEGATIONS_KEY, JSON.stringify(delegations));
  return newDelegation;
}

export async function updateDelegationStatus(id: string, status: TaskDelegation["status"]): Promise<void> {
  const delegations = await getDelegations();
  const idx = delegations.findIndex(d => d.id === id);
  if (idx >= 0) {
    delegations[idx].status = status;
    if (status === "sent") delegations[idx].sentAt = Date.now();
    await AsyncStorage.setItem(DELEGATIONS_KEY, JSON.stringify(delegations));
  }
}

export async function deleteDelegation(id: string): Promise<void> {
  const delegations = await getDelegations();
  const filtered = delegations.filter(d => d.id !== id);
  await AsyncStorage.setItem(DELEGATIONS_KEY, JSON.stringify(filtered));
}

export async function getPendingDelegations(): Promise<TaskDelegation[]> {
  const delegations = await getDelegations();
  return delegations.filter(d => d.status === "pending" || d.status === "sent");
}

export function formatDelegationNotification(delegation: TaskDelegation): { title: string; content: string } {
  const priorityEmoji = delegation.priority === "hoch" ? "🔴" : delegation.priority === "mittel" ? "🟡" : "🟢";
  return {
    title: `${priorityEmoji} Neue Aufgabe: ${delegation.taskText.slice(0, 50)}`,
    content: `Zugewiesen an: ${delegation.assignee}\nPriorität: ${delegation.priority}\nProtokoll: ${delegation.protocolTitle}${delegation.deadline ? `\nFrist: ${delegation.deadline}` : ""}`,
  };
}
