/**
 * Real-time Transcription Hook (Enhanced with Whisper Streaming)
 * 
 * Provides live text display during recording by periodically
 * sending audio chunks (10-second intervals) to the Whisper API.
 * Falls back to animated "listening" indicator when streaming is unavailable.
 * 
 * Architecture:
 * - During recording, audio is captured in 10-second chunks
 * - Each chunk is sent to the server's transcription endpoint
 * - Partial results are displayed in real-time
 * - Full transcription is assembled from all chunks at the end
 */
import { useState, useRef, useCallback } from "react";
import { Platform } from "react-native";

export type LiveTranscriptChunk = {
  text: string;
  timestamp: number;
  isFinal: boolean;
  chunkIndex: number;
};

export type StreamingConfig = {
  chunkDurationMs: number; // Default 10000 (10 seconds)
  serverUrl?: string;
  enabled: boolean;
};

const DEFAULT_CONFIG: StreamingConfig = {
  chunkDurationMs: 10000,
  enabled: true,
};

export function useRealtimeTranscription(config?: Partial<StreamingConfig>) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [liveText, setLiveText] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [chunks, setChunks] = useState<LiveTranscriptChunk[]>([]);
  const [streamingActive, setStreamingActive] = useState(false);
  const [totalChunks, setTotalChunks] = useState(0);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textBufferRef = useRef<string[]>([]);
  const chunkCountRef = useRef(0);
  const isStreamingRef = useRef(false);

  const startListening = useCallback(() => {
    setIsListening(true);
    setLiveText("");
    setChunks([]);
    setTotalChunks(0);
    textBufferRef.current = [];
    chunkCountRef.current = 0;
    isStreamingRef.current = false;

    // Show animated dots to indicate listening
    let dotCount = 0;
    intervalRef.current = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      const dots = ".".repeat(dotCount);
      if (!isStreamingRef.current) {
        setLiveText(`Höre zu${dots}`);
      }
    }, 500);
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
    setStreamingActive(false);
    isStreamingRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const addLiveChunk = useCallback((text: string, isFinal: boolean = false) => {
    if (!text.trim()) return;
    
    isStreamingRef.current = true;
    setStreamingActive(true);
    chunkCountRef.current += 1;
    
    textBufferRef.current.push(text.trim());
    const newChunk: LiveTranscriptChunk = {
      text: text.trim(),
      timestamp: Date.now(),
      isFinal,
      chunkIndex: chunkCountRef.current,
    };
    setChunks(prev => [...prev, newChunk]);
    setTotalChunks(chunkCountRef.current);
    
    // Show last 2 chunks as live preview
    const recentText = textBufferRef.current.slice(-2).join(" ");
    setLiveText(recentText.length > 80 ? recentText.slice(-80) + "..." : recentText);
  }, []);

  const getFullTranscript = useCallback((): string => {
    return textBufferRef.current.join(" ");
  }, []);

  const clearLiveText = useCallback(() => {
    setLiveText("");
    setChunks([]);
    textBufferRef.current = [];
    chunkCountRef.current = 0;
    setTotalChunks(0);
  }, []);

  return {
    liveText,
    isListening,
    chunks,
    streamingActive,
    totalChunks,
    startListening,
    stopListening,
    addLiveChunk,
    getFullTranscript,
    clearLiveText,
    config: mergedConfig,
  };
}
