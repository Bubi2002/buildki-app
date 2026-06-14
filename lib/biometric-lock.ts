import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BIOMETRIC_ENABLED_KEY = 'biometricLockEnabled';
const LOCK_TIMEOUT_KEY = 'biometricLockTimeout';

export type BiometricType = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricStatus {
  available: boolean;
  enrolled: boolean;
  type: BiometricType;
}

/**
 * Check biometric hardware and enrollment status
 */
export async function getBiometricStatus(): Promise<BiometricStatus> {
  if (Platform.OS === 'web') {
    return { available: false, enrolled: false, type: 'none' };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let type: BiometricType = 'none';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      type = 'face';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      type = 'fingerprint';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      type = 'iris';
    }

    return { available: hasHardware, enrolled: isEnrolled, type };
  } catch {
    return { available: false, enrolled: false, type: 'none' };
  }
}

/**
 * Authenticate using biometrics
 */
export async function authenticate(): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    return { success: true };
  }

  try {
    const status = await getBiometricStatus();
    if (!status.available || !status.enrolled) {
      return { success: true }; // Skip if not available
    }

    const promptMessage = status.type === 'face'
      ? 'Mit Face ID entsperren'
      : status.type === 'fingerprint'
      ? 'Mit Fingerabdruck entsperren'
      : 'Biometrisch entsperren';

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Abbrechen',
      disableDeviceFallback: false,
      fallbackLabel: 'PIN eingeben',
    });

    if (result.success) {
      return { success: true };
    }

    if (result.error === 'user_cancel') {
      return { success: false, error: 'cancelled' };
    }

    return { success: false, error: result.warning || 'Authentifizierung fehlgeschlagen' };
  } catch (e: any) {
    return { success: false, error: e.message || 'Unbekannter Fehler' };
  }
}

/**
 * Check if biometric lock is enabled in settings
 */
export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

/**
 * Enable or disable biometric lock
 */
export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

/**
 * Get the lock timeout in milliseconds (default: 30 seconds)
 */
export async function getLockTimeout(): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(LOCK_TIMEOUT_KEY);
    return value ? parseInt(value, 10) : 30000;
  } catch {
    return 30000;
  }
}

/**
 * Set the lock timeout in milliseconds
 */
export async function setLockTimeout(ms: number): Promise<void> {
  await AsyncStorage.setItem(LOCK_TIMEOUT_KEY, ms.toString());
}

/**
 * Get a human-readable label for the biometric type
 */
export function getBiometricLabel(type: BiometricType): string {
  switch (type) {
    case 'face':
      return 'Face ID';
    case 'fingerprint':
      return 'Fingerabdruck';
    case 'iris':
      return 'Iris-Erkennung';
    default:
      return 'Biometrie';
  }
}
