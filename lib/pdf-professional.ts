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

const COMPANY_LOGO_KEY = "company_logo_base64";
const COMPANY_INFO_KEY = "company_info";

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoBase64?: string;
}

export interface PdfSection {
  title: string;
  content: string; // Markdown or HTML
  images?: PdfImage[];
  table?: PdfTable;
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
    accentColor = "#0a7ea4",
  } = options;

  const NAVY = "#0F2744";
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escCss = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const ico = (path: string) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const icoBuilding = ico(`<rect x="4" y="3" width="10" height="18" rx="1"/><path d="M14 8h5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-5"/><path d="M7 7h.01M7 11h.01M7 15h.01M10 7h.01M10 11h.01"/>`);
  const icoCal = ico(`<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>`);
  const icoTag = ico(`<path d="M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z"/><circle cx="7.5" cy="7.5" r="1.5"/>`);
  const icoHash = ico(`<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>`);

  const logoHtml = companyInfo?.logoBase64
    ? `<img src="${companyInfo.logoBase64}" alt="" />`
    : "";
  const coName = esc(companyInfo?.name || "");

  // Compact report meta shown in the navy band (top-right).
  const bandMeta = [reportType ? esc(reportType) : "", projekt ? esc(projekt) : "", esc(datum)]
    .filter(Boolean).join("<br/>");

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

  const tocHtml = includeTableOfContents && sections.length > 3
    ? `<div class="toc">
        <div class="toc-h">Inhalt</div>
        <ol>
          ${sections.map((s, i) => `<li>${esc(s.title)}</li>`).join("")}
          ${signatures && signatures.length > 0 ? `<li>Unterschriften</li>` : ""}
        </ol>
      </div>`
    : "";

  const sectionsHtml = sections.map((section, i) => {
    // Strip a trailing "(N)" count from the heading \u2014 it already appears in the dashboard.
    const heading = section.title.replace(/\s*\(\d+\)\s*$/, "");
    let sectionContent = `<div class="section" id="section-${i}">
      <div class="section-chip"><span class="num">${i + 1}</span><span class="txt">${esc(heading)}</span></div>`;

    const contentHtml = markdownToHtml(section.content);
    if (contentHtml) sectionContent += `<div class="section-content">${contentHtml}</div>`;

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
      sectionContent += `<table class="data-table">
        <thead><tr>${section.table.headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${section.table.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
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

  const footerLeft = escCss(footerText || (projekt ? `Projekt: ${projekt}` : "BuildKI"));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      margin: 15mm 12mm 16mm 12mm;
      @bottom-right { content: "Seite " counter(page) " / " counter(pages); font-size: 8px; color: #94a3b8; }
      @bottom-left { content: "${footerLeft}"; font-size: 8px; color: #94a3b8; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.55;
      color: #1f2937;
    }
    .band {
      display: flex; align-items: center; gap: 12px;
      background: ${NAVY}; color: #fff;
      padding: 14px 18px; border-radius: 10px;
    }
    .band img { max-height: 34px; max-width: 150px; object-fit: contain; }
    .band .co { font-size: 15px; font-weight: 700; letter-spacing: .2px; }
    .band .meta { margin-left: auto; text-align: right; font-size: 8.5px; line-height: 1.5; color: #cbd5e1; }
    .title { font-size: 26px; font-weight: 800; color: ${NAVY}; margin: 20px 0 0; letter-spacing: -.4px; }
    .title-rule { width: 54px; height: 4px; background: ${accentColor}; border-radius: 2px; margin: 8px 0 10px; }
    .subtitle { font-size: 12px; color: #64748b; margin-bottom: 4px; }
    .infogrid { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 4px; }
    .infocol { flex: 1; min-width: 130px; background: #f8fafc; border: 1px solid #e8ecf1; border-radius: 10px; padding: 10px 12px; }
    .infocol .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .4px; color: #64748b; font-weight: 700; display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
    .infocol .val { font-size: 12px; font-weight: 600; color: #1f2937; }
    .summary-band { background: #f6f8fa; border: 1px solid #e8ecf1; border-radius: 12px; padding: 14px; margin: 14px 0 4px; }
    .stats-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .stat-box { flex: 1; min-width: 90px; background: #fff; border: 1px solid #eef1f5; border-radius: 8px; padding: 10px 6px; text-align: center; }
    .stat-number { font-size: 22px; font-weight: 800; }
    .stat-label { font-size: 9px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: .3px; }
    .toc { margin: 16px 0; padding: 12px 16px; background: #f8fafc; border: 1px solid #e8ecf1; border-radius: 10px; }
    .toc-h { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: ${accentColor}; font-weight: 700; margin-bottom: 6px; }
    .toc ol { padding-left: 20px; }
    .toc li { margin: 3px 0; font-size: 11px; color: #334155; }
    .section { margin-bottom: 20px; }
    .section-chip { display: flex; align-items: center; gap: 10px; margin: 18px 0 10px; }
    .section-chip .num { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: ${NAVY}; color: #fff; border-radius: 6px; font-size: 12px; font-weight: 700; }
    .section-chip .txt { font-size: 15px; font-weight: 700; color: ${NAVY}; }
    .section-content { font-size: 11px; line-height: 1.6; }
    .section-content p { margin-bottom: 7px; }
    .section-content h2, .section-content h3, .section-content h4 { color: ${NAVY}; margin: 8px 0 5px; }
    .section-content h2 { font-size: 13px; }
    .section-content h3 { font-size: 12px; }
    .section-content h4 { font-size: 11px; }
    .section-content ul { padding-left: 18px; margin-bottom: 7px; }
    .section-content li { margin-bottom: 3px; }
    .section-content strong { font-weight: 700; }
    .images-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
    .image-container { text-align: center; }
    .section-image { width: 100%; max-height: 200px; object-fit: contain; border: 1px solid #e8ecf1; border-radius: 6px; }
    .image-caption { font-size: 9px; color: #64748b; margin-top: 4px; font-style: italic; }
    .image-annotation { font-size: 9px; color: ${accentColor}; margin-top: 2px; }
    .data-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10px; }
    .data-table th { background: #f8fafc; color: #334155; padding: 8px 10px; text-align: left; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: .3px; border-bottom: 2px solid #e2e8f0; }
    .data-table td { padding: 7px 10px; border-bottom: 1px solid #eef1f5; color: #334155; }
    .data-table tr:nth-child(even) td { background: #fbfcfd; }
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

  <div class="band">
    ${logoHtml}
    ${coName ? `<div class="co">${coName}</div>` : ""}
    ${bandMeta ? `<div class="meta">${bandMeta}</div>` : ""}
  </div>

  <h1 class="title">${esc(title)}</h1>
  <div class="title-rule"></div>
  ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ""}

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
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
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
