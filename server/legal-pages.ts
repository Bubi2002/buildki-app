import type { Express, Request, Response } from "express";

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_DRAFT_MARKER,
  LEGAL_DRAFT_NOTICE,
  LEGAL_DRAFT_VERSION,
} from "../lib/legal-draft";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const OPEN = `<strong class="open">${escapeHtml(LEGAL_DRAFT_MARKER)}</strong>`;

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)} – BuildKI Prüfentwurf</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; color: #edf4fa; background: #081522; }
    header, main, footer { width: min(920px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 24px 0 16px; }
    nav { display: flex; gap: 8px; flex-wrap: wrap; }
    nav a { color: #b9dff5; border: 1px solid #31516b; padding: 8px 10px; text-decoration: none; }
    main { background: #0f2133; border: 1px solid #29445d; padding: clamp(20px, 4vw, 44px); }
    h1 { font-size: clamp(28px, 5vw, 42px); line-height: 1.15; margin: 0 0 12px; }
    h2 { font-size: 21px; margin: 32px 0 10px; }
    h3 { font-size: 17px; margin: 22px 0 8px; }
    p, li { font-size: 15px; }
    ul { padding-left: 22px; }
    .draft { background: #3b171b; border: 2px solid #ef6a74; padding: 16px; margin-bottom: 24px; }
    .open { color: #ff9ca5; }
    .meta { color: #9bb0c3; font-size: 13px; }
    .field { border-left: 3px solid #486984; padding-left: 12px; margin: 10px 0; }
    a { color: #71c3f0; }
    footer { color: #9bb0c3; padding: 20px 0 40px; font-size: 13px; }
  </style>
</head>
<body>
  <header>
    <nav aria-label="Rechts- und Supportseiten">
      <a href="/datenschutz">Datenschutz</a>
      <a href="/impressum">Impressum</a>
      <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>
      <a href="/privacy-choices">Datenschutzoptionen</a>
      <a href="/support">Support</a>
    </nav>
  </header>
  <main>
    <div class="draft"><strong>NICHT VERÖFFENTLICHUNGSFÄHIGER PRÜFENTWURF</strong><br>${escapeHtml(LEGAL_DRAFT_NOTICE)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">Entwurfsversion ${escapeHtml(LEGAL_DRAFT_VERSION)} · Kontakt: <a href="mailto:${escapeHtml(LEGAL_CONTACT_EMAIL)}">${escapeHtml(LEGAL_CONTACT_EMAIL)}</a></p>
    ${body}
  </main>
  <footer>BuildKI Compliance-Prüfzweig · keine Produktiv- oder App-Store-Freigabe</footer>
</body>
</html>`;
}

const privacyBody = `
<h2>1. Verantwortlicher</h2>
<p>Name/Firma, Rechtsform, ladungsfähige Anschrift, Vertretung und Registerangaben: ${OPEN}</p>
<p>Datenschutzkontakt: <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a>. Eine förmliche Bestellung eines Datenschutzbeauftragten wird nicht behauptet.</p>

<h2>2. Tatsächlich verarbeitete Daten</h2>
<ul>
  <li>Konto-, Login-, Sitzungs- und Verifikationsdaten</li>
  <li>Projekt-, Kontakt-, Beschäftigten-, Anwesenheits-, Aufgaben-, Termin- und Mängeldaten</li>
  <li>Audio, Video, Fotos, Anhänge, Transkripte, Protokolle und Exporte</li>
  <li>Standort-, Wetter-, Matterport-, Dropbox-, Push-, Audit-, Sicherheits- und Synchronisationsdaten</li>
  <li>KI-Eingaben und KI-generierte Inhalte</li>
  <li>Zahlungs-/Abodaten nur bei künftig rechtlich und Apple-konform aktiviertem Zahlungsmodell</li>
</ul>

<h2>3. Lokale, serverseitige und externe Verarbeitung</h2>
<p>BuildKI verarbeitet einen Teil der Daten lokal. Konto-, Cloud-, Synchronisations-, Upload-, E-Mail-, KI-, Stripe-, Dropbox-, Matterport-, Wetter- und Pushfunktionen können Daten an BuildKI-Server oder externe Anbieter übertragen. Eine Deinstallation löscht deshalb nicht automatisch alle Daten.</p>

<h2>4. Zwecke und Rechtsgrundlagen</h2>
<p>Bereitstellung der angeforderten Appfunktionen, Projekt- und Dokumentationsverwaltung, Sicherheit, optionale Cloud-/KI-/Standortfunktionen und gesetzliche Pflichten. Die konkrete Zuordnung zu Vertrag, berechtigtem Interesse, Einwilligung oder gesetzlicher Pflicht ist je Datenfluss und Zielgruppe vor Veröffentlichung zu bestätigen: ${OPEN}</p>

<h2>5. Empfänger, Regionen und Drittlandtransfer</h2>
<p>Der technische Prüfstand enthält unter anderem BuildKI-Backend/Datenbank/Objektspeicher, einen KI-/Forge-Endpunkt, Strato SMTP, Dropbox, Matterport, Open-Meteo, Apple/Expo und optional Stripe. Vertragspartner, Regionen, AVV, SCC/Transfergrundlagen und Löschfristen: ${OPEN}</p>

<h2>6. Speicherdauer und Löschung</h2>
<p>Fristen für Konto, Projekte, Audio, Video, Fotos, Transkripte, KI-Anfragen, Audit-/Sicherheitslogs, Objektspeicher, Backups und Vertragsende: ${OPEN}</p>
<p>Die App behauptet im Prüfentwurf keine pauschale vollständige Löschung durch Deinstallation.</p>

<h2>7. Audio, Fotos, Standort und Beschäftigtendaten</h2>
<p>Nutzer müssen vor nichtöffentlichen Aufnahmen betroffene Personen informieren und eine geeignete Rechtsgrundlage sicherstellen. Unternehmen müssen Beschäftigtendatenschutz, Erforderlichkeit, Informationspflichten und mögliche Mitbestimmung prüfen.</p>

<h2>8. Betroffenenrechte</h2>
<p>Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Einwilligungswiderruf und Beschwerde können über <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a> geltend gemacht werden. Der Compliance-Prüfzweig enthält einen In-App-Export und eine initiierbare Konto-, Cloud- und lokale Datenlöschung. Binäre Medienexporte sowie physische Providerlöschung und Fristen: ${OPEN}</p>

<h2>9. Endgerätespeicherung und Tracking</h2>
<p>Notwendige lokale Appspeicherung dient der angeforderten Funktion. Im geprüften Quellstand ist kein Analytics-, Werbe- oder Tracking-SDK nachgewiesen. Eine spätere Einführung erfordert eine neue TDDDG-/DSGVO-Prüfung.</p>
`;

const imprintBody = `
<h2>Angaben gemäß § 5 DDG</h2>
<div class="field">Name/Firma: ${OPEN}</div>
<div class="field">Rechtsform: ${OPEN}</div>
<div class="field">Ladungsfähige Anschrift: ${OPEN}</div>
<div class="field">Vertretungsberechtigter: ${OPEN}</div>
<div class="field">Registergericht und Registernummer: ${OPEN}</div>
<div class="field">USt-IdNr. oder Wirtschafts-IdNr., soweit vorhanden: ${OPEN}</div>
<div class="field">Telefon/weitere schnelle Kontaktmöglichkeit: ${OPEN}</div>
<p>E-Mail: <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a></p>
<p>Eine interne Steuernummer und Bankverbindung werden nicht veröffentlicht.</p>

<h2>KI-Inhalte</h2>
<p>KI-generierte Inhalte sind Arbeitshilfen, können Fehler enthalten und müssen fachlich geprüft werden. Sie ersetzen keine rechtliche, technische oder sicherheitsrelevante Fachentscheidung.</p>
`;

const termsBody = `
<h2>1. Anbieter und Zielgruppe</h2>
<p>Vertragspartner, B2B-/B2C-Modell und Vertretung: ${OPEN}</p>

<h2>2. Leistung</h2>
<p>BuildKI unterstützt projektbezogene Baudokumentation, Protokolle, Aufgaben, Mängel, Medien und Exporte sowie optionale Cloud-, KI- und Dropboxfunktionen. Nicht nachgewiesene SLAs, automatische Synchronisationsgarantien oder unbegrenzte Leistungen werden nicht zugesagt.</p>
<p>Die Matterport-Integration ist im Prüfentwurf technisch gesperrt. Commercial Partner Terms, zulässige Monetarisierung und App-Store-Verteilung, DPA-Rollen, Transfers, Löschung, Endnutzerbedingungen sowie mandantensichere Account-/Modellzuordnung: ${OPEN}</p>

<h2>3. Preise, Testphase und Zahlung</h2>
<p>Tarife, Steuern, Laufzeit, Testphase, Zahlungsarchitektur und Kündigung: ${OPEN}</p>
<p>Bis zur Apple- und vertragsrechtlichen Entscheidung darf kein ungeklärter externer Kauf digitaler Premiumfunktionen aus der iOS-App angeboten werden.</p>

<h2>4. Kundenpflichten</h2>
<ul>
  <li>Zugangsdaten schützen und nur rechtmäßig erhobene Daten verarbeiten.</li>
  <li>Vor nichtöffentlichen Aufnahmen alle Betroffenen informieren und erforderliche Freigaben sicherstellen.</li>
  <li>KI-Ergebnisse vor Freigabe, Versand oder fachlicher Verwendung prüfen.</li>
  <li>Beschäftigtendatenschutz, Geheimhaltung und mögliche Mitbestimmung beachten.</li>
</ul>

<h2>5. Auftragsverarbeitung und Unterauftragnehmer</h2>
<p>Rollenverteilung, AVV, TOM, Unterauftragnehmer, Regionen und Transfergrundlagen: ${OPEN}</p>

<h2>6. Haftung, Gewährleistung und Rechtswahl</h2>
<p>Verbindliche Klauseln sind abhängig von Zielgruppe und Geschäftsmodell anwaltlich zu formulieren: ${OPEN}</p>
`;

const choicesBody = `
<h2>Datenschutzoptionen</h2>
<p>Optionale KI-, Standort- und Cloudfunktionen sind im Compliance-Prüfzweig standardmäßig deaktiviert und durch zweckbezogene Schalter geschützt. Der Widerruf ist über denselben Einstellungsbereich möglich und wirkt für künftige Verarbeitungen.</p>
<h2>Auskunft, Export und Löschung</h2>
<p>Die In-App-Verwaltung bietet einen kombinierten Konto-/Gerätedatenexport sowie Konto-, Cloud-, lokale Medien-, Cache-, Authentifizierungs- und Einwilligungslöschung. Binäre Medienexporte, physische Providerlöschung und gesetzliche Aufbewahrung: ${OPEN}. Ergänzende Anfragen können an <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a> gerichtet werden.</p>
<h2>Veröffentlichungssperre</h2>
<p>Diese Seite ist kein fertiges Privacy-Center. Betreiber-, Anbieter-, Fristen- und Vertragsinformationen: ${OPEN}</p>
`;

const supportBody = `
<h2>Support</h2>
<p>Kontakt: <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a></p>
<p>Servicezeiten, Reaktionszeiten, Verantwortlicher und alternative Kontaktwege: ${OPEN}</p>
<h2>Datenschutz- und Kontolöschanfragen</h2>
<p>Bitte nennen Sie keine Passwörter. Für eine Identitätsprüfung und sichere Bearbeitung wird vor Produktivstart ein dokumentierter Prozess eingerichtet: ${OPEN}</p>
`;

function sendPage(res: Response, title: string, body: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.send(layout(title, body));
}

export function registerLegalPages(app: Express) {
  app.get("/datenschutz", (_req: Request, res: Response) =>
    sendPage(res, "Datenschutz-Prüfentwurf", privacyBody),
  );
  app.get("/impressum", (_req: Request, res: Response) =>
    sendPage(res, "Impressum-Prüfentwurf", imprintBody),
  );
  app.get("/nutzungsbedingungen", (_req: Request, res: Response) =>
    sendPage(res, "Nutzungsbedingungen-Prüfentwurf", termsBody),
  );
  app.get("/privacy-choices", (_req: Request, res: Response) =>
    sendPage(res, "Datenschutzoptionen-Prüfentwurf", choicesBody),
  );
  app.get("/support", (_req: Request, res: Response) =>
    sendPage(res, "Support-Prüfentwurf", supportBody),
  );
}
