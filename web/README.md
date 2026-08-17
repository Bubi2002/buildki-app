# buildki.app – Einladungs-Links (Universal Links)

Damit ein Einladungs-Link (`https://buildki.app/join?token=…`) entweder **die App öffnet**
(falls installiert) oder **zum App Store** führt (falls nicht), müssen diese Dateien auf der
Domain `buildki.app` per **HTTPS** erreichbar sein:

## 1. Apple App Site Association
Datei: `.well-known/apple-app-site-association`
- Erreichbar unter: `https://buildki.app/.well-known/apple-app-site-association`
- **Wichtig:**
  - Kein `.json` im Dateinamen.
  - Muss mit `Content-Type: application/json` ausgeliefert werden.
  - **Keine** Weiterleitung (kein 301/302), direkt 200.
  - Gültiges HTTPS-Zertifikat.
- Enthält die App-ID: `TLHL2MRJB4.space.manus.protokoll.app.t20250614001800`
  (Apple Team ID `TLHL2MRJB4` + Bundle-ID). Beim nächsten Build muss die App
  `applinks:buildki.app` beanspruchen — das ist in `app.config.js` bereits eingetragen
  (`ios.associatedDomains`).

## 2. Weiterleitungsseite
Datei: `join/index.html`
- Erreichbar unter: `https://buildki.app/join`
- Öffnet sich nur, wenn die App **nicht** installiert ist → leitet dann zum App Store
  (`https://apps.apple.com/app/id6780242629`) weiter.

## 3. App Store
- Der Link greift erst, wenn die App **öffentlich im App Store** ist (App-ID 6780242629).
  In der TestFlight-Phase öffnet der App-Store-Link die Store-Seite, aber Installation
  ist nur für TestFlight-Tester möglich.

## 4. Android (optional)
Für Android App Links zusätzlich `.well-known/assetlinks.json` hosten mit dem
SHA-256-Fingerprint des App-Signing-Keys (aus der Google Play Console bzw.
`eas credentials`). Beispiel:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "space.manus.protokoll.app.t20250614001800",
    "sha256_cert_fingerprints": ["<SHA256_AUS_PLAY_CONSOLE>"]
  }
}]
```

## Testen
- iOS: nach Live-Schaltung der Dateien einen **neuen Build** installieren, dann den Link
  antippen. Apple cached die AASA; ggf. App neu installieren.
- Prüfen der AASA: `https://buildki.app/.well-known/apple-app-site-association` im Browser
  öffnen → sollte den JSON-Inhalt direkt anzeigen.
