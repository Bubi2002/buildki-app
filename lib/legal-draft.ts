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
  contractingEntity: LEGAL_DRAFT_MARKER,
  serverRegion: LEGAL_DRAFT_MARKER,
  dpaStatus: LEGAL_DRAFT_MARKER,
  transferMechanism: LEGAL_DRAFT_MARKER,
  retentionPeriod: LEGAL_DRAFT_MARKER,
} as const;
