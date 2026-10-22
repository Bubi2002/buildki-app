import AsyncStorage from "@react-native-async-storage/async-storage";

const PDF_BRANDING_KEY = "pdf-branding";
const PDF_BRANDING_PROFILES_KEY = "pdf-branding-profiles";

// Legacy company-identity stores kept in sync from the canonical `pdf-branding`
// record so every PDF generator (which still reads one of these) sees the same,
// fresh company data. This is the single source of truth for company identity.
const LEGACY_COMPANY_SETTINGS_KEY = "company-settings"; // read by pdf-generator.ts (protocol)
const LEGACY_COMPANY_INFO_KEY = "company_info"; // read by pdf-professional.ts (pro engine)
const LEGACY_COMPANY_LOGO_KEY = "company_logo_base64"; // pro engine logo

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
  // --- extended company identity (mirrored from company-settings) ---
  companyLegalForm?: string; // Namenszusatz / Rechtsform
  companyContactPerson?: string; // Ansprechpartner / Inhaber
  companyContactTitle?: string; // Titel / Funktion
  companyMobile?: string; // Mobil
  companyRegisterCourt?: string; // Registergericht
  companyRegisterNumber?: string; // Registernummer
  companyVatId?: string; // USt-IdNr.
  companyLegalNote?: string; // Pflichtangaben / rechtlicher Zusatz
  defaultEditor?: string; // Standardbearbeiter
  // --- logo presentation ---
  logoSize?: "small" | "medium" | "large";
  logoPosition?: "left" | "center" | "right";
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
  accentColor: "#8A6E52",
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
  companyLegalForm: "",
  companyContactPerson: "",
  companyContactTitle: "",
  companyMobile: "",
  companyRegisterCourt: "",
  companyRegisterNumber: "",
  companyVatId: "",
  companyLegalNote: "",
  defaultEditor: "",
  logoSize: "medium",
  logoPosition: "left",
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
      // Migrate the old default accents (teal, then navy) to the new warm-brown
      // house default so existing installs on an untouched default pick it up.
      if (merged.accentColor === "#0E7490" || merged.accentColor === "#1E3A5F") {
        merged.accentColor = "#8A6E52";
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
    // Keep the legacy company-identity stores in sync so every PDF generator
    // reads the same, fresh company data (no "changed here, stale there").
    await syncCompanyToLegacy(updated);
  } catch {}
}

/**
 * Mirror the canonical company identity (from `pdf-branding`) into the legacy
 * stores that individual PDF generators still read. This removes the old
 * divergence where editing company data only updated some document types.
 * Text fields propagate always; the logo is resolved to base64 once so the
 * protocol + pro-engine PDFs keep working unchanged.
 */
export async function syncCompanyToLegacy(b: PdfBranding): Promise<void> {
  try {
    // Resolve the logo to a base64 data URI (handles file:// and data: URIs).
    let logoBase64 = "";
    try {
      const { resolveBrandingLogo } = await import("./pdf-premium");
      logoBase64 = await resolveBrandingLogo(b);
    } catch {}

    // company-settings (protocol generator). Preserve any existing extra fields.
    try {
      const raw = await AsyncStorage.getItem(LEGACY_COMPANY_SETTINGS_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      const next = {
        ...prev,
        companyName: b.companyName,
        companyAddress: b.companyAddress,
        companyPhone: b.companyPhone,
        companyEmail: b.companyEmail,
        companyWebsite: b.companyWebsite,
        logoUri: b.logoUri || prev.logoUri || null,
        logoBase64: logoBase64 || prev.logoBase64 || "",
      };
      await AsyncStorage.setItem(LEGACY_COMPANY_SETTINGS_KEY, JSON.stringify(next));
    } catch {}

    // company_info + company_logo_base64 (pro engine).
    try {
      const info = {
        name: b.companyName,
        address: b.companyAddress,
        phone: b.companyPhone,
        email: b.companyEmail,
        website: b.companyWebsite,
        logoBase64: logoBase64 || undefined,
      };
      await AsyncStorage.setItem(LEGACY_COMPANY_INFO_KEY, JSON.stringify(info));
      if (logoBase64) await AsyncStorage.setItem(LEGACY_COMPANY_LOGO_KEY, logoBase64);
    } catch {}
  } catch {}
}

/**
 * One-time consolidation (run from the migration framework): if the canonical
 * `pdf-branding` record is missing company identity that only lived in a legacy
 * store, backfill it — then sync everything so all stores agree. Idempotent.
 */
export async function consolidateCompanyProfile(): Promise<{ keysAffected: string[] }> {
  const keysAffected: string[] = [];
  try {
    const b = await getPdfBranding();
    const missing = (v: string | null | undefined) => !v || !String(v).trim();

    // Pull legacy company-settings / company_info if branding is blank.
    let legacyCS: any = {};
    let legacyCI: any = {};
    try { const r = await AsyncStorage.getItem(LEGACY_COMPANY_SETTINGS_KEY); legacyCS = r ? JSON.parse(r) : {}; } catch {}
    try { const r = await AsyncStorage.getItem(LEGACY_COMPANY_INFO_KEY); legacyCI = r ? JSON.parse(r) : {}; } catch {}

    const patch: Partial<PdfBranding> = {};
    if (missing(b.companyName)) { const v = legacyCS.companyName || legacyCI.name; if (v) patch.companyName = v; }
    if (missing(b.companyAddress)) { const v = legacyCS.companyAddress || legacyCI.address; if (v) patch.companyAddress = v; }
    if (missing(b.companyPhone)) { const v = legacyCS.companyPhone || legacyCI.phone; if (v) patch.companyPhone = v; }
    if (missing(b.companyEmail)) { const v = legacyCS.companyEmail || legacyCI.email; if (v) patch.companyEmail = v; }
    if (missing(b.companyWebsite)) { const v = legacyCS.companyWebsite || legacyCI.website; if (v) patch.companyWebsite = v; }
    if (!b.logoUri) {
      // Prefer an existing file URI; otherwise use a base64 logo as a data: URI.
      const uri = legacyCS.logoUri || null;
      const b64 = legacyCS.logoBase64 || legacyCI.logoBase64 || null;
      if (uri) patch.logoUri = uri;
      else if (b64) patch.logoUri = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
    }

    const merged = { ...b, ...patch };
    await AsyncStorage.setItem(PDF_BRANDING_KEY, JSON.stringify(merged));
    await syncCompanyToLegacy(merged);
    keysAffected.push("pdf-branding", LEGACY_COMPANY_SETTINGS_KEY, LEGACY_COMPANY_INFO_KEY);
  } catch (e) {
    console.warn("[Branding] consolidateCompanyProfile failed:", e);
  }
  return { keysAffected };
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
  logoBase64?: string | null,
  extras?: {
    kpiCards?: { value: string | number; label: string; sub?: string; subWarn?: boolean; color: string; bg: string; icon: string }[];
    heroDataUri?: string | null;
  }
): string {
  const accentColor = branding.accentColor || protocol.projectColor || "#8A6E52";
  // Cover headings/icons follow the brand accent (warm brown) for consistency.
  const NAVY = accentColor;
  const INK = "#1b2430";
  const MUTED = "#6B7A8D";
  const date = new Date(protocol.createdAt);
  const dateLong = date.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const dateShort = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const title = protocol.templateName || "Protokoll";
  const subtitle = protocol.projectName || "";
  const slogan = (branding as any).companySlogan || "";

  // SVG icon helper (stroked, navy).
  const ic = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;flex:0 0 auto;">${d}</svg>`;
  const ICONS = {
    project: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    report: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    date: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pin: '<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  };

  const meta: { icon: string; k: string; v: string }[] = [];
  if (subtitle) meta.push({ icon: ICONS.project, k: "Projekt", v: subtitle });
  meta.push({ icon: ICONS.report, k: "Berichtstyp", v: title });
  meta.push({ icon: ICONS.date, k: "Datum", v: dateLong });
  if (protocol.location?.address) meta.push({ icon: ICONS.pin, k: "Adresse", v: `${protocol.location.address}${protocol.location.city ? `, ${protocol.location.city}` : ""}` });
  if (branding.companyName) meta.push({ icon: ICONS.user, k: "Erstellt durch", v: branding.companyName });
  const metaHtml = meta
    .map((m) => `<div style="display:flex;align-items:center;gap:9px;">${ic(m.icon)}<span style="font-size:11px;color:${MUTED};font-weight:600;">${m.k}</span></div><div style="font-size:11.5px;color:${INK};font-weight:700;">${m.v}</div>`)
    .join("");

  const companyHtml = (branding.companyName || branding.companyAddress || branding.companyPhone || branding.companyEmail)
    ? `<div style="font-size:9px;color:${MUTED};text-align:right;line-height:1.55;">${[
        branding.companyName ? `<b style="color:${INK};font-size:9.5px;">${branding.companyName}</b>` : "",
        branding.companyAddress || "",
        branding.companyPhone ? `Tel: ${branding.companyPhone}` : "",
        branding.companyEmail || "",
      ].filter(Boolean).join("<br>")}</div>`
    : "";

  const brandHtml = `<div style="display:flex;align-items:center;gap:9px;">${
    logoBase64
      ? `<img src="${logoBase64}" style="max-height:34px;max-width:150px;object-fit:contain;" />`
      : `<svg viewBox="0 0 48 48" fill="none" style="width:30px;height:30px;"><path d="M24 4L6 17v27h12V30h12v14h12V17L24 4z" fill="${NAVY}"/><path d="M24 4L6 17h8l10-7 10 7h8L24 4z" fill="#2E6BA6"/></svg><div><div style="font-size:19px;font-weight:800;color:${NAVY};letter-spacing:-.2px;">${branding.companyName || "BuildKI"}</div>${slogan ? `<div style="font-size:8.5px;color:${MUTED};font-weight:600;">${slogan}</div>` : ""}</div>`
  }</div>`;

  const kpiCards = extras?.kpiCards || [];
  const statsHtml = kpiCards.length > 0
    ? `<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">${kpiCards.map((c) => `
      <div style="border:1px solid #E6EBF1;border-radius:12px;padding:14px 16px;display:flex;gap:13px;align-items:flex-start;">
        <div style="width:34px;height:34px;border-radius:9px;background:${c.bg};display:flex;align-items:center;justify-content:center;flex:0 0 auto;"><svg viewBox="0 0 24 24" fill="none" stroke="${c.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;">${c.icon}</svg></div>
        <div><div style="font-size:24px;font-weight:800;color:${INK};line-height:1;">${c.value}</div><div style="font-size:11px;font-weight:700;color:${INK};margin-top:3px;">${c.label}</div>${c.sub ? `<div style="font-size:9.5px;color:${c.subWarn ? "#D64545" : MUTED};margin-top:2px;font-weight:${c.subWarn ? 600 : 400};">${c.sub}</div>` : ""}</div>
      </div>`).join("")}</div>`
    : "";

  const heroHtml = extras?.heroDataUri
    ? `<img src="${extras.heroDataUri}" style="margin-top:22px;width:100%;height:150px;border-radius:12px;object-fit:cover;display:block;" />`
    : "";

  void brandHtml; void companyHtml; void slogan;
  // Deckblatt-Briefkopf: LINKS Logo + Firmenname, RECHTS der Kontaktblock
  // (Firmenname fett in Akzentfarbe, Ansprechpartner, Adresse, "E-Mail: … ·
  // Mobile: …", Website). Dies ersetzt die frühere laufende Kopfzeile — die
  // Inhaltsseiten tragen oben KEINE Kopfzeile mehr.
  const addressOneLine = (branding.companyAddress || "").replace(/\s*\n\s*/g, ", ").trim();
  const coverContactLine = [
    branding.companyEmail ? `E-Mail: ${branding.companyEmail}` : "",
    branding.companyMobile ? `Mobile: ${branding.companyMobile}` : (branding.companyPhone ? `Tel: ${branding.companyPhone}` : ""),
  ].filter(Boolean).join(" · ");
  const coverLogoImg = logoBase64
    ? `<img src="${logoBase64}" style="max-height:72px;max-width:260px;object-fit:contain;display:block;" />`
    : `<svg viewBox="0 0 48 48" fill="none" style="width:40px;height:40px;"><path d="M24 4L6 17v27h12V30h12v14h12V17L24 4z" fill="${NAVY}"/><path d="M24 4L6 17h8l10-7 10 7h8L24 4z" fill="#2E6BA6"/></svg>`;
  const letterheadLeft = `<div style="display:flex;flex-direction:column;gap:9px;align-items:flex-start;">${coverLogoImg}${
    branding.companyName ? `<div style="font-size:15px;font-weight:800;color:${INK};letter-spacing:-.2px;">${branding.companyName}</div>` : ""
  }</div>`;
  const letterheadRight = `<div style="text-align:right;line-height:1.6;color:${INK};font-size:12.5px;">${[
    branding.companyName ? `<div style="font-size:15px;font-weight:800;color:${accentColor};letter-spacing:.2px;margin-bottom:3px;">${branding.companyName}</div>` : "",
    branding.companyContactPerson ? `<div>${branding.companyContactPerson}</div>` : "",
    addressOneLine ? `<div>${addressOneLine}</div>` : "",
    coverContactLine ? `<div>${coverContactLine}</div>` : "",
    branding.companyWebsite ? `<div>${branding.companyWebsite}</div>` : "",
  ].filter(Boolean).join("")}</div>`;
  const letterheadHtml = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:16px;border-bottom:1px solid #E6EBF1;margin-bottom:22px;">${letterheadLeft}${letterheadRight}</div>`;
  return `
  <div style="page-break-after: always; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:${INK}; padding-top:4mm;">
    ${letterheadHtml}
    <div>
      <div style="font-size:40px;font-weight:800;color:${INK};letter-spacing:-1px;line-height:1.05;">${title}</div>
      ${subtitle ? `<div style="font-size:25px;font-weight:600;color:${NAVY};margin-top:2px;letter-spacing:-.4px;">${subtitle}</div>` : ""}
      <div style="width:54px;height:4px;background:${accentColor};border-radius:2px;margin:16px 0 10px;"></div>
    </div>

    <div style="margin-top:20px;display:grid;grid-template-columns:auto 1fr;gap:9px 12px;align-items:center;">
      ${metaHtml}
    </div>

    ${heroHtml}
    ${statsHtml}
  </div>`;
}
