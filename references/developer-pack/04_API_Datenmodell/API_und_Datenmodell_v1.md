# 04 – API- und Datenmodell-Spezifikation

## 1. Hauptentitäten

### Company
- id
- name
- created_at

### User
- id
- company_id
- email
- name
- role
- status

### Project
- id
- company_id
- name
- address
- description
- start_date
- end_date
- status

### ProjectMember
- project_id
- user_id
- project_role

### MediaAsset
- id
- project_id
- uploaded_by
- type: image | video | audio | document | matterport_panorama
- storage_key
- captured_at
- room_id
- metadata_json

### Room
- id
- project_id
- name
- level
- external_reference

### Analysis
- id
- project_id
- source_type
- source_ids
- status
- model_version
- prompt_version
- result_json
- created_at
- reviewed_by
- reviewed_at

### Defect
- id
- project_id
- room_id
- title
- description
- severity
- status
- due_date
- assignee_id
- source_analysis_id

### Task
- id
- project_id
- room_id
- title
- description
- priority
- status
- due_date
- assignee_id
- source_type
- source_id

### Report
- id
- project_id
- type
- status
- version
- generated_file_key
- created_by
- created_at

### Integration
- id
- company_id
- provider
- encrypted_credentials
- status
- last_checked_at

## 2. API-Konventionen

- Basis: /api/v1
- Auth: Bearer JWT
- UUIDs
- Zeitstempel ISO 8601
- Pagination: cursor-basiert
- Fehlerformat einheitlich
- idempotency-key bei Upload-/Analyse-Endpunkten

## 3. Fehlerformat

{
  "error": {
    "code": "MATTERPORT_SANDBOX_ONLY",
    "message": "Der Matterport-Zugang befindet sich im Sandbox-Modus.",
    "details": {},
    "request_id": "..."
  }
}

## 4. Kernendpunkte

### Projekte
- GET /projects
- POST /projects
- GET /projects/{id}
- PATCH /projects/{id}

### Medien
- POST /projects/{id}/media/upload-url
- POST /projects/{id}/media/complete
- GET /projects/{id}/media

### KI
- POST /projects/{id}/analyses/photo
- POST /projects/{id}/analyses/audio
- GET /analyses/{id}
- POST /analyses/{id}/review

### Mängel
- GET /projects/{id}/defects
- POST /projects/{id}/defects
- PATCH /defects/{id}

### Aufgaben
- GET /projects/{id}/tasks
- POST /projects/{id}/tasks
- PATCH /tasks/{id}

### Berichte
- POST /projects/{id}/reports
- GET /reports/{id}
- GET /reports/{id}/download

## 5. Datenschutz und Audit

- Jede Änderung an Mängeln, Aufgaben und Berichten auditieren.
- Soft Delete für fachlich relevante Datensätze.
- Mandantentrennung auf Datenbank- und API-Ebene.
- Medienzugriff über zeitlich begrenzte URLs.
