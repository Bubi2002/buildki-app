# BuildKI – Backend-Migration weg von Manus (Kosten + Datenschutz)

Ziel: Betrieb auf eigenem, EU-gehostetem Backend statt Manus/Forge. Senkt die
laufenden Kosten (keine Manus-Credit-Marge, freie Providerwahl) und löst die
offenen DSGVO-/Sicherheitspunkte (EU-Region, eigener AVV, echte Löschung,
abgesicherter Download) zugleich.

> Wichtig: Alles hier ist **Backend-Arbeit**. Sie wird über den neuen Server
> deployt, **nicht** über den EAS-App-Build. Manus bleibt laufen, bis der
> Umzug getestet und umgeschaltet ist. Kosten verschwinden nicht, sie wandern
> zu den gewählten Providern (dann aber transparent, EU-wählbar, oft günstiger).

## Was heute an Manus hängt (zu ersetzen)
| Baustein | heute | Ersatz (EU/Datenschutz-freundlich) |
|---|---|---|
| Hosting Backend | manus.space | Hetzner (DE) VPS **oder** PaaS mit EU-Region (Railway/Render/Fly) |
| Datenbank (MySQL) | env `DATABASE_URL` | managed EU-MySQL (Aiven/Scaleway) oder auf dem VPS |
| Dateispeicher | Forge → S3 | S3-kompatibel EU: Scaleway (FR) / AWS eu-central-1 / Cloudflare R2 (EU) → **unterstützt echte Löschung** |
| Transkription | Forge Whisper | Azure OpenAI Whisper (EU-Region) **oder** selbst-gehostet faster-whisper |
| LLM (Protokoll/Analyse) | Forge Google Gemini | Mistral (FR/EU) **oder** Azure OpenAI (EU) |
| Auth/Session | Manus-SDK (+ lokaler Login da) | `server/auth-local.ts` ausbauen, Manus-SDK-Session ablösen (eigenes JWT) |
| E-Mail | Strato (eigen) | bleibt |
| Zahlung | RevenueCat (geplant) | bleibt |

## Deine Provider-Entscheidungen (du legst Konten/Keys an)
1. **Hosting:** Hetzner VPS (günstig, DE) vs. PaaS (einfacher, teurer).
2. **Datenbank:** managed EU vs. auf dem VPS.
3. **Objektspeicher:** Scaleway / AWS eu-central-1 / Cloudflare R2.
4. **KI:** Transkription (Azure-Whisper EU vs. selbst-gehostet) + LLM (Mistral EU vs. Azure OpenAI EU). AVV je Provider abschließen.

## Phasen (so baue ich es, mit Tests zwischendurch)
1. **Abstraktionsschicht** (risikoarm, kann sofort beginnen): providerneutrale
   Interfaces für Storage und KI einziehen, sodass sich Anbieter tauschen
   lassen, ohne die Aufrufer zu ändern.
2. **Storage → eigenes S3**: put/get/**presign**/**delete** implementieren →
   behebt die fehlende physische Löschung bei Kontolöschung.
3. **KI → gewählte Provider**: Transkription + LLM umstellen (ein dünner
   Adapter pro Anbieter).
4. **Auth entkoppeln**: Session-Ausstellung/-Prüfung unabhängig vom Manus-SDK
   (auf Basis `auth-local.ts`), danach Download-Route eigentümergeprüft
   absichern (siehe Prüfbericht; interne Transkriptions-Auflösung mitfixen).
5. **Hosting + DB umziehen**: neues Hosting, `DATABASE_URL` + `EXPO_PUBLIC_API_BASE_URL`
   umstellen; parallel zu Manus testen.
6. **Rechtstexte anpassen**: neue Region (EU), neue Auftragsverarbeiter + AVV,
   SCC entfällt ggf. (EU-intern), Löschung jetzt real → Impressum/Datenschutz
   aktualisieren.
7. **Gerätetest + Cut-over**: Foto/Audio/Video + Transkription auf echtem
   Gerät (Cookie/Bearer-Weitergabe) testen, dann umschalten. Manus erst danach
   abschalten.

## Nebeneffekte / Risiken
- KI-Kosten bleiben nutzungsabhängig (jetzt direkt beim Provider). Weiterhin
  sinnvoll: **Premium-Gating** (vorhanden) + **Nutzungslimit** pro Nutzer.
- Auth-Entkopplung ist der heikelste Teil (Sessions). Sorgfältig + testen.
- Mehrere Tage Arbeit + neue Accounts/Keys; nichts davon über den App-Build.

## Nächster sinnvoller Schritt
Phase 1 (Abstraktionsschicht) ist risikoarm und unabhängig von Provider-Konten –
damit kann ich beginnen, sobald du die Richtung bestätigst. Danach entscheidest
du die Provider (Punkte 1–4), legst Konten/Keys an, und ich setze Phase 2+ um.
