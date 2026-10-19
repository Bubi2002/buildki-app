export const LEGAL_DRAFT_MARKER = "OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN";
export const LEGAL_DRAFT_VERSION = "2026-07-25-uncommitted-review";
export const LEGAL_CONTACT_EMAIL = "info@iserloh.net";

export const LEGAL_RELEASE_BLOCKED = true as const;

export const LEGAL_DRAFT_NOTICE =
  "NICHT VERÖFFENTLICHUNGSFÄHIGER PRÜFENTWURF. Fehlende Betreiber-, Vertrags-, Tarif-, Anbieter-, Hosting-, Transfer- und Löschfristenangaben sind vor TestFlight-/App-Store- oder Produktivfreigabe verbindlich zu ergänzen und anwaltlich zu prüfen.";

export const LEGAL_PROVIDER = {
  legalName: LEGAL_DRAFT_MARKER,
  legalForm: LEGAL_DRAFT_MARKER,
  streetAddress: LEGAL_DRAFT_MARKER,
  postalCodeAndCity: LEGAL_DRAFT_MARKER,
  representative: LEGAL_DRAFT_MARKER,
  registerCourt: LEGAL_DRAFT_MARKER,
  registerNumber: LEGAL_DRAFT_MARKER,
  vatOrBusinessId: LEGAL_DRAFT_MARKER,
  phone: LEGAL_DRAFT_MARKER,
  email: LEGAL_CONTACT_EMAIL,
  dataProtectionOfficer: LEGAL_DRAFT_MARKER,
} as const;

export const LEGAL_BUSINESS_MODEL = {
  audience:
    "Alle Nutzerinnen und Nutzer über App Store und Google Play (Verbraucher und Unternehmer)",
  monthlyPrice:
    "Im App Store bzw. bei Google Play zum Kaufzeitpunkt angezeigter Monatspreis",
  yearlyPrice:
    "Im App Store bzw. bei Google Play zum Kaufzeitpunkt angezeigter Jahrespreis",
  trialTerms:
    "Optionale kostenlose Testphase wie im Store angezeigt; ungenutzte Testzeit verfällt mit dem ersten kostenpflichtigen Zeitraum",
  paymentArchitecture:
    "Abwicklung über Apple In-App-Kauf bzw. Google Play Billing; Abrechnung über das Apple-ID- bzw. Google-Konto",
  cancellationTerms:
    "Automatische Verlängerung um den gewählten Zeitraum, sofern nicht spätestens 24 Stunden vor Ablauf in den Abo-Einstellungen des Stores gekündigt wird",
} as const;

export const LEGAL_PROCESSOR_OPEN_FIELDS = {
  // Technisch aus dem Code belegt (Stand 2026-10):
  //  - Backend/DB/Objektspeicher: Manus-Plattform (manus.space / forge.manus.im, S3)
  //  - KI: Transkription via Whisper, Textauswertung via Google Gemini (Forge-Endpunkt)
  //  - System-E-Mail: Strato (smtp.strato.de, Deutschland)
  //  - Optional (nur bei Nutzer-Verbindung): Dropbox, Matterport; Wetter: Open-Meteo
  //  - Zahlung: Stripe im Code vorhanden, aber deaktiviert; kein IAP/Play-Billing
  contractingEntity:
    "Backend/Datenbank/Objektspeicher: Manus-Plattform (manus.space, forge.manus.im, S3); KI-/Transkriptions-Endpunkt: forge.manus.im (Whisper + Google Gemini); E-Mail: Strato; Zahlungsabwicklung (sobald aktiv): Apple In-App-Kauf bzw. Google Play Billing mit RevenueCat zur Kaufverwaltung/Belegpruefung. Genaue Rechtstraeger der Auftragsverarbeiter noch zu bestaetigen.",
  // Aus Manus' öffentlichen Angaben (Trust Center / DPA, Stand 2026-10) – vom
  // Betreiber vor Release zu bestätigen:
  serverRegion:
    "Manus/Forge: USA und Singapur (nicht EU-exklusiv); Unterauftragsverarbeiter u. a. Google Cloud, AWS, OpenAI – United States. Strato-E-Mail: Deutschland.",
  dpaStatus:
    "Manus-DPA vorhanden (Master Services Agreement mit Butterfly Effect Pte. Ltd., Singapur); wirksamer Abschluss durch den Betreiber noch zu bestätigen.",
  transferMechanism:
    "EU-Standardvertragsklauseln (SCC) gemäß Manus-DPA für die Drittlandübermittlung (USA/Singapur).",
  // Vom Betreiber festgelegter Entwurf (vor Release mit tatsächlicher Systempraxis abgleichen):
  retentionPeriod:
    "Konto-/Stammdaten bis zur Kontolöschung; Rechnungs-/Abrechnungsdaten bis zu 10 Jahre (§ 147 AO, § 257 HGB); Projekt-/Baustellendaten bis zur Löschung durch den Nutzer bzw. kurz nach Kontolöschung; technische Server-Protokolle in der Regel 30–90 Tage; viele Daten bleiben nur lokal auf dem Gerät.",
} as const;
