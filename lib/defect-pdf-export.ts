import { getDefects, type Defect, type DefectStatus, type DefectPriority } from "./defect-store";
import { getPdfBranding } from "./pdf-branding-store";
import * as FileSystem from "expo-file-system/legacy";
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
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const accentColor = branding.accentColor || "#0E7490";
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

  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escCss = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const NAVY = "#0F2744";
  const logoTag = branding.logoUri ? `<img src="${branding.logoUri}" alt="" />` : "";
  const coName = esc(branding.companyName || "BuildKI");
  const coSub = esc(branding.headerText || "Mängeldokumentation");
  const footerLeft = escCss(branding.footerText || (projectName ? `Projekt: ${projectName}` : "BuildKI"));
  const pageBox = branding.showPageNumbers
    ? `@bottom-right { content: "Seite " counter(page) " / " counter(pages); font-size: 8px; color: #94a3b8; padding: 0 14mm 7mm 0; }`
    : "";
  const icoBuilding = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="10" height="18" rx="1"/><path d="M14 8h5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-5"/><path d="M7 7h.01M7 11h.01M7 15h.01M10 7h.01M10 11h.01M10 15h.01"/></svg>`;
  const icoCal = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>`;
  const icoWarn = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>`;

  let html = `<!DOCTYPE html>
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
  .stat-box { flex: 1; min-width: 70px; padding: 12px; border-radius: 10px; text-align: center; background: #fff; border: 1px solid #e8ecf1; }
  .stat-number { font-size: 22px; font-weight: 800; }
  .stat-label { font-size: 9px; color: #64748b; margin-top: 3px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .legend { display: flex; gap: 22px; flex-wrap: wrap; padding: 12px 2px 4px; }
  .legend-item { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #475569; font-weight: 600; }
  .legend-dot { width: 11px; height: 11px; border-radius: 50%; border: 2px solid; }
  .section-chip { display: flex; align-items: center; gap: 10px; margin: 26px 0 12px; }
  .section-chip .num { background: ${NAVY}; color: #fff; font-size: 12px; font-weight: 800; width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; }
  .section-chip .txt { font-size: 15px; font-weight: 800; color: ${NAVY}; text-transform: uppercase; letter-spacing: 0.4px; }
  .page-break { page-break-before: always; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .defect-card { border: 1px solid #e8ecf1; border-radius: 10px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .defect-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .defect-title { font-size: 14px; font-weight: 700; flex: 1; color: #1f2937; }
  .defect-meta { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; font-size: 11px; color: #475569; }
  .defect-meta-item { display: flex; align-items: center; gap: 4px; }
  .defect-description { font-size: 12px; color: #334155; margin-bottom: 10px; padding: 10px; background: #f8fafc; border-radius: 6px; }
  .defect-photos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .defect-photo { width: 120px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #e8ecf1; }
  .summary-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px; }
  .summary-table th, .summary-table td { padding: 9px 10px; border-bottom: 1px solid #eef1f5; text-align: left; }
  .summary-table th { background: #f8fafc; font-weight: 700; color: #334155; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.3px; }
  .summary-table tr:nth-child(even) td { background: #fbfcfd; }
</style>
</head>
<body>
  <div class="band">${logoTag}<div class="co">${coName}<small>${coSub}</small></div></div>
  <div class="wrap">
    <h1 class="title">Mängelbericht</h1>
    <div class="title-rule"></div>
    <p class="subtitle">Projekt: ${esc(projectName)} &nbsp;·&nbsp; Stand: ${dateStr}</p>

    <div class="infogrid">
      <div class="infocol"><div class="lbl">${icoBuilding} Projekt</div><div class="val">${esc(projectName)}</div></div>
      <div class="infocol"><div class="lbl">${icoCal} Datum</div><div class="val">${dateStr}</div></div>
      <div class="infocol"><div class="lbl">${icoWarn} Mängel gesamt</div><div class="val">${stats.total}</div></div>
    </div>

    <div class="summary-band"><div class="stats-grid">
      <div class="stat-box" style="border-top: 3px solid #334155;"><div class="stat-number" style="color: #334155;">${stats.total}</div><div class="stat-label">Gesamt</div></div>
      <div class="stat-box" style="border-top: 3px solid #DC2626;"><div class="stat-number" style="color: #DC2626;">${stats.offen}</div><div class="stat-label">Offen</div></div>
      <div class="stat-box" style="border-top: 3px solid #D97706;"><div class="stat-number" style="color: #D97706;">${stats.inBearbeitung}</div><div class="stat-label">In Bearbeitung</div></div>
      <div class="stat-box" style="border-top: 3px solid #16A34A;"><div class="stat-number" style="color: #16A34A;">${stats.erledigt}</div><div class="stat-label">Erledigt</div></div>
      <div class="stat-box" style="border-top: 3px solid #B91C1C;"><div class="stat-number" style="color: #B91C1C;">${stats.hoch}</div><div class="stat-label">Priorität Hoch</div></div>
    </div></div>

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
      <td>${i + 1}</td>
      <td>${(d as any).positionCode ? `[${(d as any).positionCode}] ` : ''}${d.title}</td>
      <td>${gewerk}</td>
      <td>${ort}</td>
      <td>${zust}</td>
      <td><span class="badge" style="background: ${sc}1A; color: ${sc}; border: 1px solid ${sc}44;">${statusLabels[d.status]}</span></td>
      <td style="color: ${priorityColors[d.priority]}; font-weight: 700;">${priorityLabels[d.priority]}</td>
      <td>${dueDate}</td>
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

      html += `<div class="defect-card" style="border-left: 4px solid ${statusColors[d.status]};">`;
      html += `<div class="defect-header">
        <div class="defect-title">${(d as any).positionCode ? `<span style="font-family:monospace;color:${accentColor};">[${(d as any).positionCode}]</span> ` : ''}${i + 1}. ${d.title}</div>
        <span class="badge" style="background: ${statusColors[d.status]}1A; color: ${statusColors[d.status]}; border: 1px solid ${statusColors[d.status]}44;">${statusLabels[d.status]}</span>
      </div>`;

      const followUpStr = d.followUpDate ? new Date(d.followUpDate).toLocaleDateString("de-DE") : null;
      const followUpResultStr = d.followUpResult === "behoben" ? "✅ Behoben" : d.followUpResult === "nachbesserung" ? "⚠️ Nachbesserung" : null;

      html += `<div class="defect-meta">
        <div class="defect-meta-item"><strong>Priorität:</strong> <span style="color: ${priorityColors[d.priority]};">${priorityLabels[d.priority]}</span></div>
        <div class="defect-meta-item"><strong>Gewerk:</strong> ${gewerk}</div>
        ${d.location ? `<div class="defect-meta-item"><strong>Ort:</strong> ${d.location}</div>` : ""}
        ${d.room ? `<div class="defect-meta-item"><strong>Raum:</strong> ${d.room}</div>` : ""}
        ${d.floor ? `<div class="defect-meta-item"><strong>Geschoss:</strong> ${d.floor}</div>` : ""}
        ${d.assignee ? `<div class="defect-meta-item"><strong>Zuständig:</strong> ${d.assignee}${d.assigneeFirma ? ` (${d.assigneeFirma})` : ""}</div>` : ""}
        <div class="defect-meta-item"><strong>Erstellt:</strong> ${createdDate}</div>
        ${dueDate ? `<div class="defect-meta-item"><strong>Frist:</strong> ${dueDate}</div>` : ""}
        ${followUpStr ? `<div class="defect-meta-item"><strong>Nachprüfung:</strong> ${followUpStr}${followUpResultStr ? " " + followUpResultStr : ""}</div>` : ""}
        ${d.matterportModelId ? `<div class="defect-meta-item"><strong>3D-Modell:</strong> Verknüpft${d.matterportFloorName ? " ("+d.matterportFloorName+")" : ""}</div>` : ""}
        ${d.source ? `<div class="defect-meta-item"><strong>Quelle:</strong> ${d.source === "matterport" ? "3D-Scan" : d.source === "ki_analysis" ? "KI-Analyse" : d.source === "checklist" ? "Checkliste" : "Manuell"}</div>` : ""}
      </div>`;

      if (d.description) {
        html += `<div class="defect-description">${d.description}</div>`;
      }

      // AI Summary (from defect-store, Single Source of Truth)
      if (d.aiSummary) {
        html += `<div style="margin-top: 8px; padding: 8px; background: #f0f9ff; border-left: 3px solid ${accentColor}; border-radius: 4px; font-size: 11px;">
          <strong style="color: ${accentColor};">KI-Zusammenfassung:</strong> ${d.aiSummary}
        </div>`;
      }

      // Photos
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

      html += `</div>`;
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
