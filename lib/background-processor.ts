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

// Types
export interface PendingJob {
  protocolId: string;
  fileUri: string;
  mimeType: string;
  templateId: string;
  style: string;
  format: string;
  createdAt: string;
  markers?: Array<{ time: number; label: string }>;
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
    console.log(`[BG-Processor] Auto-send disabled, skipping email for ${protocolId}`);
    return;
  }
  
  const emailAddressRaw = branding.defaultEmailAddress || "info@iserloh.net";
  const recipients = emailAddressRaw.split(",").map((e: string) => e.trim()).filter((e: string) => e.length > 0);
  
  if (recipients.length === 0) {
    console.log(`[BG-Processor] No email recipients configured, skipping auto-send`);
    return;
  }
  
  // Load the protocol data
  const protocolsStr = await AsyncStorage.getItem("protocols");
  const protocols = protocolsStr ? JSON.parse(protocolsStr) : [];
  const protocol = protocols.find((p: any) => p.id === protocolId);
  
  if (!protocol || !protocol.protocol) {
    console.log(`[BG-Processor] Protocol not found or empty, skipping auto-send`);
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
    console.log(`[BG-Processor] PDF generation failed, skipping auto-send`);
    return;
  }
  
  // Send via mail composer
  try {
    const MailComposer = await import("expo-mail-composer");
    const isAvailable = await MailComposer.isAvailableAsync();
    if (isAvailable) {
      await MailComposer.composeAsync({
        recipients,
        subject: `${protocol.templateName || "Protokoll"} - ${protocol.title || new Date(protocol.createdAt).toLocaleDateString("de-DE")}`,
        body: `Anbei das automatisch erstellte Protokoll "${protocol.title || protocol.templateName || "Protokoll"}" vom ${new Date(protocol.createdAt).toLocaleDateString("de-DE")}.\n\nMit freundlichen Gr\u00fc\u00dfen`,
        attachments: [pdfUri],
      });
      console.log(`[BG-Processor] Auto-send email composed for ${protocolId}`);
    } else {
      console.log(`[BG-Processor] Mail composer not available, skipping auto-send`);
    }
  } catch (mailErr) {
    console.warn(`[BG-Processor] Mail composer failed:`, mailErr);
  }
}

export async function startBackgroundProcessing(job: PendingJob, apiClient: {
  upload: (base64: string, mimeType: string, filename: string) => Promise<{ url: string }>;
  transcribe: (audioUrl: string, language: string) => Promise<{ text: string; segments?: Array<{ start: number; end: number; text: string }> }>;
  generateProtocol: (transcription: string, templateId: string, style: string, format: string, recordingDate?: string, markers?: Array<{ time: number; label: string }>, photoCount?: number, photoTimestamps?: number[]) => Promise<{ protocol: string }>;
  extractTodos: (transcription: string, protocolText: string) => Promise<{ todos: Array<{ task: string; assignee: string; priority: string; deadline: string }> }>;
}) {
  activeJobs.set(job.protocolId, job);
  
  try {
    // Step 1: Compress if needed, then Upload
    job.status = "uploading";
    notifyListeners(job.protocolId, "uploading");
    await updateProtocolStep(job.protocolId, "uploading");
    
    const fileInfo = await FileSystem.getInfoAsync(job.fileUri);
    const fileSizeMB = fileInfo.exists && fileInfo.size ? fileInfo.size / (1024 * 1024) : 0;
    console.log(`[BG-Processor] ${job.protocolId}: Uploading (${fileSizeMB.toFixed(1)} MB)...`);
    
    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(job.fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    const ext = "m4a";
    const uploadResult = await apiClient.upload(base64, job.mimeType, `recording-${Date.now()}.${ext}`);
    console.log(`[BG-Processor] ${job.protocolId}: Upload complete`);
    
    // Step 2: Transcribe
    job.status = "transcribing";
    notifyListeners(job.protocolId, "transcribing");
    await updateProtocolStep(job.protocolId, "transcribing");
    
    let audioUrl = uploadResult.url;
    if (audioUrl.startsWith("/")) {
      audioUrl = `${getApiBaseUrl()}${audioUrl}`;
    }
    
    const transcription = await apiClient.transcribe(audioUrl, "de");
    const transcriptionSegments = transcription.segments || [];
    console.log(`[BG-Processor] ${job.protocolId}: Transcription complete (${transcriptionSegments.length} segments)`);
    
    // Step 3: Generate Protocol
    job.status = "generating";
    notifyListeners(job.protocolId, "generating");
    await updateProtocolStep(job.protocolId, "generating");
    
    const protocol = await apiClient.generateProtocol(
      transcription.text,
      job.templateId,
      job.style,
      job.format,
      job.createdAt,
      job.markers,
      job.photos?.length || 0,
      job.photoTimestamps,
    );
    console.log(`[BG-Processor] ${job.protocolId}: Protocol generated`);
    
    // Step 4: Extract Todos
    job.status = "extracting-todos";
    notifyListeners(job.protocolId, "extracting-todos");
    await updateProtocolStep(job.protocolId, "extracting-todos");
    
    let todos: Array<{ task: string; assignee: string; priority: string; deadline: string; done: boolean }> = [];
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
        title: transcription.text.substring(0, 50) + "...",
        todos,
        status: "ready",
        processingStep: undefined,
        processingError: undefined,
      };
      await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
      console.log(`[BG-Processor] ${job.protocolId}: Saved to AsyncStorage as ready`);
    }
    
    notifyListeners(job.protocolId, "done");
    activeJobs.delete(job.protocolId);
    
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
