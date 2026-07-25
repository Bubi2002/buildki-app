import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recordSource = readFileSync(resolve(process.cwd(), "app/(tabs)/record.tsx"), "utf8");

describe("sichtbare Kamera-Lichtsteuerung", () => {
  it("positioniert die obere Steuerung unterhalb der iPhone-Safe-Area", () => {
    expect(recordSource).toContain('top: insets.top + 8');
    expect(recordSource).toContain('maxWidth: "58%"');
    expect(recordSource).toContain('top: insets.top + 176');
  });

  it("zeigt den Lichtzustand als Text und barrierearme Aktion", () => {
    expect(recordSource).toContain('accessibilityLabel={flashMode === "on"');
    expect(recordSource).toContain('"LICHT EIN"');
    expect(recordSource).toContain('"LICHT AUS"');
    expect(recordSource).toContain('"AUTO"');
    expect(recordSource).toContain('minHeight: 44');
  });

  it("aktiviert Dauerlicht nur an der Rückkamera und schaltet es beim Kamerawechsel aus", () => {
    expect(recordSource).toContain('enableTorch={cameraFacing === "back" && flashMode === "on"}');
    expect(recordSource).toContain('if (next === "front") setFlashMode("off")');
    expect(recordSource).toContain('disabled={cameraFacing === "front"}');
  });
});
