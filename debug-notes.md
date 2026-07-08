# Audio Recording Bug Analysis

## Current Code Structure (app/(tabs)/index.tsx)

### Key State Variables (lines 95-100):
- `isRecording` (boolean) - whether recording is active
- `isPaused` (boolean) - whether recording is paused
- `showStopConfirm` (boolean) - stop confirmation modal
- `recordingDuration` (number) - timer in seconds

### Timer Functions (lines 644-669):
- `startTimer()` - setInterval every 1000ms, increments recordingDuration
- `stopTimer()` - clearInterval
- `pauseTimer()` - clearInterval (same as stop)
- `resumeTimer()` - new setInterval

### Recording Functions:
- `startAudioRecording()` (line 995): prepareToRecordAsync() then record()
- `stopAudioRecording()` (line 1014): await audioRecorder.stop()
- `pauseRecording()` (line 1034): audioRecorder.pause(), pauseTimer(), setIsPaused(true)
- `resumeRecording()` (line 1041): audioRecorder.record(), resumeTimer(), setIsPaused(false)

### Stop Flow (line 1063):
1. stopRecording() - pauses audio, pauses timer, shows modal (does NOT set isPaused)
2. confirmStopRecording() - hides modal, stops audio, processes recording
3. cancelStopRecording() - hides modal, resumes audio with audioRecorder.record(), resumeTimer()

### Chapter Marker (line 881):
- startChapterMarker() - pauses audio+timer, shows chapter input modal
- After chapter is set, it should resume recording

## expo-audio AudioRecorder API:
- `record()` - starts recording
- `pause()` - pauses recording
- `stop()` - stops recording (async)
- `prepareToRecordAsync()` - prepares recorder
- Properties: `isRecording`, `currentTime`, `uri`

## Potential Issues:
1. **Timer freezes at 00:02**: The timer uses setInterval but the useEffect for waveform (line 601) 
   depends on [isRecording, isPaused]. If something causes a re-render that clears the interval 
   without restarting it, the timer would freeze. The timer itself is NOT in a useEffect cleanup - 
   it's managed manually via startTimer/stopTimer/pauseTimer/resumeTimer.

2. **Pause can't resume**: The pauseRecording sets isPaused=true, and the button handler is 
   `onPress={isPaused ? resumeRecording : pauseRecording}` (line 1939). This should work.
   BUT: the stopRecording function also calls audioRecorder.pause() without setting isPaused=true 
   (line 1067-1070). If the user hits stop then cancel, the cancelStopRecording calls 
   audioRecorder.record() and resumeTimer() but doesn't touch isPaused state. Since isPaused 
   was never set to true by stopRecording, it should still be false after cancel.

3. **Chapter button does nothing visible**: startChapterMarker() pauses audio and shows modal.
   If the modal doesn't appear or the audio pause fails, it would seem unresponsive.

## Root Cause Hypothesis:
The issue is likely that `audioRecorder.pause()` throws an error silently on the device 
(maybe the recorder isn't in a state that supports pause), which prevents the subsequent 
code from executing. This would explain why:
- Timer freezes (pauseTimer is called but resumeTimer never gets called)
- Stop button doesn't work (audioRecorder.pause() fails before setShowStopConfirm(true))
- Chapter button doesn't work (same issue)

## Fix Strategy:
1. Wrap all audioRecorder.pause() and audioRecorder.record() calls in try/catch
2. Make stopRecording NOT depend on pausing first - just show the modal directly
3. Make the timer more robust by using recorderState.durationMillis from expo-audio 
   instead of a manual setInterval (which can drift or get cleared)
4. Add error handling to all recorder operations
