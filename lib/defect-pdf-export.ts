import { getDefects, type Defect, type DefectStatus, type DefectPriority } from "./defect-store";
import { getPdfBranding, generatePdfHeader, generatePdfFooter } from "./pdf-branding-store";
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

  const accentColor = branding.accentColor || "#0a7ea4";
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
  const statusColors: Record<DefectStatus, string> = {
    offen: "#EF4444",
    zugewiesen: "#FF9800",
    in_bearbeitung: "#F59E0B",
    nachbesserung: "#E91E63",
    pruefung: "#9C27B0",
    erledigt: "#22C55E",
    abgelehnt: "#795548",
    geschlossen: "#607D8B",
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
    hoch: "#DC2626",
    mittel: "#F59E0B",
    niedrig: "#6B7280",
  };
  const priorityLabels: Record<DefectPriority, string> = {
    hoch: "Hoch",
    mittel: "Mittel",
    niedrig: "Niedrig",
  };

  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; color: #1a1a1a; font-size: 12px; line-height: 1.5; }
  .page-break { page-break-before: always; }
  .header { margin-bottom: 20px; }
  .stats-grid { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat-box { flex: 1; min-width: 80px; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb; }
  .stat-number { font-size: 24px; font-weight: 800; }
  .stat-label { font-size: 10px; color: #666; margin-top: 2px; }
  .defect-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .defect-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .defect-title { font-size: 14px; font-weight: 700; flex: 1; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; color: white; }
  .defect-meta { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; font-size: 11px; color: #666; }
  .defect-meta-item { display: flex; align-items: center; gap: 4px; }
  .defect-description { font-size: 12px; color: #333; margin-bottom: 10px; padding: 8px; background: #f9fafb; border-radius: 4px; }
  .defect-photos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .defect-photo { width: 120px; height: 90px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; }
  .summary-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 11px; }
  .summary-table th, .summary-table td { padding: 8px 10px; border: 1px solid #e5e7eb; text-align: left; }
  .summary-table th { background: ${accentColor}10; font-weight: 600; color: ${accentColor}; }
  .footer { margin-top: 24px; }
</style>
</head>
<body>`;

  // Header
  html += `<div class="header">${generatePdfHeader(branding, projectName)}</div>`;

  // Title
  html += `<h1 style="font-size: 20px; font-weight: 800; color: ${accentColor}; margin-bottom: 4px;">Mängelbericht</h1>`;
  html += `<p style="font-size: 12px; color: #666; margin-bottom: 20px;">Projekt: ${projectName} | Stand: ${dateStr}</p>`;

  // Statistics
  html += `<div class="stats-grid">
    <div class="stat-box"><div class="stat-number" style="color: ${accentColor};">${stats.total}</div><div class="stat-label">Gesamt</div></div>
    <div class="stat-box"><div class="stat-number" style="color: #EF4444;">${stats.offen}</div><div class="stat-label">Offen</div></div>
    <div class="stat-box"><div class="stat-number" style="color: #F59E0B;">${stats.inBearbeitung}</div><div class="stat-label">In Bearbeitung</div></div>
    <div class="stat-box"><div class="stat-number" style="color: #22C55E;">${stats.erledigt}</div><div class="stat-label">Erledigt</div></div>
    <div class="stat-box"><div class="stat-number" style="color: #DC2626;">${stats.hoch}</div><div class="stat-label">Priorität Hoch</div></div>
  </div>`;

  // Summary table
  html += `<table class="summary-table">
    <thead><tr>
      <th>Nr.</th><th>Titel</th><th>Status</th><th>Priorität</th><th>Gewerk</th><th>Ort</th><th>Frist</th>
    </tr></thead><tbody>`;

  defects.forEach((d, i) => {
    const gewerk = (d as any).gewerk || d.category || "–";
    const dueDate = d.dueDate ? new Date(d.dueDate).toLocaleDateString("de-DE") : "–";
    html += `<tr>
      <td>${i + 1}</td>
      <td>${(d as any).positionCode ? `[${(d as any).positionCode}] ` : ''}${d.title}</td>
      <td><span class="badge" style="background: ${statusColors[d.status]};">${statusLabels[d.status]}</span></td>
      <td style="color: ${priorityColors[d.priority]}; font-weight: 600;">${priorityLabels[d.priority]}</td>
      <td>${gewerk}</td>
      <td>${d.location || "–"}</td>
      <td>${dueDate}</td>
    </tr>`;
  });

  html += `</tbody></table>`;

  // Detailed defect cards
  if (defects.length > 0) {
    html += `<div class="page-break"></div>`;
    html += `<h2 style="font-size: 16px; font-weight: 700; color: ${accentColor}; margin-bottom: 16px;">Detailansicht</h2>`;

    for (let i = 0; i < defects.length; i++) {
      const d = defects[i];
      const gewerk = (d as any).gewerk || d.category || "–";
      const dueDate = d.dueDate ? new Date(d.dueDate).toLocaleDateString("de-DE") : null;
      const createdDate = new Date(d.createdAt).toLocaleDateString("de-DE");

      html += `<div class="defect-card" style="border-left: 4px solid ${statusColors[d.status]};">`;
      html += `<div class="defect-header">
        <div class="defect-title">${(d as any).positionCode ? `<span style="font-family:monospace;color:${accentColor};">[${(d as any).positionCode}]</span> ` : ''}${i + 1}. ${d.title}</div>
        <span class="badge" style="background: ${statusColors[d.status]};">${statusLabels[d.status]}</span>
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
    html += `<h2 style="font-size: 16px; font-weight: 700; color: ${accentColor}; margin-bottom: 16px;">Unterschriften</h2>`;
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

  // Footer
  html += `<div class="footer">${generatePdfFooter(branding)}</div>`;
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
