import { TimeEntry, formatDuration, getTimeEntries, getTimeTrackingSettings } from "./time-tracking-store";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { getPdfBranding } from "./pdf-branding-store";
import { buildPremiumHtml, resolveBrandingLogo, escHtml, premiumIcons, type InfoCol } from "./pdf-premium";

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
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday of this week (Sunday-safe)
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
  const accent = branding?.accentColor || "#1E3A5F";
  const logoDataUri = await resolveBrandingLogo(branding);
  const ic = premiumIcons(accent);
  const workerName = data.workerName;
  const hourlyRate = data.hourlyRate;
  const dailyRate = data.dailyRate;
  const earnings = hourlyRate > 0 ? (data.totalHours * hourlyRate) : 0;

  const entriesHtml = data.entries
    .map(
      (e) => `<tr>
      <td>${formatTimeStr(e.startTime)}</td>
      <td>${e.endTime ? formatTimeStr(e.endTime) : "–"}</td>
      <td>${formatDuration(e.duration)}</td>
      <td>${getCategoryLabel(e.category)}</td>
      <td>${escHtml(e.note || "–")}</td>
    </tr>`
    )
    .join("");

  const pauseEntries = (await getTimeEntries(projectId)).filter(
    (e) => new Date(e.startTime).toDateString() === date.toDateString() && e.category === "pause"
  );
  const pauseTotal = pauseEntries.reduce((sum, e) => sum + e.duration, 0);

  const info: InfoCol[] = [
    { label: "Datum", value: dateStr, icon: ic.calendar },
    { label: "Projekt", value: projectName, icon: ic.building },
    { label: "Mitarbeiter", value: workerName || "–", icon: ic.person },
  ];

  const totalsRow = (label: string, value: string, main = false) =>
    `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#64748b;font-size:12px;${main ? "font-weight:700;" : ""}">${label}</span><span style="font-weight:800;font-size:${main ? "16px" : "13px"};color:${main ? accent : "#1f2937"};">${value}</span></div>`;

  const body = `
    <table class="prem-table" style="margin-top:16px;">
      <thead><tr><th>Von</th><th>Bis</th><th>Dauer</th><th>Kategorie</th><th>Bemerkung</th></tr></thead>
      <tbody>${entriesHtml || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Keine Einträge</td></tr>'}</tbody>
    </table>

    <div class="card" style="margin-top:16px;">
      ${totalsRow("Arbeitszeit", `${data.totalHours.toFixed(2)} Stunden`)}
      ${totalsRow("Pausenzeit", `${(pauseTotal / 3600).toFixed(2)} Stunden`)}
      <div style="border-top:1px solid #e8ecf1;margin:8px 0 8px;"></div>
      ${totalsRow("Gesamt (netto)", `${data.totalHours.toFixed(2)} h`, true)}
      ${hourlyRate > 0 ? totalsRow("Stundensatz", `${hourlyRate.toFixed(2)} €/h`) + totalsRow("Betrag", `${earnings.toFixed(2)} €`, true) : ""}
      ${dailyRate > 0 ? totalsRow("Tagessatz", `${dailyRate.toFixed(2)} €/Tag`) : ""}
    </div>

    <div style="display:flex;gap:40px;margin-top:34px;">
      <div style="flex:1;border-top:1px solid #94a3b8;padding-top:8px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;">Auftragnehmer / Mitarbeiter</div>
        <div style="font-size:9px;color:#94a3b8;margin-top:4px;font-style:italic;">Unterschrift am gleichen oder nächsten Tag</div>
      </div>
      <div style="flex:1;border-top:1px solid #94a3b8;padding-top:8px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;">Auftraggeber / Bauleitung</div>
        <div style="font-size:9px;color:#94a3b8;margin-top:4px;font-style:italic;">Bestätigung der geleisteten Stunden</div>
      </div>
    </div>`;

  const html = buildPremiumHtml({
    branding: branding || ({} as any),
    accentColor: accent,
    title: "Taglohnzettel",
    reportTag: "Zeiterfassung",
    subtitle: escHtml(projectName),
    info,
    body,
    logoDataUri,
  });

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

  const accent = branding?.accentColor || "#1E3A5F";
  const logoDataUri = await resolveBrandingLogo(branding);

  const weekStart = new Date(report.days[0]?.date || new Date());
  const weekEnd = new Date(report.days[6]?.date || new Date());
  const weekLabel = `${weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${weekEnd.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

  const daysHtml = report.days
    .map((d) => {
      const dayDate = new Date(d.date);
      const dayName = dayDate.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
      return `<tr>
        <td style="font-weight:600">${dayName}</td>
        <td>${d.totalHours > 0 ? d.totalHours.toFixed(2) + " h" : "–"}</td>
        <td>${d.entries.length > 0 ? escHtml(d.entries.map((e) => getCategoryLabel(e.category)).join(", ")) : "–"}</td>
      </tr>`;
    })
    .join("");

  const body = `
    <table class="prem-table" style="margin-top:16px;">
      <thead><tr><th>Tag</th><th>Stunden</th><th>Kategorien</th></tr></thead>
      <tbody>${daysHtml}</tbody>
    </table>

    <div class="card" style="margin-top:18px;text-align:center;">
      <div style="font-size:32px;font-weight:800;color:${accent};">${report.totalWeekHours.toFixed(1)} h</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;">Gesamtstunden diese Woche</div>
    </div>`;

  const html = buildPremiumHtml({
    branding: branding || ({} as any),
    accentColor: accent,
    title: "Wochenbericht",
    reportTag: "Zeiterfassung",
    subtitle: escHtml(`${projectName || "Alle Projekte"} · KW ${weekLabel}`),
    body,
    logoDataUri,
  });

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

export async function shareTaqlohnzettel(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Taglohnzettel teilen" });
  }
}
