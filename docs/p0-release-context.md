# P0-Releasekontext – historischer, nicht freigegebener Stand

**Status:** Nicht als Releasequelle verwenden. Maßgeblich sind der aktuelle Quellstand, automatisierte Tests und der jeweils freigegebene Compliance-/Release-Bericht.

> Unbestätigte Unternehmens-, Preis-, Vertrags-, Provider- oder Produktionsangaben sind **OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN**. Frühere Angaben in dieser Datei waren keine belastbare Betreiberfreigabe.

## Betreiber- und Unternehmensdaten

Alle Angaben zu Firma, Rechtsform, Anschrift, Vertretung, Register, Steuerkennzeichen und Datenschutzkontakt sind **OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN**. Sie dürfen weder aus historischen Notizen noch aus Beispiel- oder Testdaten übernommen werden.

## Authentifizierung

Frühere Befunde zu lokaler Klartextspeicherung, Fake-Login, Auto-Verifikation und einem lokalen Passwort-Reset waren historische P0-Risiken. Diese Muster sind für einen Release unzulässig und dürfen nicht wieder eingeführt werden.

Vor einem Release sind ausschließlich der aktuelle serverseitige Authentifizierungsablauf und die zugehörigen Regressionstests maßgeblich. Folgende Gates müssen nachweislich bestehen:

| Gate | Anforderung |
|---|---|
| Registrierung und Login | Serverseitig validiert; keine lokale Passwortprüfung als Authentifizierung |
| Passwörter | Ausschließlich als starker Hash; niemals Klartext in App, Datenbank, Logs oder Dokumenten |
| E-Mail-Verifikation | Kein Bypass und keine automatische Bestätigung |
| Reset-Codes | Gehasht, befristet, einmalig, rate-limitiert und serverseitig geprüft |
| Sitzungen | Serverseitig widerrufbar; sichere Token-/Cookie-Verarbeitung |
| Geheimnisse | Nur über produktive Secret-Verwaltung; niemals im Repository |

## Preise, Testphase und Zahlung

Preise, Währung, Netto-/Bruttoangaben, Steuer, Laufzeit, Verlängerung, Kündigung, Testphase, Zahlungsanbieter und Apple-Zahlungsarchitektur sind **OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN**. Bis zur schriftlichen Betreiber- und Rechtsfreigabe bleiben Kauf-, Trial- und Checkoutpfade fail-closed.

## Produktionsdomain und öffentliche Seiten

Produktionsdomain, Backend-URL sowie öffentliche Datenschutz-, Impressum-, Support- und Privacy-Choices-URLs sind **OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN**. Historische Deployment-Aliasse gelten nicht automatisch als freigegebene Produktionsziele.

## Freigabegrenze

Diese Datei begründet keine Releasefreigabe. Ein Release Candidate setzt vollständig grüne technische Gates, bestätigte Betreiber-/Providerfakten, finale Rechtstexte, reale Geräteabnahme und eine dokumentierte Freigabeentscheidung voraus.
