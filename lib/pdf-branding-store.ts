import AsyncStorage from "@react-native-async-storage/async-storage";

const PDF_BRANDING_KEY = "pdf-branding";
const PDF_BRANDING_PROFILES_KEY = "pdf-branding-profiles";

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
  autoSendEmail: boolean; // legacy flag (kept in sync with autoSendMode for compatibility)
  autoSendMode: "off" | "prepare" | "auto"; // off = manual; prepare = auto-build PDF, confirm before send; auto = send immediately
  showTranscription: boolean; // show original transcription in PDF
  showTodos: boolean; // show task list in PDF
  showMetadata: boolean; // show metadata (location, weather, participants) in PDF
  showSignatures: boolean; // show signature fields in PDF
  photoSize: "klein" | "mittel" | "gro\u00df"; // photo size in PDF
  emailSubjectTemplate: string; // email subject template (placeholders: {vorlage}, {titel}, {datum}, {projekt})
  emailBodyTemplate: string; // email body template (placeholders: {vorlage}, {titel}, {datum}, {projekt})
  emailCc: string; // CC recipients (comma-separated)
  emailBcc: string; // BCC recipients (comma-separated)
};

export const DEFAULT_BRANDING: PdfBranding = {
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",
  logoUri: null,
  headerText: "",
  footerText: "Erstellt mit BuildKI",
  showPageNumbers: true,
  showDate: true,
  showProjectName: true,
  accentColor: "#1E3A5F",
  filenameSchema: "project_date_nr",
  pdfTemplate: "standard" as PdfTemplate,
  photoWatermark: true,
  showCoverPage: true,
  watermarkText: "",
  defaultEmailAddress: "info@iserloh.net",
  autoSendEmail: false,
  autoSendMode: "off",
  showTranscription: true,
  showTodos: true,
  showMetadata: true,
  showSignatures: true,
  photoSize: "mittel" as const,
  emailSubjectTemplate: "{vorlage} - {titel}",
  emailBodyTemplate: "Anbei das Protokoll \"{titel}\" vom {datum}.\n\nMit freundlichen Gr\u00fc\u00dfen",
  emailCc: "",
  emailBcc: "",
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
      const merged = { ...DEFAULT_BRANDING, ...JSON.parse(stored) };
      // Migrate the legacy boolean to the new 3-state mode if not set yet.
      if (!JSON.parse(stored).autoSendMode) {
        merged.autoSendMode = merged.autoSendEmail ? "auto" : "off";
      }
      // Migrate the old teal default accent to the new navy default.
      if (merged.accentColor === "#0E7490") {
        merged.accentColor = "#1E3A5F";
      }
      return merged;
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

// ─── Named branding profiles (multiple templates) ───────────────────────────
export type BrandingProfile = { id: string; name: string; branding: PdfBranding; createdAt: string };

export async function getBrandingProfiles(): Promise<BrandingProfile[]> {
  try {
    const raw = await AsyncStorage.getItem(PDF_BRANDING_PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveBrandingProfile(name: string, branding: PdfBranding): Promise<BrandingProfile[]> {
  const profiles = await getBrandingProfiles();
  const trimmed = name.trim() || `Vorlage ${profiles.length + 1}`;
  const existing = profiles.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    existing.branding = branding;
  } else {
    profiles.unshift({ id: Date.now().toString(), name: trimmed, branding, createdAt: new Date().toISOString() });
  }
  await AsyncStorage.setItem(PDF_BRANDING_PROFILES_KEY, JSON.stringify(profiles));
  return profiles;
}

export async function deleteBrandingProfile(id: string): Promise<BrandingProfile[]> {
  const profiles = (await getBrandingProfiles()).filter((p) => p.id !== id);
  await AsyncStorage.setItem(PDF_BRANDING_PROFILES_KEY, JSON.stringify(profiles));
  return profiles;
}

/**
 * Replace header/footer placeholders like {projekt} · {firma} · {datum} ·
 * {dokumenttyp} · Seite {seite}/{seiten} with real values. Unknown or missing
 * values collapse to an empty string. Case-insensitive.
 */
export function applyBrandingVariables(
  text: string,
  ctx: { projekt?: string; firma?: string; datum?: string; dokumenttyp?: string; seite?: number | string; seiten?: number | string } = {},
): string {
  if (!text) return text;
  const map: Record<string, string> = {
    projekt: ctx.projekt || "",
    firma: ctx.firma || "",
    datum: ctx.datum || "",
    dokumenttyp: ctx.dokumenttyp || "",
    seite: ctx.seite != null ? String(ctx.seite) : "",
    seiten: ctx.seiten != null ? String(ctx.seiten) : "",
  };
  return text.replace(/\{(projekt|firma|datum|dokumenttyp|seite|seiten)\}/gi, (_m, k) => map[String(k).toLowerCase()] ?? "");
}

function todayShort(): string {
  return new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Generate HTML header for PDF export
 */
export function generatePdfHeader(branding: PdfBranding, projectName?: string, docType?: string): string {
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

  // Header text (with variables) or project name
  const headerLine = branding.headerText
    ? applyBrandingVariables(branding.headerText, { projekt: projectName, firma: branding.companyName, datum: todayShort(), dokumenttyp: docType })
    : (branding.showProjectName && projectName ? `Projekt: ${projectName}` : "");
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
export function generatePdfFooter(branding: PdfBranding, pageNum?: number, totalPages?: number, projectName?: string, docType?: string): string {
  const parts: string[] = [];
  parts.push(`<div style="height:1px;background:#e5e7eb;margin-top:16px;margin-bottom:8px;"></div>`);
  parts.push(`<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#999;">`);

  // Left: footer text (with variables)
  const footerResolved = applyBrandingVariables(branding.footerText || "", {
    projekt: projectName, firma: branding.companyName, datum: todayShort(), dokumenttyp: docType, seite: pageNum, seiten: totalPages,
  });
  parts.push(`<span>${footerResolved}</span>`);

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
  const NAVY = "#0F2744";
  const accentColor = branding.accentColor || protocol.projectColor || "#1E3A5F";
  const date = new Date(protocol.createdAt);
  const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  const rows: { label: string; value: string }[] = [
    { label: "Datum", value: dateStr },
    { label: "Uhrzeit", value: `${timeStr} Uhr` },
  ];
  if (protocol.location?.address) rows.push({ label: "Ort", value: `${protocol.location.address}${protocol.location.city ? `, ${protocol.location.city}` : ""}` });
  if (protocol.protocolNumber) rows.push({ label: "Protokoll-Nr.", value: String(protocol.protocolNumber) });
  if (branding.companyName) rows.push({ label: "Erstellt von", value: branding.companyName });

  const rowsHtml = rows
    .map((r, i) => `<div style="display:flex; justify-content:space-between; align-items:center; padding:11px 16px; ${i < rows.length - 1 ? "border-bottom:1px solid #eef1f5;" : ""}"><span style="font-size:9.5px; text-transform:uppercase; letter-spacing:0.4px; color:#64748b; font-weight:700;">${r.label}</span><span style="font-size:13px; color:#1f2937; font-weight:600; text-align:right;">${r.value}</span></div>`)
    .join("");

  const footer = branding.footerText
    ? applyBrandingVariables(branding.footerText, { projekt: protocol.projectName, firma: branding.companyName, datum: dateStr, dokumenttyp: protocol.templateName })
    : "Erstellt mit BuildKI";

  return `
  <div style="page-break-after: always; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
    <div style="display:flex; align-items:center; gap:14px; background:${NAVY}; color:#ffffff; padding:16px 22px; border-radius:10px;">
      ${logoBase64 ? `<img src="${logoBase64}" style="max-height:36px; max-width:150px; object-fit:contain;" />` : ""}
      ${branding.companyName ? `<div style="font-size:16px; font-weight:800; letter-spacing:0.2px;">${branding.companyName}</div>` : ""}
    </div>

    <div style="padding:52px 6px 0;">
      <div style="font-size:13px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:1.4px;">${protocol.templateName || "Protokoll"}</div>
      <div style="font-size:36px; font-weight:800; color:${NAVY}; letter-spacing:-0.8px; line-height:1.1; margin-top:8px;">${protocol.projectName || protocol.templateName || "Protokoll"}</div>
      <div style="width:64px; height:4px; border-radius:2px; background:${accentColor}; margin:18px 0 0;"></div>

      <div style="margin-top:44px; background:#f8fafc; border:1px solid #e8ecf1; border-radius:12px; overflow:hidden;">
        ${rowsHtml}
      </div>

      <div style="margin-top:28px; font-size:10px; color:#94a3b8;">${footer}</div>
    </div>
  </div>`;
}
