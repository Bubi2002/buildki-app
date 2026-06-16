/**
 * Team Contacts - Saved contacts for quick email access
 * Stores frequently used team members with names and emails
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const TEAM_CONTACTS_KEY = "team-contacts";

export type TeamContact = {
  id: string;
  name: string;
  email: string;
  role?: string;
  lastUsed?: number;
};

export async function getTeamContacts(): Promise<TeamContact[]> {
  try {
    const data = await AsyncStorage.getItem(TEAM_CONTACTS_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error("Error loading team contacts:", e);
  }
  return [];
}

export async function saveTeamContact(contact: Omit<TeamContact, "id">): Promise<TeamContact> {
  const contacts = await getTeamContacts();
  const newContact: TeamContact = {
    ...contact,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    lastUsed: Date.now(),
  };
  contacts.push(newContact);
  await AsyncStorage.setItem(TEAM_CONTACTS_KEY, JSON.stringify(contacts));
  return newContact;
}

export async function updateTeamContact(id: string, updates: Partial<TeamContact>): Promise<void> {
  const contacts = await getTeamContacts();
  const idx = contacts.findIndex(c => c.id === id);
  if (idx >= 0) {
    contacts[idx] = { ...contacts[idx], ...updates };
    await AsyncStorage.setItem(TEAM_CONTACTS_KEY, JSON.stringify(contacts));
  }
}

export async function deleteTeamContact(id: string): Promise<void> {
  const contacts = await getTeamContacts();
  const filtered = contacts.filter(c => c.id !== id);
  await AsyncStorage.setItem(TEAM_CONTACTS_KEY, JSON.stringify(filtered));
}

export async function markContactUsed(id: string): Promise<void> {
  await updateTeamContact(id, { lastUsed: Date.now() });
}

export function sortContactsByRecent(contacts: TeamContact[]): TeamContact[] {
  return [...contacts].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}
