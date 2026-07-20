# BuildKI – Design Document

## App Overview

BuildKI is a native mobile app that enables users to record videos while speaking into the microphone, automatically transcribes the speech using AI, generates a structured protocol/report, and shares it via WhatsApp or Email.

---

## Screen List

### 1. Aufnahme (Recording) – Main Tab
The primary screen. A full-screen camera view with a large record button at the bottom. Shows recording duration and a visual audio level indicator. Minimal UI during recording to keep focus on the task.

### 2. Protokolle (Protocols) – Second Tab
A chronological list of all created protocols. Each entry shows: date, title (auto-generated from content), duration, and status (processing / ready / sent). Tapping opens the detail view.

### 3. Protokoll-Detail (Protocol Detail)
Shows the full protocol text, the original transcription, and metadata (date, duration, video thumbnail). Action buttons at the bottom: "Per WhatsApp senden", "Per E-Mail senden", "Kopieren".

### 4. Einstellungen (Settings) – Third Tab
API key configuration (OpenAI), default recipients (WhatsApp number, email address), protocol template preferences (formal/informal, bullet points/paragraphs), language selection.

---

## Primary Content and Functionality

| Screen | Content | Functionality |
|--------|---------|---------------|
| Aufnahme | Camera preview, record button, timer, audio level | Start/stop video recording with audio |
| Protokolle | FlatList of protocol cards (date, title, status) | Browse history, delete, re-send |
| Protokoll-Detail | Full protocol text, transcription, video thumb | Share via WhatsApp/Email, copy, edit |
| Einstellungen | Form fields for API key, recipients, preferences | Save settings to AsyncStorage |

---

## Key User Flows

### Flow 1: Record and Generate Protocol
1. User opens app → lands on Aufnahme screen
2. User taps large red record button → camera starts recording video + audio
3. User speaks into microphone describing observations
4. User taps stop button → recording stops
5. App shows "Verarbeitung..." (Processing) with progress indicator
6. Audio is extracted and sent to OpenAI Whisper for transcription
7. Transcription is sent to ChatGPT with a protocol prompt
8. Structured protocol is generated and saved locally
9. User is navigated to Protocol Detail screen

### Flow 2: Share Protocol
1. User views protocol in detail screen
2. User taps "Per WhatsApp senden"
3. App opens WhatsApp share sheet with protocol text pre-filled
4. Alternatively: User taps "Per E-Mail senden"
5. App opens mail composer with protocol as body text

### Flow 3: Browse History
1. User taps "Protokolle" tab
2. Sees list of all protocols sorted by date (newest first)
3. Taps on any protocol to view details
4. Can swipe to delete old protocols

---

## Color Choices

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| primary | #E53935 | #EF5350 | Record button, active states, accent |
| background | #FAFAFA | #121212 | Screen backgrounds |
| surface | #FFFFFF | #1E1E1E | Cards, elevated surfaces |
| foreground | #1A1A1A | #F5F5F5 | Primary text |
| muted | #757575 | #9E9E9E | Secondary text, timestamps |
| border | #E0E0E0 | #333333 | Dividers, card borders |
| success | #43A047 | #66BB6A | Protocol ready status |
| warning | #FB8C00 | #FFA726 | Processing status |
| error | #E53935 | #EF5350 | Error states, delete |

The red primary color evokes the classic "record" button metaphor. The overall palette is neutral and professional, suitable for a business/construction context.

---

## Typography

- Headlines: System font, Bold, 28px
- Subheadlines: System font, SemiBold, 20px
- Body: System font, Regular, 16px
- Caption: System font, Regular, 13px

---

## Navigation Structure

```
Tab Bar (3 tabs):
├── Aufnahme (camera icon)
├── Protokolle (list icon)
└── Einstellungen (gear icon)

Modal:
└── Protokoll-Detail (pushed from Protokolle list)
```
