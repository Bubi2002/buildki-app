# BuildKI – End-to-End Testplan

## Ziel
Vollständiger Funktionstest aller Kernfeatures auf einem echten iPhone (Expo Go oder TestFlight-Build).

---

## Voraussetzungen

| Punkt | Status |
|-------|--------|
| iPhone mit Expo Go installiert | ☐ |
| QR-Code der App gescannt | ☐ |
| Internetverbindung vorhanden | ☐ |
| Matterport Token ID + Secret bereit | ☐ |
| Mindestens ein Matterport-Modell vorhanden | ☐ |

---

## Test 1: Projekt erstellen

| Schritt | Erwartetes Ergebnis | OK? |
|---------|---------------------|-----|
| App öffnen → Onboarding durchlaufen | Alle 5 Slides angezeigt, "Los geht's" führt zur App | ☐ |
| Tab "Werkzeuge" antippen | Dashboard mit Tool-Grid erscheint | ☐ |
| Projekt-Auswahl oben antippen | Projekt-Picker öffnet sich | ☐ |
| "Neues Projekt" antippen | Formular: Name, Beschreibung, Farbe, Präfix | ☐ |
| Projekt "Testprojekt" erstellen | Projekt erscheint in Liste, ist aktiv | ☐ |

---

## Test 2: Audio-Aufnahme + Fotos

| Schritt | Erwartetes Ergebnis | OK? |
|---------|---------------------|-----|
| Tab "Aufnahme" antippen | Aufnahme-Screen mit Mikrofon-Button | ☐ |
| Modus "Audio + Foto" auswählen | Kamera-Preview erscheint | ☐ |
| Aufnahme starten (roter Button) | Timer läuft, Wellenform sichtbar | ☐ |
| Während Aufnahme: "Markierung" sagen | Markierung wird gesetzt (visuelles Feedback) | ☐ |
| Foto-Button antippen | Foto wird aufgenommen, Thumbnail erscheint | ☐ |
| 30-60 Sekunden sprechen, dann stoppen | Aufnahme beendet, Verarbeitung startet | ☐ |
| Fortschrittsanzeige beobachten | Upload → Transkription → Protokoll (Häkchen) | ☐ |
| Protokoll erscheint in Liste | Status "Fertig", Titel generiert | ☐ |

---

## Test 3: Protokoll-Detail und KI-Ergebnis

| Schritt | Erwartetes Ergebnis | OK? |
|---------|---------------------|-----|
| Protokoll antippen | Detail-Ansicht öffnet sich | ☐ |
| Protokolltext prüfen | Strukturierter Text, korrektes Datum, keine Halluzinationen | ☐ |
| Fotos prüfen | Fotos sind dem richtigen Abschnitt zugeordnet | ☐ |
| To-Do-Liste prüfen | Aufgaben aus dem Gespräch extrahiert | ☐ |
| Metadaten prüfen | Datum, Uhrzeit, Standort, Wetter korrekt | ☐ |

---

## Test 4: Mängelliste

| Schritt | Erwartetes Ergebnis | OK? |
|---------|---------------------|-----|
| Werkzeuge → "Mängel" antippen | Mängel-Screen öffnet sich | ☐ |
| "+" Button → Neuen Mangel erstellen | Formular: Titel, Beschreibung, Priorität, Gewerk, Foto | ☐ |
| Foto hinzufügen | Kamera/Galerie-Picker, Foto wird gespeichert | ☐ |
| Mangel speichern | Erscheint in Liste mit Status "Offen" | ☐ |
| Status ändern (antippen) | Status-Auswahl mit 8 Optionen | ☐ |
| Filter nach Status | Nur gefilterte Mängel angezeigt | ☐ |

---

## Test 5: PDF erzeugen und teilen

| Schritt | Erwartetes Ergebnis | OK? |
|---------|---------------------|-----|
| Protokoll-Detail → Export-Button | PDF wird generiert | ☐ |
| PDF-Vorschau prüfen | Logo, Header, Text, Fotos, Seitenzahlen korrekt | ☐ |
| "Teilen" antippen | iOS Share-Sheet öffnet sich | ☐ |
| Per WhatsApp/Mail senden | PDF kommt korrekt an | ☐ |
| Werkzeuge → "Mängel-PDF" | Mängel-Export-Screen mit Filtern | ☐ |
| Export mit ausgewählten Mängeln | PDF mit Zusammenfassung und Details | ☐ |

---

## Test 6: Matterport 3D-Viewer

| Schritt | Erwartetes Ergebnis | OK? |
|---------|---------------------|-----|
| Werkzeuge → "Matterport" | Matterport-Screen öffnet sich | ☐ |
| Token ID + Secret eingeben | Verbindung wird geprüft, "Verbunden" angezeigt | ☐ |
| Modell-Liste laden | Alle eigenen Modelle erscheinen | ☐ |
| Modell auswählen → "3D öffnen" | WebView lädt 3D-Modell | ☐ |
| Im Modell navigieren (Pan/Zoom) | Flüssige Navigation | ☐ |
| Pin setzen (Mangel/Notiz) | Pin-Modal öffnet sich, Pin wird gespeichert | ☐ |
| Räume importieren | Etagen und Räume aus Modell in App übernommen | ☐ |

---

## Test 7: Offline-Synchronisierung

| Schritt | Erwartetes Ergebnis | OK? |
|---------|---------------------|-----|
| Flugmodus aktivieren | "Offline"-Banner erscheint | ☐ |
| Aufnahme starten und beenden | Aufnahme wird lokal gespeichert | ☐ |
| Mangel erstellen | Mangel wird lokal gespeichert | ☐ |
| Flugmodus deaktivieren | Banner verschwindet, Sync startet | ☐ |
| Aufnahme wird verarbeitet | Protokoll erscheint nach Sync | ☐ |

---

## Test 8: Weitere Features

| Feature | Test | OK? |
|---------|------|-----|
| Bautagebuch | Werkzeuge → Tagebuch → Eintrag erstellen | ☐ |
| Checklisten | Werkzeuge → Checklisten → Prüfpunkte abhaken | ☐ |
| Zeiterfassung | Werkzeuge → Zeiterfassung → Timer starten/stoppen | ☐ |
| KI-Bericht | Werkzeuge → KI-Bericht → Berichtstyp wählen → generieren | ☐ |
| Grundriss | Werkzeuge → Grundriss → Plan laden → Markierung setzen | ☐ |
| Team | Werkzeuge → Team → Mitglied hinzufügen | ☐ |
| Anwesenheit | Werkzeuge → Anwesenheit → Firma + Zeiten eintragen | ☐ |
| Export-Center | Werkzeuge → Export → Firmendaten eingeben → PDF testen | ☐ |

---

## Bekannte Einschränkungen (Web-Preview)

- Kamera/Mikrofon funktionieren nur auf echtem Gerät
- Haptics nur auf echtem Gerät
- Push-Benachrichtigungen nur auf echtem Gerät
- Biometrische Sperre nur auf echtem Gerät
- Matterport WebView kann in Web-Preview eingeschränkt sein

---

## Fehler-Dokumentation

| Nr. | Screen | Beschreibung | Priorität | Status |
|-----|--------|--------------|-----------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## Abnahmekriterien für Beta

- [ ] Alle 8 Haupt-Tests bestanden
- [ ] Kein Crash während der Tests
- [ ] PDF-Export funktioniert vollständig
- [ ] Matterport-Modell lädt und ist navigierbar
- [ ] Offline-Aufnahme wird nach Reconnect verarbeitet
- [ ] Alle Texte auf Deutsch
- [ ] Touch-Targets mindestens 44x44pt
