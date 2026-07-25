import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const gallery = source("app/photo-gallery.tsx");
const store = source("lib/project-photo-store.ts");

describe("aktive Projektfoto-Galerie", () => {
  it("bietet Kamera, Mehrfachimport und Single-Flight-Schutz direkt im Projekt", () => {
    expect(gallery).toContain("requestCameraPermissionsAsync");
    expect(gallery).toContain("launchCameraAsync");
    expect(gallery).toContain("launchImageLibraryAsync");
    expect(gallery).toContain("allowsMultipleSelection: true");
    expect(gallery).toContain("selectionLimit: 20");
    expect(gallery).toContain("createAsyncInvocationGuard");
    expect(gallery).toContain("FOTO AUFNEHMEN");
  });

  it("führt Protokollfotos und direkte Projektfotos in einer Galerie zusammen", () => {
    expect(gallery).toContain('AsyncStorage.getItem("protocols")');
    expect(gallery).toContain("getDirectProjectPhotos(projectId)");
    expect(gallery).toContain('source: "protocol"');
    expect(gallery).toContain("directPhotos.forEach");
    expect(gallery).toContain("allPhotos.sort");
  });

  it("ermöglicht Metadaten, Gewerkezuordnung, Löschung und gemeinsamen Export", () => {
    expect(gallery).toContain("updateDirectProjectPhoto");
    expect(gallery).toContain("deleteDirectProjectPhoto");
    expect(gallery).toContain("Gewerk für das Projektfoto auswählen");
    expect(gallery).toContain("Alle Projektfotos exportieren");
    expect(gallery).toContain('pathname: "/cloud-photo-export"');
  });
});

describe("persistenter Projekfoto-Speicher", () => {
  it("speichert Projekt-ID, Originaldateiname, Quelle und Zeitstempel", () => {
    expect(store).toContain('const PROJECT_PHOTOS_KEY = "project-direct-photos-v1"');
    expect(store).toContain("projectId: input.projectId");
    expect(store).toContain("originalFileName");
    expect(store).toContain("storedFileName");
    expect(store).toContain("createdAt: createdAt.toISOString()");
  });

  it("kopiert native Dateien persistent und löscht nur direkt verwaltete Dateien", () => {
    expect(store).toContain('Platform.OS !== "web"');
    expect(store).toContain("FileSystem.copyAsync");
    expect(store).toContain("deleteDirectProjectPhoto");
    expect(store).toContain("FileSystem.deleteAsync");
  });
});
