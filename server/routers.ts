import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";
import { getTemplateById } from "../shared/templates";

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
          templateId: z.string().optional(),
          style: z.enum(["formal", "informal"]).optional(),
          format: z.enum(["bullets", "paragraphs"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const style = input.style || "formal";
        const format = input.format || "bullets";
        const templateId = input.templateId || "freitext";

        const template = getTemplateById(templateId);

        // Build system prompt from template + style/format preferences
        const styleNote =
          style === "formal"
            ? "Schreibe formell und sachlich."
            : "Schreibe verständlich und informell.";
        const formatNote =
          format === "bullets"
            ? "Verwende Stichpunkte und klare Gliederung."
            : "Schreibe in Fließtext mit Absätzen.";

        const systemPrompt = `${template.systemPrompt}\n\nZusätzliche Hinweise:\n- ${styleNote}\n- ${formatNote}\n\nAntworte ausschließlich mit dem fertigen Protokoll.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.transcription },
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
          // Parse the response - it might be wrapped in an object or be a direct array
          const parsed = JSON.parse(content);
          const todos = Array.isArray(parsed) ? parsed : (parsed.todos || parsed.tasks || []);
          return { todos };
        } catch {
          // Try to extract JSON array from the response
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
