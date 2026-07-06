import { TimeEntry, formatDuration, getTimeEntries, getTimeTrackingSettings } from "./time-tracking-store";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { getPdfBranding } from "./pdf-branding-store";

export type TaqlohnzettelData = {
  projectName: string;
  projectId: string;
  date: string; // ISO date string
  entries: TimeEntry[];
  workerName: string;
  companyName: string;
  hourlyRate: number;
  dailyRate: number;
  totalHours: number;
  signatureRequired: boolean;
};

export async function generateTaqlohnzettelForDay(
  projectId: string,
  projectName: string,
  date: Date
): Promise<TaqlohnzettelData> {
  const entries = await getTimeEntries(projectId);
  const dayStr = date.toDateString();
  const dayEntries = entries.filter(
    (e) => new Date(e.startTime).toDateString() === dayStr && e.category !== "pause"
  );
  const totalSeconds = dayEntries.reduce((sum, e) => sum + e.duration, 0);

  const settings = await getTimeTrackingSettings();

  return {
    projectName,
    projectId,
    date: date.toISOString(),
    entries: dayEntries,
    workerName: settings.workerName || "",
    companyName: settings.companyName || "",
    hourlyRate: parseFloat(settings.hourlyRate) || 0,
    dailyRate: parseFloat(settings.dailyRate) || 0,
    totalHours: totalSeconds / 3600,
    signatureRequired: true,
  };
}

export async function generateWeeklyReport(
  projectId?: string
): Promise<{ days: { date: string; totalHours: number; entries: TimeEntry[] }[]; totalWeekHours: number }> {
  const entries = await getTimeEntries(projectId);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const days: { date: string; totalHours: number; entries: TimeEntry[] }[] = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayStr = day.toDateString();
    const dayEntries = entries.filter(
      (e) => new Date(e.startTime).toDateString() === dayStr
    );
    const totalSeconds = dayEntries.reduce((sum, e) => sum + e.duration, 0);
    days.push({
      date: day.toISOString(),
      totalHours: totalSeconds / 3600,
      entries: dayEntries,
    });
  }

  const totalWeekHours = days.reduce((sum, d) => sum + d.totalHours, 0);
  return { days, totalWeekHours };
}

export async function generateMonthlyReport(
  projectId?: string,
  month?: number,
  year?: number
): Promise<{ days: { date: string; totalHours: number; entries: TimeEntry[] }[]; totalMonthHours: number; month: number; year: number }> {
  const entries = await getTimeEntries(projectId);
  const now = new Date();
  const m = month ?? now.getMonth();
  const y = year ?? now.getFullYear();

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const days: { date: string; totalHours: number; entries: TimeEntry[] }[] = [];

  for (let i = 1; i <= daysInMonth; i++) {
    const day = new Date(y, m, i);
    const dayStr = day.toDateString();
    const dayEntries = entries.filter(
      (e) => new Date(e.startTime).toDateString() === dayStr
    );
    const totalSeconds = dayEntries.reduce((sum, e) => sum + e.duration, 0);
    days.push({
      date: day.toISOString(),
      totalHours: totalSeconds / 3600,
      entries: dayEntries,
    });
  }

  const totalMonthHours = days.reduce((sum, d) => sum + d.totalHours, 0);
  return { days, totalMonthHours, month: m, year: y };
}

function formatTimeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function getCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    arbeit: "Arbeit",
    besprechung: "Besprechung",
    fahrt: "Fahrt",
    pause: "Pause",
  };
  return map[cat] || cat;
}

export async function exportTaqlohnzettelPdf(
  projectName: string,
  projectId: string,
  date: Date
): Promise<string> {
  const data = await generateTaqlohnzettelForDay(projectId, projectName, date);
  let branding: any = null;
  try {
    branding = await getPdfBranding();
  } catch {}

  const dateStr = date.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  // Use settings company if available, fall back to branding
  const companyName = data.companyName || branding?.companyName || "";
  const companyAddress = branding?.companyAddress || "";
  const accentColor = branding?.accentColor || "#0a7ea4";
  const workerName = data.workerName;
  const hourlyRate = data.hourlyRate;
  const dailyRate = data.dailyRate;
  const earnings = hourlyRate > 0 ? (data.totalHours * hourlyRate) : 0;

  const entriesHtml = data.entries
    .map(
      (e) => `
    <tr>
      <td>${formatTimeStr(e.startTime)}</td>
      <td>${e.endTime ? formatTimeStr(e.endTime) : "–"}</td>
      <td>${formatDuration(e.duration)}</td>
      <td>${getCategoryLabel(e.category)}</td>
      <td>${e.note || "–"}</td>
    </tr>`
    )
    .join("");

  const pauseEntries = (await getTimeEntries(projectId)).filter(
    (e) => new Date(e.startTime).toDateString() === date.toDateString() && e.category === "pause"
  );
  const pauseTotal = pauseEntries.reduce((sum, e) => sum + e.duration, 0);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; padding: 40px; color: #1a1a1a; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid ${accentColor}; padding-bottom: 15px; }
    .title { font-size: 22px; font-weight: 700; color: ${accentColor}; }
    .subtitle { font-size: 12px; color: #666; margin-top: 4px; }
    .company { text-align: right; font-size: 11px; color: #666; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
    .info-item { padding: 10px; background: #f8f9fa; border-radius: 6px; }
    .info-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { font-size: 14px; font-weight: 600; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: ${accentColor}; color: white; padding: 10px 8px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { padding: 9px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
    tr:nth-child(even) td { background: #fafafa; }
    .totals { background: #f0f9ff; border: 1px solid ${accentColor}30; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .totals-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .totals-label { color: #555; font-size: 13px; }
    .totals-value { font-weight: 700; font-size: 14px; }
    .totals-main { font-size: 18px; color: ${accentColor}; font-weight: 800; }
    .signature-section { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .signature-box { border-top: 1px solid #333; padding-top: 8px; }
    .signature-label { font-size: 10px; color: #888; text-transform: uppercase; }
    .signature-hint { font-size: 9px; color: #aaa; margin-top: 4px; font-style: italic; }
    .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">Taglohnzettel</div>
      <div class="subtitle">${projectName}</div>
    </div>
    <div class="company">
      ${companyName ? `<strong>${companyName}</strong><br>` : ""}
      ${companyAddress ? companyAddress.replace(/\n/g, "<br>") : ""}
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item">
      <div class="info-label">Datum</div>
      <div class="info-value">${dateStr}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Projekt</div>
      <div class="info-value">${projectName}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Mitarbeiter</div>
      <div class="info-value">${workerName || "–"}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Erstellt</div>
      <div class="info-value">${new Date().toLocaleDateString("de-DE")} ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Von</th>
        <th>Bis</th>
        <th>Dauer</th>
        <th>Kategorie</th>
        <th>Bemerkung</th>
      </tr>
    </thead>
    <tbody>
      ${entriesHtml || '<tr><td colspan="5" style="text-align:center;color:#999;">Keine Einträge</td></tr>'}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span class="totals-label">Arbeitszeit:</span>
      <span class="totals-value">${data.totalHours.toFixed(2)} Stunden</span>
    </div>
    <div class="totals-row">
      <span class="totals-label">Pausenzeit:</span>
      <span class="totals-value">${(pauseTotal / 3600).toFixed(2)} Stunden</span>
    </div>
    <div class="totals-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${accentColor}30;">
      <span class="totals-label" style="font-weight:600;">Gesamt (netto):</span>
      <span class="totals-main">${data.totalHours.toFixed(2)} h</span>
    </div>
    ${hourlyRate > 0 ? `<div class="totals-row" style="margin-top: 6px;">
      <span class="totals-label">Stundensatz:</span>
      <span class="totals-value">${hourlyRate.toFixed(2)} €/h</span>
    </div>
    <div class="totals-row">
      <span class="totals-label" style="font-weight:700;">Betrag:</span>
      <span class="totals-main">${earnings.toFixed(2)} €</span>
    </div>` : ''}
    ${dailyRate > 0 ? `<div class="totals-row" style="margin-top: 6px;">
      <span class="totals-label">Tagessatz:</span>
      <span class="totals-value">${dailyRate.toFixed(2)} €/Tag</span>
    </div>` : ''}
  </div>

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-label">Auftragnehmer / Mitarbeiter</div>
      <div class="signature-hint">Unterschrift am gleichen oder nächsten Tag erforderlich</div>
    </div>
    <div class="signature-box">
      <div class="signature-label">Auftraggeber / Bauleitung</div>
      <div class="signature-hint">Bestätigung der geleisteten Stunden</div>
    </div>
  </div>

  <div class="footer">
    Erstellt mit ProtoKI • ${new Date().toLocaleDateString("de-DE")}
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

export async function exportWeeklyPdf(
  projectId?: string,
  projectName?: string
): Promise<string> {
  const report = await generateWeeklyReport(projectId);
  let branding: any = null;
  try {
    branding = await getPdfBranding();
  } catch {}

  const accentColor = branding?.accentColor || "#0a7ea4";
  const companyName = branding?.companyName || "";

  const weekStart = new Date(report.days[0]?.date || new Date());
  const weekEnd = new Date(report.days[6]?.date || new Date());
  const weekLabel = `${weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${weekEnd.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

  const daysHtml = report.days
    .map((d) => {
      const dayDate = new Date(d.date);
      const dayName = dayDate.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
      const bg = isWeekend ? "#f5f5f5" : d.totalHours > 0 ? "#f0f9ff" : "white";
      return `<tr style="background:${bg}">
        <td style="font-weight:600">${dayName}</td>
        <td>${d.totalHours > 0 ? d.totalHours.toFixed(2) + " h" : "–"}</td>
        <td>${d.entries.length > 0 ? d.entries.map((e) => getCategoryLabel(e.category)).join(", ") : "–"}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; padding: 40px; color: #1a1a1a; font-size: 13px; }
    .header { border-bottom: 3px solid ${accentColor}; padding-bottom: 15px; margin-bottom: 24px; }
    .title { font-size: 22px; font-weight: 700; color: ${accentColor}; }
    .subtitle { font-size: 13px; color: #666; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: ${accentColor}; color: white; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
    td { padding: 10px; border-bottom: 1px solid #eee; }
    .total-box { background: ${accentColor}10; border: 2px solid ${accentColor}; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0; }
    .total-value { font-size: 32px; font-weight: 800; color: ${accentColor}; }
    .total-label { font-size: 12px; color: #666; margin-top: 4px; }
    .footer { text-align: center; font-size: 9px; color: #aaa; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Wochenbericht Zeiterfassung</div>
    <div class="subtitle">${projectName || "Alle Projekte"} • KW ${weekLabel}</div>
    ${companyName ? `<div class="subtitle">${companyName}</div>` : ""}
  </div>

  <table>
    <thead>
      <tr><th>Tag</th><th>Stunden</th><th>Kategorien</th></tr>
    </thead>
    <tbody>${daysHtml}</tbody>
  </table>

  <div class="total-box">
    <div class="total-value">${report.totalWeekHours.toFixed(1)} h</div>
    <div class="total-label">Gesamtstunden diese Woche</div>
  </div>

  <div class="footer">Erstellt mit ProtoKI • ${new Date().toLocaleDateString("de-DE")}</div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

export async function shareTaqlohnzettel(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Taglohnzettel teilen" });
  }
}
