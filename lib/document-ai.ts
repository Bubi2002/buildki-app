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
  fileType: DocumentFileType;
  category: DocumentCategory;
  analyzedAt: string;
  summary: string;
  
  // Extracted structured data
  rooms: string[];
  trades: string[];
  persons: Array<{ name: string; role?: string; company?: string }>;
  companies: Array<{ name: string; role?: string }>;
  appointments: ExtractedAppointment[];
  tasks: ExtractedTask[];
  defects: ExtractedDefect[];
  quantities: Array<{ item: string; amount: string; unit: string }>;
  references: Array<{ title: string; type: string; number?: string }>;
  
  // Raw entities
  entities: ExtractedEntity[];
  
  // Confidence
  overallConfidence: number;
  processingTime: number;
}

export interface DocumentUploadRequest {
  projectId: string;
  projectName?: string;
  fileUri: string;
  fileName: string;
  fileType: DocumentFileType;
  category?: DocumentCategory;
  additionalContext?: string;
}

// ─── Document AI Service ─────────────────────────────────────────────────────

const DOCUMENTS_KEY = "document-ai-store";

class DocumentAIService {
  private analyzeMutation: ((input: any) => Promise<any>) | null = null;

  /**
   * Inject the tRPC mutation for server-side analysis.
   */
  setAnalyzeMutation(mutation: (input: any) => Promise<any>): void {
    this.analyzeMutation = mutation;
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

    // Call server-side analysis
    let serverResult: any = null;
    if (this.analyzeMutation) {
      try {
        serverResult = await this.analyzeMutation({
          imageUrls: [request.fileUri],
          projectId: request.projectId,
          projectName: request.projectName,
          additionalContext: this.buildAnalysisPrompt(request),
        });
      } catch (error) {
        // Fallback: create minimal result
      }
    }

    // Parse server result into structured format
    const result = this.parseAnalysisResult(documentId, request, serverResult, startTime);

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
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
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

  private parseAnalysisResult(
    documentId: string,
    request: DocumentUploadRequest,
    serverResult: any,
    startTime: number
  ): DocumentAnalysisResult {
    const processingTime = Date.now() - startTime;

    // Default empty result
    const defaultResult: DocumentAnalysisResult = {
      documentId,
      fileName: request.fileName,
      fileType: request.fileType,
      category: request.category || this.suggestCategory(request.fileName),
      analyzedAt: new Date().toISOString(),
      summary: "",
      rooms: [],
      trades: [],
      persons: [],
      companies: [],
      appointments: [],
      tasks: [],
      defects: [],
      quantities: [],
      references: [],
      entities: [],
      overallConfidence: 0,
      processingTime,
    };

    if (!serverResult) return defaultResult;

    // Try to parse structured JSON from server response
    try {
      let parsed: any = null;
      const responseText = serverResult.summary || serverResult.result || JSON.stringify(serverResult);
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }

      if (parsed) {
        return {
          ...defaultResult,
          summary: parsed.summary || responseText.slice(0, 200),
          category: parsed.category || defaultResult.category,
          rooms: parsed.rooms || [],
          trades: parsed.trades || [],
          persons: parsed.persons || [],
          companies: parsed.companies || [],
          appointments: parsed.appointments || [],
          tasks: parsed.tasks || [],
          defects: parsed.defects || [],
          quantities: parsed.quantities || [],
          references: parsed.references || [],
          entities: this.buildEntities(parsed),
          overallConfidence: 75,
        };
      }
    } catch {}

    // Fallback: use raw summary
    return {
      ...defaultResult,
      summary: typeof serverResult === "string" ? serverResult.slice(0, 200) : "Analyse abgeschlossen",
      overallConfidence: 50,
    };
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
        analyzed: true,
        analysisId: documentId,
        extractedEntities: result.entities.map(e => e.value),
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
