/**
 * Voice Profiles - Automatic speaker recognition via voice characteristics
 * Stores voice embeddings/fingerprints and auto-assigns speakers
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const VOICE_PROFILES_KEY = "voice-profiles";

export type VoiceProfile = {
  id: string;
  name: string;
  /** Average pitch range (Hz) - used for basic voice matching */
  pitchRange: { low: number; high: number };
  /** Average speaking rate (words per minute) */
  speakingRate: number;
  /** Voice characteristics description from AI analysis */
  characteristics: string;
  /** Number of protocols this profile was detected in */
  detectionCount: number;
  /** Confidence score 0-1 */
  confidence: number;
  lastDetected: number;
  createdAt: number;
};

export async function getVoiceProfiles(): Promise<VoiceProfile[]> {
  try {
    const data = await AsyncStorage.getItem(VOICE_PROFILES_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error("Error loading voice profiles:", e);
  }
  return [];
}

export async function saveVoiceProfile(profile: Omit<VoiceProfile, "id" | "createdAt">): Promise<VoiceProfile> {
  const profiles = await getVoiceProfiles();
  const newProfile: VoiceProfile = {
    ...profile,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: Date.now(),
  };
  profiles.push(newProfile);
  await AsyncStorage.setItem(VOICE_PROFILES_KEY, JSON.stringify(profiles));
  return newProfile;
}

export async function updateVoiceProfile(id: string, updates: Partial<VoiceProfile>): Promise<void> {
  const profiles = await getVoiceProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx >= 0) {
    profiles[idx] = { ...profiles[idx], ...updates };
    await AsyncStorage.setItem(VOICE_PROFILES_KEY, JSON.stringify(profiles));
  }
}

export async function deleteVoiceProfile(id: string): Promise<void> {
  const profiles = await getVoiceProfiles();
  const filtered = profiles.filter(p => p.id !== id);
  await AsyncStorage.setItem(VOICE_PROFILES_KEY, JSON.stringify(filtered));
}

export async function matchSpeakerToProfile(
  characteristics: string,
  speakingRate: number
): Promise<VoiceProfile | null> {
  const profiles = await getVoiceProfiles();
  if (profiles.length === 0) return null;
  
  // Simple matching based on speaking rate similarity and characteristics
  let bestMatch: VoiceProfile | null = null;
  let bestScore = 0;
  
  for (const profile of profiles) {
    let score = 0;
    // Speaking rate similarity (within 20% = good match)
    const rateDiff = Math.abs(profile.speakingRate - speakingRate) / Math.max(profile.speakingRate, 1);
    if (rateDiff < 0.2) score += 0.5;
    else if (rateDiff < 0.4) score += 0.25;
    
    // Characteristics keyword overlap
    const profileWords = profile.characteristics.toLowerCase().split(/\s+/);
    const inputWords = characteristics.toLowerCase().split(/\s+/);
    const overlap = profileWords.filter(w => inputWords.includes(w)).length;
    score += Math.min(overlap / Math.max(profileWords.length, 1), 0.5);
    
    if (score > bestScore && score > 0.4) {
      bestScore = score;
      bestMatch = profile;
    }
  }
  
  return bestMatch;
}

export function getProfilesSortedByRecent(profiles: VoiceProfile[]): VoiceProfile[] {
  return [...profiles].sort((a, b) => b.lastDetected - a.lastDetected);
}
