import { getDefects, type Defect, type DefectStatus, type DefectPriority } from "./defect-store";
import { getPdfBranding } from "./pdf-branding-store";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TRADE_NAMES, type TradeName } from "./trades";

/**
 * Gewerke (trades) for defect assignment
 */
export const GEWERKE = TRADE_NAMES;

export type Gewerk = TradeName;

/**
 * Generate a professional Mängel-PDF report for a project
 */
export async function generateDefectPdfHtml(
  projectId: string,
  projectName: string,
  options?: {
    filterStatus?: DefectStatus[];
    filterPriority?: DefectPriority[];
    filterGewerk?: string;
    includePhotos?: boolean;
    includeHistory?: boolean;
  }
): Promise<string> {
  const branding = await getPdfBranding();
  // Load project meta (address, client) to enrich the cover page.
  let projectMeta: { address?: string; client?: string; contact?: string; contactName?: string } | null = null;
  try {
    const raw = await AsyncStorage.getItem("projects");
    if (raw) projectMeta = (JSON.parse(raw) as any[]).find((p) => p.id === projectId) || null;
  } catch {}
  let defects = await getDefects(projectId);

  // Apply filters
  if (options?.filterStatus && options.filterStatus.length > 0) {
    defects = defects.filter(d => options.filterStatus!.includes(d.status));
  }
  if (options?.filterPriority && options.filterPriority.length > 0) {
    defects = defects.filter(d => options.filterPriority!.includes(d.priority));
  }
  if (options?.filterGewerk) {
    defects = defects.filter(d => (d as any).gewerk === options.filterGewerk);
  }

  // Sort: high priority first, then by date
  defects.sort((a, b) => {
    const priorityOrder: Record<DefectPriority, number> = { hoch: 0, mittel: 1, niedrig: 2 };
    const pDiff = (a.priority ? priorityOrder[a.priority] : 3) - (b.priority ? priorityOrder[b.priority] : 3);
    if (pDiff !== 0) return pDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const accentColor = branding.accentColor || "#1E3A5F";
  const now = new Date();
  const dateStr = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Stats
  const stats = {
    total: defects.length,
    offen: defects.filter(d => d.status === "offen").length,
    inBearbeitung: defects.filter(d => d.status === "in_bearbeitung").length,
    erledigt: defects.filter(d => d.status === "erledigt").length,
    hoch: defects.filter(d => d.priority === "hoch" && d.status !== "erledigt").length,
  };

  // Management-summary aggregates (Kurzüberblick)
  const CLOSED: DefectStatus[] = ["erledigt", "abgelehnt", "geschlossen"];
  const openDefects = defects.filter(d => !CLOSED.includes(d.status));
  const prio = {
    hoch: defects.filter(d => d.priority === "hoch").length,
    mittel: defects.filter(d => d.priority === "mittel").length,
    niedrig: defects.filter(d => d.priority === "niedrig").length,
  };
  const roomsAffected = Array.from(new Set(
    defects.map(d => [d.floor, d.room].filter(Boolean).join(" · ") || d.location || "").filter(Boolean)
  ));
  const gewerkeAffected = Array.from(new Set(
    defects.map(d => ((d as any).gewerk || d.category || "").toString().trim()).filter(Boolean)
  ));
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const weekAhead = new Date(today0); weekAhead.setDate(weekAhead.getDate() + 7);
  const overdueCount = openDefects.filter(d => d.dueDate && new Date(d.dueDate) < today0).length;
  const dueSoonCount = openDefects.filter(d => { if (!d.dueDate) return false; const dd = new Date(d.dueDate); return dd >= today0 && dd <= weekAhead; }).length;
  const noDueCount = openDefects.filter(d => !d.dueDate).length;

  // Convert photos to base64
  const photoCache: Record<string, string> = {};
  if (options?.includePhotos !== false) {
    for (const defect of defects) {
      for (const photoUri of defect.photos.slice(0, 3)) { // Max 3 photos per defect
        if (!photoCache[photoUri]) {
          try {
            const base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: FileSystem.EncodingType.Base64 });
            const ext = photoUri.toLowerCase().includes(".png") ? "png" : "jpeg";
            photoCache[photoUri] = `data:image/${ext};base64,${base64}`;
          } catch {
            // Skip unreadable photos
          }
        }
      }
    }
  }

  // Build HTML
  // Muted, cohesive palette (Tailwind-700-ish) — no neon.
  const statusColors: Record<DefectStatus, string> = {
    offen: "#DC2626",
    zugewiesen: "#EA580C",
    in_bearbeitung: "#D97706",
    nachbesserung: "#DB2777",
    pruefung: "#7C3AED",
    erledigt: "#16A34A",
    abgelehnt: "#78716C",
    geschlossen: "#475569",
  };
  const statusLabels: Record<DefectStatus, string> = {
    offen: "Offen",
    zugewiesen: "Zugewiesen",
    in_bearbeitung: "In Bearbeitung",
    nachbesserung: "Nachbesserung",
    pruefung: "Pr\u00fcfung",
    erledigt: "Erledigt",
    abgelehnt: "Abgelehnt",
    geschlossen: "Geschlossen",
  };
  const priorityColors: Record<DefectPriority, string> = {
    hoch: "#B91C1C",
    mittel: "#B45309",
    niedrig: "#6B7280",
  };
  const priorityLabels: Record<DefectPriority, string> = {
    hoch: "Hoch",
    mittel: "Mittel",
    niedrig: "Niedrig",
  };
  // An unset priority shows a dash, not an invented value.
  const prioLabel = (p?: DefectPriority) => (p ? priorityLabels[p] : "–");
  const prioColor = (p?: DefectPriority) => (p ? priorityColors[p] : "#94A3B8");

  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escCss = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  // Render limited markdown (bold/italic/line breaks) safely: escape first, then
  // convert **bold** / *italic* and strip stray heading/list markers. Prevents raw
  // markdown like "**Anzahl Mängel:** 1" from leaking into the final PDF.
  const richText = (s: string) => {
    let out = esc(s ?? "").trim();
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
    out = out.replace(/^\s*#{1,6}\s+/gm, "");
    out = out.replace(/^\s*[-*•]\s+/gm, "• ");
    out = out.replace(/\*/g, ""); // drop stray/unbalanced asterisks
    out = out.replace(/\r?\n/g, "<br/>");
    return out;
  };
  const NAVY = "#0F2744";
  const { resolveBrandingLogo, premiumIcons } = await import("./pdf-premium");
  const logoDataUri = await resolveBrandingLogo(branding);
  const logoTag = logoDataUri ? `<img src="${logoDataUri}" alt="" />` : "";
  const siTotal = premiumIcons("#334155", 22).clipboard;
  const siOffen = premiumIcons("#DC2626", 22).warning;
  const siProg = premiumIcons("#D97706", 22).calendarClock;
  const siDone = premiumIcons("#16A34A", 22).check;
  const siHigh = premiumIcons("#B91C1C", 22).warning;
  const { applyBrandingVariables } = await import("./pdf-branding-store");
  const nowStr = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const varCtx = { projekt: projectName, firma: branding.companyName, datum: nowStr, dokumenttyp: "Mängeldokumentation" };
  const coName = esc(branding.companyName || "BuildKI");
  const coSub = esc(applyBrandingVariables(branding.headerText || "Mängeldokumentation", varCtx));
  const footerLeft = escCss(applyBrandingVariables(branding.footerText || (projectName ? `Projekt: ${projectName}` : "BuildKI"), varCtx));
  const pageBox = branding.showPageNumbers
    ? `@bottom-right { content: "Seite " counter(page) " von " counter(pages); font-size: 8px; color: #94a3b8; padding: 0 14mm 7mm 0; }`
    : "";
  const icoBuilding = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="10" height="18" rx="1"/><path d="M14 8h5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-5"/><path d="M7 7h.01M7 11h.01M7 15h.01M10 7h.01M10 11h.01M10 15h.01"/></svg>`;
  const icoCal = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>`;
  const icoWarn = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>`;
  const icoPin = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  const icoUser = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/></svg>`;
  const projAddress = projectMeta?.address ? esc(projectMeta.address) : "";
  const projContact = esc(projectMeta?.client || projectMeta?.contact || projectMeta?.contactName || "");

  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 0 0 15mm 0; ${pageBox} @bottom-left { content: "${footerLeft}"; font-size: 8px; color: #9aa6b4; padding: 0 0 7mm 16mm; } }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; margin: 0; color: #253040; font-size: 12px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Header band */
  .header { background: ${NAVY}; color: #fff; padding: 20px 16mm; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .header .brand { display: flex; align-items: center; gap: 14px; }
  .header img { height: 38px; width: auto; object-fit: contain; }
  .header .co { font-size: 16px; font-weight: 800; letter-spacing: 0.3px; line-height: 1.2; }
  .header .co small { display: block; font-size: 8.5px; font-weight: 700; color: #9db8d4; letter-spacing: 1.6px; text-transform: uppercase; margin-top: 4px; }
  .header .rtag { text-align: right; }
  .header .rtag .t { font-size: 8.5px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #9db8d4; }
  .header .rtag .d { font-size: 13px; font-weight: 700; margin-top: 3px; }

  /* Title */
  .wrap { padding: 22px 16mm 10px; }
  .title { font-size: 26px; font-weight: 800; color: ${NAVY}; margin: 0; letter-spacing: 0.2px; }
  .title-rule { height: 3px; width: 56px; background: ${accentColor}; margin: 11px 0 0; border-radius: 2px; }
  .subtitle { font-size: 11.5px; color: #64748b; margin: 10px 0 0; }

  /* Meta chips */
  .meta-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; }
  .meta-chip { flex: 1 1 0; min-width: 130px; border: 1px solid #e6eaf0; border-radius: 10px; padding: 11px 13px; background: #fff; }
  .meta-chip .lbl { display: flex; align-items: center; gap: 6px; font-size: 8.5px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 5px; }
  .meta-chip .val { font-size: 12.5px; font-weight: 700; color: #253040; line-height: 1.35; }

  /* KPI cards */
  .kpi-row { display: flex; gap: 9px; margin: 14px 0 0; }
  .kpi { flex: 1; border: 1px solid #e6eaf0; border-radius: 12px; padding: 13px 6px 11px; text-align: center; background: #fff; }
  .kpi .ic { display: flex; justify-content: center; margin-bottom: 5px; }
  .kpi .n { font-size: 22px; font-weight: 800; line-height: 1; }
  .kpi .l { font-size: 8.5px; color: #64748b; margin-top: 5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }

  /* Summary trio */
  .trio { display: flex; gap: 9px; margin: 12px 0 0; }
  .trio .box { flex: 1; background: #f7f9fb; border: 1px solid #e6eaf0; border-radius: 12px; padding: 12px 13px; }
  .trio .box .h { font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; color: #94a3b8; font-weight: 800; margin-bottom: 6px; }
  .trio .box .b { font-size: 11.5px; color: #334155; line-height: 1.5; }
  .trio .box .sub { font-size: 9.5px; color: #94a3b8; margin-top: 3px; }

  /* Legend */
  .legend { display: flex; gap: 20px; flex-wrap: wrap; padding: 14px 2px 2px; }
  .legend-item { display: flex; align-items: center; gap: 7px; font-size: 10.5px; color: #475569; font-weight: 600; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid; }

  /* Section heading */
  .section-chip { display: flex; align-items: center; gap: 10px; margin: 24px 0 12px; }
  .section-chip .num { background: ${NAVY}; color: #fff; font-size: 12px; font-weight: 800; width: 24px; height: 24px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; }
  .section-chip .txt { font-size: 14px; font-weight: 800; color: ${NAVY}; text-transform: uppercase; letter-spacing: 0.5px; }
  .page-break { page-break-before: always; }
  .badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 9.5px; font-weight: 800; letter-spacing: 0.2px; white-space: nowrap; }

  /* Overview table */
  .summary-table { width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 10.5px; border: 1px solid #e6eaf0; border-radius: 10px; overflow: hidden; }
  .summary-table th { background: #eef2f7; font-weight: 800; color: ${NAVY}; text-align: left; text-transform: uppercase; font-size: 9px; letter-spacing: 0.4px; padding: 9px 10px; border-bottom: 1px solid #dde4ec; }
  .summary-table td { padding: 9px 10px; border-bottom: 1px solid #eef1f5; vertical-align: top; color: #334155; }
  .summary-table tr:last-child td { border-bottom: none; }
  .summary-table tr:nth-child(even) td { background: #fafbfc; }
  .summary-table .nr { color: #94a3b8; font-weight: 700; }
  .prio-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; }

  /* Detail cards */
  .defect-card { border: 1px solid #e6eaf0; border-radius: 12px; margin-bottom: 14px; page-break-inside: avoid; overflow: hidden; }
  .defect-card .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 13px 15px; background: #f7f9fb; border-bottom: 1px solid #eef1f5; }
  .defect-title { font-size: 13px; font-weight: 800; color: ${NAVY}; flex: 1; line-height: 1.35; }
  .defect-body { padding: 13px 15px; }
  .kv { display: flex; flex-wrap: wrap; gap: 7px 10px; }
  .kv .item { flex: 1 1 42%; min-width: 150px; display: flex; gap: 6px; font-size: 10.5px; }
  .kv .k { color: #94a3b8; font-weight: 700; min-width: 66px; }
  .kv .v { color: #334155; font-weight: 600; }
  .defect-description { font-size: 11px; color: #334155; margin-top: 11px; padding: 10px 12px; background: #f7f9fb; border-left: 3px solid ${accentColor}; border-radius: 6px; line-height: 1.5; }
  .defect-photos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 11px; }
  .defect-photo { width: 128px; height: 94px; object-fit: cover; border-radius: 8px; border: 1px solid #e6eaf0; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">${logoTag}<div class="co">${coName}<small>${coSub}</small></div></div>
    <div class="rtag"><div class="t">Bericht</div><div class="d">${dateStr}</div></div>
  </div>
  <div class="wrap">
    <h1 class="title">Mängelbericht</h1>
    <div class="title-rule"></div>
    <p class="subtitle">Projekt: ${esc(projectName)}${projAddress ? ` &nbsp;·&nbsp; ${projAddress}` : ""} &nbsp;·&nbsp; Stand: ${dateStr}</p>

    <div class="meta-row">
      <div class="meta-chip"><div class="lbl">${icoBuilding} Projekt</div><div class="val">${esc(projectName)}</div></div>
      ${projAddress ? `<div class="meta-chip"><div class="lbl">${icoPin} Adresse</div><div class="val">${projAddress}</div></div>` : ""}
      ${projContact ? `<div class="meta-chip"><div class="lbl">${icoUser} Ansprechpartner</div><div class="val">${projContact}</div></div>` : ""}
      <div class="meta-chip"><div class="lbl">${icoCal} Erstellt am</div><div class="val">${dateStr}</div></div>
    </div>

    <div class="kpi-row">
      <div class="kpi"><div class="ic">${siTotal}</div><div class="n" style="color:#334155;">${stats.total}</div><div class="l">Gesamt</div></div>
      <div class="kpi"><div class="ic">${siOffen}</div><div class="n" style="color:#DC2626;">${stats.offen}</div><div class="l">Offen</div></div>
      <div class="kpi"><div class="ic">${siProg}</div><div class="n" style="color:#D97706;">${stats.inBearbeitung}</div><div class="l">In Arbeit</div></div>
      <div class="kpi"><div class="ic">${siDone}</div><div class="n" style="color:#16A34A;">${stats.erledigt}</div><div class="l">Erledigt</div></div>
      <div class="kpi"><div class="ic">${siHigh}</div><div class="n" style="color:#B91C1C;">${stats.hoch}</div><div class="l">Prio Hoch</div></div>
    </div>

    <div class="trio">
      <div class="box">
        <div class="h">Prioritäten</div>
        <div class="b"><span style="color:#B91C1C;font-weight:800;">${prio.hoch} Hoch</span> · <span style="color:#B45309;font-weight:800;">${prio.mittel} Mittel</span> · <span style="color:#6B7280;font-weight:800;">${prio.niedrig} Niedrig</span></div>
      </div>
      <div class="box">
        <div class="h">Betroffen</div>
        <div class="b">${roomsAffected.length} Räume · ${gewerkeAffected.length} Gewerke</div>
        ${gewerkeAffected.length ? `<div class="sub">${esc(gewerkeAffected.slice(0, 4).join(", "))}${gewerkeAffected.length > 4 ? " …" : ""}</div>` : ""}
      </div>
      <div class="box">
        <div class="h">Fristen (offen)</div>
        <div class="b"><span style="color:#B91C1C;font-weight:800;">${overdueCount} überfällig</span> · ${dueSoonCount} diese Woche · ${noDueCount} ohne Frist</div>
      </div>
    </div>

    <div class="legend">
      <div class="legend-item"><span class="legend-dot" style="border-color: ${statusColors.offen};"></span>Offen</div>
      <div class="legend-item"><span class="legend-dot" style="border-color: ${statusColors.in_bearbeitung};"></span>In Bearbeitung</div>
      <div class="legend-item"><span class="legend-dot" style="border-color: ${statusColors.erledigt}; background: ${statusColors.erledigt};"></span>Erledigt</div>
      <div class="legend-item"><span class="legend-dot" style="border-color: ${priorityColors.hoch}; background: ${priorityColors.hoch};"></span>Priorität hoch</div>
    </div>

    <div class="section-chip"><span class="num">1</span><span class="txt">Übersicht</span></div>`;

  // Summary table
  html += `<table class="summary-table">
    <thead><tr>
      <th>Nr.</th><th>Titel</th><th>Gewerk</th><th>Ort</th><th>Zuständig</th><th>Status</th><th>Priorität</th><th>Frist</th>
    </tr></thead><tbody>`;

  defects.forEach((d, i) => {
    const gewerk = (d as any).gewerk || d.category || "–";
    const dueDate = d.dueDate ? new Date(d.dueDate).toLocaleDateString("de-DE") : "–";
    const ort = [d.floor, d.room].filter(Boolean).join(" · ") || d.location || "–";
    const zust = d.assignee ? `${d.assignee}${d.assigneeFirma ? ` (${d.assigneeFirma})` : ""}` : "–";
    const sc = statusColors[d.status];
    html += `<tr>
      <td class="nr">${i + 1}</td>
      <td>${(d as any).positionCode ? `<span style="font-family:monospace;color:${accentColor};">[${(d as any).positionCode}]</span> ` : ''}${d.title}</td>
      <td>${gewerk}</td>
      <td>${ort}</td>
      <td>${zust}</td>
      <td><span class="badge" style="background: ${sc}1A; color: ${sc}; border: 1px solid ${sc}44;">${statusLabels[d.status]}</span></td>
      <td style="white-space:nowrap;"><span class="prio-dot" style="background:${prioColor(d.priority)};"></span><span style="color: ${prioColor(d.priority)}; font-weight: 700;">${prioLabel(d.priority)}</span></td>
      <td style="white-space:nowrap;">${dueDate}</td>
    </tr>`;
  });

  html += `</tbody></table>`;

  // Detailed defect cards
  if (defects.length > 0) {
    html += `<div class="page-break"></div>`;
    html += `<div class="section-chip"><span class="num">2</span><span class="txt">Detailansicht</span></div>`;

    for (let i = 0; i < defects.length; i++) {
      const d = defects[i];
      const gewerk = (d as any).gewerk || d.category || "–";
      const dueDate = d.dueDate ? new Date(d.dueDate).toLocaleDateString("de-DE") : null;
      const createdDate = new Date(d.createdAt).toLocaleDateString("de-DE");
      const ort = [d.floor, d.room].filter(Boolean).join(" · ") || d.location || "";
      const followUpStr = d.followUpDate ? new Date(d.followUpDate).toLocaleDateString("de-DE") : null;
      const followUpResultStr = d.followUpResult === "behoben" ? "✅ Behoben" : d.followUpResult === "nachbesserung" ? "⚠️ Nachbesserung" : null;
      const sc = statusColors[d.status];
      const pc = prioColor(d.priority);
      const quelle = d.source ? (d.source === "matterport" ? "3D-Scan" : d.source === "ki_analysis" ? "KI-Analyse" : d.source === "checklist" ? "Checkliste" : "Manuell") : "";

      html += `<div class="defect-card">`;
      html += `<div class="top" style="border-left: 4px solid ${sc};">
        <div class="defect-title">${(d as any).positionCode ? `<span style="font-family:monospace;color:${accentColor};">[${(d as any).positionCode}]</span> ` : ''}${i + 1}. ${d.title}</div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <span class="badge" style="background: ${pc}1A; color: ${pc}; border: 1px solid ${pc}44;">${prioLabel(d.priority)}</span>
          <span class="badge" style="background: ${sc}1A; color: ${sc}; border: 1px solid ${sc}44;">${statusLabels[d.status]}</span>
        </div>
      </div>`;

      html += `<div class="defect-body">
        <div class="kv">
          <div class="item"><span class="k">Gewerk</span><span class="v">${gewerk}</span></div>
          ${ort ? `<div class="item"><span class="k">Ort</span><span class="v">${ort}</span></div>` : ""}
          ${d.assignee ? `<div class="item"><span class="k">Zuständig</span><span class="v">${d.assignee}${d.assigneeFirma ? ` (${d.assigneeFirma})` : ""}</span></div>` : ""}
          <div class="item"><span class="k">Erstellt</span><span class="v">${createdDate}</span></div>
          ${dueDate ? `<div class="item"><span class="k">Frist</span><span class="v">${dueDate}</span></div>` : ""}
          ${followUpStr ? `<div class="item"><span class="k">Nachprüfung</span><span class="v">${followUpStr}${followUpResultStr ? " " + followUpResultStr : ""}</span></div>` : ""}
          ${d.matterportModelId ? `<div class="item"><span class="k">3D-Modell</span><span class="v">Verknüpft${d.matterportFloorName ? " ("+d.matterportFloorName+")" : ""}</span></div>` : ""}
          ${quelle ? `<div class="item"><span class="k">Quelle</span><span class="v">${quelle}</span></div>` : ""}
        </div>`;

      if (d.description) {
        html += `<div class="defect-description">${richText(d.description)}</div>`;
      }

      if (d.aiSummary) {
        html += `<div style="margin-top: 10px; padding: 10px 12px; background: #eef5fc; border-left: 3px solid ${accentColor}; border-radius: 6px; font-size: 10.5px; line-height: 1.5;">
          <strong style="color: ${accentColor};">KI-Zusammenfassung:</strong> ${richText(d.aiSummary)}
        </div>`;
      }

      if (options?.includePhotos !== false && d.photos.length > 0) {
        html += `<div class="defect-photos">`;
        for (const photoUri of d.photos.slice(0, 3)) {
          const base64 = photoCache[photoUri];
          if (base64) {
            html += `<img class="defect-photo" src="${base64}" />`;
          }
        }
        html += `</div>`;
      }

      html += `</div>`; // .defect-body
      html += `</div>`; // .defect-card
    }
  }

  // ─── Signatures Section (from defect-store, Single Source of Truth) ─────────
  const allSignatures = defects.flatMap(d => (d.signatures || []).map(s => ({ ...s, defectTitle: d.title })));
  if (allSignatures.length > 0) {
    html += `<div class="page-break"></div>`;
    html += `<div class="section-chip"><span class="num">3</span><span class="txt">Unterschriften</span></div>`;
    html += `<p style="font-size: 11px; color: #666; margin-bottom: 16px;">Die folgenden digitalen Unterschriften bestätigen die Kenntnisnahme und/oder Anerkennung der dokumentierten Mängel.</p>`;
    html += `<table class="summary-table"><thead><tr><th>Rolle</th><th>Datum</th><th>Unterschrift</th></tr></thead><tbody>`;

    // Deduplicate by role+date
    const uniqueSigs = new Map<string, typeof allSignatures[0]>();
    for (const sig of allSignatures) {
      const key = `${sig.role}_${sig.signedAt.slice(0, 10)}`;
      if (!uniqueSigs.has(key)) uniqueSigs.set(key, sig);
    }

    for (const [, sig] of uniqueSigs) {
      const sigDate = new Date(sig.signedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      // Render signature paths as SVG. The paths use the raw signature-pad pixel
      // coordinates (pad size isn't stored), so fit the viewBox to the actual
      // bounding box — otherwise a fixed viewBox clips the strokes to nothing.
      let sigSvg = "";
      if (sig.paths && sig.paths.length > 0) {
        const d = sig.paths.join(" ");
        const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
        let vbX = 0, vbY = 0, vbW = 300, vbH = 100;
        if (xs.length && ys.length) {
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          const pad = 10;
          vbX = minX - pad; vbY = minY - pad;
          vbW = Math.max(1, (maxX - minX) + pad * 2);
          vbH = Math.max(1, (maxY - minY) + pad * 2);
        }
        // Keep the stroke visible after scaling the (possibly large) viewBox down.
        const strokeW = Math.max(2, (vbW / 160) * 2.2).toFixed(1);
        sigSvg = `<svg width="160" height="54" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="border-bottom: 1px solid #333;"><path d="${d}" stroke="#1a1a1a" stroke-width="${strokeW}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      } else {
        sigSvg = `<em style="color: #666;">[Digital signiert]</em>`;
      }
      html += `<tr><td style="font-weight: 600;">${sig.role}</td><td>${sigDate}</td><td>${sigSvg}</td></tr>`;
    }

    html += `</tbody></table>`;
    html += `<p style="font-size: 9px; color: #999; margin-top: 12px; font-style: italic;">Hinweis: Die digitalen Unterschriften wurden elektronisch erfasst und sind rechtlich bindend gemäß § 126a BGB (elektronische Form). Die Unterzeichner bestätigen die Richtigkeit und Vollständigkeit der dokumentierten Mängel zum Zeitpunkt der Unterschrift.</p>`;
  }

  // Close content wrapper (page footer is rendered via @page margin boxes)
  html += `</div>`;
  html += `</body></html>`;

  return html;
}

/**
 * Get defects grouped by Gewerk
 */
export function groupDefectsByGewerk(defects: Defect[]): Record<string, Defect[]> {
  const groups: Record<string, Defect[]> = {};
  for (const d of defects) {
    const gewerk = (d as any).gewerk || d.category || "Sonstiges";
    if (!groups[gewerk]) groups[gewerk] = [];
    groups[gewerk].push(d);
  }
  return groups;
}

/**
 * Get defects with overdue deadlines
 */
export function getOverdueDefects(defects: Defect[]): Defect[] {
  const now = new Date();
  return defects.filter(d => {
    if (d.status === "erledigt") return false;
    if (!d.dueDate) return false;
    return new Date(d.dueDate) < now;
  });
}
