/**
 * Shared "premium" PDF house style used across the app's reports
 * (Mängelbericht, Checkliste/Abnahme, Bautagebuch, …).
 *
 * A caller builds only the inner `body` HTML using the exported CSS classes
 * (section-chip, summary-band, stat-box, prem-table, legend, …) and passes it
 * to `buildPremiumHtml`, which wraps it in the navy header band, title,
 * optional icon info-row, consistent styles and a repeating page footer.
 */
import * as FileSystem from "expo-file-system/legacy";
import type { PdfBranding } from "./pdf-branding-store";

const NAVY = "#0F2744";

/**
 * The branding logo is stored as a local file URI, which expo-print's WebView
 * cannot load in an <img>. Convert it to a base64 data URI so it actually
 * shows up in the exported PDF. Returns "" when there is no (readable) logo.
 */
export async function resolveBrandingLogo(branding: { logoUri?: string | null } | null | undefined): Promise<string> {
  const uri = branding?.logoUri;
  if (!uri) return "";
  if (uri.startsWith("data:")) return uri;
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const ext = (uri.split(".").pop() || "").toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${base64}`;
  } catch {
    return "";
  }
}

export const escHtml = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escCss = (s: unknown) =>
  String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Small line icons (stroke = accent color). */
export function premiumIcons(accent: string) {
  const s = (inner: string) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return {
    building: s(`<rect x="4" y="3" width="10" height="18" rx="1"/><path d="M14 8h5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-5"/><path d="M7 7h.01M7 11h.01M7 15h.01M10 7h.01M10 11h.01M10 15h.01"/>`),
    layers: s(`<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>`),
    room: s(`<path d="M3 21h18M5 21V7l8-4v18M13 9h6v12"/><path d="M9 9v0M9 13v0M9 17v0"/>`),
    person: s(`<circle cx="12" cy="8" r="3.5"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>`),
    calendar: s(`<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>`),
    warning: s(`<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>`),
    check: s(`<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>`),
    hash: s(`<path d="M9 3L7 21M17 3l-2 18M4 8.5h16M3 15.5h16"/>`),
    clipboard: s(`<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>`),
  };
}

export type InfoCol = { label: string; value: string; icon?: string };

/** A numbered dark section chip + uppercase heading. */
export function sectionChip(num: number | string, text: string): string {
  return `<div class="section-chip"><span class="num">${num}</span><span class="txt">${escHtml(text)}</span></div>`;
}

/** A ring showing done/total in the centre. */
export function progressRing(done: number, total: number, accent: string): string {
  const pct = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = (c * (1 - pct)).toFixed(1);
  return `<svg width="86" height="86" viewBox="0 0 84 84">
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="6"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off}" transform="rotate(-90 42 42)"/>
    <text x="42" y="48" text-anchor="middle" font-size="17" font-weight="800" fill="${NAVY}" font-family="-apple-system,Arial,sans-serif">${done}/${total}</text>
  </svg>`;
}

/** A legend row of small dots + labels. `filled` fills the dot solid. */
export function legend(items: { label: string; color: string; filled?: boolean }[]): string {
  return `<div class="legend">${items
    .map(
      (i) =>
        `<div class="legend-item"><span class="legend-dot" style="border-color:${i.color};${i.filled ? `background:${i.color};` : ""}"></span>${escHtml(i.label)}</div>`,
    )
    .join("")}</div>`;
}

/** A light band of stat cards (value + label, coloured top-border). */
export function statBand(items: { value: string | number; label: string; color: string }[]): string {
  return `<div class="summary-band"><div class="stats-grid">${items
    .map(
      (i) =>
        `<div class="stat-box" style="border-top:3px solid ${i.color};"><div class="stat-number" style="color:${i.color};">${escHtml(i.value)}</div><div class="stat-label">${escHtml(i.label)}</div></div>`,
    )
    .join("")}</div></div>`;
}

/**
 * Wrap inner body HTML in the shared premium document shell.
 */
export function buildPremiumHtml(opts: {
  branding: PdfBranding;
  accentColor: string;
  title: string;
  subtitle?: string;
  reportTag?: string;
  info?: InfoCol[];
  body: string;
  footerLeft?: string;
  extraCss?: string;
  /** Pre-resolved base64 data URI of the logo (see resolveBrandingLogo). */
  logoDataUri?: string;
}): string {
  const { branding, accentColor, title, subtitle, reportTag, info, body, extraCss, logoDataUri } = opts;
  const logoTag = logoDataUri ? `<img src="${logoDataUri}" alt="" />` : "";
  const coName = escHtml(branding.companyName || "BuildKI");
  const coSub = escHtml(reportTag || branding.headerText || "Baudokumentation");
  const footerLeft = escCss(opts.footerLeft || branding.footerText || "BuildKI");
  const pageBox = branding.showPageNumbers
    ? `@bottom-right { content: "Seite " counter(page) " / " counter(pages); font-size: 8px; color: #94a3b8; padding: 0 14mm 7mm 0; }`
    : "";
  const infoHtml =
    info && info.length > 0
      ? `<div class="infogrid">${info
          .map(
            (c) =>
              `<div class="infocol"><div class="lbl">${c.icon || ""} ${escHtml(c.label)}</div><div class="val">${escHtml(c.value) || "&ndash;"}</div></div>`,
          )
          .join("")}</div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 12mm 0 15mm 0; ${pageBox} @bottom-left { content: "${footerLeft}"; font-size: 8px; color: #94a3b8; padding: 0 0 7mm 14mm; } }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; margin: 0; color: #1f2937; font-size: 12px; line-height: 1.5; }
  .band { background: ${NAVY}; color: #fff; padding: 18px 28px; display: flex; align-items: center; gap: 16px; }
  .band img { height: 40px; width: auto; object-fit: contain; }
  .band .co { font-size: 17px; font-weight: 800; letter-spacing: 0.3px; line-height: 1.2; }
  .band .co small { display: block; font-size: 9px; font-weight: 600; color: #8FB0CF; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 3px; }
  .wrap { padding: 24px 28px 12px; }
  .title { font-size: 28px; font-weight: 800; color: ${NAVY}; margin: 0; letter-spacing: 0.4px; }
  .title-rule { height: 3px; background: ${accentColor}; margin: 10px 0 0; border-radius: 2px; }
  .subtitle { font-size: 12px; color: #64748b; margin: 12px 0 0; }
  .infogrid { display: flex; margin: 18px 0 2px; border: 1px solid #e8ecf1; border-radius: 10px; overflow: hidden; }
  .infocol { flex: 1; padding: 12px 14px; border-right: 1px solid #eef1f5; }
  .infocol:last-child { border-right: none; }
  .infocol .lbl { display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 5px; }
  .infocol .val { font-size: 14px; font-weight: 700; color: #1f2937; }
  .summary-band { background: #f6f8fa; border: 1px solid #e8ecf1; border-radius: 12px; padding: 16px; margin: 18px 0 2px; }
  .stats-grid { display: flex; gap: 10px; }
  .stat-box { flex: 1; min-width: 68px; padding: 12px; border-radius: 10px; text-align: center; background: #fff; border: 1px solid #e8ecf1; }
  .stat-number { font-size: 22px; font-weight: 800; }
  .stat-label { font-size: 9px; color: #64748b; margin-top: 3px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .progress-band { display: flex; align-items: center; gap: 20px; background: #f6f8fa; border: 1px solid #e8ecf1; border-radius: 12px; padding: 16px 20px; margin: 18px 0 2px; }
  .progress-band .pmeta { flex: 1; }
  .progress-band .plabel { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; }
  .progress-band .pbig { font-size: 26px; font-weight: 800; color: ${NAVY}; margin-top: 2px; }
  .progress-band .pbar { height: 8px; background: #e2e8f0; border-radius: 4px; margin-top: 10px; overflow: hidden; }
  .progress-band .pbar > i { display: block; height: 100%; background: ${accentColor}; border-radius: 4px; }
  .progress-band .psub { font-size: 11px; color: #64748b; margin-top: 6px; }
  .legend { display: flex; gap: 22px; flex-wrap: wrap; padding: 12px 2px 4px; }
  .legend-item { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #475569; font-weight: 600; }
  .legend-dot { width: 11px; height: 11px; border-radius: 50%; border: 2px solid; }
  .section-chip { display: flex; align-items: center; gap: 10px; margin: 26px 0 12px; }
  .section-chip .num { background: ${NAVY}; color: #fff; font-size: 12px; font-weight: 800; width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; }
  .section-chip .txt { font-size: 15px; font-weight: 800; color: ${NAVY}; text-transform: uppercase; letter-spacing: 0.4px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .page-break { page-break-before: always; }
  .prem-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px; }
  .prem-table th, .prem-table td { padding: 9px 10px; border-bottom: 1px solid #eef1f5; text-align: left; vertical-align: top; }
  .prem-table th { background: #f8fafc; font-weight: 700; color: #334155; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.3px; }
  .prem-table tr:nth-child(even) td { background: #fbfcfd; }
  .note { font-size: 12px; color: #334155; padding: 10px 12px; background: #f8fafc; border-radius: 6px; margin: 4px 0 12px; }
  .card { border: 1px solid #e8ecf1; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; page-break-inside: avoid; }
  ${extraCss || ""}
</style>
</head>
<body>
  <div class="band">${logoTag}<div class="co">${coName}<small>${coSub}</small></div></div>
  <div class="wrap">
    <h1 class="title">${escHtml(title)}</h1>
    <div class="title-rule"></div>
    ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}
    ${infoHtml}
    ${body}
  </div>
</body>
</html>`;
}
