# Authentifizierung – aktueller Implementierungs- und Release-Status

**Status:** Serverbasierte E-Mail-/Passwort-Authentifizierung ist implementiert; mehrere Produktionshärtungen bleiben **OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN**.

## Aktueller Quellstand

| Bereich | Implementierung | Releasebewertung |
|---|---|---|
| Registrierung | Express-Endpunkt `/api/auth/register`; Benutzer in der Datenbank | Implementiert |
| Passwortspeicherung | bcrypt mit zwölf Runden; Mindestlänge zwölf Zeichen | Implementiert |
| Login | Serverseitige Passwortprüfung; JWT-Sitzung und HttpOnly-Cookie | Implementiert |
| E-Mail-Bestätigung | Zeitlich begrenzter sechsstelliger Code; maximal fünf Fehlversuche | Teilweise; produktiver gemeinsamer Code-Store fehlt |
| Passwort-Reset | E-Mail-Enumeration reduziert; Code befristet und versuchsbegrenzt; neues Passwort wird gehasht | Teilweise; produktiver gemeinsamer Code-Store fehlt |
| Login-Rate-Limit | IP-/E-Mail-Schlüssel und Zeitfenster | Teilweise; derzeit nur pro Prozess |
| Logout | Cookie wird gelöscht | Implementiert; serverseitiger Tokenwiderruf separat bewerten |
| SMTP | Host, Port, Benutzer und Passwort ausschließlich über Umgebungsvariablen | Secret-frei im Repository erforderlich |

## Verbleibende Release-Blocker

Die Verifikations-, Reset- und Login-Versuchsspeicher sind aktuell prozesslokale `Map`-Instanzen. Bei Neustart gehen Zustände verloren; bei mehreren Instanzen sind Versuche und Limits nicht konsistent. Vor einem Release sind ein gemeinsamer persistenter Store, gehashte Einmalcodes, atomare Versuchszählung, definierte TTLs sowie ein verteiltes Rate-Limit erforderlich.

Die Registrierung erstellt derzeit bereits vor abgeschlossener E-Mail-Bestätigung eine Sitzung. Vor der Releasefreigabe ist festzulegen und technisch zu erzwingen, welche Funktionen ungeprüften Konten erlaubt sind. Sicherheitsrelevante Cloud-, Export-, Einladungs- und Zahlungsaktionen dürfen nicht allein auf einer unbestätigten E-Mail-Adresse beruhen.

## Secret-Regeln

Zugangsdaten dürfen niemals in Markdown-Dateien, Quellcode, Testdateien, Git-Historie oder EAS-Konfigurationen mit lokalem Schlüsselpfad eingecheckt werden. Produktionsschlüssel werden ausschließlich über die jeweilige Secret-/Credential-Verwaltung bereitgestellt. Test-Fixtures müssen klar als nicht echt gekennzeichnet sein und dürfen keine verwendbaren Schlüssel enthalten.

> Ein zuvor in dieser Datei gespeichertes SMTP-Passwort wurde aus dem aktuellen Arbeitsbaum entfernt. Da es in der Git-Historie enthalten war, ist seine Rotation vor einem Release zwingend. Gleiches gilt für andere jemals getrackte Produktionsschlüssel.

## Release-Gates

| Gate | Abnahmekriterium |
|---|---|
| Shared Auth Store | Neustart- und Multi-Instanz-Test bestanden |
| Code-Schutz | Nur Hash gespeichert; Einmalverwendung und TTL atomar erzwungen |
| Rate Limiting | Verteiltes Limit für Login, Verifikation und Reset |
| E-Mail-Verifikation | Kein Bypass; Berechtigung ungeprüfter Konten ausdrücklich begrenzt |
| Session-Widerruf | Logout/Passwortwechsel sperren bestehende Sitzungen nach festgelegter Policy |
| SMTP | Rotiertes Secret; Versand-, Fehler- und Abuse-Test bestanden |
| Negative Tests | Enumeration, Brute Force, Code-Reuse, Ablauf, Restart und Parallelität geprüft |
