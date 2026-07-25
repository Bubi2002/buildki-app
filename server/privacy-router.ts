import { z } from "zod";

import { protectedProcedure, router } from "./_core/trpc";
import {
  getServerConsent,
  getServerConsentChoices,
  saveServerConsentChoices,
  SERVER_CONSENT_VERSION,
} from "./privacy-consent";

const choicesSchema = z.object({
  aiProcessing: z.boolean(),
  cloudSync: z.boolean(),
  gpsTracking: z.boolean(),
});

export const privacyRouter = router({
  getChoices: protectedProcedure.query(async ({ ctx }) => {
    const record = await getServerConsent(ctx.user.id);
    return {
      exists: Boolean(record && record.version === SERVER_CONSENT_VERSION),
      version: SERVER_CONSENT_VERSION,
      choices: await getServerConsentChoices(ctx.user.id),
    };
  }),

  saveChoices: protectedProcedure
    .input(
      z.object({
        version: z.literal(SERVER_CONSENT_VERSION),
        choices: choicesSchema,
        source: z.string().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => ({
      version: SERVER_CONSENT_VERSION,
      choices: await saveServerConsentChoices({
        userId: ctx.user.id,
        choices: input.choices,
        source: input.source,
      }),
    })),
});
