# 03 – Matterport Integration Spezifikation

## 1. Ziel

Matterport-Modelle serverseitig mit protoKI verbinden und später Panoramen sowie räumliche Metadaten für Baufortschritt und Mängelanalyse verwenden.

## 2. Sicherheitsvorgaben

- API-Token niemals in Flutter speichern.
- Token ausschließlich im Backend-Secret-Store.
- Zugriff mandantengetrennt.
- Token in Logs vollständig maskieren.
- Verbindung durch Admin einrichten.
- Widerruf und Rotation unterstützen.

## 3. Phase 1 – Verbindung

Funktionen:
- Matterport-Verbindung anlegen
- Verbindung testen
- sichtbare Modelle auflisten
- Modell per ID laden
- Modell einem protoKI-Projekt zuordnen
- Sandbox-Status verständlich anzeigen

## 4. Phase 2 – Synchronisation

Je Modell speichern:
- model_id
- Name
- Status
- Veröffentlichungsstatus
- letzte Synchronisation
- Etagen
- Räume/Zonen, soweit verfügbar
- Scanpositionen
- MatterTags
- Vorschaubilder/Panoramen, soweit API und Lizenz dies erlauben

## 5. Phase 3 – Analyse

Ablauf:
1. Modell synchronisieren
2. Panoramen erfassen
3. Duplikate und stark ähnliche Blickrichtungen reduzieren
4. Panoramen Räumen/Etagen zuordnen
5. KI-Analyse pro Raum
6. Gesamtergebnis aggregieren
7. Nutzerprüfung
8. Bericht erzeugen

## 6. Vergleich zweier Scans

Ergebnis:
- neue sichtbare Leistungen
- behobene Mängel
- neue mögliche Mängel
- Raumfortschritt alt/neu
- Stillstand
- unsichere Unterschiede

## 7. Backend-Endpunkte

- POST /integrations/matterport/connect
- GET /integrations/matterport/status
- GET /integrations/matterport/models
- POST /projects/{project_id}/matterport/link
- POST /projects/{project_id}/matterport/sync
- GET /projects/{project_id}/matterport/sync-status
- POST /projects/{project_id}/matterport/analyze
- GET /projects/{project_id}/matterport/results

## 8. UI

Matterport-Bereich:
- Verbindungsstatus
- Modell auswählen
- Synchronisieren
- letzte Synchronisierung
- Analyse starten
- Ergebnisse je Etage/Raum
- Fehler und fehlende Berechtigungen klar erklären

## 9. Akzeptanzkriterien Phase 1

- Token bleibt serverseitig.
- Modellliste wird geladen.
- Modell kann einem Projekt zugeordnet werden.
- Sandbox wird korrekt erkannt.
- Fehler werden nutzerverständlich angezeigt.
- Kein Token erscheint in App-Logs.
