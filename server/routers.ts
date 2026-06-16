import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";
import { getTemplateById } from "../shared/templates";
import { getDb } from "./db";
import { protocols } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

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
        // Resolve relative storage URLs to absolute URLs for server-side fetch
        let audioUrl = input.audioUrl;
        if (audioUrl.startsWith("/manus-storage/")) {
          const port = process.env.PORT || "3000";
          audioUrl = `http://127.0.0.1:${port}${audioUrl}`;
        }

        const result = await transcribeAudio({
          audioUrl,
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
          templateId: z.string().optional(),
          style: z.enum(["formal", "informal"]).optional(),
          format: z.enum(["bullets", "paragraphs"]).optional(),
          recordingDate: z.string().optional(),
          markers: z.array(z.object({ time: z.number(), label: z.string() })).optional(),
          photoCount: z.number().optional(),
          photoTimestamps: z.array(z.number()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const style = input.style || "formal";
        const format = input.format || "bullets";
        const templateId = input.templateId || "freitext";

        const template = getTemplateById(templateId);

        const styleNote =
          style === "formal"
            ? "Schreibe formell und sachlich."
            : "Schreibe verständlich und informell.";
        const formatNote =
          format === "bullets"
            ? "Verwende Stichpunkte und klare Gliederung."
            : "Schreibe in Fließtext mit Absätzen.";

        const systemPrompt = `${template.systemPrompt}\n\nZusätzliche Hinweise:\n- ${styleNote}\n- ${formatNote}\n- WICHTIG: Das Aufnahmedatum ist im Kontext angegeben. Verwende AUSSCHLIESSLICH dieses Datum im Protokoll. Erfinde NIEMALS ein anderes Datum.\n\nAntworte ausschließlich mit dem fertigen Protokoll.`;

        // Build user message with recording context
        let userMessage = "";
        
        // Add recording date context
        if (input.recordingDate) {
          const date = new Date(input.recordingDate);
          const dateStr = date.toLocaleDateString("de-DE", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          const timeStr = date.toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          });
          userMessage += `AUFNAHMEDATUM: ${dateStr}, ${timeStr} Uhr\n\n`;
        }

        // Add markers context for section structure
        if (input.markers && input.markers.length > 0) {
          userMessage += "MARKIERUNGEN (Abschnitt-Trenner während der Aufnahme gesetzt):\n";
          input.markers.forEach((m, i) => {
            const mins = Math.floor(m.time / 60);
            const secs = Math.floor(m.time % 60);
            const timeCode = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
            userMessage += `  [${timeCode}] Markierung ${i + 1}: ${m.label || "Abschnitt"}\n`;
          });
          userMessage += "\nBitte strukturiere das Protokoll anhand dieser Markierungen in entsprechende Abschnitte. Füge zwischen den Abschnitten einen klaren Trenner ein.\n\n";
        }

        // Add photo context with timestamps for inline placement
        if (input.photoCount && input.photoCount > 0) {
          if (input.photoTimestamps && input.photoTimestamps.length > 0) {
            userMessage += `FOTOS: ${input.photoCount} Foto(s) wurden während der Aufnahme zu folgenden Zeitpunkten gemacht:\n`;
            input.photoTimestamps.forEach((ts, i) => {
              const mins = Math.floor(ts / 60);
              const secs = Math.floor(ts % 60);
              userMessage += `  Foto ${i + 1}: bei ${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")} Min.\n`;
            });
            userMessage += `\nFüge an der thematisch passenden Stelle im Protokoll den Platzhalter [FOTO X] ein (z.B. [FOTO 1], [FOTO 2] etc.), damit die Fotos im fertigen Dokument inline erscheinen.\n\n`;
          } else {
            userMessage += `FOTOS: ${input.photoCount} Foto(s) wurden während der Aufnahme gemacht und sind dem Protokoll beigefügt.\n\n`;
          }
        }

        userMessage += `TRANSKRIPTION:\n${input.transcription}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        });

        const protocolText =
          (response.choices?.[0]?.message?.content as string) || "Protokoll konnte nicht erstellt werden.";

        return { protocol: protocolText, templateName: template.name };
      }),

    extractTodos: publicProcedure
      .input(
        z.object({
          transcription: z.string(),
          protocolText: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const systemPrompt = `Du bist ein Assistent, der aus Protokollen und Transkriptionen konkrete Aufgaben (To-Dos) extrahiert.

Analysiere den folgenden Protokolltext und die Originaltranskription. Extrahiere alle konkreten Aufgaben, Handlungsanweisungen, Vereinbarungen und offenen Punkte.

Für jede Aufgabe gib an:
- "task": Die konkrete Aufgabe in einem Satz
- "assignee": Die verantwortliche Person (falls genannt, sonst "Nicht zugewiesen")
- "priority": "hoch", "mittel" oder "niedrig" (basierend auf Dringlichkeit/Kontext)
- "deadline": Frist falls genannt (sonst "Offen")

Antworte AUSSCHLIESSLICH mit einem JSON-Array. Keine weiteren Erklärungen.
Beispiel:
[
  {"task": "Angebot an Herrn Müller senden", "assignee": "Max", "priority": "hoch", "deadline": "Freitag"},
  {"task": "Material für Dachsanierung bestellen", "assignee": "Nicht zugewiesen", "priority": "mittel", "deadline": "Offen"}
]

Falls keine Aufgaben erkennbar sind, antworte mit einem leeren Array: []`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `PROTOKOLL:\n${input.protocolText}\n\nORIGINAL-TRANSKRIPTION:\n${input.transcription}`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const content =
          (response.choices?.[0]?.message?.content as string) || "[]";

        try {
          const parsed = JSON.parse(content);
          const todos = Array.isArray(parsed) ? parsed : (parsed.todos || parsed.tasks || []);
          return { todos };
        } catch {
          const match = content.match(/\[[\s\S]*\]/);
          if (match) {
            try {
              const todos = JSON.parse(match[0]);
              return { todos: Array.isArray(todos) ? todos : [] };
            } catch {
              return { todos: [] };
            }
          }
          return { todos: [] };
        }
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

        const sizeMB = buffer.length / (1024 * 1024);
        const isVideo = input.mimeType.startsWith("video/");
        const maxSize = isVideo ? 50 : 16;
        if (sizeMB > maxSize) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Datei zu gro\u00df: ${sizeMB.toFixed(1)}MB (max ${maxSize}MB)`,
          });
        }

        const key = `audio/${Date.now()}-${input.filename}`;
        const { url } = await storagePut(key, buffer, input.mimeType);

        return { url, key };
      }),
  }),

  // Cloud Sync endpoints (require login)
  sync: router({
    // Upload a protocol to the cloud
    pushProtocol: protectedProcedure
      .input(
        z.object({
          localId: z.string(),
          title: z.string().nullable(),
          transcription: z.string().nullable(),
          protocol: z.string().nullable(),
          templateName: z.string().nullable(),
          templateId: z.string().nullable(),
          todos: z.string().nullable(), // JSON string
          markers: z.string().nullable(), // JSON string
          photos: z.string().nullable(), // JSON string
          duration: z.number().nullable(),
          recordingMode: z.string().nullable(),
          calendarEventId: z.string().nullable(),
          createdAt: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const userId = ctx.user.id;

        // Check if protocol already exists
        const existing = await db
          .select()
          .from(protocols)
          .where(and(eq(protocols.localId, input.localId), eq(protocols.userId, userId)))
          .limit(1);

        if (existing.length > 0) {
          // Update existing
          await db
            .update(protocols)
            .set({
              title: input.title,
              transcription: input.transcription,
              protocol: input.protocol,
              templateName: input.templateName,
              templateId: input.templateId,
              todos: input.todos,
              markers: input.markers,
              photos: input.photos,
              duration: input.duration,
              recordingMode: input.recordingMode,
              calendarEventId: input.calendarEventId,
            })
            .where(eq(protocols.id, existing[0].id));

          return { id: existing[0].id, action: "updated" as const };
        } else {
          // Insert new
          const result = await db.insert(protocols).values({
            localId: input.localId,
            userId,
            title: input.title,
            transcription: input.transcription,
            protocol: input.protocol,
            templateName: input.templateName,
            templateId: input.templateId,
            todos: input.todos,
            markers: input.markers,
            photos: input.photos,
            duration: input.duration,
            recordingMode: input.recordingMode,
            calendarEventId: input.calendarEventId,
          });

          return { id: result[0].insertId, action: "created" as const };
        }
      }),

    // Pull all protocols from the cloud
    pullProtocols: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const userId = ctx.user.id;

      const results = await db
        .select()
        .from(protocols)
        .where(eq(protocols.userId, userId))
        .orderBy(desc(protocols.createdAt));

      return {
        protocols: results.map((p) => ({
          localId: p.localId,
          title: p.title,
          transcription: p.transcription,
          protocol: p.protocol,
          templateName: p.templateName,
          templateId: p.templateId,
          todos: p.todos,
          markers: p.markers,
          photos: p.photos,
          duration: p.duration,
          recordingMode: p.recordingMode,
          calendarEventId: p.calendarEventId,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
      };
    }),

    // Delete a protocol from the cloud
    deleteProtocol: protectedProcedure
      .input(z.object({ localId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const userId = ctx.user.id;

        await db
          .delete(protocols)
          .where(and(eq(protocols.localId, input.localId), eq(protocols.userId, userId)));

        return { success: true };
      }),
  }),

  translate: router({
    translateProtocol: publicProcedure
      .input(
        z.object({
          text: z.string(),
          sourceLanguage: z.string().optional(),
          targetLanguage: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const langNames: Record<string, string> = {
          de: "Deutsch",
          en: "Englisch",
          fr: "Französisch",
          es: "Spanisch",
          it: "Italienisch",
          nl: "Niederländisch",
          pl: "Polnisch",
          tr: "Türkisch",
          pt: "Portugiesisch",
          ar: "Arabisch",
          ru: "Russisch",
        };

        const targetName = langNames[input.targetLanguage] || input.targetLanguage;
        const sourceName = input.sourceLanguage ? (langNames[input.sourceLanguage] || input.sourceLanguage) : "der erkannten Sprache";

        const systemPrompt = `Du bist ein professioneller Übersetzer. Übersetze den folgenden Protokolltext von ${sourceName} nach ${targetName}.

Wichtige Regeln:
- Behalte die Struktur und Formatierung bei (Überschriften, Stichpunkte, Absätze)
- Übersetze fachlich korrekt und kontextbezogen
- Behalte Eigennamen, Firmennamen und Adressen unverändert
- Antworte ausschließlich mit der Übersetzung, ohne Erklärungen`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
        });

        const translated =
          (response.choices?.[0]?.message?.content as string) || "Übersetzung fehlgeschlagen.";

        return { translated, targetLanguage: input.targetLanguage };
      }),
  }),
});

export type AppRouter = typeof appRouter;
