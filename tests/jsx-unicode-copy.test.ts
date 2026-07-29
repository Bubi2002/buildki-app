import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const babel = require("@babel/core") as {
  transformSync: (
    source: string,
    options: Record<string, unknown>,
  ) => { code?: string | null } | null;
};
const jsxUnicodePlugin = require("../babel-plugins/decode-jsx-unicode-escapes.js");

function transformJsx(source: string): string {
  const result = babel.transformSync(source, {
    ast: false,
    babelrc: false,
    code: true,
    compact: false,
    configFile: false,
    parserOpts: { plugins: ["jsx"] },
    plugins: [jsxUnicodePlugin],
  });

  if (!result?.code) throw new Error("Babel returned no transformed code");
  return result.code;
}

describe("JSX Unicode copy guard", () => {
  it("decodes the complete German pricing copy reported from the device", () => {
    const source = String.raw`
      const pricing = <>
        <Text>Tarif w\u00E4hlen</Text>
        <Text>J\u00E4hrlich</Text>
        <Text>140,00 \u20AC</Text>
        <Text>= 11,66 \u20AC/Monat (ca. 10% Ersparnis gegen\u00FCber Monatsabo)</Text>
        <Text>Jederzeit k\u00FCndbar zum Ende der Laufzeit</Text>
        <Text>14 Tage kostenlos testen \u2013 keine Kreditkarte erforderlich</Text>
        <Text>Preise zzgl. 19% MwSt. K\u00FCndigung jederzeit zum Ende der Laufzeit m\u00F6glich.</Text>
        <Text>Sichere Zahlungsabwicklung \u00FCber Stripe.</Text>
      </>;
    `;

    const code = transformJsx(source);

    expect(code).toContain("Tarif wählen");
    expect(code).toContain("Jährlich");
    expect(code).toContain("140,00 €");
    expect(code).toContain("11,66 €/Monat");
    expect(code).toContain("gegenüber Monatsabo");
    expect(code).toContain("Jederzeit kündbar");
    expect(code).toContain("testen – keine Kreditkarte");
    expect(code).toContain("Kündigung jederzeit");
    expect(code).toContain("Laufzeit möglich");
    expect(code).toContain("über Stripe");
    expect(code).not.toMatch(/\\u(?:\{[0-9a-fA-F]{1,6}\}|[0-9a-fA-F]{4})/);
  });

  it("decodes static JSX attributes and repeatedly escaped text", () => {
    const source = String.raw`
      const action = <Button accessibilityLabel="Tarif w\u00E4hlen">J\\u00E4hrlich</Button>;
    `;

    const code = transformJsx(source);

    expect(code).toMatch(/accessibilityLabel="Tarif w(?:ählen|\\xE4hlen)"/);
    expect(code).toContain("Jährlich");
    expect(code).not.toContain("\\u00E4");
    expect(jsxUnicodePlugin.decodeUnicodeEscapes(String.raw`J\\u00E4hrlich`)).toBe("Jährlich");
  });

  it("runs before the required Worklets Babel plugin", () => {
    const config = fs.readFileSync(path.join(root, "babel.config.js"), "utf8");
    const unicodePluginIndex = config.indexOf("decode-jsx-unicode-escapes.js");
    const workletsPluginIndex = config.indexOf("react-native-worklets/plugin");

    expect(unicodePluginIndex).toBeGreaterThanOrEqual(0);
    expect(workletsPluginIndex).toBeGreaterThan(unicodePluginIndex);
  });

  it("does not reactivate the legally disabled price or checkout flow", () => {
    const subscription = fs.readFileSync(path.join(root, "app/subscription.tsx"), "utf8");

    expect(subscription).toContain("Kaufabschluss gesperrt");
    expect(subscription).toContain("keinen Demo-Kauf");
    expect(subscription).not.toMatch(/12,99|140,00|createCheckoutSession|AsyncStorage/);
  });
});
