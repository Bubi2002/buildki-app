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
