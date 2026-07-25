import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TRADE_NAMES, TRADES, formatTradeLabel, getTradeName, getTradeNumber } from "../lib/trades";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("kanonische Gewerke", () => {
  it("führt alle Gewerke eindeutig und lückenlos nummeriert", () => {
    expect(TRADES).toHaveLength(16);
    expect(TRADES.map((trade) => trade.nr)).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    expect(new Set(TRADE_NAMES).size).toBe(16);
    expect(TRADES[0]).toEqual({ nr: 1, name: "Trockenbau" });
    expect(TRADES[15]).toEqual({ nr: 16, name: "Sonstiges" });
  });

  it("bildet Namen, Nummern und sichtbare Labels stabil ab", () => {
    expect(getTradeNumber("Elektro")).toBe(3);
    expect(getTradeNumber(" elektro ")).toBe(3);
    expect(getTradeNumber("Unbekannt")).toBe(16);
    expect(getTradeName(2)).toBe("Fliesen");
    expect(getTradeName(99)).toBe("Sonstiges");
    expect(formatTradeLabel("Sanitär")).toBe("4. Sanitär");
  });
});

describe("zentraler Gewerke-Scroll-Picker", () => {
  it("verwendet ein modales Snap-Scrollrad und schließt vor dem Öffnen die Tastatur", () => {
    const picker = source("components/trade-picker.tsx");
    expect(picker).toContain("snapToInterval={ITEM_HEIGHT}");
    expect(picker).toContain('decelerationRate="fast"');
    expect(picker).toContain("Keyboard.dismiss()");
    expect(picker).toContain("Gewerk auswählen");
    expect(picker).toContain("Übernehmen");
  });

  it.each([
    ["app/diary.tsx", "Gewerk zum Tagebuch hinzufügen"],
    ["app/defects.tsx", "Gewerk für den neuen Mangel auswählen"],
    ["app/attendance.tsx", "Gewerk der Person auswählen"],
    ["app/rooms.tsx", "Gewerk für den Raum auswählen"],
    ["app/matterport-viewer.tsx", "Gewerk für den Matterport-Pin auswählen"],
  ])("ist in %s eingebunden", (file, accessibilityLabel) => {
    const appSource = source(file);
    expect(appSource).toContain("<TradePicker");
    expect(appSource).toContain(accessibilityLabel);
  });

  it("speichert Tagebuch-Gewerke getrennt von Tätigkeitsdetails und hält Alt-Einträge kompatibel", () => {
    const store = source("lib/diary-store.ts");
    const diary = source("app/diary.tsx");
    expect(store).toContain("trades?: string[]");
    expect(diary).toContain("trades: [...selectedTrades]");
    expect(diary).toContain("item.trades?.length || item.activities.length");
    expect(diary).toContain("InputAccessoryView");
    expect(diary).toContain("keyboardDismissMode");
    expect(diary).toContain(">Fertig</Text>");
  });
});
