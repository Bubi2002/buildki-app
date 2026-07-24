# BuildKI v1.0.42 Build 7 – Wiederherstellungsanleitung

## Überblick

Diese Anleitung beschreibt, wie die Version 1.0.42 (Build 7) vollständig wiederhergestellt werden kann – sowohl der Quellcode als auch die Build-Artefakte und die Konfiguration.

---

## Methode 1: Git-Checkout (empfohlen)

Die schnellste Methode zur Wiederherstellung des exakten Quellcode-Stands:

```bash
# Tag auschecken (detached HEAD)
git checkout v1.0.42-build7

# Oder: Release-Branch auschecken
git checkout release/1.0.42

# Dependencies installieren
npm ci

# Verifizieren
grep '"version"' app.config.js  # Sollte "1.0.42" zeigen
```

---

## Methode 2: Manus Webdev Rollback

Falls das Projekt über die Manus-Plattform verwaltet wird:

1. Im Manus-Chat den Checkpoint `9d345d1d` (oder den nächsten nach dem Build) verwenden
2. Oder: `webdev_rollback_checkpoint` mit der Version-ID aufrufen

---

## Methode 3: Aus dem Release-Archiv

Falls das Git-Repository nicht verfügbar ist:

1. Die Konfigurationsdateien aus `config-backup/` in ein frisches Expo-Projekt kopieren
2. `npm ci` ausführen
3. Die Datenbank-Migrationen aus `database-backup/drizzle/` anwenden
4. Die Secrets (siehe Release_1.0.42.md) neu konfigurieren

---

## iOS-Build reproduzieren

```bash
# 1. Expo-Token setzen
export EXPO_TOKEN="<your-expo-token>"

# 2. Auf den Release-Tag wechseln
git checkout v1.0.42-build7

# 3. Dependencies installieren
npm ci

# 4. EAS Build starten (identische Konfiguration)
npx eas build --platform ios --profile testflight --clear-cache

# 5. An TestFlight übermitteln
npx eas submit --platform ios --profile testflight --latest
```

---

## IPA direkt installieren

Die archivierte IPA-Datei (`BuildKI_v1.0.42_Build7.ipa`) kann:

1. **Über Apple Configurator 2** auf ein registriertes Testgerät installiert werden
2. **Über Transporter** erneut an App Store Connect hochgeladen werden
3. **Über EAS** mit `eas submit --path ./BuildKI_v1.0.42_Build7.ipa` eingereicht werden

**Hinweis:** Die IPA ist mit dem Distribution-Zertifikat signiert und kann nur auf Geräten installiert werden, die im Apple Developer Portal registriert sind, oder über TestFlight.

---

## Datenbank wiederherstellen

Das Schema ist in `database-backup/drizzle/schema.ts` dokumentiert. Um die Datenbank-Struktur wiederherzustellen:

```bash
# Drizzle-Migrationen anwenden
npx drizzle-kit generate
npx drizzle-kit migrate
```

**Achtung:** Dies stellt nur die Struktur wieder her, nicht die Daten. Für ein vollständiges Daten-Backup muss ein separater MySQL-Dump erstellt werden.

---

## Secrets wiederherstellen

Alle erforderlichen Secrets sind in `Release_1.0.42.md` unter "EAS & Expo Secrets" dokumentiert (nur Namen, keine Werte). Die tatsächlichen Werte müssen aus dem jeweiligen Dienst bezogen werden:

| Dienst | Wo die Werte zu finden sind |
|--------|----------------------------|
| Expo | expo.dev → Account Settings → Access Tokens |
| App Store Connect | appstoreconnect.apple.com → Users & Access → Keys |
| Matterport | my.matterport.com → Settings → API |
| Stripe | dashboard.stripe.com → Developers → API Keys |
| Dropbox | dropbox.com/developers → App Console |
| SMTP (Strato) | strato.de → E-Mail-Verwaltung |
| Manus Platform | Automatisch bereitgestellt (DATABASE_URL, JWT_SECRET, etc.) |

---

## Checkliste für vollständige Wiederherstellung

- [ ] Git-Tag `v1.0.42-build7` ausgecheckt
- [ ] `npm ci` erfolgreich
- [ ] `npx tsc --noEmit` ohne Fehler
- [ ] Alle Secrets konfiguriert
- [ ] Datenbank-Schema angewendet
- [ ] EAS Build erfolgreich
- [ ] TestFlight-Upload bestätigt
- [ ] App auf Testgerät funktionsfähig

---

## Kontakt

**Verantwortlich:** Dipl. Ing. (FH) Jörg Iserloh  
**Unternehmen:** immobau-ka GmbH  
**E-Mail:** info@immobau-ka.de  
**Erstellt:** 24. Juli 2026
