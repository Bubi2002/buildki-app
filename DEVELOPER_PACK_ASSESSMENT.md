# protoKI Developer Pack – Bewertung & Integrationsplan

## 1. Zusammenfassung

Das Developer Pack definiert eine **Zielarchitektur** für protoKI mit Fokus auf KI-Bildanalyse, strukturierte Mängel-/Aufgabenverwaltung und Matterport-Integration. Die bestehende App hat bereits eine solide Grundlage mit tRPC-Backend, AsyncStorage für lokale Daten, Drizzle/MySQL für Cloud-Sync, und einem funktionierenden LLM-Proxy mit Vision-Support.

**Empfehlung:** Die Developer-Pack-Ziele werden **modular in die bestehende Architektur integriert**, nicht als Neuaufbau. Die tRPC-API bleibt bestehen (kein Wechsel zu REST), AsyncStorage bleibt für lokale Daten, und neue Entitäten werden schrittweise in die DB aufgenommen.

---

## 2. Ist-Zustand vs. Developer Pack

| Bereich | Ist-Zustand | Developer Pack | Bewertung |
|---------|-------------|----------------|-----------|
| **Projekte** | AsyncStorage lokal, Cloud-Sync als JSON | DB-Entität mit company_id, address, status | Bereits funktional, DB-Migration optional |
| **Protokolle** | AsyncStorage + DB-Sync (protocols-Tabelle) | Nicht explizit im Pack (wird als "Report" abgebildet) | Bleibt wie ist |
| **Fotos** | Lokal als Base64/URI, in Protokoll eingebettet | MediaAsset-Entität mit storage_key, room_id | **Erweiterung nötig** für Analyse-Flow |
| **KI-Analyse** | Protokoll-Generierung per LLM (Text) | Strukturierte JSON-Ausgabe mit Schema | **Neu zu implementieren** |
| **Mängel** | Einfache Liste in Mängel-Tool (lokal) | DB-Entität mit severity, status, assignee | **Erweiterung sinnvoll** |
| **Aufgaben** | To-Dos in Protokollen (JSON-Array) | Eigenständige Task-Entität | **Erweiterung sinnvoll** |
| **Berichte** | PDF-Generator (client-seitig) | Server-seitige Report-Entität mit Versionierung | Bleibt client-seitig, Metadaten in DB |
| **Matterport** | Backend-Service implementiert, App-Screen vorhanden | Phase 1 fertig, Phase 2-3 nach Freischaltung | **Gating hinzufügen** |
| **Rollen/Rechte** | Einfaches user/admin | 4 Rollen (Admin, Projektleiter, Bauleiter, Gast) | Später, nicht Phase 1 |
| **Company/Mandant** | Nicht vorhanden | Company-Entität | Später, nicht Phase 1 |

---

## 3. Was bereits abgedeckt ist

Die folgenden Developer-Pack-Anforderungen sind **bereits implementiert oder funktional äquivalent**:

- **Projekte anlegen/verwalten** – Vollständig in AsyncStorage mit Farbe, Präfix, Nummerierung, Archivierung, Favoriten
- **Audio aufnehmen/hochladen** – Audio-Modus mit Background-Processing
- **Bautagesbericht** – Über Protokoll-Vorlagen (templateId: "bautagebericht")
- **PDF-Export** – Client-seitiger PDF-Generator mit Branding, Fotos, To-Dos
- **Matterport Phase 1** – Backend-Service + App-Screen (connect, listModels, getModel)
- **Offline-Toleranz** – Offline-Queue mit automatischer Sync
- **Baustellenfotos** – Foto-Aufnahme während Recording, Annotation, Plan-Markierung

---

## 4. Was neu implementiert werden muss

### 4.1 KI-Bildanalyse (Priorität 1)

**Ziel:** Aus Baustellenfotos strukturierte Ergebnisse erzeugen (Raumtyp, Bauphase, Fortschritt, Mängel, nächste Schritte).

**Implementierungsansatz:**
- Neuer tRPC-Endpunkt `analysis.photo` (Mutation)
- Input: Base64-Bild(er), optional Raum/Gewerk/Notiz, project_id (lokal)
- LLM-Aufruf mit Vision (`gemini-3-flash-preview` für Kosten/Qualität-Balance)
- Strukturierte Ausgabe per `response_format: json_schema` mit dem Schema aus dem Developer Pack
- Ergebnis lokal in AsyncStorage speichern (wie Protokolle)
- Optional: DB-Sync für Cloud-Backup

**Warum kein DB-Pflicht:** Die App funktioniert primär offline-first. Analysen werden lokal gespeichert und können optional synchronisiert werden.

### 4.2 Mängel-Management (Priorität 2)

**Ziel:** Aus KI-Analysen erkannte Mängel als eigenständige Entitäten verwalten.

**Implementierungsansatz:**
- Erweiterung des bestehenden Mängel-Tools (bereits im Dashboard)
- Datenmodell: `{ id, projectId, title, description, severity, status, confidence, sourceAnalysisId, photos, roomId, dueDate, assignee, createdAt }`
- Speicherung: AsyncStorage (Key: `defects`)
- Status-Flow: `possible` → `confirmed` → `in_progress` → `resolved`
- KI-erkannte Mängel starten als `possible` und werden erst nach User-Bestätigung zu `confirmed`

### 4.3 Aufgaben aus Analysen (Priorität 2)

**Ziel:** Nächste Schritte aus KI-Analysen als verfolgbare Aufgaben anlegen.

**Implementierungsansatz:**
- Erweiterung des bestehenden To-Do-Systems
- Aufgaben aus `next_steps` der Analyse werden als Vorschläge angezeigt
- User bestätigt/verwirft einzelne Vorschläge
- Bestätigte Aufgaben werden dem Projekt zugeordnet
- Kompatibel mit bestehendem CSV/Excel-Export

### 4.4 Matterport Gating (Priorität 3)

**Ziel:** Matterport-Funktionen vorbereiten, aber erst nach Produktionsfreigabe aktivieren.

**Implementierungsansatz:**
- Environment-Variable `MATTERPORT_PRODUCTION_ENABLED=false`
- Backend gibt bei Sandbox-Status klare Fehlermeldung zurück
- App zeigt "Coming Soon" / Sandbox-Hinweis im Matterport-Screen
- Kein Code-Entfernung, nur Feature-Flag

---

## 5. Was bewusst NICHT umgebaut wird

| Aspekt | Begründung |
|--------|-----------|
| **tRPC → REST** | tRPC funktioniert, ist typsicher, und ein Wechsel bringt keinen Mehrwert |
| **AsyncStorage → nur DB** | Offline-First-Architektur ist ein Kernfeature für Baustellen |
| **Company/Mandanten** | Aktuell Single-User, Multi-Tenant kommt in Release 2.0 |
| **Rollen-System** | Aktuell nicht nötig, da Single-User; vorbereitet durch user.role |
| **Server-seitige PDF** | Client-seitige Generierung funktioniert gut und ist offline-fähig |
| **UUID statt Auto-Increment** | Bestehende IDs funktionieren, Migration wäre riskant |

---

## 6. Technische Umsetzungsreihenfolge

```
Phase 1: KI-Bildanalyse
├── Backend: tRPC analysis.photo Endpoint
├── Schema: construction_analysis.schema.json als response_format
├── App: Analyse-Screen (Foto wählen → Analysieren → Ergebnis-Karten)
└── App: Ergebnis bestätigen/korrigieren

Phase 2: Mängel & Aufgaben
├── App: Mängel aus Analyse übernehmen (mit Bestätigung)
├── App: Aufgaben aus next_steps übernehmen
├── Datenmodell: defects[] und tasks[] in AsyncStorage
└── Integration: Bestehender Mängel-Tool-Screen erweitern

Phase 3: Matterport Gating
├── Backend: Feature-Flag MATTERPORT_PRODUCTION_ENABLED
├── App: Sandbox-Status klar kommunizieren
└── Vorbereitung: Modell-Projekt-Zuordnung (für Phase 2 nach Freischaltung)
```

---

## 7. KI-Regeln (aus Developer Pack übernommen)

Diese Regeln werden **wörtlich im System-Prompt** der Bildanalyse implementiert:

1. „Nicht sichtbar" ≠ „nicht vorhanden"
2. Mangel nur als „sicher" wenn visuell ausreichend erkennbar
3. Bei Unsicherheit: „möglicher Mangel" mit confidence < 0.7
4. Fertigstellungsgrad ist eine Schätzung (als solche gekennzeichnet)
5. Keine DIN-/Rechtskonformität behaupten ohne Maße
6. Keine Personenidentifikation
7. Jede Aussage mit confidence 0-1 versehen

---

## 8. Fazit

Die Ergänzungen aus dem Developer Pack sind **sinnvoll und gut integrierbar**. Die bestehende Architektur muss nicht umgebaut werden – sie wird erweitert. Der wichtigste neue Baustein ist die **KI-Bildanalyse mit strukturierter JSON-Ausgabe**, die als Grundlage für Mängel, Aufgaben und später Matterport-Analysen dient.

**Geschätzter Aufwand:**
- Phase 1 (KI-Bildanalyse): ~1 Session
- Phase 2 (Mängel & Aufgaben): ~1 Session
- Phase 3 (Matterport Gating): ~30 Minuten

**Risiken:**
- LLM-Vision-Qualität bei schlechten Baustellenfotos (Dunkelheit, Unschärfe) → Fallback mit `needs_review`
- Kosten bei vielen Analysen → `gemini-3-flash-preview` als Default (günstig + gut bei Bildern)
- Matterport Sandbox-Limitierungen → klare Fehlermeldungen, kein stilles Scheitern
