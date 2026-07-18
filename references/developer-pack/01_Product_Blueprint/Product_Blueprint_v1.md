# 01 – protoKI Product Blueprint v1.0

## 1. Produktziel

protoKI ist eine KI-gestützte Plattform für Bauleitung und Baustellendokumentation. Sie wandelt Fotos, Sprache, Videos, Dokumente und künftig Matterport-Scans in strukturierte Berichte, Mängel, Aufgaben und Fortschrittsdaten um.

## 2. Zielgruppen

Primär:
- Bauleiter
- Architekten
- Ingenieurbüros
- Generalunternehmer
- Projektsteuerer

Sekundär:
- Sachverständige
- Hausverwaltungen
- Handwerksbetriebe
- Bauherrenvertretungen

## 3. Kernnutzen

- weniger Schreibarbeit
- schnellere Baustellendokumentation
- strukturierte Mängelverfolgung
- nachvollziehbarer Baufortschritt
- automatische Aufgaben und Fristen
- projektbezogener KI-Assistent

## 4. MVP

### Muss-Funktionen
- Benutzer und Unternehmen
- Projekte
- Baustellenfotos hochladen
- Audio aufnehmen oder hochladen
- KI-Analyse
- Bautagesbericht
- Mängelliste
- Aufgaben
- PDF-Export
- Rollen und Rechte
- TestFlight-fähige Flutter-Oberfläche

### Soll-Funktionen
- Excel-Export
- Raumzuordnung
- Bildmarkierungen
- Unterschrift
- Anwesenheitsliste
- Fristen und Erinnerungen

### Später
- Matterport
- IFC/BIM
- Soll-Ist-Terminvergleich
- Kosten- und Nachtragsanalyse
- Projektchat über alle Datenquellen

## 5. Produktprinzipien

1. Baustellentauglich: wenige Klicks, große Schaltflächen, offline-tolerant.
2. Nachvollziehbar: jede KI-Aussage braucht Datenquelle und Sicherheit.
3. Fachlich vorsichtig: keine definitive Aussage, wenn ein Bauteil nicht sichtbar ist.
4. Modular: Foto, Sprache, Matterport und Dokumente verwenden dieselbe Projektlogik.
5. Serverzentriert: Secrets, KI und Integrationen liegen im Backend.
6. Versioniert: Analysen und Berichte bleiben historisch nachvollziehbar.

## 6. Systemarchitektur

Flutter App
→ protoKI Backend
→ PostgreSQL
→ Objektspeicher
→ OpenAI Vision/Speech
→ Matterport API
→ PDF-/Excel-Service

## 7. Rollen

### Admin
- Unternehmen verwalten
- Benutzer einladen
- Integrationen konfigurieren
- alle Projekte sehen

### Projektleiter
- Projekte anlegen
- Mitglieder verwalten
- Berichte freigeben
- Exporte erstellen

### Bauleiter
- Medien erfassen
- Analysen starten
- Mängel und Aufgaben bearbeiten
- Berichte erstellen

### Gast/Auftragnehmer
- nur freigegebene Aufgaben/Mängel sehen
- Rückmeldung geben
- Nachweisfoto hochladen

## 8. Roadmap

### Release 1.0
- Projekte
- Fotos
- Sprache
- KI-Berichte
- Mängel
- Aufgaben
- PDF

### Release 1.1
- Excel
- Bildmarkierungen
- Unterschriften
- Anwesenheiten
- wiederverwendbare Berichtsvorlagen

### Release 1.2
- Matterport-Modellliste
- Scan-Synchronisation
- Raum-/Panorama-Zuordnung

### Release 2.0
- Fortschrittsvergleich
- Smart Timeline
- Projektchat
- Terminrisiken
