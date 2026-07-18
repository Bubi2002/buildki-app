# protoKI – Produkt-Roadmap

> Letzte Aktualisierung: 19. Juli 2026

---

## Phase 1: Grundlagen (aktuell)

| Feature | Status | Beschreibung |
|---------|--------|--------------|
| Audio-Protokollierung | ✅ Fertig | Sprachaufnahme → KI-Transkription → Bautagesbericht |
| PDF-Export | ✅ Fertig | Professionelle PDF-Generierung mit Fotos, Logo, Branding |
| Projekt-Management | ✅ Fertig | Projekte erstellen, archivieren, Favoriten |
| Offline-First | ✅ Fertig | AsyncStorage, Offline-Queue, automatische Synchronisation |
| Mängel-Verwaltung | ✅ Fertig | Mängelliste, Status-Tracking, Export |
| Checklisten | ✅ Fertig | Vorlagen, Prüfpunkte, Fortschritt |
| Team-Verwaltung | ✅ Fertig | Kontakte, Rollen, Zuweisungen |
| Mehrsprachigkeit | ✅ Fertig | DE, EN, FR vollständig |
| KI-Bildanalyse (Backend) | ✅ Fertig | Modulare Vision-Engine, strukturierte JSON-Ausgabe |
| KI-Bildanalyse (App UI) | ✅ Fertig | Foto-Auswahl, Analyse-Flow, Ergebnis-Karten |
| Matterport (Sandbox) | ✅ Fertig | Backend-Service, App-UI, Feature-Gate |
| Settings Premium-Redesign | ✅ Fertig | iOS-Premium-Look, kompakte Karten, Animationen |

---

## Phase 2: KI-Erweiterung (nächste Schritte)

| Feature | Status | Beschreibung |
|---------|--------|--------------|
| Mängel aus KI-Analyse übernehmen | 🔲 Geplant | Bestätigungs-Flow: KI-Erkennung → Prüfung → Mängelliste |
| Aufgaben aus KI-Analyse ableiten | 🔲 Geplant | Automatische Task-Erstellung mit Gewerk-Zuweisung |
| Baufortschritts-Tracking | 🔲 Geplant | Zeitreihe: Fortschritt pro Projekt über Zeit |
| Multi-Foto-Vergleich | 🔲 Geplant | Vorher/Nachher-Analyse mit KI-Bewertung |
| Matterport Produktion | ⏳ Wartend | Aktivierung nach API-Freischaltung durch Matterport |
| Matterport → KI-Analyse | 🔲 Geplant | Panoramen aus Matterport durch Vision-Engine analysieren |

---

## Phase 3: Automatisierung & Integration

| Feature | Status | Beschreibung |
|---------|--------|--------------|
| Automatische Berichte | 🔲 Geplant | Wöchentliche Baufortschritts-Berichte per KI |
| E-Mail-Integration | 🔲 Geplant | Protokolle/Berichte automatisch per E-Mail versenden |
| Dropbox-Sync | 🔲 Geplant | Projektordner automatisch mit Dropbox abgleichen |
| IFC/BIM-Anbindung | 🔲 Geplant | 3D-Modelle als Analysegrundlage |
| Dokument-Analyse | 🔲 Geplant | Pläne, Leistungsverzeichnisse, Verträge analysieren |
| Video-Analyse | 🔲 Geplant | Baustellenvideos durch Vision-Engine |

---

## Phase 4: Skalierung

| Feature | Status | Beschreibung |
|---------|--------|--------------|
| Multi-User / Rollen | 🔲 Geplant | Team-Zugriff, Berechtigungen, Audit-Trail |
| Cloud-Sync | 🔲 Geplant | Projekte geräteübergreifend synchronisieren |
| Push-Benachrichtigungen | 🔲 Geplant | Erinnerungen, Frist-Warnungen, Mangel-Updates |
| Dashboard-Analytics | 🔲 Geplant | Projektübergreifende KPIs und Trends |
| API für Drittanbieter | 🔲 Geplant | REST-API für externe Systeme (ERP, Bauprojekt-SW) |

---

## Architektur-Prinzipien

1. **Modular**: Jede Datenquelle (Foto, Audio, Matterport, IFC) nutzt dieselbe Analyse-Pipeline
2. **Offline-First**: Alle Kernfunktionen ohne Internetverbindung nutzbar
3. **Sicher**: API-Tokens nur serverseitig, keine Secrets in der App
4. **Erweiterbar**: Neue Quellen können ohne Umbau der bestehenden Architektur angebunden werden
5. **Kosteneffizient**: Lokale Verarbeitung wo möglich, KI-Calls nur bei Bedarf

---

## Legende

| Symbol | Bedeutung |
|--------|-----------|
| ✅ | Fertig und ausgeliefert |
| 🔄 | In Arbeit |
| ⏳ | Wartend (externe Abhängigkeit) |
| 🔲 | Geplant (noch nicht begonnen) |
