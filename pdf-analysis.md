# PDF Analyse

## Beobachtungen:
1. **Zeitstempel-Problem**: PDF zeigt "Datum: 15.06.2026, Uhrzeit: 06:37" aber unter "Datum und Zeitstempel" steht "26. Oktober 2023, 10:30 Uhr" - das ist der LLM-generierte Text, der ein falsches Datum halluziniert hat. Das echte Datum ist 15.06.2026, 06:37.
2. **Bilder ohne Zuordnung**: Alle 3 Fotos sind am Ende als "Fotodokumentation" aufgelistet ohne Bezug zum Text.
3. **Gewünschtes Verhalten**: Wenn eine Markierung gesetzt wird, soll im Protokoll ein Abschnitt-Trenner kommen, und die Fotos sollen dem jeweiligen Abschnitt zugeordnet werden (Foto nach der Markierung → gehört zum vorherigen Abschnitt).
