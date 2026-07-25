import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import {
  privacyConsentEvents,
  privacyConsents,
  type PrivacyConsentRecord,
} from "../drizzle/schema";
import { getDb } from "./db";

export const SERVER_CONSENT_VERSION = 2;

export const OPTIONAL_PURPOSES = [
  "aiProcessing",
  "cloudSync",
  "gpsTracking",
] as const;

export type OptionalPurpose = (typeof OPTIONAL_PURPOSES)[number];
export type ServerConsentChoices = Record<OptionalPurpose, boolean>;

const EMPTY_CHOICES: ServerConsentChoices = {
  aiProcessing: false,
  cloudSync: false,
  gpsTracking: false,
};

export async function getServerConsent(
  userId: number,
): Promise<PrivacyConsentRecord | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(privacyConsents)
    .where(eq(privacyConsents.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getServerConsentChoices(
  userId: number,
): Promise<ServerConsentChoices> {
  const record = await getServerConsent(userId);
  if (!record || record.version !== SERVER_CONSENT_VERSION) {
    return { ...EMPTY_CHOICES };
  }

  return {
    aiProcessing: record.aiProcessing === true,
    cloudSync: record.cloudSync === true,
    gpsTracking: record.gpsTracking === true,
  };
}

export async function saveServerConsentChoices(params: {
  userId: number;
  choices: ServerConsentChoices;
  source?: string;
}): Promise<ServerConsentChoices> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Einwilligungsnachweis kann derzeit nicht gespeichert werden.",
    });
  }

  const source = params.source?.trim().slice(0, 32) || "app";
  const previous = await getServerConsentChoices(params.userId);
  const now = new Date();
  const anyRevoked = OPTIONAL_PURPOSES.some(
    (purpose) => previous[purpose] && !params.choices[purpose],
  );

  await db
    .insert(privacyConsents)
    .values({
      userId: params.userId,
      version: SERVER_CONSENT_VERSION,
      ...params.choices,
      acceptedAt: now,
      updatedAt: now,
      revokedAt: anyRevoked ? now : null,
      source,
    })
    .onDuplicateKeyUpdate({
      set: {
        version: SERVER_CONSENT_VERSION,
        ...params.choices,
        updatedAt: now,
        revokedAt: anyRevoked ? now : null,
        source,
      },
    });

  const events = OPTIONAL_PURPOSES.filter(
    (purpose) => previous[purpose] !== params.choices[purpose],
  ).map((purpose) => ({
    userId: params.userId,
    version: SERVER_CONSENT_VERSION,
    purpose,
    granted: params.choices[purpose],
    occurredAt: now,
    source,
  }));

  if (events.length > 0) {
    await db.insert(privacyConsentEvents).values(events);
  }

  return { ...params.choices };
}

export async function requireServerConsent(
  userId: number,
  purpose: OptionalPurpose,
): Promise<void> {
  const choices = await getServerConsentChoices(userId);
  if (!choices[purpose]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `CONSENT_REQUIRED:${purpose}`,
    });
  }
}
