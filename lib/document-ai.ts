/**
 * protoKI – Document AI Service
 * 
 * Analysiert Dokumente (PDF, DOCX, XLSX, Bilder) und extrahiert
 * strukturierte Informationen für den Knowledge Layer:
 * - Räume, Gewerke, Termine, Fristen
 * - Ansprechpartner, Mengen, Aufgaben, Mängel
 * - Dokumentreferenzen
 * 
 * Keine KI-Logik in UI-Komponenten – alles über diesen Service.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { analyzeExtractedDocument } from "@/lib/document-analysis-parser";
import {
  DocumentExtractionError,
  extractDocumentText,
  type DocumentExtractionMethod,
  type DocumentExtractionResult,
} from "@/lib/document-text-extractor";
import { knowledgeLayer } from "@/lib/knowledge-layer";
import { timelineEngine } from "@/lib/timeline-engine";
import type { DocumentEntity, DocumentCategory, EntityType } from "@/shared/entities";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DocumentFileType = "pdf" | "docx" | "xlsx" | "image" | "other";

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface ExtractedAppointment {
  title: string;
  date: string;
  time?: string;
  participants?: string[];
  location?: string;
}

export interface ExtractedTask {
  title: string;
  description?: string;
  priority?: string;
  deadline?: string;
  assignedTo?: string;
  trade?: string;
}

export interface ExtractedDefect {
  title: string;
  description?: string;
  location?: string;
  severity?: string;
  trade?: string;
}

export interface DocumentAnalysisResult {
  documentId: string;
  fileName: string;
  fileUri: string;
  fileType: DocumentFileType;
  category: DocumentCategory;
  analyzedAt: string;
  analysisStatus: "completed";
  summary: string;
  
  // Extracted structured data
  rooms: string[];
  trades: string[];
  persons: { name: string; role?: string; company?: string }[];
  companies: { name: string; role?: string }[];
  appointments: ExtractedAppointment[];
  tasks: ExtractedTask[];
  defects: ExtractedDefect[];
  quantities: { item: string; amount: string; unit: string }[];
  references: { title: string; type: string; number?: string }[];

  // Plan-relevant extraction
  buildingType?: string;
  floors?: string[];
  roomAreas?: { name: string; area: number }[];
  totalAreaSqm?: number;
  materials?: string[];
  scale?: string;            // Maßstab, z.B. "1:100"
  ceilingHeights?: string[]; // Raumhöhen, z.B. ["2,50 m"]

  // Raw entities
  entities: ExtractedEntity[];
  
  // Confidence
  overallConfidence: number;
  processingTime: number;
  extraction: {
    method: DocumentExtractionMethod | "image_ai";
    pageCount?: number;
    textLength?: number;
    truncated?: boolean;
  };
  warnings: string[];
  sourceExcerpts: string[];
}

export interface DocumentUploadRequest {
  projectId: string;
  projectName?: string;
  fileUri: string;
  fileName: string;
  fileType: DocumentFileType;
  fileSize?: number;
  remoteUri?: string;
  category?: DocumentCategory;
  additionalContext?: string;
}

export class DocumentAnalysisError extends Error {
  constructor(
    public readonly code: string,
    public readonly userMessage: string,
    message = userMessage,
  ) {
    super(message);
    this.name = "DocumentAnalysisError";
  }
}

// ─── Document AI Service ─────────────────────────────────────────────────────

const DOCUMENTS_KEY = "document-ai-store";

export class DocumentAIService {
  private analyzeMutation: ((input: any) => Promise<any>) | null = null;
  private analyzeDocumentMutation: ((input: any) => Promise<any>) | null = null;

  /**
   * Inject the tRPC mutation for server-side text/document (LLM) analysis.
   */
  setAnalyzeDocumentMutation(mutation: (input: any) => Promise<any>): void {
    this.analyzeDocumentMutation = mutation;
  }

  /**
   * Inject the tRPC mutation for server-side analysis.
   */
  setAnalyzeMutation(mutation: (input: any) => Promise<any>): void {
    this.analyzeMutation = mutation;
  }

  /**
   * Map the server LLM's document analysis to a full DocumentAnalysisResult.
   */
  private buildResultFromLLM(
    documentId: string,
    request: DocumentUploadRequest,
    category: DocumentCategory,
    extraction: DocumentExtractionResult,
    ai: any,
    startedAt: number,
  ): DocumentAnalysisResult {
    const roomAreas = (Array.isArray(ai?.roomAreas) ? ai.roomAreas : [])
      .map((r: any) => ({ name: String(r?.name || "").trim(), area: Number(r?.area) || 0 }))
      .filter((r: { name: string; area: number }) => r.name && r.area > 0);
    const strArr = (v: any): string[] => (Array.isArray(v) ? v.map((x: any) => String(x).trim()).filter(Boolean) : []);
    const floors = strArr(ai?.floors);
    const materials = strArr(ai?.materials);
    const trades = strArr(ai?.trades);
    const tasks: ExtractedTask[] = (Array.isArray(ai?.tasks) ? ai.tasks : [])
      .map((t: any) => ({ title: String(t?.title || "").trim(), description: t?.description, priority: t?.priority, trade: t?.trade }))
      .filter((t: ExtractedTask) => t.title);
    const defects: ExtractedDefect[] = (Array.isArray(ai?.defects) ? ai.defects : [])
      .map((d: any) => ({ title: String(d?.title || "").trim(), description: d?.description, location: d?.location, severity: d?.severity, trade: d?.trade }))
      .filter((d: ExtractedDefect) => d.title);
    const appointments: ExtractedAppointment[] = (Array.isArray(ai?.appointments) ? ai.appointments : [])
      .map((a: any) => ({ title: String(a?.title || "Termin").trim(), date: String(a?.date || "").trim() }))
      .filter((a: ExtractedAppointment) => a.date);
    const totalAreaSqm = Number(ai?.totalAreaSqm) > 0
      ? Math.round(Number(ai.totalAreaSqm) * 10) / 10
      : roomAreas.length
        ? Math.round(roomAreas.reduce((sum: number, r: { area: number }) => sum + r.area, 0) * 10) / 10
        : undefined;
    const lines = extraction.text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length >= 3);

    return {
      documentId,
      fileName: request.fileName,
      fileUri: request.fileUri,
      fileType: request.fileType,
      category,
      analyzedAt: new Date().toISOString(),
      analysisStatus: "completed",
      summary: String(ai?.summary || "").trim() || "Analyse abgeschlossen.",
      buildingType: ai?.buildingType ? String(ai.buildingType).trim() : undefined,
      floors,
      roomAreas,
      totalAreaSqm,
      materials,
      rooms: roomAreas.map((r: { name: string }) => r.name),
      trades,
      persons: [],
      companies: [],
      appointments,
      tasks,
      defects,
      quantities: [],
      references: [],
      entities: [],
      overallConfidence: 90,
      processingTime: Date.now() - startedAt,
      extraction: {
        method: extraction.method,
        pageCount: extraction.pageCount,
        textLength: extraction.textLength,
        truncated: extraction.truncated,
      },
      warnings: extraction.warnings,
      sourceExcerpts: lines.slice(0, 8).map((l) => l.slice(0, 240)),
    };
  }

  /**
   * Upload and analyze a document.
   */
  async analyzeDocument(request: DocumentUploadRequest): Promise<DocumentAnalysisResult> {
    const startTime = Date.now();
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Emit timeline event: upload
    await timelineEngine.emit({
      projectId: request.projectId,
      eventType: "document_uploaded",
      source: "document",
      title: `Dokument hochgeladen: ${request.fileName}`,
      description: `${request.fileType.toUpperCase()} · Kategorie: ${request.category || "auto"}`,
      entityId: documentId,
      entityType: "document",
    });

    let result: DocumentAnalysisResult;
    try {
      if (request.fileType === "image") {
        result = await this.analyzeImageDocument(documentId, request, startTime);
      } else {
        const extraction = await extractDocumentText({
          fileUri: request.fileUri,
          fileName: request.fileName,
          fileType: request.fileType,
          fileSize: request.fileSize,
        });
        const category = request.category || this.suggestCategory(request.fileName);
        // Prefer the server LLM for a high-quality, plan-focused analysis; fall
        // back to the local keyword parser when offline or on any LLM error.
        let llmResult: DocumentAnalysisResult | null = null;
        if (this.analyzeDocumentMutation && extraction.text.trim().length > 0) {
          try {
            const ai = await this.analyzeDocumentMutation({
              text: extraction.text,
              fileName: request.fileName,
              projectName: request.projectName,
            });
            llmResult = this.buildResultFromLLM(documentId, request, category, extraction, ai, startTime);
          } catch {
            llmResult = null;
          }
        }
        result = llmResult ?? analyzeExtractedDocument({
          documentId,
          fileName: request.fileName,
          fileUri: request.fileUri,
          fileType: request.fileType,
          category,
          extraction,
          startedAt: startTime,
        });
        result.entities = this.buildEntities(result);
      }
    } catch (error) {
      await timelineEngine.emit({
        projectId: request.projectId,
        eventType: "custom",
        source: "document",
        title: `Dokumentanalyse fehlgeschlagen: ${request.fileName}`,
        description: error instanceof DocumentExtractionError || error instanceof DocumentAnalysisError
          ? error.userMessage
          : "Das Dokument konnte nicht ausgewertet werden.",
        entityId: documentId,
        entityType: "document",
        metadata: { analysisStatus: "failed" },
      });
      if (error instanceof DocumentAnalysisError) throw error;
      if (error instanceof DocumentExtractionError) {
        throw new DocumentAnalysisError(error.code, error.userMessage, error.message);
      }
      throw new DocumentAnalysisError(
        "ANALYSIS_FAILED",
        "Das Dokument konnte nicht ausgewertet werden. Bitte Dateiformat und Inhalt prüfen.",
        error instanceof Error ? error.message : undefined,
      );
    }

    // Store document record
    await this.storeDocument(documentId, request, result);

    // Feed into Knowledge Layer
    await this.feedKnowledgeLayer(request.projectId, result);

    // Emit timeline event: analyzed
    await timelineEngine.emit({
      projectId: request.projectId,
      eventType: "document_analyzed",
      source: "document",
      title: `Dokument analysiert: ${request.fileName}`,
      description: `${result.entities.length} Entitäten · ${result.tasks.length} Aufgaben · ${result.defects.length} Mängel`,
      entityId: documentId,
      entityType: "document",
      confidence: result.overallConfidence,
    });

    return result;
  }

  /**
   * Get all analyzed documents for a project.
   */
  async getDocuments(projectId: string): Promise<DocumentEntity[]> {
    try {
      const stored = await AsyncStorage.getItem(DOCUMENTS_KEY);
      if (!stored) return [];
      const docs: DocumentEntity[] = JSON.parse(stored);
      return docs.filter(d => d.projectId === projectId);
    } catch {
      return [];
    }
  }

  /**
   * Get analysis result for a specific document.
   */
  async getAnalysisResult(documentId: string): Promise<DocumentAnalysisResult | null> {
    try {
      const stored = await AsyncStorage.getItem(`doc-result-${documentId}`);
      if (!stored) return null;
      const result = JSON.parse(stored) as Partial<DocumentAnalysisResult>;
      const structuredCount = [
        result.rooms,
        result.trades,
        result.persons,
        result.companies,
        result.appointments,
        result.tasks,
        result.defects,
        result.quantities,
        result.references,
      ].reduce((count, value) => count + (Array.isArray(value) ? value.length : 0), 0);
      const isLegacyPlaceholder = result.summary === "Analyse abgeschlossen"
        && result.overallConfidence === 50
        && structuredCount === 0;
      if (isLegacyPlaceholder || !result.summary?.trim()) return null;

      if (!result.fileUri) {
        const docs = await this.getAllDocuments();
        result.fileUri = docs.find((document) => document.id === documentId)?.fileUri;
      }

      return {
        ...result,
        analysisStatus: "completed",
        fileUri: result.fileUri || "",
        extraction: result.extraction || { method: result.fileType === "image" ? "image_ai" : "plain_text" },
        warnings: result.warnings || [],
        sourceExcerpts: result.sourceExcerpts || [],
      } as DocumentAnalysisResult;
    } catch {
      return null;
    }
  }

  private async getAllDocuments(): Promise<DocumentEntity[]> {
    try {
      const stored = await AsyncStorage.getItem(DOCUMENTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Detect file type from extension.
   */
  detectFileType(fileName: string): DocumentFileType {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "pdf": return "pdf";
      case "docx": case "doc": return "docx";
      case "xlsx": case "xls": case "csv": return "xlsx";
      case "jpg": case "jpeg": case "png": case "heic": case "webp": return "image";
      default: return "other";
    }
  }

  /**
   * Suggest document category based on filename and content.
   */
  suggestCategory(fileName: string): DocumentCategory {
    const lower = fileName.toLowerCase();
    if (lower.includes("plan") || lower.includes("grundriss") || lower.includes("schnitt")) return "plan";
    if (lower.includes("vertrag") || lower.includes("contract")) return "contract";
    if (lower.includes("lv") || lower.includes("leistung") || lower.includes("spec")) return "specification";
    if (lower.includes("protokoll") || lower.includes("protocol")) return "protocol";
    if (lower.includes("rechnung") || lower.includes("invoice")) return "invoice";
    if (lower.includes("genehmigung") || lower.includes("permit")) return "permit";
    if (lower.includes("zertifikat") || lower.includes("cert")) return "certificate";
    return "other";
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  private buildAnalysisPrompt(request: DocumentUploadRequest): string {
    return `Analysiere dieses Dokument (${request.fileType.toUpperCase()}: "${request.fileName}") für das Bauprojekt "${request.projectName || ""}".

Extrahiere folgende Informationen im JSON-Format:
{
  "summary": "Kurze Zusammenfassung des Dokuments (max 2 Sätze)",
  "category": "plan|contract|specification|protocol|invoice|correspondence|permit|certificate|other",
  "rooms": ["Liste der erwähnten Räume"],
  "trades": ["Liste der erwähnten Gewerke"],
  "persons": [{"name": "...", "role": "...", "company": "..."}],
  "companies": [{"name": "...", "role": "contractor|subcontractor|client|architect|engineer|supplier|authority"}],
  "appointments": [{"title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "participants": [...]}],
  "tasks": [{"title": "...", "description": "...", "priority": "niedrig|mittel|hoch", "deadline": "...", "trade": "..."}],
  "defects": [{"title": "...", "description": "...", "location": "...", "severity": "minor|major|critical", "trade": "..."}],
  "quantities": [{"item": "...", "amount": "...", "unit": "..."}],
  "references": [{"title": "...", "type": "norm|plan|document|regulation", "number": "..."}]
}

${request.additionalContext ? `Zusätzlicher Kontext: ${request.additionalContext}` : ""}`;
  }

  private async analyzeImageDocument(
    documentId: string,
    request: DocumentUploadRequest,
    startTime: number,
  ): Promise<DocumentAnalysisResult> {
    if (!this.analyzeMutation) {
      throw new DocumentAnalysisError("ANALYZER_UNAVAILABLE", "Die Bildanalyse ist momentan nicht verfügbar.");
    }
    if (!request.remoteUri) {
      throw new DocumentAnalysisError("IMAGE_NOT_UPLOADED", "Das Bild konnte nicht für die Analyse bereitgestellt werden.");
    }

    const serverResult = await this.analyzeMutation({
      imageUrls: [request.remoteUri],
      projectId: request.projectId,
      projectName: request.projectName,
      additionalContext: this.buildAnalysisPrompt(request),
    });

    const summary = typeof serverResult?.summary === "string" ? serverResult.summary.trim() : "";
    if (!summary || summary === "Keine Zusammenfassung verfügbar") {
      throw new DocumentAnalysisError("EMPTY_ANALYSIS", "Die Bildanalyse hat kein auswertbares Ergebnis geliefert.");
    }

    const defects: ExtractedDefect[] = Array.isArray(serverResult.defects)
      ? serverResult.defects.map((defect: any) => ({
        title: String(defect.title || "Erkannter Mangel"),
        description: typeof defect.description === "string" ? defect.description : undefined,
        location: typeof defect.location === "string" ? defect.location : undefined,
        severity: typeof defect.severity === "string" ? defect.severity : undefined,
        trade: typeof defect.trade === "string" ? defect.trade : undefined,
      }))
      : [];
    const tasks: ExtractedTask[] = Array.isArray(serverResult.tasks)
      ? serverResult.tasks.map((task: any) => ({
        title: String(task.title || "Erkannte Aufgabe"),
        description: typeof task.description === "string" ? task.description : undefined,
        priority: typeof task.priority === "string" ? task.priority : undefined,
        deadline: typeof task.deadline === "string" ? task.deadline : undefined,
        trade: typeof task.trade === "string" ? task.trade : undefined,
      }))
      : [];
    const progress = serverResult.progress || {};
    const trades = [...new Set([
      ...(Array.isArray(progress.completedTrades) ? progress.completedTrades : []),
      ...(Array.isArray(progress.activeTrades) ? progress.activeTrades : []),
      ...(Array.isArray(progress.pendingTrades) ? progress.pendingTrades : []),
      ...defects.map((defect) => defect.trade).filter(Boolean),
      ...tasks.map((task) => task.trade).filter(Boolean),
    ].map(String))];
    const defectConfidences = Array.isArray(serverResult.defects)
      ? serverResult.defects.map((defect: any) => Number(defect.confidence)).filter((value: number) => Number.isFinite(value))
      : [];
    const confidence = defectConfidences.length > 0
      ? Math.round(defectConfidences.reduce((sum: number, value: number) => sum + Math.max(0, Math.min(1, value)), 0) / defectConfidences.length * 100)
      : Math.min(90, 62 + defects.length * 3 + tasks.length * 2 + trades.length);

    const result: DocumentAnalysisResult = {
      documentId,
      fileName: request.fileName,
      fileUri: request.fileUri,
      fileType: request.fileType,
      category: request.category || "photo_documentation",
      analyzedAt: new Date().toISOString(),
      analysisStatus: "completed",
      summary,
      rooms: [],
      trades,
      persons: [],
      companies: [],
      appointments: [],
      tasks,
      defects,
      quantities: [],
      references: [],
      entities: [],
      overallConfidence: confidence,
      processingTime: Date.now() - startTime,
      extraction: { method: "image_ai" },
      warnings: [],
      sourceExcerpts: Array.isArray(serverResult.observations)
        ? serverResult.observations.map(String).slice(0, 8)
        : [],
    };
    result.entities = this.buildEntities(result);
    return result;
  }

  private buildEntities(parsed: any): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    for (const room of (parsed.rooms || [])) {
      entities.push({ type: "room", value: room, confidence: 80 });
    }
    for (const trade of (parsed.trades || [])) {
      entities.push({ type: "trade", value: trade, confidence: 80 });
    }
    for (const person of (parsed.persons || [])) {
      entities.push({ type: "person", value: person.name, confidence: 75, metadata: person });
    }
    for (const company of (parsed.companies || [])) {
      entities.push({ type: "company", value: company.name, confidence: 75, metadata: company });
    }
    for (const appt of (parsed.appointments || [])) {
      entities.push({ type: "appointment", value: appt.title, confidence: 70, metadata: appt });
    }

    return entities;
  }

  private async storeDocument(documentId: string, request: DocumentUploadRequest, result: DocumentAnalysisResult): Promise<void> {
    try {
      // Store document entity
      const stored = await AsyncStorage.getItem(DOCUMENTS_KEY);
      const docs: DocumentEntity[] = stored ? JSON.parse(stored) : [];
      
      const doc: DocumentEntity = {
        id: documentId,
        entityType: "document",
        projectId: request.projectId,
        title: request.fileName,
        fileName: request.fileName,
        fileUri: request.fileUri,
        fileType: request.fileType,
        category: result.category,
        analyzed: result.analysisStatus === "completed",
        analysisId: documentId,
        extractedEntities: result.entities.map(e => e.value),
        pageCount: result.extraction.pageCount,
        metadata: {
          analysisStatus: result.analysisStatus,
          confidence: result.overallConfidence,
          extractionMethod: result.extraction.method,
          textLength: result.extraction.textLength,
          warnings: result.warnings,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      docs.unshift(doc);
      await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs.slice(0, 200)));

      // Store analysis result separately
      await AsyncStorage.setItem(`doc-result-${documentId}`, JSON.stringify(result));
    } catch {}
  }

  private async feedKnowledgeLayer(projectId: string, result: DocumentAnalysisResult): Promise<void> {
    try {
      // Feed summary
      if (result.summary) {
        await knowledgeLayer.ingest({
          projectId,
          type: "observation",
          source: "document",
          content: `Dokument "${result.fileName}": ${result.summary}`,
          confidence: result.overallConfidence,
          metadata: { documentId: result.documentId, category: result.category },
        });
      }

      // Feed extracted tasks
      for (const task of result.tasks) {
        await knowledgeLayer.ingest({
          projectId,
          type: "task",
          source: "document",
          content: `${task.title}${task.description ? ": " + task.description : ""}`,
          confidence: 70,
          metadata: { trade: task.trade, deadline: task.deadline, documentId: result.documentId },
        });
      }

      // Feed extracted defects
      for (const defect of result.defects) {
        await knowledgeLayer.ingest({
          projectId,
          type: "defect",
          source: "document",
          content: `${defect.title}${defect.description ? ": " + defect.description : ""}`,
          confidence: 70,
          metadata: { location: defect.location, severity: defect.severity, documentId: result.documentId },
        });
      }

      // Feed rooms and trades as observations
      if (result.rooms.length > 0) {
        await knowledgeLayer.ingest({
          projectId,
          type: "observation",
          source: "document",
          content: `Räume aus "${result.fileName}": ${result.rooms.join(", ")}`,
          confidence: 80,
          metadata: { documentId: result.documentId },
        });
      }
    } catch {}
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const documentAI = new DocumentAIService();
export default documentAI;
