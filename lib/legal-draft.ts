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
  audience: LEGAL_DRAFT_MARKER,
  monthlyPrice: LEGAL_DRAFT_MARKER,
  yearlyPrice: LEGAL_DRAFT_MARKER,
  trialTerms: LEGAL_DRAFT_MARKER,
  paymentArchitecture: LEGAL_DRAFT_MARKER,
  cancellationTerms: LEGAL_DRAFT_MARKER,
} as const;

export const LEGAL_PROCESSOR_OPEN_FIELDS = {
  contractingEntity: LEGAL_DRAFT_MARKER,
  serverRegion: LEGAL_DRAFT_MARKER,
  dpaStatus: LEGAL_DRAFT_MARKER,
  transferMechanism: LEGAL_DRAFT_MARKER,
  retentionPeriod: LEGAL_DRAFT_MARKER,
} as const;
