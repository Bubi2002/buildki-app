/**
 * BuildKI – Privacy Consent Manager
 * 
 * Manages user consent for:
 * - KI-Verarbeitung (AI processing)
 * - Cloud-Sync
 * - GPS-Erfassung
 * - Foto-Personenerfassung
 * - Analytics
 * 
 * DSGVO Art. 7: Consent must be freely given, specific, informed, unambiguous.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logAudit } from "./audit-log";

const CONSENT_KEY = "buildki_privacy_consent";

export interface PrivacyConsent {
  version: number; // Consent version (increment when policy changes)
  acceptedAt: string; // ISO date
  consents: {
    aiProcessing: boolean; // KI-Verarbeitung von Transkriptionen
    cloudSync: boolean; // Cloud-Synchronisation
    gpsTracking: boolean; // GPS-Erfassung bei Mängeln
    photoPersons: boolean; // Fotos mit Personen
    analytics: boolean; // Anonyme Nutzungsstatistiken
    auditLog: boolean; // Beweissicherungs-Protokoll (required)
  };
  revokedAt?: string; // If any consent was revoked
}

const CURRENT_CONSENT_VERSION = 1;

/**
 * Get current consent state.
 */
export async function getConsent(): Promise<PrivacyConsent | null> {
  try {
    const raw = await AsyncStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Check if consent has been given (any version).
 */
export async function hasConsent(): Promise<boolean> {
  const consent = await getConsent();
  return consent !== null;
}

/**
 * Check if consent needs update (new version available).
 */
export async function needsConsentUpdate(): Promise<boolean> {
  const consent = await getConsent();
  if (!consent) return true;
  return consent.version < CURRENT_CONSENT_VERSION;
}

/**
 * Save consent choices.
 */
export async function saveConsent(consents: PrivacyConsent["consents"]): Promise<void> {
  const consent: PrivacyConsent = {
    version: CURRENT_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    consents: {
      ...consents,
      auditLog: true, // Always required for Beweissicherung
    },
  };
  
  await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  
  await logAudit("settings.changed", "consent", undefined, {
    action: "consent_given",
    version: CURRENT_CONSENT_VERSION,
    consents: consent.consents,
  });
}

/**
 * Revoke a specific consent.
 */
export async function revokeConsent(key: keyof PrivacyConsent["consents"]): Promise<void> {
  if (key === "auditLog") return; // Cannot revoke audit log (required)
  
  const consent = await getConsent();
  if (!consent) return;
  
  consent.consents[key] = false;
  consent.revokedAt = new Date().toISOString();
  
  await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  
  await logAudit("settings.changed", "consent", undefined, {
    action: "consent_revoked",
    key,
    revokedAt: consent.revokedAt,
  });
}

/**
 * Check if a specific consent is given.
 */
export async function isConsentGiven(key: keyof PrivacyConsent["consents"]): Promise<boolean> {
  const consent = await getConsent();
  if (!consent) return false;
  return consent.consents[key] === true;
}

/**
 * Reset all consents (for testing or DSGVO deletion).
 */
export async function resetConsent(): Promise<void> {
  await AsyncStorage.removeItem(CONSENT_KEY);
}
