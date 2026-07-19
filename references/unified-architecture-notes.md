# Unified Architecture Refactoring Notes

## Status: In Progress

## Completed Steps:
1. ✅ Extended Defect type in lib/defect-store.ts with:
   - MatterportPosition type (x, y, z)
   - DefectSignature type (role, paths, signedAt)
   - matterportModelId, matterportPosition, matterportNormal, matterportSweepId, matterportFloorIndex, matterportFloorName, matterportRoomId, matterportRoomName
   - aiSummary (KI-generated summary)
   - voiceNoteUri (audio recording)
   - signatures (DefectSignature[])
   - followUpResult ("behoben" | "nachbesserung" | null)

2. ✅ Added helper functions to defect-store.ts:
   - attachMatterportData(defectId, data) - stores 3D position on defect
   - getMatterportDefects(modelId) - replaces separate matterport_pins store
   - setAiSummary(defectId, summary)
   - setVoiceNote(defectId, uri)
   - addDefectSignature(defectId, signature)
   - removeDefectSignature(defectId, index)
   - getDefectsWithFollowUp(projectId?) - for calendar/notifications
   - groupByGewerk(defects) - for KI-Bericht
   - groupByRoom(defects) - for KI-Bericht

## Remaining Steps:
3. Refactor Matterport viewer (app/matterport-viewer.tsx):
   - Replace separate PINS_KEY ("matterport_pins") AsyncStorage with getMatterportDefects()
   - Pin creation → creates defect with matterport fields (already partially done)
   - Pin display → reads from defects directly (shows photos, status, assignee, frist)
   - navigateToDefect → uses defect.matterportPosition directly

4. Refactor KI-Bericht (server/report-engine.ts + app/report-generator.tsx):
   - report-generator.tsx already reads from getDefects() ✅
   - Need to pass more fields: gewerk, followUpDate, assignee, positionCode, signatures, aiSummary
   - Report engine groups by gewerk (already has tradeSections structure) ✅
   - Add photo references inline per defect

5. Refactor PDF Export (lib/defect-pdf-export.ts):
   - Already reads from getDefects() ✅
   - Add signatures section (from defect.signatures)
   - Add Matterport reference links
   - Add followUp info

6. Dashboard (app/(tabs)/dashboard.tsx):
   - Already reads from getDefects() ✅
   - Already uses getDefectStats() ✅
   - No changes needed (already unified)

7. Follow-up/Kalender (app/follow-up.tsx + lib/notification-service.ts):
   - follow-up.tsx already reads from getDefects() ✅
   - notification-service.ts reads from AsyncStorage "defects" key directly ✅
   - Add followUpResult field usage

## Key Architecture Principle:
- Defect in defect-store.ts = Single Source of Truth
- All modules read from getDefects() or specific helper functions
- No duplicate data stores (eliminate matterport_pins separate storage)
- Changes to a defect automatically propagate to all views (reactive via useFocusEffect refresh)

## Files Modified:
- lib/defect-store.ts (extended types + helper functions)

## Files To Modify:
- app/matterport-viewer.tsx (use getMatterportDefects instead of PINS_KEY)
- server/report-engine.ts (pass more defect fields)
- app/report-generator.tsx (pass more defect fields to server)
- lib/defect-pdf-export.ts (add signatures section)
