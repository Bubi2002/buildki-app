import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const dashboardSource = fs.readFileSync(path.join(root, "app/(tabs)/index.tsx"), "utf8");
const protocolDetailSource = fs.readFileSync(path.join(root, "app/protocol-detail.tsx"), "utf8");
const i18nSource = fs.readFileSync(path.join(root, "lib/i18n.ts"), "utf8");

describe("dashboard recording CTA", () => {
  it("uses the short German dashboard label", () => {
    expect(i18nSource).toContain("neue_aufnahme: 'Neue Aufnahme'");
    expect(dashboardSource).toContain("{t('neue_aufnahme')}");
    expect(dashboardSource).not.toContain("{t('neue_aufnahme_starten')}");
  });

  it("keeps the longer retry label outside the dashboard unchanged", () => {
    expect(protocolDetailSource).toContain("{t('neue_aufnahme_starten')}");
  });

  it("constrains the primary CTA to one responsive line", () => {
    expect(dashboardSource).toContain("numberOfLines={1}");
    expect(dashboardSource).toContain("adjustsFontSizeToFit");
    expect(dashboardSource).toContain("minimumFontScale={0.82}");
    expect(dashboardSource).toMatch(/quickActionPrimaryText:\s*\{[\s\S]*?flexShrink:\s*1,[\s\S]*?minWidth:\s*0,[\s\S]*?textAlign:\s*'center'/);
  });
});
