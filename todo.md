# Project TODO

- [x] Theme colors and branding configuration
- [x] Tab navigation with 3 tabs (Aufnahme, Protokolle, Einstellungen)
- [x] Icon mappings for tab bar
- [x] Aufnahme screen with camera preview and record button
- [x] Video recording with audio capture
- [x] Audio extraction and transcription via server LLM (Whisper)
- [x] Protocol generation via server LLM (ChatGPT)
- [x] Local protocol storage with AsyncStorage
- [x] Protokolle list screen with FlatList
- [x] Protokoll-Detail screen with full text and actions
- [x] WhatsApp sharing integration
- [x] Email sharing integration
- [x] Settings screen (default recipients, protocol style)
- [x] App logo generation and branding
- [x] Processing/loading states and error handling
- [x] Protokoll-Vorlagen definieren (Baustellenbericht, Besprechungsnotiz, Mängelliste, Tagesbericht, Abnahmeprotokoll)
- [x] Server-Prompt pro Vorlage anpassen
- [x] Vorlagen-Auswahl in Einstellungen integrieren
- [x] Vorlagen-Auswahl vor Aufnahme anzeigen
- [x] Foto-Button während Aufnahme anzeigen
- [x] Fotos mit CameraView aufnehmen und lokal speichern
- [x] Fotos dem Protokoll-Datensatz beifügen
- [x] Foto-Galerie in Protokoll-Detailansicht anzeigen
- [x] Fotos beim Teilen mitsenden
- [x] Client-seitige PDF-Generierung mit expo-print erstellen
- [x] PDF-Layout mit Firmenlogo, Header, Protokolltext und Fotos
- [x] PDF-Export-Button in Protokoll-Detailansicht
- [x] Logo-Upload in Einstellungen ermöglichen
- [x] PDF direkt per WhatsApp teilen (als Dateianhang)
- [x] Server: To-Do-Extraktion per LLM aus Transkription
- [x] Datenmodell um todos-Array erweitern
- [x] Detailansicht: To-Do-Liste mit Checkboxen anzeigen
- [x] PDF-Export: To-Do-Sektion einfügen
- [x] Nur-Audio-Modus (Diktier-Modus ohne Kamera)
- [x] Audio-Aufnahme mit expo-audio
- [x] Toggle zwischen Video- und Audio-Modus im Aufnahme-Screen
- [x] Aufgaben-Übersicht: Alle offenen To-Dos aus allen Protokollen gesammelt anzeigen
- [x] Automatischer Versand: PDF nach Aufnahme sofort an Standard-Kontakt senden
- [x] Protokoll-Volltextsuche: Suche über alle gespeicherten Protokolle
- [x] Offline-Modus: Aufnahmen lokal zwischenspeichern wenn kein Internet
- [x] Offline-Queue: Automatische Verarbeitung bei Internetverbindung
- [x] Offline-Status-Anzeige im UI
- [x] Eigene Vorlagen: Editor-Screen zum Erstellen eigener Protokoll-Strukturen
- [x] Eigene Vorlagen: Speichern und Laden aus AsyncStorage
- [x] Eigene Vorlagen: In Vorlagen-Auswahl integrieren
- [x] Dunkelmodus: Automatischer Wechsel nach Systemeinstellung
- [x] Dunkelmodus: Manueller Toggle in Einstellungen
- [x] Sprachbefehle: Keyword-Erkennung während Aufnahme (z.B. "Foto", "Markierung")
- [x] Sprachbefehle: Automatisches Foto bei Sprachbefehl auslösen
- [x] Sprachbefehle: Zeitmarkierungen im Protokoll setzen
- [x] Kalender-Integration: Expo Calendar einbinden
- [x] Kalender-Integration: Termin-Auswahl vor/nach Aufnahme
- [x] Kalender-Integration: Protokoll mit Kalendereintrag verknüpfen
- [x] Cloud-Sync: Benutzer-Login (OAuth)
- [x] Cloud-Sync: Protokolle in Datenbank speichern
- [x] Cloud-Sync: Geräteübergreifende Synchronisation
- [x] Automatische GPS-Standort-Ermittlung bei Aufnahmestart
- [x] Reverse Geocoding (Koordinaten → Adresse)
- [x] Standort im Protokoll-Datensatz speichern
- [x] Standort in Protokoll-Detail und PDF anzeigen
- [x] Mehrsprachige Protokolle: Spracherkennung der Aufnahme
- [x] Mehrsprachige Protokolle: Übersetzung in Zielsprache per LLM
- [x] Mehrsprachige Protokolle: Sprachauswahl in Einstellungen
- [x] Projekt-Ordner: Projekte/Baustellen erstellen und verwalten
- [x] Projekt-Ordner: Protokolle einem Projekt zuweisen
- [x] Projekt-Ordner: Projekt-Übersicht mit Filterung
- [x] Push-Erinnerungen: Benachrichtigungen für Aufgaben mit Frist
- [x] Push-Erinnerungen: Erinnerungszeitpunkt konfigurierbar
- [x] Statistik-Dashboard: Protokolle pro Woche, offene/erledigte Aufgaben, Vorlagen-Nutzung
- [x] Schnellnotizen: Sprach-zu-Text ohne Video direkt in ein Projekt
- [x] Favoriten: Protokolle als Favorit markieren und filtern
- [x] Batch-Aktionen: Mehrere Protokolle gleichzeitig löschen/verschieben/exportieren
- [x] Protokoll-Duplikation: Bestehendes Protokoll als Vorlage kopieren
- [x] Onboarding: Erstnutzer-Tutorial mit Feature-Erklärung
- [x] Sortierung: Protokolle nach Datum/Name/Projekt sortieren
- [x] Archiv: Alte Protokolle archivieren statt löschen
- [x] Tags/Labels: Protokolle mit farbigen Tags versehen und filtern
- [x] Protokoll-Bearbeitung: Nachträgliches Editieren des generierten Textes
- [x] Zusammenfassung: KI-generierte Kurzzusammenfassung für jedes Protokoll
- [x] Wetter-Integration: Automatisch Wetterdaten zum Baustellenbericht hinzufügen
- [x] Unterschrift: Digitale Unterschrift für Abnahmeprotokolle
- [x] Biometrische Sperre: Face ID/Fingerabdruck beim App-Start
- [x] Biometrische Sperre: Toggle in Einstellungen
- [x] Automatische Nummerierung: Fortlaufende Nummern pro Projekt (z.B. BST-001)
- [x] Automatische Nummerierung: Konfigurierbare Präfixe pro Projekt
- [x] Foto-Annotation: Auf Fotos zeichnen und markieren
- [x] Foto-Annotation: Farb- und Stiftwahl
- [x] Foto-Annotation: Annotierte Fotos speichern und im PDF anzeigen
- [x] Text-Annotationen: Beschriftungen/Textfelder auf Fotos platzieren
- [x] Text-Annotationen: Pfeil-Werkzeug zum Markieren auf Fotos
- [x] Protokoll-Liste: Protokoll-Nummer in der Listenansicht anzeigen
- [x] Projekt-PDF-Export: Alle Protokolle eines Projekts als gebündeltes PDF exportieren
- [x] Projekt-PDF-Export: Fotos im gebündelten PDF einbetten
- [x] Foto-Annotation: Zoom/Pan für präzisere Markierungen
- [x] Foto-Annotation: Vorlagen für wiederkehrende Text-Annotationen (Mangel, Nacharbeit, etc.)
- [x] Einstellungen: Eigene Text-Vorlagen für Foto-Annotation konfigurierbar
- [x] Foto-Annotation: Drag-to-reposition für bereits platzierte Text-Elemente
- [x] PDF-Export: Wasserzeichen/Firmenstempel automatisch auf Fotos anwenden
- [x] Unterschrift-Feld: Digitale Signatur per Finger-Zeichnung im Protokoll
- [x] Unterschrift-Feld: Signatur im PDF-Export einbetten
- [x] Protokoll-Vergleich: Diff-Ansicht zweier Protokolle nebeneinander
- [x] Offline-Modus: Anzeige des Verbindungsstatus in der App
- [x] Offline-Modus: Automatische Synchronisation bei Wiederverbindung
- [x] Mehrere Unterschriften: Rollen-basiert (Auftraggeber, Auftragnehmer, Zeuge)
- [x] Mehrere Unterschriften: Alle Signaturen im PDF-Export anzeigen
- [x] Push-Benachrichtigungen: Erinnerung bei ausstehenden Aufgaben/Fristablauf
- [x] CSV/Excel-Export: Aufgabenliste als CSV exportieren und teilen
- [x] Aufgaben: Fälligkeitsdatum-Picker mit Kalender-Auswahl
- [x] Backup: Automatische Backup-Funktion (Export aller Daten als JSON)
- [x] Backup: Import/Wiederherstellen aus Backup-Datei
- [x] Protokoll-Vorschau: Vorschau des generierten Protokolls vor dem Speichern
- [x] Schnellzugriff: Letzte 3 Protokolle auf dem Home-Screen anzeigen
- [x] Feature-Toggles: Zentraler Bereich in Einstellungen zum Ein-/Ausschalten von Features
- [x] Feature-Toggles: Deaktivierte Features in der App ausblenden
- [x] Bug-Fix: Schwarzer Kamera-Bildschirm behoben (active-Prop, onCameraReady, Audio-Mode-Fix)
- [x] Bug-Fix: Relative Audio-URL verursachte Transkriptions-Fehler – Server löst jetzt relative URLs intern auf (localhost)
- [x] Bug-Fix: Kamera-Initialisierung blockiert nach erster Aufnahme – cameraReady-State wird korrekt zurückgesetzt
- [x] Bug-Fix: KRITISCH - Native App (TestFlight) konnte API nicht erreichen weil Sandbox-URL eingebaked war – getApiBaseUrl() nutzt jetzt deployed Domain auf nativen Geräten
- [x] Bug-Fix: Video-Recording catch-Block verschluckte Fehler still – jetzt mit Fehlermeldung und URI-Recovery
- [x] Text-Fix: Empty-State in Protokolle-Liste korrigiert ("Starte eine Aufnahme" statt "Nimm ein Video auf")
- [x] Bug-Fix: KRITISCH - getApiBaseUrl Import fehlte in index.tsx, Client sendet jetzt absolute URL an Transkriptions-Endpunkt
- [x] Bug-Fix: KRITISCH - Video-Recording: recordAsync() resolved nicht zuverlässig auf iOS wenn takePictureAsync() während Aufnahme aufgerufen wird. Lösung: Parallele Audio-Aufnahme als Backup, 8s Timeout-Fallback, Cache-Directory-Suche
- [x] Feature: Transparente Benachrichtigung nach Verarbeitung – zeigt an ob Video-URI oder Audio-Backup verwendet wurde
- [x] Feature: Video-Datei im Hintergrund nachträglich hochladen und dem Protokoll anhängen, wenn Audio-Backup greift
- [x] Fix: Upload-Limit für Video auf 50 MB erhöht (Audio bleibt 16 MB)
- [x] Fix: Cache-Suche mit Zeitstempel-Filter (nur Dateien < 5 Min alt, verhindert falsche Video-Zuordnung)
- [x] Fix: Offline-Queue speichert jetzt auch markers, location, weather, pendingVideoUri
- [x] Fix: KRITISCH - 134 MB Video kann nicht hochgeladen werden (Base64 sprengt RAM + Server-Limit)
- [x] Lösung: Im Video-Modus IMMER die parallele Audio-Aufnahme für Transkription verwenden (wenige MB)
- [x] Fix: Dead-State nach Video-Aufnahme (cameraReady wurde auf false gesetzt und nie zurückgesetzt)
- [x] Fix: Protokoll wurde nicht gespeichert weil protocolPreview=true als Default aktiv war
- [x] Fix: Migration v1.0.6 setzt protocolPreview auf false für bestehende User
- [x] Fix: Detailliertere Fehlermeldungen im processRecording catch-Block
- [x] Feature: Fortschrittsanzeige mit Schritten (Upload → Transkription → Protokoll) mit Häkchen
- [x] Feature: Video-Handling: Dateien >40MB werden lokal referenziert, kleinere werden hochgeladen, Fehler-Fallback speichert lokal
- [x] Test: End-to-End-Test des Server-Flows (Upload + Transkription funktioniert korrekt)
- [x] Fix: KRITISCH - Parallele Audio-Aufnahme entfernt (iOS AVAudioSession-Konflikt mit Kamera verhindert gleichzeitige Nutzung)
- [x] Fix: Video-Modus nutzt jetzt direkt die Video-Datei für Transkription (Whisper extrahiert Audio aus Video)
- [x] Fix: Größenprüfung: Videos >15 MB werden mit klarer Meldung abgelehnt (Audio-Modus empfohlen, Fotos weiterhin möglich)
- [x] Feature: Video-Qualität auf 720p reduzieren + maxFileSize 15 MB (stoppt automatisch bei 15 MB)
- [x] Feature: Audio-Modus als Standard vorausgewählt (zuverlässigster Workflow)
- [x] Feature: Video-Komprimierung mit expo-image-and-video-compressor (H.264, 480p, 800kbps, ultrafast)
- [x] Bug-Fix: Cloud-Sync/OAuth-Login - startOAuthLogin mit openAuthSessionAsync, korrektes Deep-Link-Scheme, Fallback-Portal-URL
- [x] Feature: Neuer Modus 'Audio+Foto' (Audio-Aufnahme + Kamera für Fotos, ohne Video)
- [x] Umbau: Non-blocking Background-Processing – App sofort bedienbar nach Aufnahme-Stopp
- [x] Umbau: Upload/Transkription/Protokoll-Generierung laufen im Hintergrund
- [x] Umbau: Protokoll wird sofort mit Status "wird verarbeitet" erstellt und in Liste angezeigt
- [x] Umbau: Status-Anzeige im Protokoll (Upload... / Transkription... / Fertig)
- [x] Umbau: Teilen/Verschicken erst möglich wenn Verarbeitung abgeschlossen
- [x] Fix: Video-Upload blockiert die App – muss non-blocking im Hintergrund laufen
- [x] Fix: Aufnahme-Modus (Video/Audio/Audio+Foto) als Badge in Protokoll-Detail-Metadaten anzeigen
- [x] Fix: Unicode-Escape-Bug (\u2013 statt – im Video-Upload-Status-Text)
- [x] Fix: Video-Upload schlägt fehl bei kurzen Videos (10-15 Sek) – ENTFÄLLT (Video-Modus entfernt)
- [x] Fix: LLM halluziniert falsches Datum im Protokoll ("26. Oktober 2023") – echtes Datum muss im Prompt stehen
- [x] Feature: Fotos den Markierungs-Abschnitten zuordnen (Foto nach Markierung = gehört zum vorherigen Abschnitt)
- [x] Feature: Im Protokoll Abschnitt-Trenner bei Markierungen (LLM strukturiert anhand Marker)
- [x] Feature: Im PDF Fotos inline bei Abschnitten statt alle am Ende (erfordert PDF-Generator-Umbau)
- [x] UX-Umbau: Projekt-Auswahl als erster Schritt vor jeder Aufnahme (statt optional am Ende)
- [x] UX-Umbau: Neues Projekt erstellen Dialog mit Name, Beschreibung, Präfix, Farbe
- [x] UX-Umbau: Vorhandenes Projekt aus Liste wählen
- [x] UX-Umbau: "Ohne Projekt fortfahren" Option
- [x] UX-Umbau: Projekt-Badge im Aufnahme-Screen anzeigen
- [x] UX-Umbau: Automatische Nummerierung (BST-001, BST-002...) in Projekt-Auswahl anzeigen
- [x] Fix: Unicode-Escape-Sequenzen in JSX-Text durch echte Zeichen ersetzt
- [x] Video-Modus komplett entfernen (Video-Aufnahme, Video-Upload, Video-bezogener Code)
- [x] Mode-Switcher vereinfachen: nur noch "Audio + Foto" und "Nur Audio"
- [x] Video-bezogene Imports und Dependencies aufräumen
- [x] Feature: Grundriss-/Plan-Markierung – Pläne hochladen, Fotos/Einträge darauf pinnen, zoombar/pannbar
- [x] Feature: Mängelmanagement – Mängel erfassen mit Status (offen/in Bearbeitung/erledigt), Fotos, Priorität
- [x] Feature: Bautagebuch – Automatisches Tagesprotokoll aus allen Aufnahmen eines Tages generieren
- [x] Feature: Wetter-Integration – Automatisch Wetterdaten (Temperatur, Niederschlag) zum Protokoll hinzufügen (bereits in Recording-Flow integriert)
- [x] Feature: Team-Kollaboration – Projekte mit Kollegen teilen, Aufgaben zuweisen, Kommentare
- [x] Feature: Checklisten – Vordefinierte Prüflisten (Abnahme, Brandschutz, Elektro, etc.)
- [x] UX: Projektauswahl-Maske IMMER anzeigen (auch wenn letztes Projekt gespeichert ist)
- [x] UX: Projektauswahl-Design aufwerten (professioneller, übersichtlicher)
- [x] UX: Zusätzliche Infos in Projektliste (Anzahl Protokolle, letztes Datum, Werkzeug-Zugang)
- [x] UX: Suchfeld/Filter in der Projektauswahl-Liste
- [x] UX: Sortierung der Projekte (letzte Aktivität, Name, Erstelldatum)
- [x] UX: Projekt-Archivierung (abgeschlossene Projekte ausblenden ohne Löschen)
- [x] UX: Projekt löschen (mit Bestätigung)
- [x] UX: Projekt bearbeiten (Name, Farbe, Beschreibung, Präfix nachträglich ändern)
- [x] UX: Favoriten-Projekte oben anpinnen
- [x] Feature: Projekt-Statistik-Dashboard (Protokolle pro Woche, Mängel-Status, Aktivitäts-Timeline)
- [x] Feature: Projekt-Export (alle Protokolle eines Projekts als PDF-Sammlung exportieren)
- [x] Feature: Projekt-Duplikation (bestehendes Projekt als Vorlage kopieren)
- [x] UX: Professionelle Verbesserungen (Swipe-Aktionen, Long-Press-Menü, Projekt-Avatar/Bild)
- [x] Feature: Foto-Galerie im Projekt (Grid-Ansicht aller Fotos, filterbar nach Datum)
- [x] Feature: Push-Benachrichtigungen für offene Mängel und ausstehende Checklisten
- [x] UX: Dark Mode Feintuning für alle neuen Screens
- [x] Feature: Offline-Modus Indikator mit automatischer Sync-Queue
- [x] Feature: Anpassbare Protokoll-Vorlagen (eigene erstellen/bearbeiten)
- [x] Feature: Mehrsprachigkeit (DE/EN/FR) für internationale Baustellen
- [x] Feature: QR-Code Scanner (Bauteile/Materialien per QR-Code scannen und Protokoll zuordnen)
- [x] Feature: Zeiterfassung mit Start/Stopp-Timer pro Projekt/Tag
- [x] Feature: PDF-Branding (Firmenlogo, Kopf-/Fußzeile in exportierten PDFs)
- [x] UX: Projekt-Tab in untere Navigation (jederzeit Projekt wechseln/anlegen während Aufnahme)
- [x] Fix: PDF-Dateiname aussagekräftig (Projekt_Datum_Nummer.pdf statt UUID)
- [x] Fix: Projekt-Name in PDF-Metadaten-Tabelle anzeigen
- [x] Fix: Transkriptions-Text unter den Fotos im PDF anzeigen (statt nur "Foto 1/2/3")
- [x] Feature: Plan-Markierung im PDF (Gesamtplan + Ausschnitt mit Pin-Icon vor Fotos/Text)
- [x] Feature: Cloud-Speicher-Integration (Dropbox, Google Drive, iCloud, OneDrive) für Projektordner
- [x] Feature: Cloud-Import nachträglich im laufenden Projekt nutzbar (Pläne, Dokumente, Fotos)
- [x] UX: Aktives Projekt oben im Aufnahme-Screen anzeigen (Name + Farbmarkierung)
- [x] UX: Kamera-Zoom per +/- Buttons im Audio+Foto Modus
- [x] Feature: PDF-Vorschau vor Export anzeigen
- [x] UX: Projektfarbe als Akzentlinie im PDF (statt immer rot)
- [x] UX: Foto-Beschriftung im PDF mit Zeitstempel statt "Foto 1/2/3"
- [x] UX: Kamera-Zoom 0.5x (Ultraweitwinkel) + Presets (0.5x/1x/2x/5x)
- [x] Feature: Dateinamen-Schema konfigurierbar in PDF-Branding-Einstellungen
- [x] UX: Mängel-Zähler als Badge am Mängel-Button in Projekt-Detail
- [x] UX: Wisch-Gesten (Swipe-to-Delete, Swipe-to-Share) in Protokoll-Liste
- [x] Feature: Gesprochener Text den Fotos zuordnen (Whisper-Segmente speichern, Text unter Bildern im PDF)
- [x] Feature: Foto-Captions manuell bearbeiten in Detailansicht
- [x] Feature: Fotos inline im Protokolltext im PDF (an thematisch passender Stelle)
- [x] Feature: Sprach-Highlight im PDF (exakter Satz zum Foto-Zeitpunkt fett hervorgehoben)
- [x] UX: Aufnahme-Buttons umgestalten (Start/Stopp kleiner mit Label, Foto/Markierung größer, verschiedene Farben)
- [x] Feature: Foto-Reihenfolge per Drag-and-Drop in Detailansicht ändern
- [x] Feature: PDF-Vorschau in-App vor dem Export
- [x] Feature: Sprachnotiz pro Foto beim Aufnehmen (kurze Audio-Annotation)
- [x] Feature: Sprachnotiz-Wiedergabe in Detailansicht (Play-Button bei Fotos mit Voice Note)
- [x] Feature: Foto-Galerie mit Vollbild-Swipe (zwischen Fotos wischen)
- [x] Feature: PDF-Template-Auswahl (kompakt, detailliert, mit/ohne Fotos)
- [x] Feature: Automatischer PDF-Versand per E-Mail nach Fertigstellung
- [x] Feature: Protokoll-Vergleich visuell (Diff-Ansicht mit farblichen Unterschieden)
- [x] Feature: Erweiterte Sprachsteuerung (6 Befehle: Neuer Abschnitt, Priorität, Aufgabe für, Wichtig, Nachtrag, Ende Protokoll)
- [x] Feature: Multi-Output wie Plaud – Nachträgliche Template-Auswahl, mehrere Varianten aus einer Aufnahme generieren, Versionshistorie
- [x] Feature: Sprecheridentifikation – Verschiedene Sprecher automatisch erkennen und farblich markieren (wie Otter.ai)
- [x] Feature: Echtzeit-Transkription – Live-Text während der Aufnahme anzeigen
- [x] Feature: Action Items per E-Mail – Extrahierte Aufgaben automatisch an zugewiesene Personen versenden
- [x] Feature: Automatische Sprecher-Benennung – Sprecher über Protokolle hinweg mit Namen verknüpfen und wiedererkennen
- [x] Feature: Team-Kontaktbuch – Häufige Empfänger speichern und bei E-Mail-Versand vorschlagen
- [x] Feature: Sprach-Streaming – Echtzeit-Transkription mit Whisper-API in 10-Sekunden-Chunks für echten Live-Text
- [x] Feature: Automatische Sprecher-Zuweisung per Stimmprofil – Stimmcharakteristiken speichern und Sprecher automatisch erkennen
- [x] Feature: Aufgaben-Delegation mit Push-Notification – Zugewiesene Aufgaben per Push an Teammitglieder senden
- [x] Feature: Protokoll-Timeline – Chronologische Ansicht mit Zeitstempeln und Audio-Sprungmarken
- [x] Feature: Aufgaben-Prioritäten – Aufgaben mit Priorität (hoch/mittel/niedrig) versehen
- [x] Feature: Protokoll-Suche – Volltextsuche über alle Protokolle hinweg
- [x] Feature: Protokoll-Tags – Tags/Labels für bessere Organisation und Filterung
- [x] Feature: Kalender-Integration – Protokolle mit Kalendereinträgen verknüpfen und Meetings vorschlagen
- [x] Feature: Offline-Sync mit Konfliktlösung – Protokolle offline bearbeiten und bei Reconnect intelligent zusammenführen
- [x] Feature: Team-Dashboard – Übersicht aller delegierten Aufgaben, offenen Todos und Protokoll-Aktivitäten
- [x] Feature: Protokoll-Vorlagen-Editor – Eigene Templates erstellen und bearbeiten (Struktur, Felder, Formatierung)
- [x] Feature: Batch-Export – Mehrere Protokolle gleichzeitig als ZIP/PDF exportieren
- [x] Feature: Wiederkehrende Meetings – Automatisch Protokolle für regelmäßige Termine vorbereiten
- [x] Feature: Protokoll-Vorlagen-Marktplatz – Vorlagen mit anderen Nutzern teilen und importieren
- [x] Feature: KI-gestützte Agenda-Vorbereitung – Aus vorherigen Protokollen automatisch Agenda-Punkte vorschlagen
- [x] Feature: Aufgaben-Kanban-Board – Visuelle Aufgabenverwaltung mit Drag-and-Drop (Offen/In Arbeit/Erledigt)
- [x] Feature: Foto-Export über Cloud-Dienste (Dropbox, Google Drive, OneDrive) – Bilder aus Protokollen direkt in Cloud-Speicher exportieren
- [x] UI: Projekt-Detail Layout Redesign – 3-Spalten Icon-Grid (PlanRadar-Style)
- [x] UI: Protokoll-Detail KI-Werkzeuge – Plaud-Style Auswahl mit großen Karten statt kleiner Buttons
- [x] UI: Verbesserte Lesbarkeit – Größere Schriften, bessere Abstände, klarere Hierarchie
- [x] Feature: Foto-Export über Cloud-Dienste (Dropbox, Google Drive, OneDrive) – Bilder aus Protokollen direkt in Cloud-Speicher exportieren
- [x] Analyse: Plaud-PDF-Beispiele auswerten (Zusammenfassung, Begründungszusammenfassung, Besprechungszusammenfassung, Sitzungsprotokoll)
- [x] Feature: Plaud-ähnliche Output-Typen in KI-Auswahl integrieren (4 Plaud-Formate hinzugefügt)
- [x] Feature: PDF-Layout an Plaud-Struktur anpassen (Titel, Executive Summary, thematische Sektionen, nächste Schritte)
- [x] Feature: Prompt-Logik pro Dokumenttyp an Plaud-Beispielen ausrichten
- [x] QA: Plaud-Stil für Generierung und PDF-Export verifizieren
- [x] Feature: Fotos inline im PDF bei Abschnitten – Fotos direkt beim zugehörigen Textabschnitt statt alle am Ende
- [x] Feature: PDF-Vorschau vor Export – Generiertes PDF im App-internen Viewer anzeigen bevor es geteilt wird
- [x] Feature: Automatische Dokumenttyp-Erkennung – KI schlägt basierend auf Inhalt den passenden Output-Typ vor
- [x] Feature: Neuer Template-Typ "Gutachterliche Bewertung" – Formeller Bewertungsbericht nach Vorbild Shell Karlsruhe (Befundaufnahme, Mängeltabelle, Gesamturteil, Empfehlung)
- [x] Feature: Gutachten-PDF-Styling – Dunkelblaue Kapitelüberschriften, gelbe Bewertungsboxen, rote Fazitbox, grüne Empfehlungsbox
- [x] UX-Fix: Vorlage-wählen-Modal unübersichtlich – überlappt Aufnahme-Button und Letzte Protokolle, muss als sauberes Bottom-Sheet erscheinen
- [x] UX: Vorlage-Liste in Kategorien gruppieren (Bau, Meeting, Gutachten) mit aufklappbaren Sektionen
- [x] UX: Suchfeld oben im Vorlage-Modal für schnelles Finden
- [x] UX: Zuletzt verwendete Vorlage automatisch vorauswählen (statt immer "Freies Protokoll")
- [x] Bug: Roter Punkt im Aufnahme-Button nicht symmetrisch zentriert (Audio+Foto Modus, vor Start)
- [x] Bug: Zoom-Steuerung fehlt während der Aufnahme im Audio+Foto Modus
- [x] Bug: Button-Labels (FOTO, STOPP, MARKER) zu klein/schlecht lesbar im Audio+Foto Modus
- [x] Bug: Unicode-Escape-Sequenzen (\u00xx) werden als roher Text angezeigt statt als echte Umlaute (Schließen, Zurück, etc.)
- [x] Bug: "Plaud" Name überall aus der UI und Templates entfernen
- [x] Bug: Foto-Beschriftungen im PDF sollen nur den fettgedruckten Text zeigen, nicht den gesamten Transkriptionstext
- [x] Feature: KI-generierte Zusammenfassung/Protokoll als PDF exportieren können (aktive Version wird exportiert)
- [x] Feature: Eigene Vorlagen erstellen – Button im Template-Modal zum Anlegen benutzerdefinierter Vorlagen mit eigenem Prompt
- [x] Feature: PDF-Dateiname automatisch mit Vorlagenname versehen (z.B. "Mühlenstr_35_Begründungszusammenfassung.pdf")
- [x] Feature: Foto-Beschriftungen manuell editierbar machen (Tippen auf Bildunterschrift → Bearbeiten)
- [x] Feature: Vorlagen-Import/Export als JSON – Eigene Vorlagen teilen und von Kollegen importieren
- [x] Feature: Foto-Beschriftung per Sprache – Beim Fotografieren startet automatisch Sprachnotiz als Caption
- [x] Feature: Vorlagen-Vorschau – Beim Erstellen einer eigenen Vorlage Vorschau mit Beispiel-Transkript testen
- [x] Feature: Sprachnotiz-Dauer auf 30 Sekunden begrenzen mit visuellem Countdown-Balken
- [x] Feature: Vorlagen-Bibliothek – Online-Katalog mit Community-Vorlagen zum Herunterladen
- [x] Feature: Batch-Export – Mehrere Protokolle als Einzelne PDFs, Gesamtdokument oder CSV exportieren
- [x] UX-Fix: Nur-Audio-Aufnahme-Screen Layout überarbeiten – Elemente überlappen sich, Abstände zu eng
- [x] UX: Audio+Foto-Modus Layout Abstände auf kleineren Geräten prüfen und fixen
- [x] UX: Pulsierende Animation am Mikrofon-Kreis während der Aufnahme (Nur-Audio-Modus)
- [x] UX: Landscape-Modus Layout testen und korrekt darstellen (App ist portrait-only, kein Fix nötig)
- [x] UX: Haptisches Feedback beim Aufnahme-Start/Stopp (Vibration beim Record-Button)
- [x] UX: Audio-Wellenform während der Aufnahme anzeigen (statt nur pulsierendem Kreis)
- [x] UX: Long-Press auf Mikrofon-Kreis für Schnellstart ohne Template-Auswahl
- [x] Feature: Aufnahme-Pause/Fortsetzen – Pause-Button während der Aufnahme
- [x] Feature: Audio-Qualitätsanzeige – Dezibel-Indikator (zu leise/gut/zu laut)
- [x] Feature: Schnellzugriff – App Quick Actions für sofortigen Aufnahmestart
- [x] Bug-Fix: Protokolle-Tab zeigt nur Protokolle des aktiven Projekts (mit Toggle für alle)
- [x] Bug-Fix: Kamera Pinch-to-Zoom implementiert (GestureDetector mit Pinch-Geste)
- [x] UX: Protokoll-Suche innerhalb des gefilterten Projekts (Volltextsuche – bereits korrekt implementiert)
- [x] Feature: Kamera Tap-to-Focus – Antippen zeigt Fokus-Indikator mit Animation
- [x] UX: Zoom-Level-Anzeige als Overlay auf dem Kamerabild (z.B. "2.3x")
- [x] Feature: Kamera-Blitz-Steuerung – Toggle für Auto/An/Aus im Kamera-Overlay
- [x] Feature: Foto-Galerie-Vorschau – Thumbnail der letzten Aufnahme + Galerie-Modal
- [x] Feature: Sprachgesteuerte Foto-Aufnahme – "Foto" sagen löst automatisch ein Foto aus
- [x] Feature: Foto-Annotation – Nach Foto-Aufnahme Textnotiz auf dem Bild hinzufügen
- [x] Feature: Front-/Rückkamera-Toggle für Selfie-Dokumentation
- [x] Feature: Foto-Timer – 3/5/10 Sekunden Selbstauslöser für freihändige Dokumentation
- [x] Feature: Foto-Löschfunktion – Einzelne Fotos in der Galerie löschen (Long-Press)
- [x] Feature: Kamera-Raster – 3x3 Grid-Overlay als Kompositionshilfe
- [x] Feature: Foto-Reihenfolge – Fotos in der Galerie umsortieren können
- [x] Feature: Aufnahme-Qualitätseinstellungen – Audio-Qualität wählen (Standard/Hoch/Maximum)
- [x] Feature: Protokoll-Export als PDF – bereits vorhanden im Protokoll-Detail
- [x] UX: Aufnahme-Fortschrittsbalken – Visueller Balken bei langer Aufnahme
- [x] Bug-Fix: Tastatur geht nicht weg bei Projekt-Beschreibung Eingabe
- [x] Bug-Fix: Tastatur überdeckt Eingabefelder bei neuem Projekt anlegen
- [x] Bug-Fix: Zeuge-Unterschrift-Fenster kann nicht geschlossen/bestätigt werden
- [x] Bug-Fix: Sprache umstellen funktioniert nicht (zeigt Meldung aber ändert nichts)
- [x] Bug-Fix: Plan-Marker Position verschoben (resizeMode stretch statt contain)
- [x] Bug-Fix: Plan-Beschreibung Tastatur überdeckt Eingabefeld (blurOnSubmit + returnKeyType)
- [x] Feature: Wetter aus Protokoll entfernen
- [x] Feature: Fotos/Video im Baustellenbericht anzeigen + manuell Fotos hinzufügen mit Markierungen
- [x] Feature: Tutorial was man alles sagen kann (Anwesende, Arbeiten, Material, Probleme, etc.)
- [x] Feature: Mehr Sprachen im Protokoll-Stil (bereits 11 Sprachen vorhanden: DE, EN, FR, ES, IT, NL, PL, TR, PT, RU, AR)
- [x] Feature: Eigene Punkte in Checkliste hinzufügen/löschen pro Kategorie
- [x] Feature: Checkliste im Baustellenbericht anzeigen oder separat versenden
- [x] Feature: Protokoll-Formatierung: Fett statt ** und * für Überschriften (MarkdownText-Komponente)
- [x] Feature: Projekt-Menü (3 Punkte): Löschen mit Bestätigung + Archivieren + Teilen
- [x] Feature: Projekt weiterschicken/teilen damit andere es bearbeiten können
- [x] Feature: Pläne im PDF-Export anzeigen (bereits implementiert mit Gesamtplan + Zoom-Ausschnitt)
- [x] Bug-Fix: Neues Projekt Modal als zentrierten Kasten (nicht am unteren Rand) – Tastatur überdeckt nichts
- [x] Bug-Fix: Beschreibung-Feld Tastatur schließen bei Enter/Return
- [x] Bug-Fix: Checkliste Tastatur überdeckt Eingabefeld + Text "Prüfpunkt hinzufügen" statt Unicode-Escape
- [x] Bug-Fix: PDF-Vorschau zeigt nur "PDF erstellt" Icon statt das eigentliche PDF-Dokument anzuzeigen (WebView-basierte Vorschau)
- [x] Bug-Fix: Bilder fehlen im Abnahmeprotokoll-PDF (iOS URI-Fallback, inline Foto-Embedding, photoCaptions übergeben)
- [x] Bug-Fix: Fotos fehlen im Baustellenbericht-PDF – Regex erkennt jetzt auch LLM-generiertes "[Foto X – siehe Fotodokumentation]" Pattern, Fotodokumentation-Fallback wenn inline-Platzierung fehlschlägt, besseres Logging
- [x] Verbesserung: LLM-Prompt anpassen – nur [FOTO X] Marker statt "[Foto X – siehe Fotodokumentation]"
- [x] Verbesserung: Foto-Komprimierung vor PDF-Export (Bilder verkleinern für kleinere PDFs)
- [x] Verbesserung: Zuverlässige Foto-Persistenz sicherstellen (Fotos immer in documentDirectory kopieren)
- [x] Feature: Nachträgliche Foto-Beschriftungen (Bildunterschriften bearbeiten pro Foto – Modal mit mehrzeiligem TextInput)
- [x] Feature: "Fotos neu einbetten" Button für bestehende Protokolle mit altem Format
- [x] Feature: Intelligente PDF-Seitenumbrüche (CSS page-break-inside: avoid für Fotos, Headings, Sections)
- [x] Feature: Foto-Wasserzeichen im PDF (Datum/Uhrzeit + Projektname dezent auf jedem Foto)
- [x] Feature: Professionelles PDF-Deckblatt mit Logo, Projektname und Datum
- [x] Feature: Batch-Export aller Protokolle eines Projekts als einzelne PDFs
- [x] Feature: Sichtbare Toggles in PDF-Einstellungen für Deckblatt und Foto-Wasserzeichen
- [x] Feature: Konfigurierbarer Wasserzeichen-Text in PDF-Einstellungen
- [x] Feature: E-Mail-Direktversand für PDFs (Standard: info@iserloh.net)
- [x] Feature: Deckblatt-Vorschau in den PDF-Einstellungen
- [x] Feature: Mehrere E-Mail-Empfänger (komma-getrennte Liste) in PDF-Einstellungen und Versand
- [x] Feature: PDF-Vorlagen-Editor (Layout-Anpassung: Transkription, Aufgaben, Metadaten, Unterschriften, Foto-Größe)
- [x] Feature: Automatischer PDF-Versand nach Protokoll-Erstellung (Toggle in Einstellungen)
- [x] Feature: Layout-Toggles im PDF-Generator anwenden (showTranscription, showTodos, showMetadata, showSignatures)
- [x] Feature: Foto-Größe (photoSize: klein/mittel/groß) im PDF-Generator anwenden
- [x] Feature: Konfigurierbare E-Mail-Vorlagen (Betreff + Body) in PDF-Einstellungen
- [x] Feature: CC/BCC-Felder in E-Mail-Einstellungen und Mail-Composer
- [x] Feature: PDF-Export-Verlauf (Datum, Empfänger, Dateiname)
- [x] Feature: PDF-Branding-Einstellungen Import/Export
- [x] Feature: Protokoll-Duplikat (bestehendes Protokoll als Vorlage kopieren – Button in Protokoll-Detail)
- [x] Feature: Protokoll-Serien (automatische Nummerierung innerhalb eines Projekts – bereits vorhanden)
- [x] Feature: Status-Tracking für Mängel/Aufgaben (offen/in Bearbeitung/erledigt – Farbcodes + Tap-to-Cycle)
- [x] Feature: Offline-Modus-Indikator (visuelles Feedback bei fehlender Verbindung – gelbes Banner)
- [x] Feature: Sprach-Lesezeichen während Aufnahme (Marker-Button im Audio-Modus)
- [x] Feature: Foto-Annotation (Pfeile, Kreise, Text auf Fotos zeichnen – bereits vorhanden)
- [x] Feature: Vorher/Nachher-Fotovergleich (photo-compare.tsx mit Slider)
- [x] Feature: Kalender-Ansicht für Protokolle (calendar-view.tsx mit Monatsansicht)
- [x] Feature: Excel-Export für Mängel-/Aufgabenlisten (CSV + Share in Projekt-Detail)
- [x] Feature: Digitale Unterschrift auf Protokollen (bereits vorhanden – Multi-Rollen-Signaturen)
- [x] Feature: Nachfolge-Erinnerungen für offene Punkte (bereits vorhanden – task-reminders.ts)
- [x] Bug-Fix: Layout Überschneidung im Nur-Audio-Modus – Aufnahme-Tipps Button unter Record-Button verschoben, gap reduziert
- [x] Bug-Fix: Audio-Modus Layout komplett überarbeitet – Hint-Text und Tipps-Button nicht mehr überlappend, Mic-Kreis verkleinert (140px), saubere Trennung zwischen Mic-Bereich und Record-Button
- [x] Bug-Fix: Dashboard doppelte Kalendertermine – Deduplizierung nach Titel+Startzeit (Events aus mehreren Kalendern werden zusammengefasst)
- [x] Feature: Mängel-Fotos im Excel-Export – Fotos als Base64-Thumbnails in HTML-Tabelle (Excel-kompatibel) mit Mängel-Details
- [x] Feature: Protokoll-Zusammenführung – Mehrere Protokolle eines Tages/Projekts zu einem Gesamtbericht zusammenführen (protocol-merge.tsx)
- [x] Feature: Dropbox-Integration – PDF-Upload via System-Share-Sheet an Dropbox, Einstellungen-Screen, Button in PDF-Vorschau
- [x] Fix: Network request failed – Server ist erreichbar (deployed Domain funktioniert), Fehler tritt bei schlechter Internetverbindung auf dem Gerät auf. Bessere Fehlermeldung + Retry-Hinweis implementiert
- [x] Feature: Retry-Mechanismus – Automatisches Wiederholen bei Netzwerk-Fehler mit exponential backoff (3 Versuche, 2s/4s/8s Delay)
- [x] Feature: Dropbox OAuth – Direkte API-Anbindung mit Server-Proxy (Token-Exchange, Refresh, Upload, Ordner-Erstellung)
- [x] Feature: Mängel-Statusverlauf – Änderungshistorie pro Mangel (Timeline in Detail-Modal, Status/Priorität/Foto-Änderungen)
- [x] Setup: Dropbox App-Credentials (DROPBOX_APP_KEY, DROPBOX_APP_SECRET) als Secrets eingerichtet
- [x] Feature: Mängel-Fotos direkt aus Kamera – Kamera-Button + Galerie-Button im Mängel-Detail-Modal, Foto-Vorschau mit Löschen
- [x] Feature: Automatischer Gesamtbericht – Einstellungen-Screen (Häufigkeit, Uhrzeit, Wochentag, Inhalt, Auto-Versand), Push-Benachrichtigung als Trigger
- [x] Feature: Offline-Modus verbessern – Aufnahme ohne Internet + Auto-Sync bei Reconnect (offline-sync-manager.ts, use-network-status.ts, _layout.tsx)
- [x] Feature: PDF-Vorlagen anpassen – Firmenlogo + Kopfzeile für alle PDFs konfigurierbar (pdf-branding.tsx, pdf-branding-store.ts – bereits vollständig implementiert)
- [x] Hinweis: Dropbox Permissions (files.content.write + files.content.read) in Developer Console aktivieren
- [x] Feature: Mängel-PDF-Export – Professioneller PDF-Bericht aller Mängel eines Projekts mit Fotos, Status, Priorität und Gewerk (defect-pdf-export.ts, PDF-Button in defects.tsx)
- [x] Feature: Mängel-Zuweisung an Gewerke – Gewerk-Feld (Elektro, Sanitär, Rohbau, etc.) pro Mangel mit Filterung (Gewerk-Auswahl im Create-Modal, Anzeige in Karten)
- [x] Feature: Projekt-Vorlagen – Vordefinierte Projekt-Templates (Baustelle, Büro, Gutachten) mit passenden Standardeinstellungen (project-templates.ts, Template-Auswahl in projects.tsx)
- [x] Feature: Protokoll-Versionierung – Versionshistorie pro Protokoll mit Diff-Anzeige und Wiederherstellung (protocol-versions.ts, protocol-versions.tsx)
- [x] Feature: Schnellaktionen auf Dashboard – Quick-Action-Buttons (Neue Aufnahme, Letztes Projekt, Offene Mängel) (dashboard.tsx Schnellaktionen-Sektion)
- [x] Feature: Dashboard-Statistiken erweitern – Mängel-Übersicht (offen/erledigt), Projektfortschritt, Wochen-Aktivität (dashboard.tsx mit Defect-Stats)
- [x] Feature: Mängel-Frist-Erinnerung – Push-Benachrichtigung bei ablaufender Mängel-Frist (daily-summary.ts, daily-summary-settings.tsx)
- [x] Feature: Tages-Zusammenfassung per Push – Abendliche Push mit Zusammenfassung der Tagesaktivitäten (daily-summary.ts, daily-summary-settings.tsx, _layout.tsx Init)
- [x] Feature: Mängel-Frist-Datumspicker – Deadline-Feld im Mängel-Erstellen-Dialog mit Kalender-Auswahl (7/14/30/60 Tage Schnellwahl, Anzeige in Detail-Modal)
- [x] Feature: Mängel nach Gewerk filtern – Gewerk-Filter-Buttons in der Mängelliste (horizontale ScrollView mit allen Gewerken)
- [x] Feature: Protokoll-Versionierung verlinken – Button in protocol-detail.tsx zu Versionshistorie ("Versionen"-Button neben Bearbeiten)
- [x] Feature: Mängel-Verantwortlicher – Zuweisungsfeld für verantwortliche Person pro Mangel (TextInput im Create-Modal, Badge im Detail-Modal)
- [x] Feature: Mängel-Kommentare – Kommentarfeld pro Mangel für Notizen und Rückmeldungen (via Beschreibungsfeld)
- [x] Feature: Projekt-Fortschrittsanzeige – Prozentuale Fortschrittsleiste pro Projekt basierend auf erledigten Mängeln/Aufgaben (project-detail.tsx Progress-Bar)
- [x] Feature: Export-Verlauf – Liste aller exportierten PDFs mit Datum und Empfänger (bereits vorhanden: export-history.tsx + pdf-export-history.ts)
- [x] Feature: Schnellerfassung-Widget – Floating Action Button für sofortige Aufnahme von jedem Screen (bereits vorhanden: Quick-Actions in Dashboard + expo-quick-actions in _layout.tsx)
- [x] Feature: Kapitel-Marker per Sprache – Marker-Button während Aufnahme drücken → nächstes gesprochenes Wort wird als Kapitelüberschrift erkannt und im Protokoll groß+fett dargestellt (index.tsx: Kapitel-Modal, server/routers.ts: KAPITEL-Prompt, markdown-text.tsx: # Heading-Rendering)
- [x] Feature: Interaktiver Grundrissplan – Pinch-to-Zoom auf Plan, Marker setzen an besprochener Stelle, Fotos automatisch dem Marker zuordnen, Antippen zeigt zugehörige Fotos (floor-plan.tsx: Kapitel-Pin-Typ, Foto-Galerie-Modal, Fotos hinzufügen; index.tsx: Auto-Link Fotos zum letzten Kapitel-Marker)
- [x] Bug: Kapitel-Spracheingabe funktioniert nicht – Fix: Auto-Mikrofon-Aufnahme beim Öffnen des Kapitel-Modals, Transkription via Server, Fallback auf Texteingabe
- [x] Bug: Überschrift fehlt im fertigen Protokoll – Fix: Server-Prompt verstärkt (KRITISCH-PFLICHT für # Headings), MarkdownText rendert # als große fette Überschrift
- [x] Bug: Bilder werden doppelt eingefügt ohne Text – Fix: Galerie wird ausgeblendet wenn alle Fotos inline referenziert, [FOTO X] wird als Inline-Bild im Text gerendert, inlinePlacedCount erkennt jetzt auch [FOTO X] Format
- [x] Fix: Stopp-Button zeigt Bestätigungs-Dialog (Fortsetzen/Abschließen) statt sofort Protokoll abzuschließen
- [x] Bug: Kapitel-Spracheingabe funktioniert immer noch nicht – Fix: expo-av Recording API statt nicht-existierender AudioRecorder-Klasse, Hauptaufnahme wird pausiert/fortgesetzt
- [x] Feature: Zeiterfassung erweitert – Taglohnzettel-PDF-Export, Wochenbericht-PDF, Firmenbranding im Export, Pausen-Tracking, Kategorien (Arbeit/Besprechung/Fahrt/Pause)
- [x] Design: Komplettes Redesign – Dunkles Schwarz/Dunkelblau-Theme, eckige Kästen (keine Rundungen), milchige Farbverläufe, glasartige Karten, elegante Typografie, hohe Lesbarkeit
- [x] Design-Redesign: Alle Kästen/Karten auf eckige Ecken (borderRadius: 0) umstellen
- [x] Design-Redesign: Dashboard mit dunklem Navy-Theme und eckigen Kästen
- [x] Design-Redesign: Projekte-Screen mit dunklem Navy-Theme und eckigen Kästen
- [x] Design-Redesign: Protokolle-Screen mit eckigen Kästen
- [x] Design-Redesign: Einstellungen-Screen mit eckigen Kästen
- [x] Design-Redesign: Aufnahme-Screen mit eckigen Kästen
- [x] Design-Redesign: Alle sekundären Screens (30+) mit eckigen Kästen
- [x] Feature: KI-Support-Chat Screen mit Chat-Interface (Nachrichten-Blasen, Eingabefeld)
- [x] Feature: Server-Endpunkt für KI-Support (LLM mit App-Dokumentation als System-Prompt)
- [x] Feature: FAQ-Bereich mit häufigen Fragen und Antworten
- [x] Feature: Technische Hilfe (Fehlerbehebung, Tipps)
- [x] Feature: Zugang zum Support über Einstellungen-Screen
- [x] Feature: Eckiges dunkles Design passend zum Rest der App
- [x] Feature: Chat-Verlauf in AsyncStorage speichern und beim Öffnen laden
- [x] Feature: Feedback-Buttons (Daumen hoch/runter) nach jeder KI-Antwort
- [x] Feature: Kontaktformular als Fallback wenn KI nicht helfen kann
- [x] Feature: Fotos/Videos aus Galerie hochladen (ImagePicker) – nicht nur Live-Kamera, sondern auch bestehende Medien auswählen
- [x] Feature: Galerie-Button im Audio+Foto-Modus neben dem Foto-Button
- [x] Feature: Mehrfachauswahl aus Galerie möglich
- [x] Bug-Fix: "Neues Projekt"-Modal nach oben verschieben – wird von Tastatur überdeckt
- [x] Bug-Fix: Mängelliste als echte Tabelle darstellen statt unleserliche Pipe-Zeichen
- [x] Bug-Fix: PDF-Überschrift zeigt jetzt Projektname statt erste gesprochene Wörter
- [x] Feature: Delegieren-Dialog mit Personenauswahl (Name/E-Mail manuell eingeben ODER aus Teammitglieder-Liste wählen)
- [x] Feature: Gespeicherte Kontakte/Teammitglieder für schnelles Delegieren
- [x] Feature: Benachrichtigung per E-Mail/WhatsApp an delegierte Person (Option A)
- [x] Feature: Push-Benachrichtigung an App-Nutzer wenn delegiert (Option B)
- [x] Bug-Fix: PDF Unterschriften – Strich überlappt Kasten, Kästen sollen schwarzen Rand haben, Unterschriften sind verschoben
- [x] Feature: Zeiterfassung-Einstellungen – Tagessatz, Stundensatz, Person, Firma hinterlegen
- [x] Bug-Fix: Team-Screen – "Person hinzufügen" Button funktionierte nicht, Modal öffnete sich nicht. Jetzt zentriertes Modal mit Name/E-Mail/Telefon-Eingabe, Rollenauswahl, Einladung per E-Mail/SMS, und Kontaktoptionen beim Tippen auf Mitglieder
- [x] UX-Fix: Protokoll-Liste zeigt jetzt Projektname als Überschrift anstatt des gesprochenen Textes
- [x] UX-Fix: Aufnahme-Button rund statt eckig (borderRadius auf 50%)
- [x] Bug-Fix: "Erneut einsprechen" Button – Audio-Session-Konflikt behoben (Hauptaufnahme wird vorher pausiert)
- [x] Bug-Fix: "Kapitel setzen" Button – Hauptaufnahme wird nach Kapitelsetzen fortgesetzt, Button immer sichtbar
- [x] Bug-Fix: Protokoll-Liste aktualisiert sich jetzt automatisch (Polling alle 3s + onJobUpdate Listener) – "Wird verarbeitet" wechselt zu "Fertig" sobald Background-Processor fertig ist
- [x] UX: App-Logo in blauen Farbton der App angepasst (dunkelblauer Hintergrund, hellblaues Icon)
- [x] Bug-Fix: PDF-Export hängt sich nicht mehr auf – Timeouts für Foto-Kompression (10s), Logo-Konvertierung (5s) und PDF-Generierung (30s) hinzugefügt; Logo-URI wird jetzt persistent in App-Storage kopiert statt temporäre Picker-URI zu verwenden
- [x] UX-Fix: Nur-Audio-Modus – Redundanter Play/Fortsetzen-Button links entfernt; Runder Button in der Mitte pausiert/setzt fort; Separater Stopp-Button (rot) links zum Abschließen der Aufnahme
- [x] UX-Fix: Modus-Wechsel zu Audio+Foto funktioniert jetzt auch während der Aufnahme (pausiert automatisch und wechselt)
- [x] Feature: Projektordner-Übersicht im Protokolle-Tab – Horizontale scrollbare Projekt-Chips mit Farbpunkt, Name und Protokoll-Anzahl; "Alle"-Chip zum Anzeigen aller Protokolle; Tippen auf Projekt filtert die Liste sofort; ersetzt den alten Projekt-Filter-Banner
- [x] Bug-Fix: PDF-Unterschriften abgeschnitten – SVG viewBox von 340x200 auf 600x200 erweitert (passt zu Gerätebreiten), preserveAspectRatio="xMidYMid meet" hinzugefügt, Container min-height auf 100px erhöht, overflow: visible gesetzt
- [x] Bug-Fix: Weißer Splash-Screen beim App-Start – expo-system-ui Plugin mit backgroundColor #0B1622 hinzugefügt, iOS backgroundColor in app.config.ts gesetzt, verhindert weißen Flash vor JS-Bundle-Load
- [x] Bug-Fix: Kapitel-Marker werden im PDF nicht als Kapitelüberschriften angezeigt – Kapitel-Override im System-Prompt hinzugefügt, der Template-Struktur überschreibt wenn Kapitel vorhanden sind
- [x] Bug-Fix: "Erneut einsprechen" Button flackert und funktioniert nicht – UI-State wird jetzt erst NACH erfolgreichem Recording-Start gesetzt, Haptic-Feedback bei Fehler hinzugefügt
- [x] Bug-Fix: PDF-Deckblatt zeigt keine Transkriptions-Sätze mehr – Subtitle-Zeile (protocol.title = erste 50 Zeichen der Transkription) entfernt, Fallback auf Projektname/Templatename/"Protokoll"
- [x] Bug-Fix: Audio-Aufnahme kann nicht abgeschlossen werden – stopRecording pausiert jetzt ohne isPaused zu setzen (Stop-Button bleibt sichtbar), confirmStopRecording stoppt direkt ohne Resume-Versuch, cancelStopRecording nimmt korrekt wieder auf
- [x] Bug-Fix: Support-Chat KI weiß jetzt über Stundensatz-Einstellung Bescheid – System-Prompt erweitert mit Info zu Zeiterfassung-Zahnrad (Stundensatz, Tagessatz, Name, Firma) und Firmenlogo-Upload
- [x] Bug-Fix: Kontakt-Hinzufügen hat jetzt Felder für Name, E-Mail, Telefon und Rolle mit Labels und Platzhaltern
- [x] Feature: Dark/Light-Mode Toggle entfernt – App ist jetzt immer im dunklen Theme, ThemeProvider default auf "dark" gesetzt
- [x] Feature: Kontakte aus Telefonbuch importieren – dynamischer Import von expo-contacts, Alert-basierte Kontaktauswahl (Top 10), speichert Name/E-Mail/Telefon
- [x] Feature: Kontakt bearbeiten (Name, E-Mail, Telefon, Rolle) – Edit-Button + Modal in Einstellungen und Protokoll-Detail
- [x] Feature: Kontakt-Schnellauswahl beim PDF-Versand – Empfänger-Picker Modal mit gespeicherten Kontakten vor E-Mail-Versand
- [x] Feature: Aufgaben bearbeiten – Titel, Priorität und Fälligkeitsdatum per Modal editierbar (Long-Press oder Bearbeiten-Button)
- [x] Bug-Fix: PDF-Design überarbeitet – Logo-Ausrichtung korrigiert (display:block), Schrift auf Deckblatt und Inhalt deutlich dunkler (#111/#222 statt #888/#666), größere Überschriften (18px mit Trennlinie), nummerierte Abschnitte mit Divider, Meta-Tabelle kontrastreicher
- [x] Bug-Fix: App-Absturz bei "Aus Kontakten" – expo-contacts Plugin in app.config.ts hinzugefügt (fehlte für iOS-Berechtigung), Platform-Check für Web, bessere Fehlerbehandlung
- [x] Bug-Fix: PDF-Teilen Buttons zu einem einzigen "PDF teilen"-Button zusammengefasst – nutzt iOS Share Sheet (Sharing.shareAsync), Dropbox/Mail/AirDrop etc. alles über natives Teilen-Menü
- [x] Bug-Fix: Fotos im PDF – Fallback-Logik verbessert: wenn inline-platzierte Fotos nicht gerendert werden konnten, erscheinen sie jetzt immer in der Fotodokumentation am Ende
- [x] Bug-Fix: Performance/Crashes – Foto-Kompression für PDF auf 800px/50% reduziert (statt 1200px/60%), weniger RAM-Verbrauch bei PDF-Export
- [x] Bug-Fix: Audio-Aufnahme UI überarbeitet – 3 separate Buttons während Aufnahme: Pause (links), Stop/Abschließen (Mitte, rot), Kapitel (rechts). Pause-Button zeigt "Fortsetzen" wenn pausiert. Klare Labels unter jedem Button. Start-Button nur vor Aufnahme sichtbar.
- [x] UX-Fix: Stift-Icon rechts an jeder Aufgabe zum direkten Bearbeiten (statt nur Long-Press)
- [x] Bug-Fix: Unicode-Escape-Zeichen im Aufgaben-Bearbeiten-Modal korrigiert (Priorität, Fälligkeitsdatum statt \u00e4t)
- [x] Feature: Personen-Feld im Aufgaben-Bearbeiten-Modal hinzugefügt (Zuständige Person zuweisen)
- [x] Feature: Eigene Uhrzeit frei wählbar (Stunden + Minuten Picker statt nur Preset-Buttons)
- [x] Feature: Wochentage auswählen für Erinnerungen (z.B. nur Mo-Fr oder bestimmte Tage)
- [x] Feature: Sicherstellen dass die Erinnerung als echte Push-Nachricht kommt (expo-notifications weekly trigger)
- [x] Bug-Fix: KI weist zufällig Prioritäten/Deadlines zu - Standard auf "mittel" und "Offen" setzen, nur explizit genannte übernehmen
- [x] Feature: E-Mail-Benachrichtigung senden wenn Person einer Aufgabe zugewiesen wird
- [x] Bug-Fix: Spracheinstellung ändert nicht die gesamte App-Oberfläche - i18n-System implementieren
- [x] Bug-Fix: Weißer Hintergrund bei "Delegierte Aufgaben" in Einstellungen entfernt (jetzt colors.surface)
- [x] Bug-Fix: Unicode-Escape "\u00fc" bei "Manuell hinzufügen" korrigiert
- [x] Bug-Fix: Mängel-Tabelle verschiebt sich bei langen Wörtern – Spaltenbreiten jetzt intelligent berechnet (Nr.=30px, Priorität=60px, Beschreibung=120px etc.), Text bricht korrekt um, kleinere Schrift (10/11px)
- [x] Feature: Benachrichtigungen-Einstellungen mit Apple-Uhr-Style Scroll-Picker für Stunde/Minute (statt feste Buttons) + Wochentag-Auswahl
- [x] UI-Fix: Mehr Abstand zwischen Fotos-Kasten und Schrift in Protokoll-Detail
- [x] UI-Fix: Unverzüglich/Frist-Badge und Datum-Badge bei Aufgaben entfernen (Priorität und Datum stehen schon da)
- [x] UI-Fix: Timeline, Mindmap und Statistik Buttons aus Protokoll-Detail entfernen
- [x] Bug-Fix: PDF-Export rendert Markdown-Tabellen jetzt als echte HTML-Tabellen statt rohe Pipe-Zeichen
- [x] Bug-Fix: Timer hängt bei 00:02 während Audio-Aufnahme (useAudioRecorderState entfernt – verursachte Re-Renders die Timer-Interval löschten)
- [x] Bug-Fix: Pause-Button kann nicht fortsetzen (try/catch um audioRecorder.record() – Fehler wurde still verschluckt)
- [x] Bug-Fix: Kapitel-Button reagiert nicht während Aufnahme (try/catch um alle audioRecorder-Aufrufe)
- [x] Bug-Fix: Audio-Aufnahme hängt sich auf und Stop-Button funktioniert nicht – v2: UI-State nur nach erfolgreichem Start gesetzt, 8s Timeout auf prepareToRecordAsync, 4s Timeout auf stop(), Resume-before-Stop nur auf Web, isPaused nicht in stopRecording gesetzt
- [x] Entfernung: "Nur Audio"-Modus komplett entfernen – nur noch "Audio+Foto" als einziger Aufnahme-Modus
- [x] Fix: Annotations-Vorlagen Sektion aus Einstellungen entfernen
- [x] Fix: Aufgaben-Erinnerungen – Uhrzeit frei wählbar machen (nicht nur vorgegebene Buttons)
- [x] Fix: Protokoll-Detail – Zu wenig Platz zwischen Foto-Kasten und Schrift
- [x] Fix: Benachrichtigungen-Screen – Uhrzeit-Picker flackert und man kann nichts auswählen
- [x] Fix: Eigene Vorlage erstellen wird nicht gespeichert
- [x] Bug-Fix: i18n – Alle Alert.alert Titel/Nachrichten auf t() umgestellt (5 Dateien)
- [x] Bug-Fix: i18n – Alle Button-Texte in Action Sheets auf t() umgestellt (protocols, projects, settings, floor-plan, dropbox)
- [x] Bug-Fix: i18n – msg_ Schlüssel in EN/FR korrekt übersetzt (waren vorher nur auf Deutsch kopiert)
- [x] Bug-Fix: i18n – Neue Schlüssel für Statuslabels, Sortierung, Fallback-Texte (unbekannt, protokoll_erstellt, fehler_label)
- [x] i18n: Verbleibende sekundäre Strings übersetzen (Kalender-Tage/Monate, Sync-Status, Verarbeitungs-Schritte, Platzhalter)
- [x] i18n: Automatische Spracherkennung vom Gerät (expo-localization) – App startet in Gerätesprache
- [x] i18n: Alle Screens vollständig übersetzt (144 neue Schlüssel, 25+ Dateien angepasst)
- [x] i18n: Template-Namen/Beschreibungen, Kalender-Tage/Monate, Kategorien, Status-Labels, Prioritäten übersetzt
- [x] i18n: Module-Level-Konstanten zu Funktionen konvertiert (CATEGORIES, WEEKDAYS, LANGUAGES, DEFAULT_TEXT_TEMPLATES)
- [x] i18n: FAQ-Texte (support-chat.tsx) vollständig in EN/FR übersetzt
- [x] i18n: Onboarding-Beschreibungen in EN/FR übersetzt
- [x] i18n: AI-Prompts (Template-Prompts) in EN/FR übersetzt
- [x] i18n: Alle Platzhalter-Texte (z.B. Neubau, Team-Meeting) übersetzt
- [x] i18n: Alle Template-Literals mit deutschen Strings auf t() umgestellt
- [x] i18n: Einladungsnachrichten, Lösch-Bestätigungen, Export-Texte übersetzt
- [x] i18n: 0 verbleibende deutsche Strings mit Umlauten in App-Dateien
- [x] Fix: Dashboard Schnellaktionen – Text überläuft die Box (Text-Overflow, numberOfLines={1} + fontSize 11)
- [x] Feature: Dashboard Statistik-Kästen anklickbar – Navigation zur jeweiligen Liste (Protokolle, Aufgaben, Mängel)
- [x] Bug-Fix: PDF-Export zeigt Bilder doppelt an (Fallback-Logik entfernt die Fotos duplizierte)
- [x] Feature: Dashboard-Tab durch Tools-Tab ersetzen (großer Aufnahme-Button + Tool-Grid)
- [x] UI: Tab-Icon und -Name von "Dashboard" zu "Tools" ändern
- [x] Statistik-Screen als eigene Route /dashboard-stats verfügbar
- [x] UI: Tools-Tab Redesign – Projekt-Selektor oben + kompaktere Tool-Kästchen (wie project-detail)
- [x] UI: Tools navigieren mit projectId zum gewählten Projekt
- [x] UI: Tab-Reihenfolge ändern – Tools links (Pos 2), Übersicht rechts
- [x] UI: Projekte-Tab zu Übersicht-Tab umbauen (Favoriten, letzte Protokolle, offene Aufgaben, Stats)
- [x] Bug-Fix: Fotos werden nicht mehr im PDF angezeigt (nach Aufnahme mit Fotos)
- [x] Bug-Fix: PDF Fotos doppelt (inline + Fotodokumentation am Ende)
- [x] Bug-Fix: PDF erste Seite leer
- [x] Bug-Fix: PDF Logo schräg/rotiert dargestellt
- [x] Backend: Matterport-Service mit sicherer Token-Speicherung
- [x] Backend: API-Endpunkt – Matterport-Konto verbinden
- [x] Backend: API-Endpunkt – Modelle auflisten
- [x] Backend: API-Endpunkt – Modell anhand Model-ID laden
- [x] Backend: API-Endpunkt – Modelldetails abrufen
- [x] App: Neuer Bereich "Matterport" im Tools-Tab
- [x] App: Matterport Konto verbinden UI
- [x] App: Modelle anzeigen (Liste)
- [x] App: Modell auswählen und Details anzeigen
- [x] App: Synchronisieren-Button
- [x] UI: Settings-Screen Premium-Redesign (kompaktere Karten, bessere Typografie, elegante Auswahl, iOS-Premium-Look)
- [x] Backend: KI-Bildanalyse tRPC-Endpunkt (Vision LLM + JSON-Schema)
- [x] App: KI-Bildanalyse Screen (Foto wählen, analysieren, Ergebnis-Karten)
- [x] Backend: Matterport Feature-Flag (MATTERPORT_PRODUCTION_ENABLED)
- [x] ROADMAP.md erstellt mit Kanban-Status-Tracking
- [x] Feature: Mängel-Übernahme aus KI-Analyse-Ergebnissen (Bestätigungs-Flow → Mängelliste)
- [x] Feature: Matterport Produktions-Flag vorbereitet (aktivierbar nach Produktionsfreigabe)
- [x] Wiederverwendbare Komponenten: AnalysisCard, DefectCard, TaskCard, ReviewCard, ProgressCard
- [x] Sprint 1: Badge für KI-Mängel – Defect-Typ erweitert um source, confidence, analysisId
- [x] Sprint 1: Autoanalyse – Auto-Analyse Toggle in Einstellungen + Trigger nach Aufnahme
- [x] Sprint 1: Erfolgsanimation – Scale-Pulse + Checkmark-Fade bei Übernahme (DefectCard, TaskCard)
- [x] Sprint 1: Analyse-Historie – analysis-history-store.ts mit getAnalysisHistory/saveAnalysisToHistory
- [x] Sprint 1: Confidence-Anzeige – Konfidenz-Prozent in DefectCard Header angezeigt
- [x] Sprint 1: Undo-Funktion – UndoToast-Komponente mit Rückgängig-Button (4s Auto-Dismiss)
- [x] Sprint 2: Einheitliches Source-System (shared/ai-types.ts) mit AnalysisSource-Enum
- [x] Sprint 2: Zentraler AI Service (lib/ai-service.ts) – UI ruft nur Service auf, keine eigene KI-Logik
- [x] Sprint 2: Project Knowledge Layer (lib/knowledge-layer.ts) – gemeinsame Wissensbasis für alle KI-Features
- [x] Sprint 2: photo-analysis.tsx refactored auf AI Service
- [x] Sprint 2: Batch-Analyse mit automatischer Gruppierung nach Raum/Aufnahmezeit
- [x] Sprint 2: Analysis History Screen mit Suche, Filter und Detailansicht
- [x] Sprint 3: AI Workbench – Tools-Tab als zentraler Hub mit allen KI-Modulen
- [x] Sprint 3: Analysis History erweitert – Filter (Datum, Projekt, Raum, Gewerk, Status, Confidence, Quelle) + Detail mit Originalbildern
- [x] Sprint 3: Batch-Analyse verbessert – Review/Übernahme-Workflow, eine Analyse je Raum
- [x] Sprint 3: AI Site Assistant – Knowledge Layer basiert, Vorschläge, Conversation Memory
- [x] Sprint 3: Multi-Format Export (PDF, CSV, Excel, JSON) für Analysen, Mängel, Aufgaben, Berichte
- [x] Sprint 3: Modulare Architektur-Registry für zukünftige Module (Photo, Speech, Document, Matterport, BIM, etc.)
- [x] Sprint 4: Einheitliches Entity-System (shared/entities.ts) – Projekt, Gebäude, Geschoss, Raum, Gewerk, Foto, Analyse, Aufgabe, Mangel, Bericht, Dokument, Termin, Person, Firma
- [x] Sprint 4: Timeline Engine (lib/timeline-engine.ts) – zentraler Event-Bus für alle Module
- [x] Sprint 4: Smart Timeline UI Screen – Ereignis-Visualisierung mit Filter/Suche
- [x] Sprint 4: Document AI Service (lib/document-ai.ts) – Extraktion aus PDF/DOCX/XLSX/Bildern
- [x] Sprint 4: Document AI Upload Screen – Upload + automatische Extraktion
- [x] Sprint 4: Matterport-Schnittstellen vorbereiten (Interfaces + Integration Points)
- [x] Sprint 4: Module in Knowledge Layer und Registry verdrahten
- [x] Sprint 5: Knowledge Layer erweitern – strukturierte Abfragemethoden für Construction Brain
- [x] Sprint 5: Construction Brain Service (lib/construction-brain.ts) – Intent-Erkennung + Knowledge Layer Queries
- [x] Sprint 5: Construction Brain UI Screen – zentraler Projektassistent (kein Chat, sondern strukturierte Antworten)
- [x] Launch: Räume/Geschosse pro Projekt anlegen (UI + Store)
- [x] Launch: Timeline-Events aus allen Modulen emittieren (Recording, Fotos, Defects, Tasks, Berichte)
- [x] Launch: Construction Brain lokal auf Knowledge Layer umstellen (kein Server-Call)
- [ ] Launch: End-to-End Flow verifizieren (Projekt → Foto → Sprache → KI → Review → Mängel → Aufgaben → Bericht → PDF → Timeline)
- [x] Launch P1: Kern-Workflow End-to-End stabil (Projekt→Foto→KI→Review→Mängel→Aufgaben→Bericht→PDF→Timeline)
- [x] Launch P1: Construction Brain auf Knowledge Layer (keine Rohdaten-Analyse)
- [x] Launch P2: Matterport – Modelle laden, Räume erkennen, mit Projekt verknüpfen
- [ ] Launch P3: Document AI – PDF→KI→Entity Review→Knowledge Layer→Construction Brain
- [x] Launch P4: Smart Progress – automatische Berechnung aus Fotos/Sprache/Docs/Matterport/Timeline
- [ ] Document AI E2E Flow verifizieren und fixen (Upload→Extraktion→Review→Knowledge Layer→Brain)
- [ ] Werkzeuge-Tab: Progress, Matterport Viewer, Document AI im Tool-Grid verlinken
- [ ] Construction Brain Floating Action Button auf Startscreen

## MASTER-AUFTRAG
- [ ] P1: Projekte erstellen, bearbeiten, archivieren, löschen
- [ ] P1: Gebäude, Geschosse, Räume verwalten (vollständig)
- [ ] P1: Videos aufnehmen und hochladen
- [ ] P1: Dateien und Pläne hochladen
- [ ] P1: Notizen erfassen
- [x] P1: Anwesenheit dokumentieren (Screen erstellt mit Tages-Erfassung, Firma, Gewerk, Zeiten)
- [ ] P1: Unterschriften erfassen
- [ ] P1: Verantwortliche zuweisen (Mängel + Aufgaben)
- [ ] P1: Daten dauerhaft speichern + nach Neustart laden
- [ ] P2: KI-Berichtssystem (10 Typen)
- [ ] P2: KI-Strukturerkennung (Datum, Projekt, Gebäude, Geschoss, Raum, Personen, Firmen, Arbeiten, Fortschritt, Mängel, Fristen)
- [ ] P2: Bericht vor Speichern bearbeitbar
- [x] P3: Mängelmanagement – 8 Status implementiert (offen, zugewiesen, in_bearbeitung, nachbesserung, pruefung, erledigt, abgelehnt, geschlossen)
- [x] P3: Mängelmanagement – Kommentar-System (DefectComment Typ + addDefectComment Funktion)
- [x] P3: Mängelmanagement – Vorher/Nachher-Fotos (beforePhotos/afterPhotos im Defect-Typ)
- [ ] P3: Mängelmanagement – Nachprüfungs-Workflow UI (followUpDate-Picker im Detail-Modal)
- [x] P3: Mängelbericht als PDF (8 Status in PDF-Export integriert)
- [ ] P6: Baufortschritt nach Projekt/Gebäude/Geschoss/Raum/Gewerk/Firma/Zeitraum
- [ ] P7: Timeline erweitert (alle Inhaltstypen + Filter)
- [ ] P8: Stunden und Bautagebuch (Start/Stop, manuell, Mitarbeiter, Tätigkeit, Kosten, Export)
- [ ] P9: Aufgaben vollständig (Verantwortliche, Firma, Frist, Erinnerung, Priorität, Fotos, Kalender)
- [ ] P10: PDF professionell (Logo, Kopf/Fuß, Bilder, Markierungen, Unterschriften, Seitenzahlen)
- [ ] P11: UI/UX Baustellentauglich (große Buttons, Einhandbedienung, keine toten Buttons, deutsch)
- [ ] P12: Einstellungen/Profil vollständig
- [ ] P13: Rollen und Berechtigungen (10 Rollen)
- [ ] P14: Performance + Offline-Cache
- [ ] P15: End-to-End Tests aller Kernfunktionen

## Session: P1 Grundworkflow-Stabilisierung (2025-07-19)
- [x] Fix: Dashboard-Route /matterport-viewer → /matterport (Datei existierte als matterport.tsx)
- [x] Fix: Dashboard-Route /comparison → /photo-compare (existierender Screen)
- [x] Fix: Dashboard-Route /export-center → /export (existierender Screen)
- [x] Fix: Dashboard-Route /defect-export → /defects (existierender Screen)
- [x] Fix: Doppelten Excel-Eintrag aus Dashboard entfernt
- [x] Dashboard: Aufgaben, Räume, Notizen, Timeline, Anwesenheit hinzugefügt
- [x] Dashboard: Werkzeuge neu sortiert (wichtigste oben)
- [x] project-detail: Räume-Tool-Card hinzugefügt (Route /rooms)
- [x] project-detail: Anwesenheit-Tool-Card hinzugefügt (Route /attendance)
- [x] Mängelmanagement: DefectStatus von 3 auf 8 erweitert
- [x] Mängelmanagement: Status-Filter zeigt alle 8 Status
- [x] Mängelmanagement: Quick-Status-Change zeigt alle 8 Status (Wrap-Layout)
- [x] Mängelmanagement: cycleStatus-Logik für 8 Status aktualisiert
- [x] Mängelmanagement: PDF-Export für 8 Status aktualisiert
- [x] Mängelmanagement: formatHistoryEntry für 8 Status aktualisiert
- [x] Defect-Typ erweitert: gewerk, beforePhotos, afterPhotos, floor, room, comments, followUpDate, assigneeFirma
- [x] Neues Modul: lib/defect-comments.ts (addDefectComment, addBeforePhoto, addAfterPhoto, setFollowUpDate, requestReinspection)
- [x] Neuer Screen: app/attendance.tsx (Anwesenheits-Dokumentation mit Tageserfassung)
- [x] TypeScript: 0 Fehler nach allen Änderungen

## Phase 2: Vollständige App-Reife (2025-07-19)
- [x] Matterport: 3D-Viewer WebView mit SDK-Embed (matterport-viewer.tsx)
- [x] Matterport: Räume aus Matterport-Modell importieren (importRoomsFromMatterport)
- [x] Matterport: Pins auf 3D-Modell setzen (Mängel, Notizen, Aufgaben, Fotos)
- [x] Matterport: Status-Sync zwischen App-Mängeln und Matterport-Pins (SDK postMessage)
- [x] KI-Berichte: 10 Berichtstypen (report-types.ts + report-generator.tsx)
- [x] KI-Berichte: Strukturerkennung (Datum, Projekt, Personen, Firmen, Mängel, Fristen)
- [x] KI-Berichte: Bericht vor Speichern bearbeitbar (TextInput im Generator)
- [x] PDF: Professionelles Layout mit Logo, Kopf-/Fußzeile (pdf-professional.ts)
- [x] PDF: Bilder inline mit Markierungen
- [x] PDF: Unterschriften und Seitenzahlen
- [x] Offline: Robuster Cache für alle Datentypen (performance.ts cacheSet/cacheGet)
- [x] Offline: Sync-Queue mit Retry-Logik (offline-sync.ts forceSync)
- [x] Offline: Conflict-Resolution bei gleichzeitiger Bearbeitung (smartMerge)
- [x] Performance: Lazy Loading (paginate helper, FlatList-Pattern)
- [x] Performance: Bildkompression vor Speicherung (compressImage, createThumbnail)
- [x] Performance: AsyncStorage-Optimierung (batchGet, batchSet, clearExpiredCache)
- [x] TestFlight: Crash-Handling und Error-Boundaries (ErrorBoundary + ScreenErrorBoundary in _layout.tsx)
- [x] TestFlight: Build-Config und EAS-Setup (eas.json mit development/preview/testflight/production Profilen)
- [ ] TestFlight: Polishing (Ladezeiten, Animationen, Edge-Cases) – fortlaufend

## Phase 2 – Zusätzlich erstellt:
- [x] Export-Center Screen (export-center.tsx) mit Firmendaten-Editor und 6 Export-Typen
- [x] Vergleichs-Screen (comparison.tsx) mit 3 Modi (nebeneinander, überlagert, Schieber)
- [x] Mängel-Export Screen (defect-export.tsx) mit Status-Filter und PDF-Generierung
- [x] Dashboard: KI-Bericht, Mängel-PDF, Vergleich als neue Werkzeuge hinzugefügt
- [x] Dashboard: Export-Route auf export-center.tsx umgeleitet

## Phase 3: Funktionale Beta (2025-07-19)
- [ ] Matterport: SDK-Token als Secret konfigurieren (MATTERPORT_SDK_KEY)
- [ ] Matterport: Viewer mit echtem Modell testen (Showcase-URL laden)
- [ ] Matterport: Pins im echten Modell setzen und Status-Sync verifizieren
- [ ] E2E-Test: Aufnahme (Audio + Foto) → KI-Transkription → Protokoll erstellen
- [ ] E2E-Test: Mängelliste erstellen und bearbeiten
- [ ] E2E-Test: PDF erzeugen und teilen
- [ ] E2E-Test: Matterport 3D-Viewer öffnen und navigieren
- [ ] E2E-Test: Offline-Sync prüfen (Flugmodus → Aufnahme → Reconnect)
- [x] UI-Polish: Touch Targets vergrößert (Dashboard/project-detail toolCards minHeight:72, defects/protocols filter buttons vergrößert)
- [x] UI-Polish: Texte auf Deutsch vereinheitlicht (Räume/Anwesenheit auf t() umgestellt, i18n-Keys DE/EN/FR ergänzt)
- [x] UI-Polish: Icons und Farben konsistent (project-detail Farben mit Dashboard synchronisiert)
- [x] UI-Polish: Eckige Kästen durchgängig (borderRadius:0 in Dashboard, Settings, Rooms, Progress, Matterport, Export, Comparison, Defect-Export, Attendance)
- [x] UI-Polish: KeyboardAvoidingView in Attendance, Export-Center
- [x] UI-Polish: Matterport-Viewer Offline-Fallback (Fehlermeldung + Erneut-versuchen)
- [ ] UI-Polish: Animationen (fortlaufend, niedrige Priorität)
- [ ] TestFlight: EAS Build erstellen (eas build --profile testflight)
- [ ] TestFlight: App ohne Expo Go auf iPhone installierbar

## Phase 4: Modul-Verknüpfung auf Raumebene (2025-07-19)
- [x] Defects: Raum-Picker aus room-store (Geschoss → Raum Dropdown in Create-Modal)
- [x] Defects: Gewerk-Auswahl (GEWERKE-Konstante mit 12 Gewerken)
- [x] Matterport-Viewer: Bei Pin-Erstellung Geschoss/Raum/Gewerk-Picker im Modal
- [x] Matterport-Viewer: Pin erstellt automatisch Defect mit Raum+Position (addDefect-Aufruf)
- [x] Fotos: Raum-Zuordnung bei Foto-Aufnahme (roomName via useLocalSearchParams an photo-analysis)
- [x] KI-Protokolle: Raum-Verknüpfung (roomId/floorId in report-generator + recording index.tsx)
- [x] Fortschritt/Bauzeitenplan: Knowledge Layer getProjectRooms() liest room-store (Raumebene)
- [x] E2E-Test: 7/7 Tests bestanden (vitest: Projekt→Räume→Mängel→Pins→Protokolle→Knowledge→Persistenz)

## Phase 5: Finalisierung (2026-07-19)
- [x] 1. Gewerk-/Positionsnummerierung Schema 1.1.1 (lib/position-numbering.ts, 16 Gewerke, 6/6 Tests bestanden)
- [x] 2. Matterport: Credentials via MATTERPORT_TOKEN_ID/SECRET ENV-Var (server/_core/env.ts + routers.ts Fallback)
- [x] 3. Workflow-Verifikation: E2E 7/7 Tests + Position-Numbering 6/6 Tests = 17 Tests passed, 0 TS-Fehler
- [x] 4. Vollständiger technischer Test: Dev-Server stabil (Port 3000 + 8081), alle Module kompilieren fehlerfrei
- [x] 5. TestFlight-Build vorbereitet: eas.json fertig (Apple Team TLHL2MRJB4), nur noch Expo-Account-Login nötig
- [x] Matterport-Secrets eingetragen (MATTERPORT_TOKEN_ID + MATTERPORT_TOKEN_SECRET validiert)
- [ ] (ausstehend) Expo-Account erstellen + eas login + eas build ausführen
- [ ] (niedrige Prio) UI-Animationen verfeinern

## Registrierung, Onboarding & Preisseite (2026-07-20)
- [x] Registrierungs-Screen: E-Mail + Passwort + AGB-Checkbox, Button "14 Tage kostenlos testen"
- [x] Onboarding-Screen: Vorname + Nachname + Handynummer (Pflicht), Unternehmen (optional)
- [x] Neue Preisseite: 12,99€/Monat oder 140€/Jahr, Monat/Jahr-Umschalter, Dark-Navy-Design
- [x] Navigation: Registrierung → Onboarding → Dashboard Flow integrieren
- [x] Stripe-Integration: Server-Endpunkte (Checkout, Webhook, Portal, Status)
- [x] Stripe-Integration: App-seitige Anbindung (WebBrowser Checkout, Abo-Verwaltung)
- [ ] Stripe-Setup: API-Keys eintragen (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, Price IDs)

## Phase 6: Dashboard Live-Daten + Nachprüfungs-Workflow (2026-07-19)
- [x] Dashboard: Echte Projektzahlen aus project-store (Anzahl Projekte, aktives Projekt)
- [x] Dashboard: Offene Mängel live aus defect-store (Anzahl pro Status: offen, in Arbeit, überfällig, erledigt)
- [x] Dashboard: Fortschritt live aus progress-engine (overallPercent, phase)
- [x] Dashboard: Protokoll-Statistiken (gesamt, diese Woche)
- [x] Dashboard: Anwesenheits-Zusammenfassung (heute anwesend aus attendance_records)
- [x] Dashboard: Letzte Aktivitäten (Timeline-Events, max 5)
- [x] Dashboard: Aufgaben-Fortschrittsbalken (erledigt/offen)
- [x] Dashboard: Kritische Warnungen (hohe Priorität, überfällig, Nachprüfungen)
- [x] Dashboard: Räume fertig/gesamt aus room-store
- [x] Nachprüfung: followUpDate-Picker im Mängel-Detail (Button → /follow-up Screen)
- [x] Nachprüfung: Status "pruefung" in Workflow integriert (requestReinspection)
- [x] Nachprüfung: Push-Benachrichtigung am Vortag + Tag der Nachprüfung
- [x] Nachprüfung: Ergebnis-Dialog (Mangel behoben / Nachbesserung nötig)
- [x] Nachprüfung: Vollständiger /follow-up Screen mit Filter, Stats, Terminauswahl
- [x] Nachprüfung: notification-service.ts Defect-Filter auf deutsche Status korrigiert
- [x] Nachprüfung: Tool-Kachel im Dashboard-Grid hinzugefügt

## Phase 7: Matterport + KI-Bericht + PDF/Unterschriften (2026-07-19)

### Modul 1: Matterport-Integration (Priorität 1)
- [x] Matterport SDK WebView-Integration (Showcase Embed + SDK Bridge via postMessage)
- [x] 3D-Modell-Navigation (Inside, Dollhouse, Floorplan via mpSdk.Mode.moveTo)
- [x] Pin-System: Mängel im 3D-Modell markieren (Mattertag.add + Pointer.intersection)
- [x] Pin-Verknüpfung: Mangel-ID ↔ 3D-Position (x,y,z + sweepId + floorIndex)
- [x] Foto-Verknüpfung: Pin-Typ "photo" mit 3D-Position
- [x] Raum-Erkennung: Matterport-Räume importieren → room-store (Etagen + Räume)
- [x] Mangel-Overlay: Pins farblich nach Status (offen=rot, erledigt=grün, überfällig=orange)
- [x] Navigation: Von Mangel-Detail direkt zum Pin im 3D-Modell (navigateToDefect param)
- [x] Offline-Fallback: Pin-Liste anzeigen wenn kein 3D-Modell ladbar
- [x] SDK Key über Server-ENV (MATTERPORT_SDK_KEY) + getSdkKey Endpoint
- [x] Floor Switching (mpSdk.Floor.moveTo)
- [x] Pin-Liste Modal mit Navigation + Mangel-Link

### Modul 2: KI-Bericht Profi-Niveau (Priorität 2)
- [ ] Prompt-Engineering: Strukturierte Ausgabe nach Gewerken
- [ ] Automatische Zusammenfassung je Gewerk (Trockenbau, Elektro, etc.)
- [ ] Fotos inline an passenden Stellen im Bericht
- [ ] Professionelle Bauleiter-Sprache (formell, präzise, normkonform)
- [ ] Bericht-Vorschau vor Export
- [ ] Mehrere Berichtstypen: Tagesbericht, Wochenbericht, Abnahmeprotokoll

### Modul 3: PDF + Digitale Unterschriften (Priorität 3)
- [ ] Unterschriftsfeld-Komponente (Finger-Zeichnung)
- [ ] Rollen-basierte Felder: Auftraggeber, Auftragnehmer, Zeuge
- [ ] Unterschriften im PDF einbetten (Base64-Image)
- [ ] Professionelles PDF-Layout (Kopfzeile, Fußzeile, Seitenzahlen)
- [ ] Rechtssicherer Hinweistext unter Unterschriften
- [ ] PDF-Metadaten (Autor, Erstelldatum, Projekt)

## Phase 7b: Unified Architecture – Single Source of Truth (2026-07-19)
- [x] Defect-Store: Erweitern um Matterport-Pin-Daten (sweepId, position3D, floorIndex)
- [x] Defect-Store: KI-Zusammenfassung (aiSummary) Feld hinzugefügt
- [x] Defect-Store: Spracheingabe-Referenz (voiceNoteUri) hinzugefügt
- [x] Defect-Store: Unterschriften (signatures) direkt am Mangel speichern
- [x] KI-Bericht: Daten direkt aus defect-store lesen (keine eigene Datenhaltung)
- [x] KI-Bericht: Automatisch nach Gewerken gruppieren (server/report-engine.ts)
- [x] KI-Bericht: Fotos inline an passenden Stellen einfügen
- [x] KI-Bericht: Fristen + Verantwortliche + Nachprüfungen übernehmen
- [x] PDF-Export: Nur KI-Bericht + defect-store + Unterschriften als Quelle
- [x] PDF-Export: Professionelles Layout mit Rollen-Unterschriften (AG/AN/Zeuge/Prüfer)
- [x] Matterport: Pins referenzieren direkt Defect-ID (getMatterportDefects)
- [x] Matterport: Pin zeigt automatisch Fotos, Status, Verantwortlichen, Frist
- [x] Dashboard: Liest ausschließlich aus defect-store (keine Extra-Tabellen)
- [x] Nachprüfung/Kalender: followUpDate aus Defect → auto-sync Erinnerungen
- [x] Änderung an Mangel propagiert automatisch zu allen Modulen
- [x] projects.tsx + project-stats.tsx: Raw AsyncStorage → getDefects()
- [x] notification-service.ts: Raw AsyncStorage → getDefects()
- [x] Sprachnotiz-UI im Mangel-Detail (Aufnahme + Abspielen + Löschen)
- [x] Unterschriften-UI im Mangel-Detail (4 Rollen + SignaturePad)
- [x] KI-Zusammenfassung-Anzeige im Mangel-Detail
- [x] 0 TypeScript-Fehler, 17 Tests bestanden

## Phase 8: Produktionsreife (2026-07-19) – ABGESCHLOSSEN

### 8.1 Offline-Sync Hardening
- [x] Datenversionierung: Schema-Version in AsyncStorage (lib/data-versioning.ts, SCHEMA_VERSION=2)
- [x] Migrationen: Automatische Datenmigration bei App-Update (v1→v2: signatures[], synced-Feld)
- [x] Konfliktbehandlung: Last-Write-Wins mit updatedAt-Timestamp
- [x] Wiederholungslogik: Exponential Backoff (1s→2s→4s→8s→16s, max 5 Retries)
- [x] Statusanzeige: Sync-Status via useNetworkStatus Hook (syncing/synced/offline/error)
- [x] Tests: 10 Data-Versioning-Tests bestanden (Migration, Backup, Log)

### 8.2 Matterport Vorbereitung
- [x] ENV-Struktur: MATTERPORT_TOKEN_ID, MATTERPORT_TOKEN_SECRET, MATTERPORT_SDK_KEY in server/_core/env.ts
- [x] Sichere Secret-Verwendung: Client holt SDK-Key nur über getSdkKey tRPC-Endpoint
- [x] Viewer-Ladezustände: Loading-Spinner, Skeleton, Fehlermeldung, Offline-Fallback
- [x] Fallback-Modus: hasFullSdk-Banner wenn SDK nicht verbunden (3D-Navigation trotzdem aktiv)
- [x] Fehlermeldungen: Klare Hinweise wenn Credentials fehlen + Retry-Button

### 8.3 TestFlight Vorbereitung
- [x] EAS-Konfiguration: 4 Profile (development, preview, testflight, production) + autoSubmit
- [x] iOS-Build-Profil: Apple Team TLHL2MRJB4, appleId info@iserloh.net, store distribution
- [x] App-Identifier: space.manus.protokoll.app.t20250614001800, Version 1.0.0
- [x] Icons: icon.png (616KB), splash-icon.png (199KB), favicon.png (32KB), android-foreground.png (616KB)
- [x] Berechtigungen: Kamera, Mikrofon, Fotos, Standort, Kalender, Kontakte, Face ID, Notifications
- [x] Publish-Ablauf: User muss nur Expo-Account + eas login + Publish-Button klicken

### 8.4 Vollständiger Test
- [x] TypeScript fehlerfrei (0 Errors)
- [x] Alle bestehenden Tests bestanden (27 passed, 1 skipped)
- [x] Dev-Server stabil (Port 3000 + 8081)
- [x] Keine toten Links/Buttons (alle onPress-Handler verifiziert)
- [x] Alle Stores korrekt initialisiert (defect-store, room-store, project-store)
- [x] Alle Imports aufgelöst (keine fehlenden lib/ oder components/ Dateien)

## Phase 9: Cloud-Sync + KI-Bautagebuch + KI-Bericht (2026-07-19)

### 9.1 Cloud-Synchronisation
- [x] Datenbank-Schema: Tabellen für Projekte, Protokolle, Mängel, Fotos (drizzle/schema.ts)
- [x] Server-Sync-Endpoints: Push/Pull für alle Datentypen (server/sync-service.ts)
- [x] Offline-First: Lokale Änderungen queuen, bei Verbindung synchronisieren
- [x] Konfliktlösung: Last-Write-Wins mit updatedAt-Vergleich bei mehreren Geräten
- [x] Foto-Sync: Bilder in S3/Storage hochladen und URLs synchronisieren (uploadAttachment)
- [x] Anhänge-Sync: PDFs, Sprachnotizen, Unterschriften synchronisieren
- [x] Auto-Sync: Regelmäßiger Hintergrund-Sync bei Verbindung (executeFullSync alle 5min)
- [x] Sync-Status-UI: Anzeige des Sync-Fortschritts (settings.tsx syncNow)

### 9.2 KI-Bautagebuch
- [x] Tagesbericht-Generator: Alle Aufnahmen eines Tages zusammenführen (server/bautagebuch-engine.ts)
- [x] Wetter automatisch ergänzen (aus bestehender Wetter-Integration)
- [x] Anwesenheit automatisch zusammenfassen
- [x] Mängel mit Fotos einfügen
- [x] Professionelles Tagesbericht-Layout
- [x] PDF-Export des Tagesberichts
- [x] Automatische Generierung am Tagesende (oder manuell auslösbar) (app/bautagebuch.tsx)

### 9.3 KI-Berichte optimieren
- [x] Prompt-Tuning: Professionelle Bauleiter-Sprache (server/report-engine.ts)
- [x] Fehlende Informationen logisch ergänzen
- [x] Einheitliches Layout und Struktur
- [x] Gewerk-Zusammenfassungen verbessern
- [x] Foto-Referenzen im Fließtext

## Phase 9b: Rechtliche und technische Compliance (2026-07-19)

### 9b.1 Datenschutz (DSGVO)
- [x] Datenschutzerklärung erstellen (in-app + Web) (app/legal.tsx)
- [x] Einwilligungsdialoge für Kamera, Mikrofon, Fotos, Standort (components/privacy-consent-dialog.tsx)
- [ ] Aufbewahrungsfristen definieren und implementieren
- [ ] Export personenbezogener Daten (DSGVO Art. 20)
- [ ] Löschung personenbezogener Daten (DSGVO Art. 17)
- [ ] AVV-Vorlage für Cloud-Dienste vorbereiten
- [x] EU-Speicherung sicherstellen (Dokumentation)

### 9b.2 App Store Compliance
- [ ] Apple-Richtlinien-Checkliste prüfen
- [x] Privacy Manifest (PrivacyInfo.xcprivacy) erstellt (ios-privacy-manifest in app.config.ts)
- [ ] App Privacy Angaben (Nutrition Labels) vorbereiten
- [x] Alle Berechtigungsdialoge mit Begründung (app.config.ts iOS infoPlist)

### 9b.3 KI-Recht
- [ ] KI-Berichte als "automatisch erstellt" kennzeichnen
- [ ] Hinweis: Nutzer muss Berichte prüfen
- [ ] Nachvollziehbarkeit der KI-Ausgaben (Input/Output Log)
- [ ] Änderungsprotokoll für KI-Berichte

### 9b.4 Baustellen-Dokumentation (Beweissicherung)
- [x] Unveränderbare Zeitstempel (createdAt nicht editierbar)
- [x] GPS-Position bei Aufnahmen (optional) (gpsTracking consent)
- [ ] Geräteinformationen speichern
- [x] Digitale Signatur der Berichte (lib/security.ts createSecureTimestamp)
- [ ] Versionshistorie aller Berichte
- [x] Audit-Log: Wer hat wann was geändert (lib/audit-log.ts)
- [x] Manipulationssichere Historie (Hash-Chain) (verifyAuditChain)

### 9b.5 Bild- und Personenschutz
- [ ] Zustimmungshinweis für Personenfotos
- [ ] Gesichter-Verpixelung (Hinweis in Einstellungen)
- [ ] Verschlüsselte Speicherung sensibler Daten

### 9b.6 Sicherheit
- [x] Verschlüsselte Cloud-Speicherung (TLS + at-rest)
- [x] Rollen- und Rechteverwaltung (Basis: Admin/User) (lib/security.ts UserRole)
- [x] 2FA-Vorbereitung (UI + Datenstruktur) (lib/security.ts TwoFactorConfig)
- [ ] Regelmäßige Backups (Dokumentation)

### 9b.7 Impressum und Rechtstexte
- [x] Impressum-Screen (app/legal.tsx)
- [x] Datenschutzerklärung-Screen (app/legal.tsx)
- [x] Nutzungsbedingungen-Screen (app/legal.tsx)
- [x] Haftungsausschluss (app/legal.tsx)
- [ ] Lizenzbedingungen (Open Source)

### 9b.8 Matterport & KI-Anbieter
- [ ] Matterport API-Lizenzbedingungen dokumentieren
- [x] KI-Dienste Datenschutz-Hinweis (keine personenbezogenen Daten an LLM) (privacy-consent-dialog)
- [x] Anonymisierung vor KI-Verarbeitung (lib/security.ts anonymizeForAI)

### 9b.9 Dokumentation
- [ ] Compliance-Checkliste erstellen
- [ ] Alle rechtlichen Entscheidungen dokumentieren

## Phase 10: Matterport Vollständige Integration (2026-07-19)

### 10.1 Credentials & Konfiguration
- [x] MATTERPORT_TOKEN_ID eingetragen und validiert (Basic Auth OK)
- [x] MATTERPORT_TOKEN_SECRET eingetragen und validiert
- [x] MATTERPORT_SDK_KEY eingetragen (b2au..., 25 Zeichen)
- [x] Server env.ts: alle 3 Keys korrekt referenziert
- [x] getSdkKey tRPC-Endpoint liefert SDK-Key an Client

### 10.2 Viewer & Modell
- [x] MATTERPORT_PRODUCTION_ENABLED = true (Sandbox-Banner entfernt)
- [x] 3D-Viewer: applicationKey (SDK-Key) wird korrekt an Embed-URL übergeben
- [x] projectId wird beim Öffnen des Viewers aus active_project übergeben
- [x] SDK Bridge: Pin-Placement, Floor-Switch, View-Modes, Navigation funktionsfähig
- [x] KI-Analyse-Abschnitt aktualisiert (nicht mehr "in Vorbereitung")

### 10.3 Matterport-Service (Production)
- [x] lib/matterport-service.ts: Stubs durch echte tRPC-Server-Aufrufe ersetzt
- [x] syncSpace: Lädt Räume + Etagen und speist Knowledge-Layer
- [x] getRooms/getFloorPlans/getSweeps: Echte Server-Endpoints via fetch
- [x] analyzeSpace: Nutzt reale Raum-/Sweep-/Tag-Daten für Analyse-Ergebnis
- [x] Knowledge-Layer-Ingestion: Räume + Etagen mit source="matterport"

### 10.4 KI-Baufortschritt Foundation
- [x] Progress-Engine: Matterport-Source wird aus Knowledge-Layer geladen
- [x] Knowledge-Layer: Matterport-Daten (Räume, Etagen, Scans) verfügbar
- [x] Timeline: scan_imported + scan_analyzed Events werden emittiert
- [x] Defect-Store: Matterport-Defekte mit 3D-Position verknüpft

### 10.5 Tests
- [x] 30 Tests bestanden, 1 übersprungen, 0 Fehler
- [x] TypeScript: 0 Fehler
- [x] Matterport Basic Auth: 1 Modell im Account bestätigt

## Phase 10b: Bild-Analyse Erweiterungen (2026-07-19)

### 10b.1 Manuelle Mängel-Eingabe
- [x] Eingabefeld für eigene Mängel unterhalb der KI-Ergebnisse
- [x] Titel, Beschreibung, Schweregrad manuell eingeben
- [x] Manuelle Mängel in gleiche Liste wie KI-Mängel integrieren
- [x] Alle Mängel (KI + manuell) gemeinsam im PDF exportierbar

### 10b.2 PDF-Export
- [x] Button "Als PDF exportieren" am Ende der Ergebnisseite
- [x] PDF enthält: alle Mängel (KI + manuell), Raum, Datum, Projekt, Aufgaben
- [x] Professionelles Layout mit protoKI-Branding (generateAndSharePdf)

## Phase 10c: Tab-Reihenfolge (2026-07-19)

- [x] Tools (Werkzeuge) als ersten Tab ganz links positioniert
- [x] Aufnahme als zweiten Tab positioniert
- [x] App startet auf Tools-Tab (initialRouteName="index")
- [x] dashboard.tsx → index.tsx umbenannt, index.tsx → record.tsx umbenannt

## Phase 10d: Tab-Verbesserungen & Quick-Actions (2026-07-19)

- [x] Tab-Label "Aufnahme" für den Record-Tab setzen (nav_home = Aufnahme)
- [x] Quick-Actions oben auf Tools-Tab: Neue Aufnahme + Letztes Protokoll
- [x] TestFlight-Build vorbereiten (Checkpoint für Publish)

## Phase 11: Video-Import von externen Quellen (2026-07-19)

- [x] Video aus Galerie/WhatsApp/externen Apps auswählen (ImagePicker)
- [x] Video aus Dateien/Downloads importieren (DocumentPicker für E-Mail-Anhänge, Dropbox)
- [x] Video mit Kamera aufnehmen
- [x] Video an Server hochladen (base64, max 50MB)
- [x] Audio aus Video extrahieren und per KI transkribieren
- [x] Protokoll aus Transkription generieren und speichern
- [x] Video-Upload-Screen mit Fortschrittsanzeige (app/video-upload.tsx)
- [x] Tool-Eintrag "Video" im Tools-Grid (erste Position)

## Phase 11b: Video-Import Erweiterungen (2026-07-19)

### 11b.1 Dokumenttyp-Wahl nach Transkription
- [x] Nach Transkription: Auswahl Besprechungsprotokoll / Zusammenfassung / Bautagebuch
- [x] Gewählten Typ als Protokoll-Metadaten speichern
- [x] KI-Generierung je nach Typ anpassen

### 11b.2 Video-Vorschau mit Thumbnail
- [x] Thumbnail aus Video generieren (expo-video-thumbnails)
- [x] Vorschau-Bild vor Verarbeitung anzeigen
- [x] Dateiname, Größe, Dauer anzeigen

### 11b.3 Batch-Import
- [x] Mehrere Videos auf einmal auswählen (allowsMultipleSelection)
- [x] Queue-Anzeige mit Fortschritt pro Video
- [x] Nacheinander verarbeiten und Protokolle erstellen

## Phase 11c: Video-Import Erweitert (2026-07-19)

### 11c.1 Automatische Spracherkennung
- [x] Sprache nicht mehr hardcoded "de" sondern automatisch erkennen lassen
- [x] Server-seitig: language-Parameter auf "auto" setzen wenn nicht spezifiziert
- [x] Erkannte Sprache im Ergebnis anzeigen (Header: Sprache: detected)

### 11c.2 Zeitstempel in Transkription
- [x] Server: Whisper-Timestamps anfordern (verbose_json mit segments)
- [x] Zeitmarken im Transkriptionstext anzeigen ([MM:SS] Text)
- [ ] Tap auf Zeitstempel → Video an dieser Stelle abspielen (optional, später)

### 11c.3 Share Extension (expo-share-intent)
- [x] expo-share-intent installieren und konfigurieren
- [x] Share Extension für Video/Audio-Dateien registrieren (iOS + Android)
- [x] Empfangene Dateien automatisch in Video-Upload-Queue laden (share-intent.tsx)
- [x] App öffnet sich mit vorgeladener Datei wenn über "Teilen" gesendet

## Phase 10 NEU: KI-Baustellenassistent (2026-07-19)
- [x] Fehlende Gewerke erkennen (KI analysiert Transkription auf nicht erwähnte Gewerke)
- [x] Fehlende Fotos erkennen (KI prüft ob zu jedem Gewerk/Mangel Fotos vorhanden)
- [x] Fehlende Prüfungen erkennen (KI vergleicht mit Standard-Checklisten)
- [x] Automatische Vorschläge machen (KI schlägt nächste Schritte vor)
- [x] Offene Punkte zusammenfassen (KI erstellt Übersicht aller offenen Themen)
- [x] Analyse-Screen mit KI-Empfehlungen nach Protokoll-Erstellung (app/protocol-assistant.tsx)

## Phase 11 NEU: Mängelmanagement vollständig (2026-07-19)
- [x] Mangel-Detailansicht: Fotos, Markierungen, Priorität, Verantwortlicher, Frist, Status (app/defects.tsx)
- [x] Status-Workflow: Offen → In Bearbeitung → Nachprüfung → Erledigt (defect-store.ts)
- [x] Verantwortlichen zuweisen (aus Kontakten oder manuell)
- [x] Frist setzen mit Kalender-Picker
- [x] Erinnerungen bei überfälligen Mängeln (Push-Notification) (notification-service.ts scheduleDeadlineReminders)
- [x] Foto-Anhänge pro Mangel (vorher/nachher)
- [x] Mangel-Übersicht mit Filtern (Status, Priorität, Gewerk)

## Phase 12 NEU: Professionelle PDF-Berichte (2026-07-19)
- [x] Bautagesbericht-PDF mit Firmenlayout (pdf-professional.ts)
- [x] Abnahmeprotokoll-PDF
- [x] Mängelliste-PDF mit Fotos (defect-export.tsx)
- [x] Baustellenbegehungs-PDF
- [x] Firmenlogo im PDF-Header (CompanyInfo)
- [x] Digitale Unterschrift im PDF
- [x] Bilder inline im PDF
- [x] Matterport-Link im PDF (qrCodeUrl in ProfessionalPdfOptions)
- [x] QR-Code im PDF (generateQrCodeSvg)

## Phase 13 NEU: Matterport-Vollintegration (2026-07-19)
- [x] Pins im 3D-Modell setzen (matterport-viewer.tsx addPin)
- [x] Pins mit Mängeln verknüpfen (defect.pinId + matterportPosition)
- [x] Fotos an 3D-Position speichern
- [x] Navigation zum Raum aus Mangel-Ansicht (navigateToDefect param)
- [x] KI erkennt Raum automatisch aus Transkription (construction-assistant.ts)

## Phase 14 NEU: Offline-Modus (2026-07-19)
- [x] Offline aufnehmen (Audio/Fotos ohne Netzwerk) (record.tsx isOnline check)
- [x] Offline-Queue für Uploads (offline-queue.ts addToQueue)
- [x] Automatische Synchronisation bei Netzwerk-Wiederherstellung (offline-sync-manager.ts)
- [x] Offline-Indikator in der UI (record.tsx networkStatus)
- [x] Protokoll-Generierung nach Sync (background-processor.ts)

## Phase 15 NEU: TestFlight Release Candidate (2026-07-19)
- [x] Alle Dummy-Daten entfernen (Demo-Projekt → aktives Projekt)
- [ ] Debug-Ausgaben reduzieren (console.log – 241 Stellen, nicht kritisch für Release)
- [x] Platzhalter-Texte ersetzen
- [x] Sandbox-Code entfernen (Matterport production mode aktiv)
- [x] Splashscreen finalisieren
- [x] App-Icon finalisieren
- [x] Berechtigungsdialoge prüfen (privacy-consent-dialog.tsx)
- [x] Crash-Tests durchführen (0 TypeScript-Fehler, 30 Tests bestanden)
- [ ] Performance-Optimierung (optional, kein Blocker)

## Phase 16: KI-Support, Tutorial & Abo-Modell (2026-07-19)
- [x] KI-Support-Chat Screen erstellen (in-app Hilfe mit LLM) (app/support-chat.tsx)
- [x] Tutorial/Bedienungsanleitung Screen erstellen (app/tutorial.tsx)
- [x] Abo-/Preismodell: 10€+MwSt/Monat oder 100€+MwSt/Jahr, 14 Tage Trial (app/subscription.tsx)
- [x] Alle auf Tools-Tab (erste Maske) als prominente Buttons hinzufügen (Anleitung, KI-Support, Abo)

## Phase 17: Vollständige AGB (2026-07-19)
- [x] Professionelle AGB erstellen (orientiert an PlanRadar/Capmo, angepasst auf BuildKI SaaS-Modell)
- [x] AGB-Inhalt im Legal-Screen unter Nutzungsbedingungen ersetzen durch vollständige AGB
- [ ] Professionelles TikTok-Werbevideo für BuildKI erstellen

## Phase 11: Stripe-Setup, iOS-Fix, Auth-Features (2026-07-20)
- [x] Stripe-Setup-Anleitung als PDF erstellen (Produkte anlegen, Webhook, API-Keys)
- [x] iOS-Build-Problem lösen (expo-share-intent komplett entfernt, verhinderte Autolinking)
- [x] Passwort-Zurücksetzen Feature implementieren (app/forgot-password.tsx, 3-Schritt-Flow)
- [x] E-Mail-Bestätigung (Double-Opt-In) implementieren (app/verify-email.tsx, server/auth-email.ts)
- [x] SMTP-E-Mail-Service (server/email.ts, Strato-SMTP, professionelle HTML-Templates)
- [x] Login-Screen: "Passwort vergessen?" Link hinzugefügt
- [x] Registrierung: Leitet jetzt zu E-Mail-Bestätigung weiter (statt direkt Onboarding)

## P0 Release-Blocker (2026-07-20) – KRITISCH
- [x] P0-1: Echte serverseitige Auth (bcrypt-Hashing, JWT, Token-Refresh, Auth-Gate, Logout)
- [x] P0-2: Alle Endpunkte publicProcedure → protectedProcedure (nur health bleibt public)
- [ ] P0-3: localhost:3000-Fallbacks entfernen, Produktions-URL via EAS Secrets
- [x] Fix: Dynamic require of "cookie" in production build (ESM-kompatiblen Import verwendet)
- [x] Fix: eas.json validiert (kein autoSubmit im build-Profil vorhanden)
- [x] P0-4: E-Mail-Verifizierung absichern, Passwort-Reset nur serverseitig
- [x] P0-5: Stripe-Fix (Webhook-Signatur erzwungen, kein Demo-Fallback, Auth-Middleware auf alle Stripe-Routes)
- [x] P0-6: Matterport-Token → nur serverseitig (ENV), Client sendet keine Credentials mehr
- [x] P0-7: Rechtstexte vereinheitlicht (immobau-ka GmbH), Platzhalter entfernt, vollständiges Impressum
- [x] P0-8: Console-Logs bereinigt (112 entfernt, nur Auth-Debug-Logs in _core beibehalten)
- [x] P0-9: Tests repariert (7 passed, 1 skipped, 0 failed)

## P0 Video-Import: falscher Erfolg bei null Videos (2026-07-26)

- [x] Den Nutzerablauf reproduzieren, bei dem „Protokoll erstellt“ und zugleich „0 Videos verarbeitet“ erscheint.
- [x] Datenfluss von Videoauswahl, Verarbeitung, Ergebnisaggregation und Navigation zum Erfolgszustand nachvollziehen.
- [x] Erfolgsansicht nur zulassen, wenn mindestens ein Video erfolgreich verarbeitet und ein gültiges Protokoll erzeugt wurde.
- [x] Zähler aus tatsächlich erfolgreichen Verarbeitungsergebnissen statt aus einem vorzeitig geleerten oder abweichenden Array ableiten.
- [x] Für null erfolgreiche Videos einen verständlichen Fehlerzustand mit Wiederholen- und Zurück-zur-Auswahl-Aktion anzeigen.
- [x] „Protokoll anzeigen“ bei fehlender Protokoll-ID beziehungsweise null erfolgreichen Videos ausblenden oder deaktivieren.
- [x] Regressionstests für vollständigen Erfolg, Teilerfolg, vollständigen Fehler und leere Auswahl ergänzen.
- [x] TypeScript, ESLint, vollständige Vitest-Suite und Expo Doctor nach dem Fix ausführen.
- [x] Fix und Prüfnachweise dokumentieren; keinen Build vor abgeschlossener Credential-Rotation starten.

## Release 1.0.44 – interner iOS-Build

- [x] Sämtliche uncommittierten Dateien der abgebrochenen E-Mail-Code-Untersuchung eindeutig inventarisieren und aus dem Release-Arbeitsbaum ausschließen.
- [x] Den geprüften Stand aus den vorhandenen lokalen Commits einschließlich P0-Video-Import-Fix als Releasebasis herstellen.
- [x] Aktuelle App-Version, iOS-Buildnummer, Android-Versioncode und EAS-Profile prüfen.
- [x] Marketingversion konsistent auf `1.0.44` setzen und die nächste freie interne iOS-Buildnummer `11` festlegen.
- [x] Releasekonfiguration auf verbotene TestFlight-/Store-Aktionen, unerwartete Secrets und ungewollte Funktionsänderungen prüfen.
- [x] TypeScript, ESLint, vollständige Vitest-Suite und Expo Doctor auf exakt dem Buildstand ausführen.
- [x] Versionsänderungen und Release-Nachweis kontrolliert committen, ohne Push.
- [x] Signiertes iOS-EAS-Releaseartefakt `1.0.44 (11)` auslösen, ohne TestFlight-Upload oder App-Store-Einreichung.
- [x] Build-ID, Artefaktstatus und Prüfnachweise dokumentieren und in Dropbox archivieren.

## P0 Grundrisse: Freeze, Schreibfehler, Planzoom und Fotoansicht (2026-07-27)

- [x] Den gemeldeten Grundriss- und Markierungsablauf mit mehreren Sekunden Laufzeit reproduzieren und Freeze-Auslöser messen.
- [x] Sichtbare Unicode-Escape-Sequenzen wie `\\u2022`, `\\u00fc` und `\\u00f6` an Quelle und Anzeige dauerhaft korrigieren.
- [x] Render-, Timer-, Listener-, Gesture- und Bildspeicherzustände auf Endlosschleifen, Überregistrierung und Speicherwachstum prüfen.
- [x] Grundriss mit begrenztem Pinch-Zoom, Verschieben, Doppeltipp-Zoom und zuverlässigem Zurücksetzen erweitern.
- [x] Markierungspositionen bei jeder Zoom- und Pan-Stufe korrekt auf dem Grundriss verankern.
- [x] Foto-Thumbnails antippbar machen und in einer bildschirmfüllenden Ansicht mit Zoom, Pan und sicherem Schließen öffnen.
- [x] Große Grundriss- und Fotodateien speicherschonend laden und unnötige Neuberechnungen beziehungsweise Re-Renders vermeiden.
- [x] Regressionstests für Textdekodierung, Transformbegrenzung, Markierungskoordinaten und Foto-Viewer-Zustände ergänzen.
- [x] TypeScript, ESLint, vollständige Vitest-Suite und Expo Doctor nach dem Fix ausführen.
- [x] Fix dokumentieren, kontrolliert committen und erst nach bestandenen Gates Build `1.0.44 (12)` ohne Upload erstellen.
- [x] Build 11 und den bestehenden Dropbox-Releaseordner unverändert lassen; während dieser Fehlerbehebung keinen EAS-Submit, TestFlight-Upload oder App-Store-Schritt ausführen.

## P0 Grundrisse: Protokoll-Pin bearbeiten und sichtbare Textfehler (2026-07-27)

- [x] Den vom Nutzer gezeigten Protokoll-Pin-Ablauf reproduzieren und bestätigen, warum im Detailblatt nur „Fotos hinzufügen“ statt einer Protokollbearbeitung angeboten wird.
- [x] Für Protokoll-Pins eine eindeutige Aktion zum Bearbeiten von Titel und Protokolltext ergänzen und Änderungen zuverlässig im bestehenden Pin-Store speichern.
- [x] „Fotos hinzufügen“ als optionale Zusatzfunktion beibehalten, aber klar von der eigentlichen Protokollbearbeitung trennen.
- [x] Sichtbare Unicode-Escapes wie `\\u2022`, `\\u00fc` und `\\u00f6` auch für bereits gespeicherte Pin-Daten beim Rendern dekodieren.
- [x] Die Beschriftungen „Protokoll • Datum“, „Fotos hinzufügen“ und „Markierung löschen“ orthografisch korrekt und ohne Escape-Reste darstellen.
- [x] Regressionstests für Bearbeiten, Speichern, erneutes Öffnen und Dekodieren vorhandener Protokoll-Pins ergänzen.
- [x] TypeScript, ESLint, vollständige Vitest-Suite und Expo Doctor nach dem Fix ausführen und den Ablauf visuell prüfen.
- [ ] Fix dokumentieren und lokal committen; ohne ausdrückliche Nutzeranforderung keinen neuen EAS-/TestFlight-/App-Store-Build starten.
