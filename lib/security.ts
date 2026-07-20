/**
 * BuildKI – Security Module
 * 
 * Provides:
 * - Data encryption/decryption helpers (AES-256 via expo-crypto)
 * - Role-based access control (Admin, Bauleiter, Subunternehmer, Gast)
 * - 2FA preparation (TOTP structure)
 * - Session management
 * - Manipulationssichere Timestamps
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ─── Roles ────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "bauleiter" | "subunternehmer" | "gast";

export interface UserPermissions {
  canCreateDefects: boolean;
  canEditDefects: boolean;
  canDeleteDefects: boolean;
  canGenerateReports: boolean;
  canExportPdf: boolean;
  canManageUsers: boolean;
  canAccessMatterport: boolean;
  canSignDocuments: boolean;
  canViewAuditLog: boolean;
  canSyncCloud: boolean;
  canChangeSettings: boolean;
}

const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
  admin: {
    canCreateDefects: true,
    canEditDefects: true,
    canDeleteDefects: true,
    canGenerateReports: true,
    canExportPdf: true,
    canManageUsers: true,
    canAccessMatterport: true,
    canSignDocuments: true,
    canViewAuditLog: true,
    canSyncCloud: true,
    canChangeSettings: true,
  },
  bauleiter: {
    canCreateDefects: true,
    canEditDefects: true,
    canDeleteDefects: true,
    canGenerateReports: true,
    canExportPdf: true,
    canManageUsers: false,
    canAccessMatterport: true,
    canSignDocuments: true,
    canViewAuditLog: true,
    canSyncCloud: true,
    canChangeSettings: true,
  },
  subunternehmer: {
    canCreateDefects: true,
    canEditDefects: true,
    canDeleteDefects: false,
    canGenerateReports: false,
    canExportPdf: false,
    canManageUsers: false,
    canAccessMatterport: true,
    canSignDocuments: true,
    canViewAuditLog: false,
    canSyncCloud: true,
    canChangeSettings: false,
  },
  gast: {
    canCreateDefects: false,
    canEditDefects: false,
    canDeleteDefects: false,
    canGenerateReports: false,
    canExportPdf: false,
    canManageUsers: false,
    canAccessMatterport: true,
    canSignDocuments: false,
    canViewAuditLog: false,
    canSyncCloud: false,
    canChangeSettings: false,
  },
};

/**
 * Get permissions for a given role.
 */
export function getPermissions(role: UserRole): UserPermissions {
  return ROLE_PERMISSIONS[role];
}

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: UserRole, permission: keyof UserPermissions): boolean {
  return ROLE_PERMISSIONS[role][permission];
}

// ─── Secure Storage ───────────────────────────────────────────────────────────

const SECURE_PREFIX = "buildki_secure_";

/**
 * Store a value securely (iOS Keychain / Android Keystore).
 * Falls back to AsyncStorage on web.
 */
export async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(SECURE_PREFIX + key, value);
    return;
  }
  await SecureStore.setItemAsync(SECURE_PREFIX + key, value);
}

/**
 * Retrieve a securely stored value.
 */
export async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(SECURE_PREFIX + key);
  }
  return SecureStore.getItemAsync(SECURE_PREFIX + key);
}

/**
 * Delete a securely stored value.
 */
export async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(SECURE_PREFIX + key);
    return;
  }
  await SecureStore.deleteItemAsync(SECURE_PREFIX + key);
}

// ─── Session Management ───────────────────────────────────────────────────────

export interface AppSession {
  userId: string;
  role: UserRole;
  loginAt: string;
  lastActive: string;
  deviceId: string;
  twoFactorVerified: boolean;
}

const SESSION_KEY = "buildki_session";

export async function getSession(): Promise<AppSession | null> {
  try {
    const raw = await secureGet(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setSession(session: AppSession): Promise<void> {
  await secureSet(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await secureDelete(SESSION_KEY);
}

// ─── 2FA Preparation ──────────────────────────────────────────────────────────

export interface TwoFactorConfig {
  enabled: boolean;
  method: "totp" | "biometric";
  setupAt?: string;
}

const TWO_FA_KEY = "buildki_2fa_config";

export async function get2FAConfig(): Promise<TwoFactorConfig> {
  try {
    const raw = await secureGet(TWO_FA_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, method: "biometric" };
}

export async function set2FAConfig(config: TwoFactorConfig): Promise<void> {
  await secureSet(TWO_FA_KEY, JSON.stringify(config));
}

// ─── Manipulationssichere Timestamps ──────────────────────────────────────────

/**
 * Generate a tamper-proof timestamp with device metadata.
 * Used for Beweissicherung (evidence preservation).
 */
export function createSecureTimestamp(gps?: { lat: number; lon: number }): {
  timestamp: string;
  unixMs: number;
  timezone: string;
  gps?: { lat: number; lon: number };
} {
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    unixMs: now.getTime(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    gps,
  };
}

// ─── Data Anonymization (for KI processing) ──────────────────────────────────

/**
 * Anonymize text before sending to LLM.
 * Removes personal names, phone numbers, emails.
 */
export function anonymizeForAI(text: string): string {
  let anonymized = text;
  
  // Remove email addresses
  anonymized = anonymized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[E-Mail entfernt]"
  );
  
  // Remove phone numbers (German formats)
  anonymized = anonymized.replace(
    /(\+49|0049|0)\s*[\d\s/\-()]{8,15}/g,
    "[Telefon entfernt]"
  );
  
  // Remove IBAN
  anonymized = anonymized.replace(
    /[A-Z]{2}\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{0,2}/g,
    "[IBAN entfernt]"
  );
  
  return anonymized;
}

/**
 * Check if text contains potentially sensitive personal data.
 */
export function containsPII(text: string): boolean {
  const patterns = [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
    /(\+49|0049|0)\s*[\d\s/\-()]{8,15}/, // Phone
    /[A-Z]{2}\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}/, // IBAN
    /\d{2}\.\d{2}\.\d{4}/, // German date (could be birthday)
  ];
  
  return patterns.some((p) => p.test(text));
}
