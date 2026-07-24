# BuildKI – Release Notes v1.0.42 (Build 7)

## Release-Informationen

| Feld | Wert |
|------|------|
| **Version** | 1.0.42 |
| **Build-Nummer** | 7 |
| **Datum** | 23. Juli 2026 |
| **Plattform** | iOS (TestFlight) |
| **EAS Build ID** | `d9306254-9c0a-46f2-a884-df0efe9a224d` |
| **Submission ID** | `0b79baa4-af2c-4f2d-8ed5-7773b211b7bb` |
| **ASC App ID** | 6780242629 |
| **Bundle ID** | `space.manus.protokoll.app.t20250612184038` |
| **Git Tag** | `v1.0.42-build7` |
| **Git Branch** | `release/1.0.42` |

---

## Technische Versionen

| Paket | Version |
|-------|---------|
| Expo SDK | 54.0.0 |
| React Native | 0.81.5 |
| React | 19.1.0 |
| TypeScript | 5.9.3 |
| NativeWind | 4.2.1 |
| Expo Router | 6.0.19 |
| babel-preset-expo | 54.0.12 |
| EAS CLI | >= 12.0.0 |
| Node.js (Build) | 22.x |

---

## Implementierte Features

### Kern-Funktionen
- Audio-Aufnahme mit Echtzeit-Transkription (Whisper)
- KI-gestützte Protokoll-Generierung (GPT)
- Projekt-Management mit Farbkodierung und Nummerierung
- PDF-Export mit Firmenbranding (Logo, Kopf-/Fußzeile)
- Cloud-Synchronisation (OAuth-Login, Datenbank)
- Offline-Modus mit automatischer Sync-Queue

### Aufnahme & Verarbeitung
- Audio + Foto Modus (Diktieren mit Kamera für Fotos)
- Nur-Audio-Modus (reines Diktieren)
- Sprachbefehle während Aufnahme ("Foto", "Markierung")
- Automatische GPS-Standort-Ermittlung
- Wetter-Integration (Temperatur, Niederschlag)
- Hintergrund-Verarbeitung (App sofort bedienbar nach Stopp)
- Pause/Fortsetzen-Funktion

### Protokoll-Management
- 6 vordefinierte Vorlagen (Baustellenbericht, Besprechungsnotiz, Mängelliste, Tagesbericht, Abnahmeprotokoll, Zusammenfassung)
- Eigene Vorlagen erstellen und bearbeiten
- Protokoll-Bearbeitung nach Generierung
- KI-Zusammenfassung pro Protokoll
- Volltextsuche über alle Protokolle
- Favoriten, Tags, Archiv
- Automatische Nummerierung (BST-001, BST-002...)
- Protokoll-Vergleich (Diff-Ansicht)
- Batch-Aktionen (Mehrfachauswahl)

### Foto & Dokumentation
- Foto-Aufnahme während Audio-Aufnahme
- Foto-Annotation (Zeichnen, Text, Pfeile)
- Zoom/Pan für präzise Markierungen
- Fotos inline bei Abschnitten im PDF
- Foto-Captions manuell bearbeitbar
- Vorher/Nachher-Vergleiche
- Grundriss-Markierung (Pläne hochladen, Pins setzen)

### Mängelmanagement
- Mängel erfassen mit Status (offen/in Bearbeitung/erledigt)
- Priorität, Fotos, Standort, Frist, Zuständiger
- Mängel-PDF-Export
- Mängel-Kommentare und Historie

### Bautagebuch
- Automatisches Tagesprotokoll aus allen Aufnahmen
- Wetter, Arbeiter, Gewerke, Materialien

### Checklisten
- Vordefinierte Prüflisten (Abnahme, Brandschutz, Elektro)
- Eigene Checklisten erstellen
- Checklisten-PDF-Export

### Matterport-Integration
- 3D-Modell-Viewer mit Pin-Markierungen
- KI-Analyse von Matterport-Scans
- Raum-basierte Dokumentation

### Export & Teilen
- PDF-Export mit konfigurierbarem Branding
- WhatsApp-Sharing
- E-Mail-Versand (SMTP)
- CSV/Excel-Export für Aufgabenlisten
- Projekt-Gesamtexport
- Cloud-Speicher (Dropbox, Google Drive, iCloud, OneDrive)
- Dateinamen-Schema konfigurierbar

### Weitere Features
- Digitale Unterschriften (Rollen-basiert)
- Biometrische Sperre (Face ID/Fingerabdruck)
- Push-Benachrichtigungen (Fristen, Mängel)
- Kalender-Integration
- Zeiterfassung mit Timer
- QR-Code-Scanner
- Mehrsprachigkeit (DE/EN/FR)
- Dunkelmodus
- Statistik-Dashboard
- Team-Kollaboration
- Onboarding-Tutorial
- Backup/Restore (JSON)
- Datenschutz & Einwilligung (DSGVO-konform)
- Subscription-Management (Stripe)

---

## Behobene Bugs in diesem Build

| Bug | Lösung |
|-----|--------|
| iOS Build scheiterte an Private Class Fields (`#x`, `#y`, `#width`, `#height`) in `DOMRectReadOnly.js` | `babel-preset-expo` von 57.0.4 auf 54.0.12 korrigiert |
| `expo-contacts@57.0.2` inkompatibel mit SDK 54 | Downgrade auf 15.0.11 |
| `expo-mail-composer@56.0.4` inkompatibel | Downgrade auf 15.0.8 |
| `expo-video-thumbnails@57.0.1` inkompatibel | Downgrade auf 10.0.8 |
| `@react-native-community/netinfo@12.0.1` inkompatibel | Downgrade auf 11.4.1 |
| `expo-modules-autolinking` als direkte Dependency | Entfernt (wird von expo intern bereitgestellt) |
| `expo-asset` als direkte Dependency | Entfernt (wird von expo@54 intern bereitgestellt) |
| TestFlight-Submission fehlte `ascAppId` | `6780242629` zu eas.json hinzugefügt |

---

## Bekannte Restpunkte

1. **Sie/Du-Inkonsistenz** im Datenschutz-Screen (legal.tsx) – verwendet noch "Sie" (bewusst formell für rechtliche Texte)
2. **Lokaler Bundle-Test** konnte auf dem 1GB-RAM Cloud-PC nicht durchgeführt werden (nur EAS Cloud Build getestet)
3. **Video-Modus** wurde in früheren Versionen entfernt – nur Audio + Foto und Nur-Audio verfügbar
4. **Matterport-Integration** erfordert gültige API-Tokens (Token ID, Token Secret, SDK Key)
5. **Stripe-Integration** erfordert Live-Keys für Produktiv-Zahlungen (aktuell Test-Modus)
6. **Push-Benachrichtigungen** funktionieren nur auf physischen Geräten (nicht im Simulator)

---

## EAS & Expo Secrets (Namen – keine Klartext-Werte)

### Build-Umgebung (EAS)
| Secret | Zweck |
|--------|-------|
| `EXPO_TOKEN` | EAS CLI Authentifizierung |
| `EXPO_PUBLIC_ENV` | Environment-Flag (development/production) |

### App Store Connect (Submit)
| Secret | Zweck |
|--------|-------|
| `AuthKey_3K2KU8YZXY.p8` | ASC API Private Key (Datei) |
| `ascApiKeyId` | 3K2KU8YZXY |
| `ascApiKeyIssuerId` | 399f93d6-934a-4c82-bc2f-3b2e7ccb3da8 |
| `ascAppId` | 6780242629 |

### Server-Umgebung (Manus Platform)
| Secret | Zweck |
|--------|-------|
| `DATABASE_URL` | MySQL-Datenbankverbindung |
| `JWT_SECRET` | Token-Signierung |
| `BUILT_IN_FORGE_API_KEY` | Manus LLM API |
| `BUILT_IN_FORGE_API_URL` | Manus LLM Endpoint |
| `MATTERPORT_SDK_KEY` | Matterport 3D-Viewer |
| `MATTERPORT_TOKEN_ID` | Matterport API Auth |
| `MATTERPORT_TOKEN_SECRET` | Matterport API Auth |
| `DROPBOX_APP_KEY` | Dropbox-Integration |
| `DROPBOX_APP_SECRET` | Dropbox-Integration |
| `STRIPE_SECRET_KEY` | Zahlungsabwicklung |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook-Verifizierung |
| `STRIPE_MONTHLY_PRICE_ID` | Monatsabo-Preis |
| `STRIPE_YEARLY_PRICE_ID` | Jahresabo-Preis |
| `SMTP_HOST` | E-Mail-Versand |
| `SMTP_PORT` | E-Mail-Versand |
| `SMTP_USER` | E-Mail-Versand |
| `SMTP_PASS` | E-Mail-Versand |
| `OAUTH_SERVER_URL` | OAuth-Authentifizierung |
| `OWNER_OPEN_ID` | Admin-Identifikation |
| `EXPO_PUBLIC_API_URL` | Client → Server URL |

---

## Ordnerstruktur des Release-Archivs

```
Releases/1.0.42/
├── BuildKI_v1.0.42_Build7.ipa          ← Fertige iOS-App (21 MB)
├── Release_1.0.42.md                    ← Diese Datei
├── RESTORE.md                           ← Wiederherstellungsanleitung
├── config-backup/
│   ├── app.config.js
│   ├── babel.config.js
│   ├── eas.json
│   ├── metro.config.js
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
└── database-backup/
    ├── db.ts                            ← Server-DB-Konfiguration
    └── drizzle/
        ├── schema.ts                    ← Datenbank-Schema
        ├── relations.ts
        ├── 0000_elite_eternals.sql      ← Migration
        └── meta/
            ├── 0000_snapshot.json
            └── _journal.json
```
