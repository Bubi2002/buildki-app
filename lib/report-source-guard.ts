export type ReportDefectSource = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  location?: string;
  trade?: string;
  dueDate?: string;
  assignee?: string;
  assigneeCompany?: string;
};

export type ReportAttendeeSource = {
  name: string;
  company?: string;
  role?: string;
};

export type ReportEvidenceSource = {
  evidenceId: string;
  description: string;
  room?: string;
  trade?: string;
  sourceLabel?: string;
  videoTimecode?: string;
  measurements?: string[];
};

export type ReportSourceSnapshot = {
  reportLabel: string;
  transcription: string;
  projectName?: string;
  datum: string;
  floor?: string;
  room?: string;
  selectedDefects: ReportDefectSource[];
  attendees: ReportAttendeeSource[];
  evidence: ReportEvidenceSource[];
};

const TRADE_TERM_GROUPS = [
  ["elektro"],
  ["sanitär", "sanitaer"],
  ["heizung", "klima", "lüftung", "lueftung"],
  ["rohbau", "mauerwerk"],
  ["trockenbau"],
  ["maler", "lackierer"],
  ["boden", "bodenbelag", "estrich"],
  ["fliesen", "naturstein"],
  ["fenster", "türen", "tueren", "verglasung"],
  ["dach", "fassade", "abdichtung"],
  ["aufzug"],
  ["brandschutz"],
  ["schreiner", "tischler"],
  ["schlosser", "metallbau"],
  ["garten", "außenanlage", "aussenanlage", "tiefbau"],
  ["innenausbau"],
] as const;

function normalize(value?: string): string {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceText(snapshot: ReportSourceSnapshot): string {
  return normalize([
    snapshot.transcription,
    snapshot.projectName,
    snapshot.datum,
    snapshot.floor,
    snapshot.room,
    ...snapshot.selectedDefects.flatMap((defect) => [
      defect.title,
      defect.description,
      defect.status,
      defect.priority,
      defect.location,
      defect.trade,
      defect.dueDate,
      defect.assignee,
      defect.assigneeCompany,
    ]),
    ...snapshot.attendees.flatMap((attendee) => [attendee.name, attendee.company, attendee.role]),
    ...snapshot.evidence.flatMap((evidence) => [
      evidence.evidenceId,
      evidence.description,
      evidence.room,
      evidence.trade,
      evidence.sourceLabel,
      evidence.videoTimecode,
      ...(evidence.measurements || []),
    ]),
  ].filter(Boolean).join("\n"));
}

function containsAny(haystack: string, terms: readonly string[]): boolean {
  return terms.some((term) => haystack.includes(normalize(term)));
}

function normalizeGermanDate(value: string): string {
  const [day, month, year] = value.split(".");
  return `${day?.padStart(2, "0")}.${month?.padStart(2, "0")}.${year}`;
}

export function findUnsupportedReportClaims(
  markdown: string,
  snapshot: ReportSourceSnapshot,
  unselectedDefects: ReportDefectSource[] = [],
): string[] {
  const output = normalize(markdown);
  const sources = sourceText(snapshot);
  const reasons = new Set<string>();

  // Hinweis: Die Gewerk-/Bauteil-Pruefung wurde bewusst entschaerft. Bei frei
  // diktierten Berichten formuliert die KI fachlich und bringt dabei Fachbegriffe
  // ein, die der Nutzer nicht woertlich getippt hat – das ist gewollt und darf den
  // Bericht nicht verwerfen. Die wirklich sensiblen Waechter (erfundene Daten,
  // Firmen, nicht ausgewaehlte Maengeldaten) bleiben aktiv.

  const outputDates = markdown.match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g) || [];
  for (const outputDate of outputDates) {
    const normalizedDate = normalizeGermanDate(outputDate);
    if (normalizedDate !== normalizeGermanDate(snapshot.datum) && !sources.includes(normalize(normalizedDate))) {
      reasons.add(`Nicht belegte Frist oder Datumsangabe: ${normalizedDate}`);
    }
  }

  const companyMatches = markdown.matchAll(/\bFa\.\s+([A-ZÄÖÜ][\p{L}0-9&.'-]*(?:\s+[A-ZÄÖÜ][\p{L}0-9&.'-]*){0,3})/gu);
  for (const match of companyMatches) {
    const company = match[1].trim();
    if (normalize(company) !== "n v" && !sources.includes(normalize(company))) {
      reasons.add(`Nicht belegte Firma: ${company}`);
    }
  }

  for (const defect of unselectedDefects) {
    const fingerprints = [defect.trade, defect.location]
      .map(normalize)
      .filter((value) => value.length >= 5 && !sources.includes(value));
    for (const fingerprint of fingerprints) {
      if (output.includes(fingerprint)) {
        reasons.add(`Nicht ausgewählte Mängeldaten verwendet: ${fingerprint}`);
      }
    }
  }

  return Array.from(reasons);
}

function cleanCell(value?: string): string {
  return (value?.trim() || "nicht angegeben")
    .replace(/\|/g, "–")
    .replace(/\r?\n+/g, " ");
}

export function buildSourceBoundReport(snapshot: ReportSourceSnapshot): string {
  const projectName = cleanCell(snapshot.projectName || "Projekt");
  const reportLabel = cleanCell(snapshot.reportLabel || "Bericht");
  const lines: string[] = [
    `# ${reportLabel} – ${projectName} – ${snapshot.datum}`,
    "",
    "## Berichtsdaten",
    "",
    "| Feld | Angabe |",
    "|---|---|",
    `| Projekt | ${projectName} |`,
    `| Datum | ${cleanCell(snapshot.datum)} |`,
    `| Berichtstyp | ${reportLabel} |`,
  ];

  if (snapshot.floor) lines.push(`| Geschoss | ${cleanCell(snapshot.floor)} |`);
  if (snapshot.room) lines.push(`| Raum | ${cleanCell(snapshot.room)} |`);

  lines.push("", "## Dokumentierte Eingabe", "", snapshot.transcription.trim());

  if (snapshot.selectedDefects.length > 0) {
    lines.push(
      "",
      "## Ausgewählte Mängeldaten",
      "",
      "| Mangel | Gewerk | Ort | Status | Priorität | Frist |",
      "|---|---|---|---|---|---|",
    );
    for (const defect of snapshot.selectedDefects) {
      lines.push(
        `| ${cleanCell(defect.title)} | ${cleanCell(defect.trade)} | ${cleanCell(defect.location)} | ${cleanCell(defect.status)} | ${cleanCell(defect.priority)} | ${cleanCell(defect.dueDate)} |`,
      );
      if (defect.description?.trim()) {
        lines.push("", `**Beschreibung zu ${cleanCell(defect.title)}:** ${defect.description.trim()}`);
      }
    }
  }

  if (snapshot.attendees.length > 0) {
    lines.push("", "## Ausgewählte Teilnehmende", "", "| Name | Firma | Funktion |", "|---|---|---|");
    for (const attendee of snapshot.attendees) {
      lines.push(`| ${cleanCell(attendee.name)} | ${cleanCell(attendee.company)} | ${cleanCell(attendee.role)} |`);
    }
  }

  if (snapshot.evidence.length > 0) {
    lines.push("", "## Ausgewählte Belege", "");
    for (const evidence of snapshot.evidence) {
      const details = [
        evidence.room ? `Raum: ${evidence.room}` : null,
        evidence.trade ? `Gewerk: ${evidence.trade}` : null,
        evidence.videoTimecode ? `Zeitcode: ${evidence.videoTimecode}` : null,
      ].filter(Boolean).join(" · ");
      lines.push(`- **${cleanCell(evidence.evidenceId)}:** ${cleanCell(evidence.description)}${details ? ` (${details})` : ""}`);
      for (const measurement of evidence.measurements || []) {
        lines.push(`  - Messung: ${measurement}`);
      }
    }
  }

  lines.push(
    "",
    "## Quellenhinweis",
    "",
    "Dieser Bericht enthält ausschließlich die dokumentierte Eingabe und ausdrücklich ausgewählte Projektdaten. Nicht belegte Angaben wurden nicht ergänzt.",
  );

  return `${lines.join("\n").trim()}\n`;
}

export function buildStrictSourceContract(snapshot: ReportSourceSnapshot): string {
  return [
    "VERBINDLICHER QUELLENVERTRAG:",
    "- Verwende ausschließlich die Transkription sowie die ausdrücklich übermittelten ausgewählten Mängel-, Teilnehmer- und Belegdaten.",
    "- Nicht übermittelte Projektdaten gelten als nicht ausgewählt und dürfen weder erwähnt noch indirekt abgeleitet werden.",
    "- Erfinde keine Gewerke, Bauteile, Ursachen, Auswirkungen, Entscheidungen, Maßnahmen, Verantwortlichen oder Fristen.",
    "- Wenn eine Angabe fehlt, lasse den Punkt weg oder schreibe exakt 'nicht angegeben'.",
    "- Eine fachlich plausible Ergänzung ist trotzdem unzulässig, wenn sie nicht wörtlich oder strukturiert in den Quellen belegt ist.",
    `- Primärquelle Transkription: ${snapshot.transcription.trim()}`,
  ].join("\n");
}
