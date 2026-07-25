import AsyncStorage from "@react-native-async-storage/async-storage";

import { logAudit } from "./audit-log";

const CONSENT_KEY = "buildki_privacy_consent";
export const CURRENT_CONSENT_VERSION = 2;

export const OPTIONAL_PURPOSES = [
  "aiProcessing",
  "cloudSync",
  "gpsTracking",
] as const;

export type OptionalPurpose = (typeof OPTIONAL_PURPOSES)[number];
export type PrivacyChoices = Record<OptionalPurpose, boolean>;

export interface ConsentEvent {
  purpose: OptionalPurpose;
  granted: boolean;
  occurredAt: string;
  source: string;
}

export interface PrivacyConsent {
  version: number;
  presentedAt: string;
  updatedAt: string;
  choices: PrivacyChoices;
  events: ConsentEvent[];
}

export class ConsentRequiredError extends Error {
  readonly purpose: OptionalPurpose;

  constructor(purpose: OptionalPurpose) {
    super(`CONSENT_REQUIRED:${purpose}`);
    this.name = "ConsentRequiredError";
    this.purpose = purpose;
  }
}

export const DEFAULT_PRIVACY_CHOICES: PrivacyChoices = {
  aiProcessing: false,
  cloudSync: false,
  gpsTracking: false,
};

const isPurpose = (value: unknown): value is OptionalPurpose =>
  typeof value === "string" &&
  OPTIONAL_PURPOSES.includes(value as OptionalPurpose);

const normalizeChoices = (value: unknown): PrivacyChoices => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PRIVACY_CHOICES };
  }

  const candidate = value as Partial<Record<OptionalPurpose, unknown>>;
  return {
    aiProcessing: candidate.aiProcessing === true,
    cloudSync: candidate.cloudSync === true,
    gpsTracking: candidate.gpsTracking === true,
  };
};

const parseConsent = (raw: string | null): PrivacyConsent | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PrivacyConsent>;
    if (parsed.version !== CURRENT_CONSENT_VERSION) return null;
    if (typeof parsed.presentedAt !== "string" || typeof parsed.updatedAt !== "string") {
      return null;
    }

    const events = Array.isArray(parsed.events)
      ? parsed.events.filter(
          (event): event is ConsentEvent =>
            Boolean(event) &&
            typeof event === "object" &&
            isPurpose((event as ConsentEvent).purpose) &&
            typeof (event as ConsentEvent).granted === "boolean" &&
            typeof (event as ConsentEvent).occurredAt === "string" &&
            typeof (event as ConsentEvent).source === "string",
        )
      : [];

    return {
      version: CURRENT_CONSENT_VERSION,
      presentedAt: parsed.presentedAt,
      updatedAt: parsed.updatedAt,
      choices: normalizeChoices(parsed.choices),
      events,
    };
  } catch {
    return null;
  }
};

export async function getConsent(): Promise<PrivacyConsent | null> {
  return parseConsent(await AsyncStorage.getItem(CONSENT_KEY));
}

export async function hasConsent(): Promise<boolean> {
  return (await getConsent()) !== null;
}

export async function needsConsentUpdate(): Promise<boolean> {
  return !(await hasConsent());
}

export async function getPrivacyChoices(): Promise<PrivacyChoices> {
  return (await getConsent())?.choices ?? { ...DEFAULT_PRIVACY_CHOICES };
}

export async function saveConsent(
  choices: PrivacyChoices,
  source = "first-run",
): Promise<PrivacyConsent> {
  const previous = await getConsent();
  const now = new Date().toISOString();
  const normalized = normalizeChoices(choices);
  const events: ConsentEvent[] = [...(previous?.events ?? [])];

  for (const purpose of OPTIONAL_PURPOSES) {
    const previousValue = previous?.choices[purpose] ?? false;
    if (!previous || previousValue !== normalized[purpose]) {
      events.push({
        purpose,
        granted: normalized[purpose],
        occurredAt: now,
        source,
      });
    }
  }

  const consent: PrivacyConsent = {
    version: CURRENT_CONSENT_VERSION,
    presentedAt: previous?.presentedAt ?? now,
    updatedAt: now,
    choices: normalized,
    events,
  };

  await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  await logAudit("settings.changed", "consent", undefined, {
    action: "privacy_choices_saved",
    version: CURRENT_CONSENT_VERSION,
    source,
    choices: normalized,
  });
  return consent;
}

export async function updateConsentChoice(
  purpose: OptionalPurpose,
  granted: boolean,
  source = "settings",
): Promise<PrivacyConsent> {
  const choices = await getPrivacyChoices();
  choices[purpose] = granted;
  return saveConsent(choices, source);
}

export async function revokeConsent(
  purpose: OptionalPurpose,
  source = "settings",
): Promise<PrivacyConsent> {
  return updateConsentChoice(purpose, false, source);
}

export async function isConsentGiven(purpose: OptionalPurpose): Promise<boolean> {
  const consent = await getConsent();
  return consent?.choices[purpose] === true;
}

export async function requireConsent(purpose: OptionalPurpose): Promise<void> {
  if (!(await isConsentGiven(purpose))) {
    throw new ConsentRequiredError(purpose);
  }
}

export async function resetConsent(): Promise<void> {
  await AsyncStorage.removeItem(CONSENT_KEY);
}

export function getConsentRequiredMessage(purpose: OptionalPurpose): string {
  const labels: Record<OptionalPurpose, string> = {
    aiProcessing: "KI- und Transkriptionsverarbeitung",
    cloudSync: "Cloud-Synchronisation",
    gpsTracking: "Standortverarbeitung",
  };
  return `${labels[purpose]} ist deaktiviert. Aktivieren Sie diese optionale Funktion zuerst in den Datenschutzoptionen.`;
}
