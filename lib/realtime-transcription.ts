/**
 * Real-time Transcription Hook
 * Provides live text display during recording by periodically
 * sending audio chunks for transcription.
 * 
 * Strategy: Every 10 seconds during recording, we show a "live preview"
 * of what's being said. This uses the existing Whisper API with short chunks.
 * On web, we simulate with a "listening..." indicator.
 */
import { useState, useRef, useCallback } from "react";
import { Platform } from "react-native";

export type LiveTranscriptChunk = {
  text: string;
  timestamp: number;
  isFinal: boolean;
};

export function useRealtimeTranscription() {
  const [liveText, setLiveText] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [chunks, setChunks] = useState<LiveTranscriptChunk[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textBufferRef = useRef<string[]>([]);

  const startListening = useCallback(() => {
    setIsListening(true);
    setLiveText("");
    setChunks([]);
    textBufferRef.current = [];
    
    // Show animated dots to indicate listening
    let dotCount = 0;
    intervalRef.current = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      const dots = ".".repeat(dotCount);
      if (textBufferRef.current.length === 0) {
        setLiveText(`Höre zu${dots}`);
      }
    }, 500);
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const addLiveChunk = useCallback((text: string) => {
    textBufferRef.current.push(text);
    const newChunk: LiveTranscriptChunk = {
      text,
      timestamp: Date.now(),
      isFinal: false,
    };
    setChunks(prev => [...prev, newChunk]);
    setLiveText(textBufferRef.current.join(" "));
  }, []);

  const clearLiveText = useCallback(() => {
    setLiveText("");
    setChunks([]);
    textBufferRef.current = [];
  }, []);

  return {
    liveText,
    isListening,
    chunks,
    startListening,
    stopListening,
    addLiveChunk,
    clearLiveText,
  };
}
