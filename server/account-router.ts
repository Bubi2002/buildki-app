import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { COOKIE_NAME } from "../shared/const.js";
import {
  attachments,
  dailyReports,
  defects,
  privacyConsentEvents,
  privacyConsents,
  projects,
  protocols,
  users,
} from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

const DELETE_CONFIRMATION = "KONTO ENDGÜLTIG LÖSCHEN";

const withoutSecrets = (user: typeof users.$inferSelect) => ({
  id: user.id,
  openId: user.openId,
  name: user.name,
  email: user.email,
  loginMethod: user.loginMethod,
  role: user.role,
  emailVerified: user.emailVerified,
  phone: user.phone,
  company: user.company,
  firstName: user.firstName,
  lastName: user.lastName,
  subscriptionStatus: user.subscriptionStatus,
  trialStartedAt: user.trialStartedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  lastSignedIn: user.lastSignedIn,
});

async function loadAccountData(userId: number) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Kontodatenbank ist derzeit nicht verfügbar.",
    });
  }

  const [
    userRows,
    consentRows,
    consentEventRows,
    protocolRows,
    projectRows,
    defectRows,
    attachmentRows,
    dailyReportRows,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(privacyConsents).where(eq(privacyConsents.userId, userId)),
    db.select().from(privacyConsentEvents).where(eq(privacyConsentEvents.userId, userId)),
    db.select().from(protocols).where(eq(protocols.userId, userId)),
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(defects).where(eq(defects.userId, userId)),
    db.select().from(attachments).where(eq(attachments.userId, userId)),
    db.select().from(dailyReports).where(eq(dailyReports.userId, userId)),
  ]);

  const user = userRows[0];
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Konto nicht gefunden." });
  }

  return {
    user,
    exportData: {
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
      profile: withoutSecrets(user),
      privacyChoices: consentRows,
      privacyChoiceEvents: consentEventRows,
      protocols: protocolRows,
      projects: projectRows,
      defects: defectRows,
      attachments: attachmentRows,
      dailyReports: dailyReportRows,
      notes: [
        "Passwort-Hashes, Sitzungsgeheimnisse sowie Verifikations- und Reset-Token werden aus Sicherheitsgründen nicht exportiert.",
        "Externe Anbieter- und Aufbewahrungsangaben: OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN.",
      ],
    },
  };
}

export const accountRouter = router({
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const { exportData } = await loadAccountData(ctx.user.id);
    return exportData;
  }),

  deleteAccount: protectedProcedure
    .input(
      z.object({
        confirmation: z.literal(DELETE_CONFIRMATION),
        acknowledgeProviderResiduals: z.literal(true),
      }),
    )
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Kontolöschung ist derzeit nicht verfügbar.",
        });
      }

      const { user, exportData } = await loadAccountData(ctx.user.id);
      const attachmentRows = exportData.attachments;
      const externalResiduals = {
        storageObjectsUnlinked: attachmentRows.length,
        storageProviderDeletion:
          attachmentRows.length > 0
            ? "OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN: Storage-API bietet keine physische Löschoperation; Provider-Löschkonzept/Frist nachweisen."
            : null,
        stripeCustomerReferencePresent: Boolean(user.stripeCustomerId),
        stripeDeletion:
          user.stripeCustomerId
            ? "OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN: Stripe-Kundenobjekt und gesetzliche Aufbewahrung klären."
            : null,
      };

      await db.transaction(async (tx) => {
        await tx.delete(privacyConsentEvents).where(eq(privacyConsentEvents.userId, ctx.user.id));
        await tx.delete(privacyConsents).where(eq(privacyConsents.userId, ctx.user.id));
        await tx.delete(attachments).where(eq(attachments.userId, ctx.user.id));
        await tx.delete(dailyReports).where(eq(dailyReports.userId, ctx.user.id));
        await tx.delete(defects).where(eq(defects.userId, ctx.user.id));
        await tx.delete(protocols).where(eq(protocols.userId, ctx.user.id));
        await tx.delete(projects).where(eq(projects.userId, ctx.user.id));
        await tx.delete(users).where(eq(users.id, ctx.user.id));
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });

      return {
        success: true as const,
        deletedAt: new Date().toISOString(),
        deletedRecords: {
          privacyChoiceEvents: exportData.privacyChoiceEvents.length,
          privacyChoices: exportData.privacyChoices.length,
          attachments: exportData.attachments.length,
          dailyReports: exportData.dailyReports.length,
          defects: exportData.defects.length,
          protocols: exportData.protocols.length,
          projects: exportData.projects.length,
          users: 1,
        },
        externalResiduals,
      };
    }),
});

export { DELETE_CONFIRMATION };
