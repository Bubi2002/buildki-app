import AsyncStorage from "@react-native-async-storage/async-storage";

const PDF_BRANDING_KEY = "pdf-branding";

export type FilenameSchema = "project_date_nr" | "nr_project_date" | "date_project_nr" | "project_nr" | "date_nr";

export type PdfTemplate = "standard" | "compact" | "detailed" | "no_photos";

export type PdfBranding = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  logoUri: string | null; // local URI of the logo image
  headerText: string; // custom header text (left side)
  footerText: string; // custom footer text
  showPageNumbers: boolean;
  showDate: boolean;
  showProjectName: boolean;
  accentColor: string; // hex color for header line
  filenameSchema: FilenameSchema;
  pdfTemplate: PdfTemplate; // layout variant
  photoWatermark: boolean; // show date/time + project name watermark on photos
  showCoverPage: boolean; // show professional cover page as first page
  watermarkText: string; // custom watermark text (empty = use date + project name)
  defaultEmailAddress: string; // default email for PDF direct send (comma-separated for multiple)
  autoSendEmail: boolean; // automatically send PDF via email after protocol creation
  showTranscription: boolean; // show original transcription in PDF
  showTodos: boolean; // show task list in PDF
  showMetadata: boolean; // show metadata (location, weather, participants) in PDF
  showSignatures: boolean; // show signature fields in PDF
  photoSize: "klein" | "mittel" | "gro\u00df"; // photo size in PDF
  emailSubjectTemplate: string; // email subject template (placeholders: {vorlage}, {titel}, {datum}, {projekt})
  emailBodyTemplate: string; // email body template (placeholders: {vorlage}, {titel}, {datum}, {projekt})
};

export const DEFAULT_BRANDING: PdfBranding = {
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",
  logoUri: null,
  headerText: "",
  footerText: "Erstellt mit ProtoKI",
  showPageNumbers: true,
  showDate: true,
  showProjectName: true,
  accentColor: "#0a7ea4",
  filenameSchema: "project_date_nr",
  pdfTemplate: "standard" as PdfTemplate,
  photoWatermark: true,
  showCoverPage: true,
  watermarkText: "",
  defaultEmailAddress: "info@iserloh.net",
  autoSendEmail: false,
  showTranscription: true,
  showTodos: true,
  showMetadata: true,
  showSignatures: true,
  photoSize: "mittel" as const,
  emailSubjectTemplate: "{vorlage} - {titel}",
  emailBodyTemplate: "Anbei das Protokoll \"{titel}\" vom {datum}.\n\nMit freundlichen Gr\u00fc\u00dfen",
};

/**
 * Generate filename based on schema
 */
export function generateFilename(
  schema: FilenameSchema,
  projectName: string | undefined,
  date: Date,
  protocolNumber: string | undefined,
  templateName: string
): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9äöüÄÖÜß\-_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  const proj = projectName ? sanitize(projectName) : "Protokoll";
  const tmpl = sanitize(templateName || "Protokoll");
  // Include both protocol number and template name when available
  const nr = protocolNumber ? `${sanitize(protocolNumber)}_${tmpl}` : tmpl;

  switch (schema) {
    case "project_date_nr":
      return `${proj}_${dateStr}_${nr}`;
    case "nr_project_date":
      return `${nr}_${proj}_${dateStr}`;
    case "date_project_nr":
      return `${dateStr}_${proj}_${nr}`;
    case "project_nr":
      return `${proj}_${nr}`;
    case "date_nr":
      return `${dateStr}_${nr}`;
    default:
      return `${proj}_${dateStr}_${nr}`;
  }
}

export async function getPdfBranding(): Promise<PdfBranding> {
  try {
    const stored = await AsyncStorage.getItem(PDF_BRANDING_KEY);
    if (stored) {
      return { ...DEFAULT_BRANDING, ...JSON.parse(stored) };
    }
    return DEFAULT_BRANDING;
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function savePdfBranding(branding: Partial<PdfBranding>): Promise<void> {
  try {
    const current = await getPdfBranding();
    const updated = { ...current, ...branding };
    await AsyncStorage.setItem(PDF_BRANDING_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * Generate HTML header for PDF export
 */
export function generatePdfHeader(branding: PdfBranding, projectName?: string): string {
  const parts: string[] = [];

  // Logo + Company name
  if (branding.logoUri || branding.companyName) {
    parts.push(`<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">`);
    if (branding.logoUri) {
      parts.push(`<img src="${branding.logoUri}" style="height:40px;width:auto;object-fit:contain;" />`);
    }
    if (branding.companyName) {
      parts.push(`<span style="font-size:16px;font-weight:700;color:#1a1a1a;">${branding.companyName}</span>`);
    }
    parts.push(`</div>`);
  }

  // Header text or project name
  const headerLine = branding.headerText || (branding.showProjectName && projectName ? `Projekt: ${projectName}` : "");
  if (headerLine) {
    parts.push(`<div style="font-size:11px;color:#666;margin-top:4px;">${headerLine}</div>`);
  }

  // Accent line
  parts.push(`<div style="height:2px;background:${branding.accentColor};margin-top:10px;margin-bottom:16px;border-radius:1px;"></div>`);

  return parts.join("\n");
}

/**
 * Generate HTML footer for PDF export
 */
export function generatePdfFooter(branding: PdfBranding, pageNum?: number, totalPages?: number): string {
  const parts: string[] = [];
  parts.push(`<div style="height:1px;background:#e5e7eb;margin-top:16px;margin-bottom:8px;"></div>`);
  parts.push(`<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#999;">`);

  // Left: footer text
  parts.push(`<span>${branding.footerText || ""}</span>`);

  // Right: page number and/or date
  const rightParts: string[] = [];
  if (branding.showDate) {
    rightParts.push(new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }));
  }
  if (branding.showPageNumbers && pageNum !== undefined) {
    rightParts.push(`Seite ${pageNum}${totalPages ? ` / ${totalPages}` : ""}`);
  }
  parts.push(`<span>${rightParts.join(" | ")}</span>`);

  parts.push(`</div>`);

  // Company contact info
  if (branding.companyAddress || branding.companyPhone || branding.companyEmail) {
    const contactParts: string[] = [];
    if (branding.companyAddress) contactParts.push(branding.companyAddress);
    if (branding.companyPhone) contactParts.push(`Tel: ${branding.companyPhone}`);
    if (branding.companyEmail) contactParts.push(branding.companyEmail);
    if (branding.companyWebsite) contactParts.push(branding.companyWebsite);
    parts.push(`<div style="font-size:9px;color:#bbb;margin-top:4px;text-align:center;">${contactParts.join(" | ")}</div>`);
  }

  return parts.join("\n");
}

/**
 * Generate a professional cover page HTML for PDF export
 */
export function generateCoverPage(
  branding: PdfBranding,
  protocol: {
    title: string;
    templateName?: string;
    projectName?: string;
    projectColor?: string;
    createdAt: string;
    protocolNumber?: string;
    location?: { address?: string | null; city?: string | null } | null;
  },
  logoBase64?: string | null
): string {
  const accentColor = branding.accentColor || protocol.projectColor || "#0a7ea4";
  const date = new Date(protocol.createdAt);
  const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return `
  <div style="page-break-after: always; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 40px; text-align: center;">
    <!-- Logo -->
    ${logoBase64 ? `<img src="${logoBase64}" style="height: 80px; width: auto; object-fit: contain; margin-bottom: 32px;" />` : ""}
    ${!logoBase64 && branding.companyName ? `<div style="font-size: 28px; font-weight: 800; color: ${accentColor}; margin-bottom: 32px; letter-spacing: -0.5px;">${branding.companyName}</div>` : ""}
    
    <!-- Accent line -->
    <div style="width: 80px; height: 4px; background: ${accentColor}; border-radius: 2px; margin-bottom: 40px;"></div>
    
    <!-- Document type -->
    <div style="font-size: 14px; color: #888; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 12px;">
      ${protocol.templateName || "Protokoll"}
    </div>
    
    <!-- Title -->
    <div style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px; max-width: 80%; line-height: 1.3;">
      ${protocol.title}
    </div>
    
    <!-- Project name -->
    ${protocol.projectName ? `<div style="font-size: 16px; color: ${accentColor}; font-weight: 600; margin-top: 12px;">Projekt: ${protocol.projectName}</div>` : ""}
    
    <!-- Protocol number -->
    ${protocol.protocolNumber ? `<div style="font-size: 13px; color: #666; margin-top: 8px;">Nr. ${protocol.protocolNumber}</div>` : ""}
    
    <!-- Spacer -->
    <div style="flex: 1; min-height: 60px;"></div>
    
    <!-- Meta info -->
    <div style="width: 100%; max-width: 400px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 11px; color: #888;">Datum:</span>
        <span style="font-size: 11px; color: #333; font-weight: 600;">${dateStr}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 11px; color: #888;">Uhrzeit:</span>
        <span style="font-size: 11px; color: #333; font-weight: 600;">${timeStr} Uhr</span>
      </div>
      ${protocol.location?.address ? `
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 11px; color: #888;">Ort:</span>
        <span style="font-size: 11px; color: #333; font-weight: 600;">${protocol.location.address}${protocol.location.city ? `, ${protocol.location.city}` : ""}</span>
      </div>` : ""}
      ${branding.companyName ? `
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 11px; color: #888;">Erstellt von:</span>
        <span style="font-size: 11px; color: #333; font-weight: 600;">${branding.companyName}</span>
      </div>` : ""}
    </div>
    
    <!-- Footer -->
    <div style="margin-top: 24px; font-size: 9px; color: #bbb;">
      ${branding.footerText || "Erstellt mit ProtoKI"}
    </div>
  </div>`;
}
