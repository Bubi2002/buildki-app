# Phase 8 Implementation Notes

## Current State (2026-07-19)

### Offline-Sync Architecture (Already Exists)
- `lib/offline-sync-manager.ts` (298 lines): Network monitoring, queue processing, retry (MAX_QUEUE_RETRIES=5), SyncStatus events
- `lib/offline-sync.ts` (228 lines): Conflict resolution (smartMerge), SyncAction queue, ConflictEntry log
- `lib/offline-queue.ts` (87 lines): QueuedRecording type, addToQueue, getQueue, updateQueueItem, removeFromQueue
- `lib/cloud-sync.ts` (56 lines): Basic sync enable/disable, protocol sync status
- `hooks/use-network-status.ts` (160 lines): UI hook, polls every 10s, subscribes to sync-manager on native
- `lib/background-processor.ts`: Has exponential backoff retry (MAX_RETRIES, BASE_DELAY_MS, withRetry)
- `components/network-banner.tsx`: UI banner for offline/syncing/synced status

### What's MISSING for hardening:
1. **Schema Versioning**: No version tracking for AsyncStorage data schemas
2. **Data Migrations**: Only one ad-hoc migration in feature-toggles.ts (v106)
3. **Exponential Backoff in sync-manager**: Uses simple retry count, no delay between retries
4. **Conflict UI**: Conflicts are logged but no UI to view/resolve them
5. **Data integrity**: No checksums or validation on stored data

### AsyncStorage Keys (70+ keys total)
Main data stores: defects, protocols, projects, attendance_records, checklists, construction-diary, time-entries, floor-plans, plan-pins, timeline-events, knowledge_index

### What to Build:
1. `lib/data-versioning.ts` - Schema version tracker + migration runner
2. Enhance `offline-sync-manager.ts` with exponential backoff
3. Add data validation/integrity checks on load
4. Sync status banner already exists (network-banner.tsx)
5. Tests for offline→online scenario

### Matterport (Already Exists)
- `app/matterport-viewer.tsx`: Full SDK bridge, WebView, pin placement
- `app/matterport.tsx`: Model listing, credentials management
- `server/matterport.ts`: API proxy (getModels, getFloors, getRooms, getTags)
- `server/routers.ts`: matterport router with getSdkKey endpoint
- ENV vars: MATTERPORT_TOKEN_ID, MATTERPORT_TOKEN_SECRET, MATTERPORT_SDK_KEY
- Credentials stored in AsyncStorage (matterport_credentials) for offline access
- Client fetches SDK key from server endpoint (no hardcoded secrets)

### TestFlight (Already Exists)
- `eas.json`: Has testflight profile (Apple Team TLHL2MRJB4)
- `app.config.ts`: Bundle ID, version, icons configured
- Icons: All sizes present in assets/images/
- Permissions: Camera, Microphone, Location, Notifications declared

### What User Needs to Do:
1. Enter Matterport secrets (MATTERPORT_TOKEN_ID, MATTERPORT_TOKEN_SECRET, MATTERPORT_SDK_KEY)
2. Create Expo account at expo.dev/signup
3. Run: eas login → eas build --platform ios --profile testflight --auto-submit
