/**
 * Speaker Names - Persistent speaker identification across protocols
 * Maps speaker voice patterns/labels to real names
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const SPEAKER_NAMES_KEY = "speaker-names-map";

export type SpeakerProfile = {
  id: string;
  label: string; // e.g. "Sprecher 1"
  name: string; // User-assigned real name
  projectId?: string; // Optional project scope
  usageCount: number;
  lastSeen: number;
};

export async function getSpeakerProfiles(): Promise<SpeakerProfile[]> {
  try {
    const data = await AsyncStorage.getItem(SPEAKER_NAMES_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error("Error loading speaker profiles:", e);
  }
  return [];
}

export async function saveSpeakerProfile(profile: Omit<SpeakerProfile, "id">): Promise<SpeakerProfile> {
  const profiles = await getSpeakerProfiles();
  // Check if a profile with same label already exists
  const existing = profiles.find(p => p.label === profile.label && p.projectId === profile.projectId);
  if (existing) {
    existing.name = profile.name;
    existing.usageCount += 1;
    existing.lastSeen = Date.now();
    await AsyncStorage.setItem(SPEAKER_NAMES_KEY, JSON.stringify(profiles));
    return existing;
  }
  const newProfile: SpeakerProfile = {
    ...profile,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  };
  profiles.push(newProfile);
  await AsyncStorage.setItem(SPEAKER_NAMES_KEY, JSON.stringify(profiles));
  return newProfile;
}

export async function updateSpeakerName(label: string, newName: string, projectId?: string): Promise<void> {
  const profiles = await getSpeakerProfiles();
  const profile = profiles.find(p => p.label === label && (!projectId || p.projectId === projectId));
  if (profile) {
    profile.name = newName;
    profile.lastSeen = Date.now();
    await AsyncStorage.setItem(SPEAKER_NAMES_KEY, JSON.stringify(profiles));
  } else {
    await saveSpeakerProfile({
      label,
      name: newName,
      projectId,
      usageCount: 1,
      lastSeen: Date.now(),
    });
  }
}

export async function getSpeakerName(label: string, projectId?: string): Promise<string | null> {
  const profiles = await getSpeakerProfiles();
  // First try project-specific match
  if (projectId) {
    const projectMatch = profiles.find(p => p.label === label && p.projectId === projectId);
    if (projectMatch) return projectMatch.name;
  }
  // Then try global match
  const globalMatch = profiles.find(p => p.label === label && !p.projectId);
  if (globalMatch) return globalMatch.name;
  return null;
}

export async function getRecentSpeakers(limit: number = 10): Promise<SpeakerProfile[]> {
  const profiles = await getSpeakerProfiles();
  return profiles
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, limit);
}

export async function deleteSpeakerProfile(id: string): Promise<void> {
  const profiles = await getSpeakerProfiles();
  const filtered = profiles.filter(p => p.id !== id);
  await AsyncStorage.setItem(SPEAKER_NAMES_KEY, JSON.stringify(filtered));
}
