# protoKI Developer Pack v1.0

Dieses Paket ist als direkte Arbeitsgrundlage für Manus gedacht.

## Reihenfolge der Umsetzung

1. Backend-Grundlagen und Projekt-/Dateimodell
2. KI-Bildanalyse mit strukturierter JSON-Ausgabe
3. Mängel, Aufgaben und Berichte
4. Matterport-Anbindung nach Produktionsfreigabe
5. Flutter-Integration und TestFlight-Tests

## Enthaltene Pakete

- 01 Product Blueprint
- 02 AI Vision Spezifikation
- 03 Matterport Integration
- 04 API & Datenmodell
- 05 UX-Flows & Akzeptanztests
- JSON-Schemas für KI-Ausgaben
- OpenAPI-Entwurf für die wichtigsten Endpunkte

## Wichtige Grundsätze

- Matterport- und OpenAI-Schlüssel ausschließlich serverseitig speichern.
- KI muss Unsicherheiten sichtbar machen.
- Zwischen „nicht sichtbar“ und „nicht vorhanden“ unterscheiden.
- Jede Analyse ist nachvollziehbar, versioniert und einem Projekt zugeordnet.
- Alle KI-Ausgaben werden strukturiert gespeichert, nicht nur als Fließtext.
