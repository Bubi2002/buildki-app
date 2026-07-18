# 02 – AI Vision Spezifikation

## 1. Ziel

Aus einem oder mehreren Baustellenbildern soll protoKI strukturierte, fachlich vorsichtige Ergebnisse erzeugen.

## 2. Eingaben

Pflicht:
- project_id
- mindestens ein Bild
- Aufnahmedatum
- Benutzer

Optional:
- Raumname
- Geschoss
- Gewerk
- Freitextnotiz
- zugehöriger Plan
- vorherige Analyse
- Soll-Bauphase

## 3. Ausgaben

- erkannter Raumtyp
- erkannte Bauphase
- sichtbare abgeschlossene Leistungen
- sichtbare noch offene Leistungen
- mögliche sichtbare Mängel
- nächste sinnvolle Arbeitsschritte
- Fertigstellungsgrad als Schätzung
- Sicherheit je Aussage
- Begründung
- Warnhinweise

## 4. Zentrale KI-Regeln

- „Nicht sichtbar“ darf niemals als „nicht vorhanden“ ausgegeben werden.
- Ein Mangel darf nur als sicher bezeichnet werden, wenn er visuell ausreichend erkennbar ist.
- Bei Unsicherheit: „möglicher Mangel“.
- Fertigstellungsgrad ist eine Schätzung und muss als solche gekennzeichnet sein.
- Keine DIN-/Rechtskonformität behaupten, wenn Maße oder Randbedingungen fehlen.
- Personenbezogene Daten vermeiden.
- Keine Identifikation von Personen.

## 5. Fortschrittslogik

Fortschritt wird nicht frei geschätzt, sondern aus gewichteten Gewerken berechnet.

Beispiel Innenausbau:
- Rohbau/Öffnungen: 10 %
- Fenster/Außentüren: 10 %
- Haustechnik Rohinstallation: 15 %
- Trockenbau/Putz: 15 %
- Estrich: 10 %
- Fliesen: 10 %
- Maler: 10 %
- Boden: 10 %
- Innentüren/Endmontage: 10 %

Nicht sichtbare Gewerke werden als unknown behandelt und nicht automatisch mit 0 % gewertet.

## 6. Prompt-Verhalten

Systemanweisung:
- Antworte ausschließlich im definierten JSON-Schema.
- Trenne Beobachtung, Interpretation und Empfehlung.
- Markiere jede Aussage mit confidence zwischen 0 und 1.
- Nenne nur sichtbare oder aus Kontext eindeutig ableitbare Punkte.
- Gib keine verbindliche Abnahme- oder Rechtsbewertung.

## 7. Fehlerfälle

- unscharfes Bild
- zu dunkel
- Raum nicht erkennbar
- mehrere Räume vermischt
- kein Baustellenbezug
- widersprüchliche Bilder

In diesen Fällen:
- analysis_status = needs_review
- konkrete Nachforderung ausgeben, z. B. „zweites Bild der gegenüberliegenden Wand erforderlich“

## 8. Beispiel

Eingabe:
- Foto eines Badezimmers im Ausbau

Ausgabe:
- room_type: bathroom
- construction_phase: interior_finishing
- completed: Wandfliesen weitgehend verlegt
- missing: Sanitärobjekte, Silikonfugen, Endmontage Elektro
- potential_defects: einzelne ungleichmäßige Fugenbereiche
- progress_percent: 72
- confidence: 0.76
