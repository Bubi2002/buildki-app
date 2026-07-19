# Launch Sprint Audit

## Was existiert (✅)

- Projekte erstellen/verwalten (projects.tsx) ✅
- Schneller Projektwechsel (dashboard.tsx) ✅
- Fotos aufnehmen (index.tsx mit CameraView) ✅
- Sprachaufnahme (index.tsx) ✅
- KI-Fotoanalyse (photo-analysis.tsx) ✅
- Review vor Übernahme ✅
- Confidence-Anzeige ✅
- Undo-Funktion ✅
- Analyse-Historie (analysis-history.tsx) ✅
- Mängelverwaltung (defects.tsx + defect-store.ts) ✅
- Aufgaben (tasks.tsx) ✅
- PDF-Generator (lib/pdf-generator.ts) ✅
- Berichte (protocol-merge.tsx) ✅
- AI Site Assistant (ai-assistant.tsx) ✅
- Timeline Engine (lib/timeline-engine.ts) ✅
- Smart Timeline UI (smart-timeline.tsx) ✅
- Knowledge Layer ✅

## Was fehlt oder unvollständig (❌)

1. **Räume/Geschosse anlegen** – Kein dedizierter Screen. Nur Grundriss-Upload. Braucht: Raum-/Geschoss-Verwaltung pro Projekt.
2. **Timeline-Integration** – Timeline Engine existiert, aber wird NIRGENDS aufgerufen (kein emit() in index.tsx, defects, tasks etc.)
3. **Dokumente hochladen (Basis)** – document-ai.tsx existiert, aber braucht Prüfung ob Upload funktioniert
4. **Bautagesbericht** – diary.tsx existiert, aber Prüfung nötig
5. **Mängelbericht** – defect-pdf-export.ts existiert, aber Prüfung nötig
6. **Construction Brain** – ai-assistant.tsx nutzt trpc.support.chat, aber sollte ausschließlich Knowledge Layer nutzen (kein Server-Call nötig für lokale Daten)

## Prioritäten für diesen Sprint

1. Räume/Geschosse pro Projekt anlegen
2. Timeline-Events aus allen Modulen emittieren (Recording, Fotos, Defects, Tasks, Berichte)
3. Construction Brain lokal auf Knowledge Layer umstellen
4. End-to-End Flow verifizieren
