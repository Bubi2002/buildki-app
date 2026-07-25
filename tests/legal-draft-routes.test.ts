import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Nicht-Release-Rechtsentwurf", () => {
  it("kennzeichnet fehlende Fakten und blockiert eine Veröffentlichung", () => {
    const draft = read("lib/legal-draft.ts");
    expect(draft).toContain("OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN");
    expect(draft).toContain("LEGAL_RELEASE_BLOCKED = true");
    expect(draft).toContain("info@iserloh.net");
  });

  it("entfernt frühere widersprüchliche Anbieter- und Sicherheitsbehauptungen", () => {
    const appLegal = read("app/legal.tsx");
    const publicLegal = read("server/legal-pages.ts");
    const combined = `${appLegal}\n${publicLegal}`;

    for (const forbidden of [
      "info@ciconcepts.net",
      "Iserloh Bau GmbH",
      "Steuernummer: 34413/61771",
      "IBAN: DE19",
      "Keine personenbezogenen Daten werden an KI-Dienste übermittelt",
      "Transkriptionen werden vor der KI-Verarbeitung anonymisiert",
      "TLS 1.3 verschlüsselt, EU-Rechenzentrum",
      "durch Löschen der App vollständig",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("registriert alle dauerhaft vorgesehenen Rechts- und Supportpfade", () => {
    const routes = read("server/legal-pages.ts");
    const index = read("server/_core/index.ts");

    for (const route of [
      "/datenschutz",
      "/impressum",
      "/nutzungsbedingungen",
      "/privacy-choices",
      "/support",
    ]) {
      expect(routes).toContain(`app.get(\"${route}\"`);
    }
    expect(index).toContain("registerLegalPages(app)");
  });

  it("macht Prüfstatus, kombinierten Export und vollständige Kontolöschung sichtbar", () => {
    const appLegal = read("app/legal.tsx");
    const dataRights = read("components/data-rights-section.tsx");
    const accountRouter = read("server/account-router.ts");

    expect(appLegal).toContain("NICHT VERÖFFENTLICHUNGSFÄHIG");
    expect(appLegal).toContain("<DataRightsSection />");
    expect(dataRights).toContain("shareCombinedDataExport");
    expect(dataRights).toContain("deleteAccount.mutateAsync");
    expect(dataRights).toContain("deleteAllLocalUserData");
    expect(dataRights).toContain("KONTO ENDGÜLTIG LÖSCHEN");
    expect(accountRouter).toContain("exportData: protectedProcedure.query");
    expect(accountRouter).toContain("deleteAccount: protectedProcedure");
    expect(appLegal).not.toContain("LOCAL_PARTIAL_REVIEW_EXPORT");
    expect(appLegal).not.toContain("Nur lokale Daten löschen");
  });
});
