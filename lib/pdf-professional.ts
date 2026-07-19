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

  const logoHtml = companyInfo?.logoBase64
    ? `<img src="${companyInfo.logoBase64}" style="height: 40px; object-fit: contain;" />`
    : "";

  const companyInfoHtml = companyInfo
    ? `<div class="company-info">
        <strong>${companyInfo.name}</strong>
        ${companyInfo.address ? `<br/>${companyInfo.address}` : ""}
        ${companyInfo.phone ? `<br/>Tel: ${companyInfo.phone}` : ""}
        ${companyInfo.email ? `<br/>${companyInfo.email}` : ""}
      </div>`
    : "";

  const tocHtml = includeTableOfContents && sections.length > 3
    ? `<div class="toc">
        <h3>Inhaltsverzeichnis</h3>
        <ol>
          ${sections.map((s, i) => `<li><a href="#section-${i}">${s.title}</a></li>`).join("")}
          ${signatures && signatures.length > 0 ? `<li><a href="#signatures">Unterschriften</a></li>` : ""}
        </ol>
      </div>
      <div class="page-break"></div>`
    : "";

  const sectionsHtml = sections.map((section, i) => {
    let sectionContent = `<div class="section" id="section-${i}">
      <h2 class="section-title"><span class="section-number">${i + 1}</span> ${section.title}</h2>
      <div class="section-content">${markdownToHtml(section.content)}</div>`;

    // Add images
    if (section.images && section.images.length > 0) {
      sectionContent += `<div class="images-grid">`;
      for (const img of section.images) {
        sectionContent += `<div class="image-container" style="width: ${img.width || 48}%;">
          <img src="${img.base64}" class="section-image" />
          ${img.caption ? `<p class="image-caption">${img.caption}</p>` : ""}
          ${img.annotation ? `<p class="image-annotation">${img.annotation}</p>` : ""}
        </div>`;
      }
      sectionContent += `</div>`;
    }

    // Add table
    if (section.table) {
      sectionContent += `<table class="data-table">
        <thead><tr>${section.table.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${section.table.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>`;
    }

    sectionContent += `</div>`;
    return sectionContent;
  }).join("");

  const signaturesHtml = signatures && signatures.length > 0
    ? `<div class="signatures-section" id="signatures">
        <h2 class="section-title">Unterschriften</h2>
        <div class="signatures-grid">
          ${signatures.map(sig => `
            <div class="signature-box">
              <div class="signature-image">
                ${sig.signatureBase64 ? `<img src="${sig.signatureBase64}" class="signature-img" />` : `<div class="signature-line"></div>`}
              </div>
              <div class="signature-info">
                <strong>${sig.name}</strong>
                <span class="signature-role">${sig.role}</span>
                <span class="signature-date">${sig.date}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      margin: 20mm 15mm 25mm 15mm;
      @bottom-center {
        content: counter(page) " / " counter(pages);
        font-size: 9px;
        color: #666;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1a1a1a;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid ${accentColor};
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .header-left { flex: 1; }
    .header-right { text-align: right; }
    .company-info { font-size: 9px; color: #555; line-height: 1.4; }
    .report-title {
      font-size: 20px;
      font-weight: 700;
      color: ${accentColor};
      margin-bottom: 4px;
    }
    .report-subtitle { font-size: 12px; color: #555; }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 20px;
      font-size: 10px;
    }
    .meta-table td {
      padding: 4px 8px;
      border: 1px solid #e0e0e0;
    }
    .meta-table td:first-child {
      font-weight: 600;
      width: 120px;
      background: #f8f9fa;
    }
    .toc {
      margin: 20px 0;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 4px;
    }
    .toc h3 { font-size: 14px; margin-bottom: 8px; }
    .toc ol { padding-left: 20px; }
    .toc li { margin: 4px 0; font-size: 11px; }
    .toc a { color: ${accentColor}; text-decoration: none; }
    .section { margin-bottom: 20px; }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #1a1a1a;
      border-bottom: 1px solid #e0e0e0;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }
    .section-number {
      display: inline-block;
      width: 22px;
      height: 22px;
      line-height: 22px;
      text-align: center;
      background: ${accentColor};
      color: white;
      border-radius: 50%;
      font-size: 10px;
      margin-right: 8px;
    }
    .section-content { font-size: 11px; line-height: 1.6; }
    .section-content p { margin-bottom: 8px; }
    .section-content ul, .section-content ol { padding-left: 20px; margin-bottom: 8px; }
    .section-content li { margin-bottom: 4px; }
    .section-content strong { font-weight: 600; }
    .images-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 12px 0;
    }
    .image-container { text-align: center; }
    .section-image {
      width: 100%;
      max-height: 200px;
      object-fit: contain;
      border: 1px solid #e0e0e0;
      border-radius: 2px;
    }
    .image-caption {
      font-size: 9px;
      color: #555;
      margin-top: 4px;
      font-style: italic;
    }
    .image-annotation {
      font-size: 9px;
      color: ${accentColor};
      margin-top: 2px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 10px;
    }
    .data-table th {
      background: ${accentColor};
      color: white;
      padding: 6px 8px;
      text-align: left;
      font-weight: 600;
    }
    .data-table td {
      padding: 5px 8px;
      border: 1px solid #e0e0e0;
    }
    .data-table tr:nth-child(even) td { background: #f8f9fa; }
    .signatures-section { margin-top: 30px; }
    .signatures-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin-top: 12px;
    }
    .signature-box {
      width: 45%;
      border: 1px solid #e0e0e0;
      padding: 12px;
      border-radius: 4px;
    }
    .signature-image {
      height: 60px;
      display: flex;
      align-items: flex-end;
      margin-bottom: 8px;
    }
    .signature-img { max-height: 50px; max-width: 100%; }
    .signature-line {
      width: 100%;
      border-bottom: 1px solid #333;
    }
    .signature-info { font-size: 9px; }
    .signature-role { display: block; color: #555; }
    .signature-date { display: block; color: #888; font-size: 8px; }
    .page-break { page-break-after: always; }
    .footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 8px;
      color: #888;
      border-top: 1px solid #e0e0e0;
      padding-top: 4px;
    }
    ${watermark ? `.watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 60px;
      color: rgba(0,0,0,0.03);
      font-weight: 700;
      pointer-events: none;
    }` : ""}
  </style>
</head>
<body>
  ${watermark ? `<div class="watermark">${watermark}</div>` : ""}
  
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <h1 class="report-title">${title}</h1>
      ${subtitle ? `<p class="report-subtitle">${subtitle}</p>` : ""}
    </div>
    <div class="header-right">
      ${companyInfoHtml}
    </div>
  </div>

  <table class="meta-table">
    <tr><td>Datum</td><td>${datum}</td></tr>
    ${projekt ? `<tr><td>Projekt</td><td>${projekt}</td></tr>` : ""}
    ${projektNummer ? `<tr><td>Projekt-Nr.</td><td>${projektNummer}</td></tr>` : ""}
    ${reportType ? `<tr><td>Berichtstyp</td><td>${reportType}</td></tr>` : ""}
  </table>

  ${tocHtml}
  ${sectionsHtml}
  ${signaturesHtml}

  <div class="footer">
    ${footerText || `Erstellt mit protoKI \u2022 ${datum}`}
  </div>
</body>
</html>`;
}

/**
 * Simple Markdown to HTML converter for report content
 */
function markdownToHtml(md: string): string {
  if (!md) return "";
  let html = md
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  // Wrap loose <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)+/gs, (match) => `<ul>${match}</ul>`);

  return `<p>${html}</p>`;
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
