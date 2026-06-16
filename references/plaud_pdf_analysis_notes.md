# Plaud-PDF-Analyse – Zwischenstand

## Quelle 1
`/home/ubuntu/upload/06-16_Gutachten_und_Austausch_zur_Sanierung_einer_Tankstellen-Außenanlage-Begründungszusammenfassung.pdf`

### Beobachtete Struktur
Die **Begründungszusammenfassung** ist der analytischste und redaktionell ausgearbeitetste Plaud-Typ. Bereits auf Seite 1 gibt es nach dem Titel eine große inhaltliche Überblicksfläche mit visueller Summary-Karte. Danach folgen klar betitelte Langform-Abschnitte mit narrativem Stil.

| Ebene | Beobachtung |
|---|---|
| Dokumenttitel | Datum + ausführlicher Betreff |
| Oberer Überblick | Ein kompakter visueller Summary-Block mit Kernthemen, Risiken und nächsten Schritten |
| Hauptteil | Mehrere ausführliche, thematische Kapitel mit Fließtext statt Stichpunkten |
| Kapitelbeispiele | **Einleitung und Kontext**, **Diskussion über künstliche Intelligenz**, **Fachlicher Austausch und Begutachtung der Mängel**, **Persönlicher Austausch**, **Begehung und konkrete Mängelfeststellung** |
| Abschluss | **Nächste Schritte** mit personenzugeordneten To-dos |

### Relevanz für unsere App
Für einen Plaud-ähnlichen Output-Typ **Begründungszusammenfassung** brauchen wir kein klassisches Protokoll, sondern ein strukturiertes **Narrativ mit thematischen Kapiteln**, einem Executive-Überblick am Anfang und einem klaren Abschnitt **Nächste Schritte** am Ende.

## Quelle 2
`/home/ubuntu/upload/06-16_Gutachten_und_Austausch_zur_Sanierung_einer_Tankstellen-Außenanlage-Besprechungszusammenfassung.pdf`

### Beobachtete Struktur
Die **Besprechungszusammenfassung** nutzt ein ruhiges, professionelles Layout mit viel Weißraum, klaren Abschnittsüberschriften und dünnen Trennlinien. Die Informationsarchitektur ist streng hierarchisch aufgebaut.

| Ebene | Beobachtung |
|---|---|
| Dokumenttitel | Datum + kurzer Betreff in großer fetter Zeile |
| Abschnitt 1 | **Kernpunkte** als stichpunktartige Management-Zusammenfassung |
| Abschnitt 2 | **Getroffene Entscheidungen** als kurze Entscheidungsblöcke |
| Abschnitt 3 | **Maßnahmen** |
| Unterabschnitt | **Aufgaben** als Tabelle mit Task, verantwortlicher Partei, Frist, Notizen |
| Abschluss | **Fristen** und **Folgemaßnahmen** |

### Relevanz für unsere App
Für den Plaud-ähnlichen Output sollten wir einen eigenen Dokumenttyp **Besprechungszusammenfassung** mit dieser Reihenfolge anbieten: Titel, Kernpunkte, Entscheidungen, Maßnahmen, Aufgabentabelle, Fristen, Folgemaßnahmen.

## Quelle 3
`/home/ubuntu/upload/06-16_Gutachten_und_Austausch_zur_Sanierung_einer_Tankstellen-Außenanlage-Sitzungsprotokoll.pdf`

### Beobachtete Struktur
Das **Sitzungsprotokoll** ist deutlich ausführlicher und verbindet Executive-Ebene mit chronologischer Detailtiefe.

| Ebene | Beobachtung |
|---|---|
| Dokumenttitel | Datum + Meeting-Titel in großer fetter Zeile |
| Abschnitt 1 | **Maßnahmen** als priorisierte Action-Items direkt am Anfang |
| Abschnitt 2 | **Wichtige Entscheidungen** als kompakte Bullet-Liste |
| Abschnitt 3 | **Detailliertes Protokoll** mit Zeitcodes in eckigen Klammern |
| Detaildarstellung | Je Zeitblock kurze Einleitung plus eingerückte Bullet-Points |
| Sprecherdarstellung | Teilweise generisch, z. B. „Speaker 2“, also nicht immer Klarnamen |

### Relevanz für unsere App
Für den Dokumenttyp **Sitzungsprotokoll** sollten wir einen Output mit drei Ebenen erzeugen: sofort sichtbare Maßnahmen, wichtige Entscheidungen und danach ein **zeitcodiertes Verlaufsprotokoll**. Das passt besonders gut zu Audio-gestützten Meetings.

## Quelle 4
`/home/ubuntu/upload/06-16_Gutachten_und_Austausch_zur_Sanierung_einer_Tankstellen-Außenanlage-Zusammenfassung.pdf`

### Beobachtete Struktur
Die **Zusammenfassung** ist das kompakteste Format. Sie besteht praktisch aus einer Ein-Seiten-Destillation mit sehr klarer Verdichtung.

| Ebene | Beobachtung |
|---|---|
| Dokumenttitel | Datum + Thema in großer Zeile |
| Hauptsektion | **Distillation** |
| Inhaltsform | Kurzer Einleitungssatz und dann prägnante Bullet-Points |
| Fokus | Entscheidungen, Kernerkenntnisse, nächste Schritte |

### Relevanz für unsere App
Dieser Dokumenttyp eignet sich für eine **Ultra-Kurzfassung** nach Plaud-Vorbild: eine Seite, nur die wichtigsten Erkenntnisse, ohne Detailprotokoll, ohne Tabellen, ohne lange Einleitungen.

## Vorläufige gemeinsame Design-Merkmale

| Merkmal | Plaud-Muster |
|---|---|
| Typografie | Große, klare Titel; mittelgroße Abschnittsüberschriften; dezente Fließtextgröße |
| Layout | Viel Weißraum, kaum visuelle Ablenkung, keine dekorativen Boxenflut |
| Inhalt | Starke Trennung von Summary, Decisions, Actions und Details |
| Tabellen | Nur dort, wo Verantwortlichkeit und Fristen klarer werden |
| Chronologie | Beim Protokoll mit Zeitstempeln, bei Zusammenfassungen thematisch statt chronologisch |

## Konsolidierte Plaud-Muster nach Dokumenttyp

| Dokumenttyp | Plaud-Muster | Empfohlene App-Logik |
|---|---|---|
| **Zusammenfassung** | Einseitige Destillation mit wenigen Bullet-Points | Kürzester KI-Output, ideal als Schnellansicht |
| **Besprechungszusammenfassung** | Kernpunkte, Entscheidungen, Maßnahmen, Aufgabentabelle | Management-tauglicher Meeting-Output |
| **Begründungszusammenfassung** | Thematische Kapitel + analytische Herleitung + nächste Schritte | Für Gutachten, komplexe Fachgespräche und Entscheidungsbegründungen |
| **Sitzungsprotokoll** | Maßnahmen, Entscheidungen, dann zeitcodierter Verlauf | Detaillierte Meeting-Dokumentation mit Audio-Bezug |

## Vorläufige Umsetzungsrichtung
Wir sollten die KI-Auswahl in mindestens diese Output-Typen gliedern:

1. **Zusammenfassung**
2. **Besprechungszusammenfassung**
3. **Begründungszusammenfassung**
4. **Sitzungsprotokoll**

Zusätzlich sollte der PDF-Generator für jeden Typ eine eigene Sektionenlogik statt eines generischen Layouts erhalten. Besonders wichtig ist dabei, dass nicht nur die Überschrift wechselt, sondern wirklich **Prompt, Abschnittsreihenfolge, Detaillierungsgrad und PDF-Struktur** pro Typ unterschiedlich erzeugt werden.

## Nächster Umsetzungsschritt
Im nächsten Schritt passe ich die bestehenden KI-Optionen, die Prompt-Logik und den PDF-Generator direkt an diese vier Plaud-Muster an.
