# 05 – UX-Flows und Akzeptanztests

## 1. Fotoanalyse

### Nutzerfluss
1. Projekt öffnen
2. „Aufnehmen“ wählen
3. Foto aufnehmen oder auswählen
4. optional Raum/Gewerk ergänzen
5. „Analysieren“
6. Ergebnis als Karten:
   - Beobachtet
   - Offen
   - mögliche Mängel
   - nächste Schritte
7. Nutzer bestätigt oder korrigiert
8. Mängel/Aufgaben übernehmen
9. Bericht speichern

### Akzeptanzkriterien
- Analyse startet in maximal 2 Klicks nach Fotoauswahl.
- Ladezustand sichtbar.
- Abbruch möglich.
- Unsicherheit wird sichtbar.
- Nutzer kann jede KI-Aussage ändern oder löschen.
- Mangel wird erst nach Bestätigung angelegt.

## 2. Matterport

### Nutzerfluss
1. Einstellungen → Integrationen
2. Matterport verbinden
3. Status prüfen
4. Projekt öffnen
5. Modell auswählen
6. Synchronisation
7. Analyse starten
8. Ergebnisse nach Etage und Raum

### Akzeptanzkriterien
- Sandbox-Fehler verständlich.
- Kein Token in der App.
- Synchronisationsfortschritt sichtbar.
- Wiederaufnahme nach Unterbrechung.
- Letzte erfolgreiche Synchronisation sichtbar.

## 3. Bericht

### Nutzerfluss
1. Berichtstyp wählen
2. Zeitraum wählen
3. Inhalte prüfen
4. Unterschrift/Anwesenheit ergänzen
5. PDF erzeugen
6. Teilen oder speichern

### Akzeptanzkriterien
- Bericht ist vor Export editierbar.
- Bilder sind Raum/Mangel zugeordnet.
- Versionsnummer wird angezeigt.
- Nachträgliche Änderung erzeugt neue Version.

## 4. Fehlerzustände

- kein Internet
- Upload unterbrochen
- KI nicht erreichbar
- API-Limit
- Matterport nicht freigeschaltet
- Datei zu groß
- nicht unterstütztes Format

Jeder Fehler benötigt:
- klare Ursache
- konkrete Handlung
- erneuter Versuch
- keine technischen Rohmeldungen für Endnutzer

## 5. Testfälle für KI

1. Bild zeigt fertigen Raum.
2. Bild zeigt Rohbau.
3. Bild zu dunkel.
4. Bild zeigt mehrere Räume.
5. Mangel eindeutig sichtbar.
6. möglicher Mangel unsicher.
7. Bauteil nicht sichtbar.
8. Nutzer korrigiert Raum.
9. Nutzer lehnt vorgeschlagenen Mangel ab.
10. Folgeanalyse mit Vergleich zum vorherigen Zustand.
