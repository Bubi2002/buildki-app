import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok" })),

  voice: router({
    transcribe: publicProcedure
      .input(
        z.object({
          audioUrl: z.string(),
          language: z.string().optional(),
          prompt: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await transcribeAudio({
          audioUrl: input.audioUrl,
          language: input.language || "de",
          prompt: input.prompt || "Transkribiere die Sprachaufnahme auf Deutsch",
        });

        if ("error" in result) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error,
            cause: result,
          });
        }

        return result;
      }),
  }),

  protocol: router({
    generate: publicProcedure
      .input(
        z.object({
          transcription: z.string(),
          style: z.enum(["formal", "informal"]).optional(),
          format: z.enum(["bullets", "paragraphs"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const style = input.style || "formal";
        const format = input.format || "bullets";

        const systemPrompt = `Du bist ein professioneller Protokollant. Erstelle aus dem folgenden transkribierten Text ein strukturiertes Protokoll.

Stil: ${style === "formal" ? "Formell und sachlich" : "Informell und verständlich"}
Format: ${format === "bullets" ? "Stichpunkte mit klarer Gliederung" : "Fließtext in Absätzen"}

Das Protokoll soll folgende Struktur haben:
1. Zusammenfassung (2-3 Sätze)
2. Hauptpunkte / Beobachtungen
3. Offene Punkte / To-Dos (falls vorhanden)
4. Datum und Zeitstempel

Antworte ausschließlich mit dem fertigen Protokoll, ohne Einleitung oder Kommentare.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.transcription },
          ],
        });

        const protocolText =
          response.choices?.[0]?.message?.content || "Protokoll konnte nicht erstellt werden.";

        return { protocol: protocolText };
      }),
  }),

  upload: router({
    audio: publicProcedure
      .input(
        z.object({
          base64: z.string(),
          mimeType: z.string(),
          filename: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, "base64");

        // Check file size (16MB limit)
        const sizeMB = buffer.length / (1024 * 1024);
        if (sizeMB > 16) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Datei zu groß: ${sizeMB.toFixed(1)}MB (max 16MB)`,
          });
        }

        const key = `audio/${Date.now()}-${input.filename}`;
        const { url } = await storagePut(key, buffer, input.mimeType);

        return { url, key };
      }),
  }),
});

export type AppRouter = typeof appRouter;
