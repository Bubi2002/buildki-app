# protoKI – Entwicklungsrichtlinie

## Grundsatz

- Developer Pack = Zielarchitektur, KEIN Rewrite
- Bestehende Architektur (tRPC, AsyncStorage, Drizzle) beibehalten
- Neue Funktionen modular integrieren

## Priorität 1 (Produktiv nutzbarer Kern)

- Projekte (anlegen, bearbeiten, Mitglieder, Status)
- Medien (Fotos, Audio, Videos, Dokumente) inkl. Upload, Offline, Sync
- KI (Bildanalyse, Sprachanalyse, strukturierte JSON-Ergebnisse) – modular erweiterbar
- Berichte (Bautagesbericht, Mängelliste, Aufgaben, PDF)

## Priorität 2 (Architektur vorbereiten)

- Matterport (Modul vorbereiten, Backend-Struktur, Tokenverwaltung, Projektzuordnung)
- IFC, BIM, PDF-Pläne, Drohnenbilder

## Matterport Status

- Sandbox-Modus aktiv, Produktionsfreigabe beantragt
- Modul vorbereitet, wird erst nach Freigabe aktiviert

## KI-Architektur

- Modulare Analyse-Engine
- Datenquellen: Fotos, Sprache, Dokumente, Matterport, IFC
- Alle Quellen nutzen dieselbe Engine
- Strukturierte JSON-Ausgabe nach Schema

## Produktziel

protoKI = Intelligenter Bauassistent:
- Baufortschritt erkennen
- Offene Gewerke erkennen
- Mängel erkennen
- Aufgaben erzeugen
- Berichte erstellen
- Projektwissen aufbauen

## Entwicklungsprinzipien

Bei jeder neuen Funktion prüfen:
1. Spart sie dem Bauleiter Zeit?
2. Ist sie einfach zu bedienen?
3. Ist sie später erweiterbar?
4. Passt sie zur bestehenden Architektur?
5. Vermeidet sie technische Schulden?

## Technische Entscheidungen

- tRPC bleibt (kein REST-Wechsel)
- AsyncStorage für Offline-First, DB nur wo fachlich sinnvoll
- DB für: Projekte, Berichte, Mängel, Aufgaben, KI-Ergebnisse (langfristig)
- Übergang schrittweise

## Built-in LLM für Vision

- Model: `gemini-2.5-flash` (vision-fähig, JSON-Schema-Output)
- Aufruf via `invokeLLM()` mit `images` Array (base64 oder URL)
- `responseSchema` für strukturierte Ausgabe
- Kein externer API-Key nötig (built-in)
