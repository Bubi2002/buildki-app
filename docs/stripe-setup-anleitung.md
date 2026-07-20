# BuildKI – Stripe-Einrichtung Schritt für Schritt

## Übersicht

BuildKI verwendet Stripe für die Zahlungsabwicklung. Nutzer zahlen über einen sicheren Stripe-Checkout im Browser – die App selbst speichert keine Zahlungsdaten. Stripe übernimmt PCI-Compliance, Rechnungserstellung und Abo-Verwaltung.

**Preismodell:**

| Plan | Preis (netto) | Ersparnis |
|------|--------------|-----------|
| Monatlich | 12,99 €/Monat zzgl. MwSt. | – |
| Jährlich | 140,00 €/Jahr zzgl. MwSt. | ~10% gegenüber Monat |

Beide Pläne starten mit einer **14-tägigen kostenlosen Testphase**.

---

## Schritt 1: Stripe-Account erstellen

1. Gehen Sie zu [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Registrieren Sie sich mit Ihrer Geschäfts-E-Mail (z.B. info@iserloh.net)
3. Verifizieren Sie Ihr Unternehmen (Handelsregister, Steuernummer, Bankverbindung)
4. Aktivieren Sie den **Live-Modus** (nach Verifizierung)

**Wichtig:** Für Tests nutzen Sie zunächst den **Test-Modus** (Schalter oben rechts im Dashboard).

---

## Schritt 2: Produkte und Preise anlegen

### 2.1 Produkt erstellen

1. Gehen Sie zu **Produkte** → **Produkt hinzufügen**
2. Name: `BuildKI Professional`
3. Beschreibung: `KI-gestützte Baustellendokumentation – Protokolle, Mängelverwaltung, 3D-Modelle`

### 2.2 Monatspreis anlegen

1. Unter dem Produkt: **Preis hinzufügen**
2. Preismodell: **Wiederkehrend**
3. Betrag: **12,99 €**
4. Währung: **EUR**
5. Abrechnungszeitraum: **Monatlich**
6. Steuerverhalten: **Exklusiv** (Steuer wird aufgeschlagen)
7. Speichern → **Price ID kopieren** (beginnt mit `price_...`)

### 2.3 Jahrespreis anlegen

1. Unter dem gleichen Produkt: **Preis hinzufügen**
2. Preismodell: **Wiederkehrend**
3. Betrag: **140,00 €**
4. Währung: **EUR**
5. Abrechnungszeitraum: **Jährlich**
6. Steuerverhalten: **Exklusiv**
7. Speichern → **Price ID kopieren** (beginnt mit `price_...`)

---

## Schritt 3: Steuer-Konfiguration (MwSt.)

1. Gehen Sie zu **Einstellungen** → **Steuern** → **Stripe Tax**
2. Aktivieren Sie Stripe Tax
3. Herkunftsadresse: Ihre Geschäftsadresse (Deutschland)
4. Standard-Steuersatz: **19% deutsche USt.** wird automatisch berechnet
5. Rechnungen enthalten dann automatisch: Netto + 19% MwSt. = Brutto

---

## Schritt 4: Webhook einrichten

Webhooks informieren BuildKI über Zahlungsereignisse (neues Abo, Kündigung, Zahlung fehlgeschlagen).

1. Gehen Sie zu **Entwickler** → **Webhooks** → **Endpoint hinzufügen**
2. Endpoint-URL: `https://protokollapp-c7amcxpp.manus.space/api/stripe/webhook`
3. Zu überwachende Ereignisse auswählen:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Speichern → **Webhook-Signing-Secret kopieren** (beginnt mit `whsec_...`)

---

## Schritt 5: API-Keys in BuildKI eintragen

Sie benötigen 4 Werte aus Stripe. So finden Sie diese:

| Key | Wo zu finden | Format |
|-----|-------------|--------|
| `STRIPE_SECRET_KEY` | Entwickler → API-Schlüssel → Secret Key | `sk_live_...` oder `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Entwickler → Webhooks → Ihr Endpoint → Signing Secret | `whsec_...` |
| `STRIPE_MONTHLY_PRICE_ID` | Produkte → BuildKI Professional → Monatspreis → ID | `price_...` |
| `STRIPE_YEARLY_PRICE_ID` | Produkte → BuildKI Professional → Jahrespreis → ID | `price_...` |

### Eintragen in der App:

Diese 4 Werte werden in den **Secrets/Umgebungsvariablen** der Manus-App eingetragen:
1. Öffnen Sie die Management-UI → **Settings** → **Secrets**
2. Tragen Sie die 4 Werte ein

---

## Schritt 6: Testen (Test-Modus)

Bevor Sie live gehen, testen Sie mit Stripe-Testkarten:

| Karte | Nummer | Ergebnis |
|-------|--------|----------|
| Visa (Erfolg) | 4242 4242 4242 4242 | Zahlung erfolgreich |
| Visa (Ablehnung) | 4000 0000 0000 0002 | Zahlung abgelehnt |
| SEPA-Lastschrift | DE89 3704 0044 0532 0130 00 | Erfolgreiche Lastschrift |

Ablaufdatum: beliebiges Datum in der Zukunft. CVC: beliebige 3 Ziffern.

---

## Schritt 7: Live schalten

1. Wechseln Sie im Stripe-Dashboard auf **Live-Modus**
2. Ersetzen Sie die Test-Keys durch Live-Keys:
   - `sk_test_...` → `sk_live_...`
   - Webhook neu erstellen im Live-Modus (neues `whsec_...`)
   - Price IDs neu erstellen im Live-Modus (neue `price_...`)
3. Testen Sie mit einer echten Karte (1€-Testbuchung, dann stornieren)

---

## Kundenportal

Kunden können ihr Abo selbst verwalten über das Stripe Customer Portal:
- Zahlungsmethode ändern
- Plan wechseln (Monat ↔ Jahr)
- Abo kündigen
- Rechnungen herunterladen

Das Portal ist automatisch konfiguriert. Aktivieren Sie es unter:
**Einstellungen** → **Billing** → **Kundenportal** → **Aktivieren**

---

## Rechnungen

Stripe erstellt automatisch Rechnungen für jede Zahlung:
- Mit USt-IdNr. (wenn Kunde sie angibt)
- Reverse-Charge für EU-B2B-Kunden
- PDF-Download für Kunden im Portal
- Automatischer E-Mail-Versand nach Zahlung

Konfigurieren Sie unter **Einstellungen** → **Billing** → **Rechnungen**:
- Ihre Firmenadresse
- USt-IdNr.
- Logo (BuildKI-Logo hochladen)
- Fußzeile (z.B. "Vielen Dank für Ihr Vertrauen")

---

## Zusammenfassung der benötigten Schritte

1. ☐ Stripe-Account erstellen und verifizieren
2. ☐ Produkt "BuildKI Professional" anlegen
3. ☐ Monatspreis (12,99€) anlegen → Price ID notieren
4. ☐ Jahrespreis (140€) anlegen → Price ID notieren
5. ☐ Stripe Tax aktivieren (19% MwSt.)
6. ☐ Webhook erstellen → Signing Secret notieren
7. ☐ 4 API-Keys in BuildKI-Secrets eintragen
8. ☐ Im Test-Modus testen
9. ☐ Kundenportal aktivieren
10. ☐ Rechnungseinstellungen konfigurieren
11. ☐ Live schalten
