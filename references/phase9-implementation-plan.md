# Phase 9 Implementation Plan

## 9.1 Cloud-Sync Architecture

### Database Schema (drizzle/schema.ts)
Need to add these tables:
- `defects` table: mirrors the Defect type from lib/defect-store.ts
- `projects` table: for project sync
- `attachments` table: for file references (photos, voice notes, signatures)

### Key Fields for defects table:
- id (auto), localId (varchar 64), userId (int), projectId (varchar 64)
- title, description, status, priority, category, gewerk
- photos (JSON text), assignee, assigneeFirma, dueDate
- location, floor, room, positionCode
- followUpDate, followUpResult, source, confidence
- matterportModelId, matterportPosition (JSON), matterportSweepId
- aiSummary, voiceNoteUri, signatures (JSON)
- createdAt, updatedAt, resolvedAt

### Key Fields for projects table:
- id (auto), localId (varchar 64), userId (int)
- name, description, prefix, color
- createdAt, updatedAt

### Key Fields for attachments table:
- id (auto), entityType (defect/protocol/project), entityLocalId
- userId (int), storageKey (varchar 512), originalName, mimeType
- createdAt

### Server Endpoints (server/routers.ts - sync router):
Extend existing sync router with:
- `sync.pushDefects` - batch push defects to cloud
- `sync.pullDefects` - pull all user's defects (with updatedAt filter)
- `sync.pushProjects` - batch push projects
- `sync.pullProjects` - pull all user's projects
- `sync.uploadAttachment` - upload file to S3, return URL
- `sync.fullSync` - combined push+pull with conflict resolution

### Client Sync Service (lib/cloud-sync.ts):
Rewrite to support:
- Generic entity sync (not just protocols)
- Offline queue with retry
- Conflict resolution (last-write-wins via updatedAt)
- Photo upload queue (base64 → S3)
- Auto-sync on reconnect
- Sync status reporting

### Existing Infrastructure:
- server/storage.ts: storagePut(key, data, contentType) → {key, url}
- server/routers.ts line 263-382: existing protocol sync (pushProtocol, pullProtocols, deleteProtocol)
- lib/offline-sync-manager.ts: has queue + exponential backoff
- hooks/use-network-status.ts: network state hook
- lib/data-versioning.ts: schema migration system

## 9.2 KI-Bautagebuch

### Existing:
- lib/diary-store.ts: DiaryEntry type, generateDiaryFromProtocols()
- Already has basic auto-generation from protocol summaries

### Enhancement needed:
- Server endpoint: generate professional daily report via LLM
- Include: weather (from protocol metadata), attendance, defects with photos, progress
- PDF export of daily report
- Auto-trigger option (end of day or manual)

## 9.3 KI-Bericht Optimization

### Existing:
- server/report-engine.ts: generateProfessionalReport() with LLM
- app/report-generator.tsx: UI for report generation

### Enhancement needed:
- Better system prompt for Bauleiter-quality language
- Structured sections: Zusammenfassung, Gewerke, Mängel, Empfehlungen
- Photo references inline
- Professional formatting

## Key Technical Decisions:
1. Use MySQL/TiDB (already configured via DATABASE_URL)
2. Use storagePut for file uploads to S3
3. Use protectedProcedure for all sync endpoints (requires auth)
4. Conflict resolution: server updatedAt vs local updatedAt, last-write-wins
5. Photo sync: upload to S3 first, then store URL in defect record
6. Batch operations for efficiency (push multiple defects at once)
