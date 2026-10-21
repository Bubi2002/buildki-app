/**
 * protoKI – Professional PDF Export Service
 * 
 * Generates professional PDF documents using expo-print with:
 * - Company logo in header
 * - Custom header/footer with project info
 * - Inline images with captions
 * - Plan markings and annotations
 * - Digital signatures
 * - Page numbers
 * - Table of contents for multi-page reports
 * - Consistent branding (colors, fonts)
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderLetterhead } from "./pdf-premium";

const COMPANY_LOGO_KEY = "company_logo_base64";
const COMPANY_INFO_KEY = "company_info";

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  contactPerson?: string;
  logoBase64?: string;
  logoSize?: "small" | "medium" | "large";
}

export interface PdfSection {
  title: string;
  content: string; // Markdown or HTML
  images?: PdfImage[];
  table?: PdfTable;
  /** Boxed cards (e.g. one per Mangel) with inline fields, note and photos. */
  cards?: PdfCard[];
  /** Force this section to start on a fresh page. */
  pageBreakBefore?: boolean;
}

export interface PdfCard {
  title: string;
  badges?: { label: string; color?: string }[];
  fields?: { label: string; value: string }[];
  note?: string;
  images?: PdfImage[];
  /** Checklist items (Prüfpunkte) with their checked state, listed in the card. */
  checklist?: { text: string; checked: boolean; note?: string }[];
}

export interface PdfImage {
  base64: string;
  caption?: string;
  width?: number; // percentage 0-100
  annotation?: string;
}

export interface PdfTable {
  headers: string[];
  rows: string[][];
}

export interface PdfSignature {
  role: string;
  name: string;
  signatureBase64?: string;
  date: string;
}

export interface ProfessionalPdfOptions {
  title: string;
  subtitle?: string;
  reportType?: string;
  datum: string;
  projekt?: string;
  projektNummer?: string;
  sections: PdfSection[];
  signatures?: PdfSignature[];
  companyInfo?: CompanyInfo;
  includeTableOfContents?: boolean;
  watermark?: string;
  footerText?: string;
  accentColor?: string;
  qrCodeBase64?: string; // Pre-generated QR code as base64 data URL
  qrCodeLabel?: string; // Label below QR code
  matterportLink?: string; // Link to Matterport 3D model
  heroDataUri?: string; // Optional project/cover image (base64 data URI) shown on the cover
}

/**
 * Load saved company info from AsyncStorage
 */
export async function getCompanyInfo(): Promise<CompanyInfo | null> {
  try {
    const stored = await AsyncStorage.getItem(COMPANY_INFO_KEY);
    if (stored) return JSON.parse(stored);
    return null;
  } catch {
    return null;
  }
}

/**
 * Save company info to AsyncStorage
 */
export async function saveCompanyInfo(info: CompanyInfo): Promise<void> {
  await AsyncStorage.setItem(COMPANY_INFO_KEY, JSON.stringify(info));
}

/**
 * Generate professional PDF HTML
 */
// Status / priority label (German, lowercased) -> pill colour.
const PROF_PILL_COLORS: Record<string, string> = {
  "offen": "#DC2626",
  "in arbeit": "#2563EB",
  "in bearbeitung": "#D97706",
  "zugewiesen": "#EA580C",
  "nachbesserung": "#DB2777",
  "prüfung": "#7C3AED",
  "pruefung": "#7C3AED",
  "fertig": "#5E8B6F",
  "abgenommen": "#5E8B6F",
  "erledigt": "#5E8B6F",
  "geschlossen": "#475569",
  "abgelehnt": "#78716C",
  "nicht begonnen": "#94A3B8",
  "hoch": "#B91C1C",
  "mittel": "#B45309",
  "niedrig": "#6B7280",
};

export function generateProfessionalPdfHtml(options: ProfessionalPdfOptions): string {
  const {
    title,
    subtitle,
    reportType,
    datum,
    projekt,
    projektNummer,
    sections,
    signatures,
    companyInfo,
    includeTableOfContents,
    watermark,
    footerText,
    accentColor = "#8A6E52",
    heroDataUri,
  } = options;

  const NAVY = "#1E3A5F";
  // Beige block tints derived from the brand accent: a soft fill + border for
  // boxes (info grid, summary, cards), while bars/chips use the solid accent.
  const beigeBg = `${accentColor}12`;
  const beigeBorder = `${accentColor}30`;
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escCss = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const ico = (path: string) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const icoBuilding = ico(`<rect x="4" y="3" width="10" height="18" rx="1"/><path d="M14 8h5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-5"/><path d="M7 7h.01M7 11h.01M7 15h.01M10 7h.01M10 11h.01"/>`);
  const icoCal = ico(`<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>`);
  const icoTag = ico(`<path d="M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z"/><circle cx="7.5" cy="7.5" r="1.5"/>`);
  const icoHash = ico(`<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>`);

  // Header (logo left + compact company block right) comes from the shared
  // renderLetterhead() so every PDF type has an identical letterhead.
  const letterhead = renderLetterhead({
    companyName: companyInfo?.name,
    companyContactPerson: companyInfo?.contactPerson,
    companyAddress: companyInfo?.address,
    companyPhone: companyInfo?.phone,
    companyMobile: companyInfo?.mobile,
    companyEmail: companyInfo?.email,
    companyWebsite: companyInfo?.website,
    logoDataUri: companyInfo?.logoBase64,
    logoSize: companyInfo?.logoSize,
  });

  // Info grid (icon-labelled project meta).
  const infoCols: string[] = [];
  if (projekt) infoCols.push(`<div class="infocol"><div class="lbl">${icoBuilding} Projekt</div><div class="val">${esc(projekt)}</div></div>`);
  infoCols.push(`<div class="infocol"><div class="lbl">${icoCal} Datum</div><div class="val">${esc(datum)}</div></div>`);
  if (reportType) infoCols.push(`<div class="infocol"><div class="lbl">${icoTag} Berichtstyp</div><div class="val">${esc(reportType)}</div></div>`);
  if (projektNummer) infoCols.push(`<div class="infocol"><div class="lbl">${icoHash} Projekt-Nr.</div><div class="val">${esc(projektNummer)}</div></div>`);
  const infoHtml = `<div class="infogrid">${infoCols.join("")}</div>`;

  // Auto-dashboard: sections whose title ends with "(N)" become stat cards.
  const palette = ["#334155", "#2563EB", "#1E3A5F", "#B45309", "#7C3AED", "#16A34A"];
  const dash = sections
    .map((s) => { const m = s.title.match(/^(.*?)\s*\((\d+)\)\s*$/); return m ? { label: m[1].trim(), value: Number(m[2]) } : null; })
    .filter((d): d is { label: string; value: number } => d !== null);
  const dashHtml = dash.length >= 2
    ? `<div class="summary-band"><div class="stats-grid">${dash.map((d, i) =>
        `<div class="stat-box" style="border-top:3px solid ${palette[i % palette.length]};"><div class="stat-number" style="color:${palette[i % palette.length]};">${d.value}</div><div class="stat-label">${esc(d.label)}</div></div>`
      ).join("")}</div></div>`
    : "";

  // Page number per entry via target-counter against the section anchor. iOS
  // expo-print honors this in recent versions; where it is not supported the
  // ::after simply renders empty (title still shows), so it degrades cleanly.
  const tocHtml = includeTableOfContents && sections.length > 3
    ? `<div class="toc">
        <div class="toc-h">Inhalt</div>
        <div class="toc-list">
          ${sections.map((s, i) => `<div class="toc-row"><span class="toc-ttl">${i + 1}. ${esc(s.title)}</span><span class="toc-dots"></span><a class="toc-pg" href="#section-${i}"></a></div>`).join("")}
          ${signatures && signatures.length > 0 ? `<div class="toc-row"><span class="toc-ttl">${sections.length + 1}. Unterschriften</span><span class="toc-dots"></span><a class="toc-pg" href="#signatures"></a></div>` : ""}
        </div>
      </div>`
    : "";

  const sectionsHtml = sections.map((section, i) => {
    // Strip a trailing "(N)" count from the heading \u2014 it already appears in the dashboard.
    const heading = section.title.replace(/\s*\(\d+\)\s*$/, "");
    let sectionContent = section.pageBreakBefore ? `<div style="page-break-before:always;"></div>` : "";
    sectionContent += `<div class="section" id="section-${i}">
      <div class="section-chip"><span class="num">${i + 1}</span><span class="txt">${esc(heading)}</span></div>`;

    const contentHtml = markdownToHtml(section.content);
    if (contentHtml) sectionContent += `<div class="section-content">${contentHtml}</div>`;

    // Boxed cards (one per Mangel/Vergleich/Messung) \u2014 fields + photos stay together.
    if (section.cards && section.cards.length > 0) {
      for (const card of section.cards) {
        sectionContent += `<div class="mcard">
          <div class="mc-head">
            <div class="mc-title">${esc(card.title)}</div>
            ${card.badges && card.badges.length ? `<div class="mc-badges">${card.badges.filter(b => b.label).map((b) => { const c = b.color || "#64748b"; return `<span class="pill" style="background:${c}1A;color:${c};border:1px solid ${c}44;">${esc(b.label)}</span>`; }).join("")}</div>` : ""}
          </div>
          ${card.fields && card.fields.some((f) => f.value) ? `<div class="mc-fields">${card.fields.filter((f) => f.value).map((f) => `<div class="mc-field"><span class="k">${esc(f.label)}</span><span class="v">${esc(f.value)}</span></div>`).join("")}</div>` : ""}
          ${card.note ? `<div class="mc-note">${esc(card.note)}</div>` : ""}
          ${card.checklist && card.checklist.length ? `<div class="mc-checks">${card.checklist.map((it) => `<div class="mc-check"><span class="box" style="color:${it.checked ? "#16A34A" : "#94A3B8"};">${it.checked ? "☑" : "☐"}</span><span class="${it.checked ? "done" : ""}">${esc(it.text)}${it.note ? ` <em>— ${esc(it.note)}</em>` : ""}</span></div>`).join("")}</div>` : ""}
          ${card.images && card.images.length ? `<div class="mc-images">${card.images.map((im) => `<div class="mc-img"><img src="${im.base64}" />${im.caption ? `<p class="image-caption">${esc(im.caption)}</p>` : ""}</div>`).join("")}</div>` : ""}
        </div>`;
      }
    }

    // Add images
    if (section.images && section.images.length > 0) {
      sectionContent += `<div class="images-grid">`;
      for (const img of section.images) {
        sectionContent += `<div class="image-container" style="width: ${img.width || 48}%;">
          <img src="${img.base64}" class="section-image" />
          ${img.caption ? `<p class="image-caption">${esc(img.caption)}</p>` : ""}
          ${img.annotation ? `<p class="image-annotation">${esc(img.annotation)}</p>` : ""}
        </div>`;
      }
      sectionContent += `</div>`;
    }

    // Add table
    if (section.table) {
      const headers = section.table.headers;
      const pillCol = headers.map((h) => { const n = (h || "").toLowerCase(); return n.includes("status") || n.includes("priorit"); });
      sectionContent += `<table class="data-table">
        <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${section.table.rows.map(row => `<tr>${row.map((cell, ci) => {
          if (pillCol[ci]) {
            const plain = esc(cell).trim();
            const c = PROF_PILL_COLORS[plain.toLowerCase()];
            if (c) return `<td><span class="pill" style="background:${c}1A;color:${c};border:1px solid ${c}44;">${plain}</span></td>`;
          }
          return `<td>${esc(cell)}</td>`;
        }).join("")}</tr>`).join("")}</tbody>
      </table>`;
    }

    sectionContent += `</div>`;
    return sectionContent;
  }).join("");

  const signaturesHtml = signatures && signatures.length > 0
    ? `<div class="signatures-section" id="signatures">
        <div class="section-chip"><span class="num">\u2713</span><span class="txt">Unterschriften</span></div>
        <div class="signatures-grid">
          ${signatures.map(sig => `
            <div class="signature-box">
              <div class="signature-image">
                ${sig.signatureBase64 ? `<img src="${sig.signatureBase64}" class="signature-img" />` : `<div class="signature-line"></div>`}
              </div>
              <div class="signature-info">
                <strong>${esc(sig.name)}</strong>
                <span class="signature-role">${esc(sig.role)}</span>
                <span class="signature-date">${esc(sig.date)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>`
    : "";

  // Footer with the author's data (company name · phone · email · address).
  // IMPORTANT: collapse any newlines first — a raw newline inside the CSS
  // `content: "…"` string breaks the whole @page rule, which would drop BOTH
  // the footer text AND the page number. (e.g. a multi-line company address.)
  const authorLine = [companyInfo?.name, companyInfo?.phone, companyInfo?.email, companyInfo?.website, companyInfo?.address]
    .map((s) => (s || "").trim()).filter(Boolean).join("  ·  ");
  const footerLeft = escCss(
    (footerText || authorLine || (projekt ? `Projekt: ${projekt}` : "BuildKI")).replace(/\r?\n+/g, "  ·  "),
  );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* Horizontal spacing comes from the inner .sheet padding, NOT from @page
       side margins (iOS expo-print does not reliably honor horizontal @page
       margins, so content ended up stuck to the left edge). @page keeps only
       the vertical margins; the footer margin-boxes get their own side padding. */
    @page {
      margin: 18mm 0 18mm 0;
      @bottom-left { content: "${footerLeft}"; font-size: 8px; color: #94a3b8; padding-left: 16mm; }
      @bottom-right { content: "Seite " counter(page) " / " counter(pages); font-size: 8px; color: #94a3b8; padding-right: 16mm; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.55;
      color: #1f2937;
    }
    .sheet { padding: 0 16mm; }
    .topbar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0 16px; border-bottom: 1px solid #E6EBF1;
    }
    .topbar .brand { display: flex; align-items: center; gap: 14px; }
    .topbar .brand img { max-height: 96px; max-width: 320px; object-fit: contain; }
    .topbar .brand .co { font-size: 19px; font-weight: 800; color: ${NAVY}; letter-spacing: -.2px; }
    .topbar .bandmeta { text-align: right; font-size: 9px; line-height: 1.55; color: #6B7A8D; }
    .title { font-size: 30px; font-weight: 800; color: #1b2430; margin: 20px 0 0; letter-spacing: -.6px; }
    .title-rule { width: 54px; height: 4px; background: ${accentColor}; border-radius: 2px; margin: 8px 0 10px; }
    .subtitle { font-size: 12px; color: #64748b; margin-bottom: 4px; }
    .infogrid { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 4px; }
    .infocol { flex: 1; min-width: 130px; background: ${beigeBg}; border: 1px solid ${beigeBorder}; border-radius: 10px; padding: 10px 12px; }
    .infocol .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .4px; color: #64748b; font-weight: 700; display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
    .infocol .val { font-size: 12px; font-weight: 600; color: #1f2937; }
    .summary-band { background: ${beigeBg}; border: 1px solid ${beigeBorder}; border-radius: 12px; padding: 14px; margin: 14px 0 4px; }
    .stats-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .stat-box { flex: 1; min-width: 90px; background: #fff; border: 1px solid ${beigeBorder}; border-radius: 8px; padding: 10px 6px; text-align: center; }
    .stat-number { font-size: 22px; font-weight: 800; }
    .stat-label { font-size: 9px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: .3px; }
    /* No frame around the table of contents — flat on the page. */
    .toc { margin: 16px 0 6px; padding: 0; }
    .toc-h { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: ${accentColor}; font-weight: 700; margin-bottom: 8px; }
    .toc-row { display: flex; align-items: baseline; margin: 4px 0; font-size: 11px; color: #334155; }
    .toc-ttl { flex: 0 0 auto; }
    .toc-dots { flex: 1 1 auto; border-bottom: 1px dotted #cbd5e1; margin: 0 6px; transform: translateY(-2px); }
    .toc-pg { flex: 0 0 auto; color: #64748b; text-decoration: none; }
    .toc-pg::after { content: target-counter(attr(href url), page); }
    .section { margin-bottom: 20px; }
    .section-chip { display: flex; align-items: center; gap: 10px; margin: 18px 0 10px; }
    .section-chip .num { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: ${accentColor}; color: #fff; border-radius: 6px; font-size: 12px; font-weight: 700; }
    .section-chip .txt { font-size: 15px; font-weight: 700; color: ${accentColor}; }
    .section-content { font-size: 11px; line-height: 1.6; }
    .section-content p { margin-bottom: 7px; }
    .section-content h2, .section-content h3, .section-content h4 { color: ${accentColor}; margin: 8px 0 5px; }
    .section-content h2 { font-size: 13px; }
    .section-content h3 { font-size: 12px; }
    .section-content h4 { font-size: 11px; }
    .section-content ul { padding-left: 18px; margin-bottom: 7px; }
    .section-content li { margin-bottom: 3px; }
    .section-content strong { font-weight: 700; }
    .images-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
    .image-container { text-align: center; page-break-inside: avoid; break-inside: avoid; }
    .section-image { width: 100%; max-height: 200px; object-fit: contain; border: 1px solid #e8ecf1; border-radius: 6px; page-break-inside: avoid; break-inside: avoid; }
    .image-caption { font-size: 9px; color: #64748b; margin-top: 4px; font-style: italic; }
    /* Boxed cards (Mängel/Vergleich/Messen) — like the app, kept on one page. */
    .mcard { border: 1px solid ${beigeBorder}; border-radius: 10px; padding: 12px 14px; margin: 0 0 12px; background: #fff; page-break-inside: avoid; break-inside: avoid; }
    .mcard .mc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .mcard .mc-title { font-size: 12.5px; font-weight: 800; color: #1b2430; flex: 1; }
    .mcard .mc-badges { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
    .mcard .mc-fields { margin: 7px 0 0; }
    .mcard .mc-field { display: flex; gap: 8px; font-size: 10.5px; margin: 2px 0; }
    .mcard .mc-field .k { color: #64748b; font-weight: 700; min-width: 70px; text-transform: uppercase; letter-spacing: .3px; font-size: 9px; padding-top: 1px; }
    .mcard .mc-field .v { color: #1f2937; flex: 1; }
    .mcard .mc-note { font-size: 10.5px; color: #334155; margin-top: 7px; line-height: 1.5; }
    .mcard .mc-images { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 9px; }
    .mcard .mc-images .mc-img { width: calc(50% - 4px); page-break-inside: avoid; break-inside: avoid; }
    .mcard .mc-images img { width: 100%; max-height: 190px; object-fit: cover; border: 1px solid #e8ecf1; border-radius: 6px; }
    .mcard .mc-checks { margin-top: 8px; }
    .mcard .mc-check { display: flex; gap: 7px; font-size: 10.5px; line-height: 1.5; padding: 2px 0; align-items: baseline; }
    .mcard .mc-check .box { font-size: 12px; }
    .mcard .mc-check .done { color: #64748b; }
    .mcard .mc-check em { color: #64748b; font-style: italic; }
    .image-annotation { font-size: 9px; color: ${accentColor}; margin-top: 2px; }
    .data-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10px; }
    .data-table th { background: ${accentColor}; color: #fff; padding: 8px 10px; text-align: left; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: .3px; border-bottom: 2px solid ${accentColor}; }
    .data-table td { padding: 7px 10px; border-bottom: 1px solid #eef1f5; color: #334155; white-space: pre-line; vertical-align: top; }
    .data-table tr:nth-child(even) td { background: #fbfcfd; }
    .pill { display: inline-block; padding: 2px 9px; border-radius: 11px; font-size: 9px; font-weight: 700; white-space: nowrap; }
    .signatures-section { margin-top: 24px; }
    .signatures-grid { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 10px; }
    .signature-box { width: 46%; border: 1px solid #e8ecf1; border-radius: 8px; padding: 12px; }
    .signature-image { height: 56px; display: flex; align-items: flex-end; margin-bottom: 8px; }
    .signature-img { max-height: 50px; max-width: 100%; }
    .signature-line { width: 100%; border-bottom: 1px solid #94a3b8; }
    .signature-info { font-size: 9px; }
    .signature-role { display: block; color: #64748b; }
    .signature-date { display: block; color: #94a3b8; font-size: 8px; }
    .page-break { page-break-after: always; }
    ${watermark ? `.watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 60px; color: rgba(15,39,68,0.04); font-weight: 800; pointer-events: none; }` : ""}
  </style>
</head>
<body>
  ${watermark ? `<div class="watermark">${esc(watermark)}</div>` : ""}

  <div class="sheet">
  ${letterhead}

  <h1 class="title">${esc(title)}</h1>
  <div class="title-rule"></div>
  ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ""}
  ${heroDataUri ? `<img src="${heroDataUri}" style="width:100%;height:160px;object-fit:cover;border-radius:12px;margin:14px 0 2px;display:block;" />` : ""}

  ${infoHtml}
  ${dashHtml}
  ${options.matterportLink ? `<p style="font-size:10px;color:#64748b;margin-top:8px;">3D-Modell: <a href="${options.matterportLink}" style="color:${accentColor};text-decoration:none;">${esc(options.matterportLink)}</a></p>` : ""}
  ${tocHtml}
  ${sectionsHtml}
  ${signaturesHtml}
  ${options.qrCodeBase64 ? `
  <div style="text-align:center;margin-top:26px;padding:18px;border-top:1px solid #e8ecf1;">
    <img src="${options.qrCodeBase64}" style="width:96px;height:96px;" />
    <p style="font-size:9px;color:#64748b;margin-top:6px;">${esc(options.qrCodeLabel || "QR-Code scannen f\u00fcr digitale Version")}</p>
  </div>` : ""}
  </div>
</body>
</html>`;
}

/**
 * Simple Markdown to HTML converter for report content
 */
function markdownToHtml(md: string): string {
  if (!md) return "";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Escape first, then render a safe subset — never leak raw markdown into the PDF.
  const inline = (s: string) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\*/g, ""); // drop stray/unbalanced asterisks so no raw * leaks
  let html = "";
  let inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.+)$/))) { closeList(); html += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = line.match(/^##\s+(.+)$/))) { closeList(); html += `<h3>${inline(m[1])}</h3>`; }
    else if ((m = line.match(/^#\s+(.+)$/))) { closeList(); html += `<h2>${inline(m[1])}</h2>`; }
    else if ((m = line.match(/^[-*•]\s+(.+)$/))) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\d+\.\s+(.+)$/))) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(m[1])}</li>`; }
    else { closeList(); html += `<p>${inline(line)}</p>`; }
  }
  closeList();
  return html;
}

/**
 * Generate a QR code as base64 data URL using the qrcode package.
 * Falls back gracefully if QR generation fails.
 */
export async function generateQrCodeBase64(data: string): Promise<string | null> {
  try {
    const QRCode = require("qrcode");
    const dataUrl = await QRCode.toDataURL(data, {
      width: 200,
      margin: 1,
      color: { dark: "#1a1a1a", light: "#ffffff" },
    });
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Generate and share a professional PDF
 */
export async function generateAndSharePdf(options: ProfessionalPdfOptions): Promise<string | null> {
  try {
    // Load company info if not provided
    if (!options.companyInfo) {
      const stored = await getCompanyInfo();
      if (stored) options.companyInfo = stored;
    }

    // Make the header show the real company logo (like the other PDFs) instead
    // of the generic house icon. The logo lives in the PDF branding store; pull
    // it (and any missing company fields) from there when not already set.
    try {
      const { getPdfBranding } = await import("./pdf-branding-store");
      const { resolveBrandingLogo } = await import("./pdf-premium");
      const branding = await getPdfBranding();
      // Adopt the configured brand accent (warm brown etc.) unless the caller
      // explicitly set one — themes bars, chips and the beige block tints.
      if (!options.accentColor && branding.accentColor) options.accentColor = branding.accentColor;
      // Resolve the logo from every place it might live: the passed-in info, the
      // branding store's logoUri (file:// or data:), then the legacy base64 key.
      let logo = options.companyInfo?.logoBase64 || "";
      if (!logo) logo = await resolveBrandingLogo(branding);
      if (!logo) { try { logo = (await AsyncStorage.getItem(COMPANY_LOGO_KEY)) || ""; } catch {} }
      if (logo || branding.companyName) {
        options.companyInfo = {
          name: options.companyInfo?.name || branding.companyName || "",
          address: options.companyInfo?.address || branding.companyAddress,
          phone: options.companyInfo?.phone || branding.companyPhone,
          mobile: options.companyInfo?.mobile || branding.companyMobile,
          email: options.companyInfo?.email || branding.companyEmail,
          website: options.companyInfo?.website || branding.companyWebsite,
          contactPerson: options.companyInfo?.contactPerson || branding.companyContactPerson,
          logoBase64: logo || options.companyInfo?.logoBase64,
          logoSize: options.companyInfo?.logoSize || branding.logoSize,
        };
      }
    } catch {
      // Fall back to the house icon if branding can't be read.
    }

    const html = generateProfessionalPdfHtml(options);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    // Share the PDF
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `${options.title} - PDF`,
        UTI: "com.adobe.pdf",
      });
    }

    return uri;
  } catch (error) {
    console.error("PDF generation failed:", error);
    return null;
  }
}
