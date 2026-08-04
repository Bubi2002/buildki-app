/**
 * Background Processor for Protocol Recording
 * 
 * Handles the async pipeline: Upload → Transcription → Protocol Generation → Save
 * The recording screen creates a placeholder protocol immediately and navigates away.
 * This processor runs in the background and updates the protocol in AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { getApiBaseUrl } from "@/constants/oauth";
import { timelineEngine } from "@/lib/timeline-engine";
import { syncProtocolDefects } from "@/lib/protocol-defect-sync";

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s exponential backoff

/**
 * Check if an error is a network/transient error that should be retried.
 */
function isRetryableError(error: any): boolean {
  const msg = (error?.message || String(error)).toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("socket") ||
    msg.includes("abort") ||
    msg.includes("failed to fetch") ||
    msg.includes("internet") ||
    msg.includes("offline") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

/**
 * Execute an async function with exponential backoff retry on network errors.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  stepName: string,
  protocolId: string,
  onRetry?: (attempt: number, maxRetries: number) => void
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        if (onRetry) onRetry(attempt + 1, MAX_RETRIES);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

// Types
export interface PendingJob {
  protocolId: string;
  fileUri: string;
  mimeType: string;
  templateId: string;
  templateSystemPrompt?: string;
  templateName?: string;
  style: string;
  format: string;
  createdAt: string;
  markers?: { time: number; label: string }[];
  photos?: string[];
  photoTimestamps?: number[];
  status: "queued" | "uploading" | "transcribing" | "generating" | "extracting-todos" | "done" | "failed";
  error?: string;
  progress?: string;
}

// Event listeners for UI updates
type JobUpdateListener = (protocolId: string, status: PendingJob["status"], error?: string) => void;
const listeners: Set<JobUpdateListener> = new Set();

export function onJobUpdate(listener: JobUpdateListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifyListeners(protocolId: string, status: PendingJob["status"], error?: string) {
  listeners.forEach(fn => fn(protocolId, status, error));
}

// Active jobs tracking
const activeJobs = new Map<string, PendingJob>();

// Helper: Update processing step in AsyncStorage so protocol-detail can show progress
async function updateProtocolStep(protocolId: string, step: string) {
  try {
    const protocolsStr = await AsyncStorage.getItem("protocols");
    const protocols = protocolsStr ? JSON.parse(protocolsStr) : [];
    const idx = protocols.findIndex((p: any) => p.id === protocolId);
    if (idx !== -1) {
      protocols[idx].processingStep = step;
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
    }
  } catch {}
}

export function getActiveJobs(): Map<string, PendingJob> {
  return activeJobs;
}

export function isJobActive(protocolId: string): boolean {
  return activeJobs.has(protocolId);
}

/**
 * Start background processing for a protocol.
 * The protocol placeholder must already be saved in AsyncStorage.
 */
/**
 * Auto-send PDF via email after protocol creation if enabled in settings.
 */
async function autoSendPdfIfEnabled(protocolId: string) {
  const { getPdfBranding } = await import("@/lib/pdf-branding-store");
  const branding = await getPdfBranding();
  
  if (!branding.autoSendEmail) {
    return;
  }
  
  const emailAddressRaw = branding.defaultEmailAddress || "info@iserloh.net";
  const recipients = emailAddressRaw.split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
  const ccRecipients = (branding.emailCc || "").split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
  const bccRecipients = (branding.emailBcc || "").split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
  
  if (recipients.length === 0) {
    return;
  }
  
  // Load the protocol data
  const protocolsStr = await AsyncStorage.getItem("protocols");
  const protocols = protocolsStr ? JSON.parse(protocolsStr) : [];
  const protocol = protocols.find((p: any) => p.id === protocolId);
  
  if (!protocol || !protocol.protocol) {
    return;
  }
  
  // Generate PDF
  const { generateProtocolPdf } = await import("@/lib/pdf-generator");
  const pdfUri = await generateProtocolPdf({
    title: protocol.title || "",
    protocol: protocol.protocol,
    templateName: protocol.templateName || "Protokoll",
    templateId: protocol.templateId,
    photos: protocol.photos || [],
    photoCaptions: protocol.photoCaptions ? Object.values(protocol.photoCaptions) : undefined,
    todos: protocol.todos || [],
    duration: protocol.duration || 0,
    createdAt: protocol.createdAt,
    transcription: protocol.transcription,
    location: protocol.location,
    weather: protocol.weather,
    protocolNumber: protocol.protocolNumber,
    projectName: protocol.projectName || "",
    projectColor: protocol.projectColor,
  });
  
  if (!pdfUri) {
    return;
  }
  
  // Apply email templates with placeholders
  const datumStr = new Date(protocol.createdAt).toLocaleDateString("de-DE");
  const replacePlaceholders = (template: string) => {
    return template
      .replace(/\{vorlage\}/g, protocol.templateName || "Protokoll")
      .replace(/\{titel\}/g, protocol.title || protocol.templateName || "Protokoll")
      .replace(/\{datum\}/g, datumStr)
      .replace(/\{projekt\}/g, protocol.projectName || "");
  };
  const subjectText = branding.emailSubjectTemplate
    ? replacePlaceholders(branding.emailSubjectTemplate)
    : `${protocol.templateName || "Protokoll"} - ${protocol.title || datumStr}`;
  const bodyText = branding.emailBodyTemplate
    ? replacePlaceholders(branding.emailBodyTemplate)
    : `Anbei das Protokoll "${protocol.title || protocol.templateName || "Protokoll"}" vom ${datumStr}.\n\nMit freundlichen Gr\u00fc\u00dfen`;

  // Send via mail composer
  try {
    const MailComposer = await import("expo-mail-composer");
    const isAvailable = await MailComposer.isAvailableAsync();
    if (isAvailable) {
      await MailComposer.composeAsync({
        recipients,
        ccRecipients,
        bccRecipients,
        subject: subjectText,
        body: bodyText,
        attachments: [pdfUri],
      });
    } else {
    }
  } catch (mailErr) {
    console.warn(`[BG-Processor] Mail composer failed:`, mailErr);
  }
}

export async function startBackgroundProcessing(job: PendingJob, apiClient: {
  upload: (base64: string, mimeType: string, filename: string) => Promise<{ url: string }>;
  transcribe: (audioUrl: string, language: string) => Promise<{ text: string; segments?: { start: number; end: number; text: string }[] }>;
  generateProtocol: (transcription: string, templateId: string, style: string, format: string, recordingDate?: string, markers?: { time: number; label: string }[], photoCount?: number, photoTimestamps?: number[], customSystemPrompt?: string, customTemplateName?: string) => Promise<{ protocol: string }>;
  extractTodos: (transcription: string, protocolText: string) => Promise<{ todos: { task: string; assignee: string; priority: string; deadline: string }[] }>;
}) {
  activeJobs.set(job.protocolId, job);
  
  try {
    // Step 1: Compress if needed, then Upload
    job.status = "uploading";
    notifyListeners(job.protocolId, "uploading");
    await updateProtocolStep(job.protocolId, "uploading");
    
    const fileInfo = await FileSystem.getInfoAsync(job.fileUri);
    const fileSizeMB = fileInfo.exists && fileInfo.size ? fileInfo.size / (1024 * 1024) : 0;
    
    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(job.fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    const ext = "m4a";
    const uploadResult = await withRetry(
      () => apiClient.upload(base64, job.mimeType, `recording-${Date.now()}.${ext}`),
      "Upload",
      job.protocolId,
      (attempt, max) => updateProtocolStep(job.protocolId, `uploading (Versuch ${attempt + 1}/${max + 1})`)
    );
    
    // Step 2: Transcribe
    job.status = "transcribing";
    notifyListeners(job.protocolId, "transcribing");
    await updateProtocolStep(job.protocolId, "transcribing");
    
    let audioUrl = uploadResult.url;
    if (audioUrl.startsWith("/")) {
      audioUrl = `${getApiBaseUrl()}${audioUrl}`;
    }
    
    const transcription = await withRetry(
      () => apiClient.transcribe(audioUrl, "de"),
      "Transcription",
      job.protocolId,
      (attempt, max) => updateProtocolStep(job.protocolId, `transcribing (Versuch ${attempt + 1}/${max + 1})`)
    );
    
    // Filter known Whisper hallucinations (appears when audio is silent/too short)
    const whisperHallucinations = [
      "untertitel der amara.org",
      "untertitel von amara.org",
      "subtitles by the amara.org",
      "amara.org community",
      "amara.org-community",
      "thanks for watching",
      "vielen dank fürs zuschauen",
      "vielen dank für's zuschauen",
      "danke fürs zuschauen",
      "please subscribe",
      "bitte abonnieren",
      "copyright",
      "www.mooji.org",
      "transcribed by",
      "transkribiert von",
    ];
    const lowerText = transcription.text.toLowerCase().trim();
    const isHallucination = whisperHallucinations.some(h => lowerText.includes(h)) || lowerText.length < 3;
    if (isHallucination) {
      transcription.text = "";
      console.warn(`[BG-Processor] ${job.protocolId}: Whisper hallucination detected and removed`);
    }
    
    // Also filter hallucinations from segments
    const transcriptionSegments = (transcription.segments || []).filter(s => {
      const segText = s.text.toLowerCase().trim();
      return !whisperHallucinations.some(h => segText.includes(h));
    });
    
    // Step 3: Generate Protocol
    job.status = "generating";
    notifyListeners(job.protocolId, "generating");
    await updateProtocolStep(job.protocolId, "generating");
    
    const protocol = await withRetry(
      () => apiClient.generateProtocol(
        transcription.text,
        job.templateId,
        job.style,
        job.format,
        job.createdAt,
        job.markers,
        job.photos?.length || 0,
        job.photoTimestamps,
        job.templateSystemPrompt,
        job.templateName,
      ),
      "Protocol generation",
      job.protocolId,
      (attempt, max) => updateProtocolStep(job.protocolId, `generating (Versuch ${attempt + 1}/${max + 1})`)
    );
    
    // Step 4: Extract Todos
    job.status = "extracting-todos";
    notifyListeners(job.protocolId, "extracting-todos");
    await updateProtocolStep(job.protocolId, "extracting-todos");
    
    let todos: { task: string; assignee: string; priority: string; deadline: string; done: boolean }[] = [];
    try {
      const todosResult = await apiClient.extractTodos(transcription.text, protocol.protocol);
      todos = (todosResult.todos || []).map((t: any) => ({
        task: t.task || "",
        assignee: t.assignee || "Nicht zugewiesen",
        priority: t.priority || "mittel",
        deadline: t.deadline || "Offen",
        done: false,
      }));
    } catch (todoError) {
      console.warn("[BG-Processor] Todo extraction failed (non-critical):", todoError);
    }
    
    // Step 5: Update protocol in AsyncStorage
    job.status = "done";
    const protocolsStr = await AsyncStorage.getItem("protocols");
    const protocols = protocolsStr ? JSON.parse(protocolsStr) : [];
    const idx = protocols.findIndex((p: any) => p.id === job.protocolId);
    
    if (idx !== -1) {
      protocols[idx] = {
        ...protocols[idx],
        transcription: transcription.text,
        transcriptionSegments: transcriptionSegments.length > 0 ? transcriptionSegments.map(s => ({ start: s.start, end: s.end, text: s.text })) : undefined,
        protocol: protocol.protocol,
        title: transcription.text.trim().length > 0
          ? transcription.text.substring(0, 50) + (transcription.text.length > 50 ? "…" : "")
          : "Ohne erkannte Sprache",
        todos,
        status: "ready",
        processingStep: undefined,
        processingError: undefined,
      };
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      try {
        await syncProtocolDefects(protocols[idx]);
      } catch (defectSyncError) {
        console.warn("[BG-Processor] Protocol defect sync failed (non-critical):", defectSyncError);
      }
    }
    
    notifyListeners(job.protocolId, "done");
    activeJobs.delete(job.protocolId);

    // ─── Timeline Events ───────────────────────────────────────────
    try {
      const projectId = protocols[idx]?.projectId || "default";
      const photoCount = job.photos?.length || 0;

      await timelineEngine.emit({
        projectId,
        eventType: "recording_completed",
        source: "user",
        title: "Aufnahme abgeschlossen",
        description: `Protokoll erstellt (${photoCount} Fotos)`,
        entityId: job.protocolId,
        entityType: "report",
        tags: ["recording", "protocol"],
      });

      await timelineEngine.emit({
        projectId,
        eventType: "protocol_generated",
        source: "photo",
        title: "Protokoll generiert",
        description: protocols[idx]?.title || "Neues Protokoll",
        entityId: job.protocolId,
        entityType: "report",
        tags: ["protocol", "ki"],
      });

      if (todos.length > 0) {
        await timelineEngine.emit({
          projectId,
          eventType: "task_created",
          source: "speech",
          title: `${todos.length} Aufgaben extrahiert`,
          description: todos.map((t: any) => t.task).slice(0, 3).join(", "),
          entityId: job.protocolId,
          entityType: "task",
          tags: ["task", "ki", "speech"],
        });
      }

      if (photoCount > 0) {
        await timelineEngine.emit({
          projectId,
          eventType: "photo_captured",
          source: "user",
          title: `${photoCount} Fotos aufgenommen`,
          entityId: job.protocolId,
          entityType: "photo",
          tags: ["photo"],
        });
      }
    } catch (timelineErr) {
      console.warn("[BG-Processor] Timeline emit failed (non-critical):", timelineErr);
    }
    
    // Auto-send email if enabled
    try {
      await autoSendPdfIfEnabled(job.protocolId);
    } catch (autoSendErr) {
      console.warn("[BG-Processor] Auto-send email failed (non-critical):", autoSendErr);
    }
    
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error(`[BG-Processor] ${job.protocolId}: FAILED -`, errMsg);
    
    job.status = "failed";
    job.error = errMsg;
    
    // Update protocol in AsyncStorage with error
    try {
      const protocolsStr = await AsyncStorage.getItem("protocols");
      const protocols = protocolsStr ? JSON.parse(protocolsStr) : [];
      const idx = protocols.findIndex((p: any) => p.id === job.protocolId);
      if (idx !== -1) {
        protocols[idx] = {
          ...protocols[idx],
          status: "processing",
          processingStep: "failed",
          processingError: errMsg,
        };
        await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      }
    } catch {}
    
    notifyListeners(job.protocolId, "failed", errMsg);
    activeJobs.delete(job.protocolId);
  }
}
