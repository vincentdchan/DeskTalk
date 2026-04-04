/**
 * Voice session Zustand store.
 *
 * Manages the complete voice input lifecycle:
 * - WebSocket connection to /ws/voice
 * - Microphone capture via AudioWorklet
 * - Session state (idle, connecting, listening, speaking, processing, error)
 * - Transcript history (partial and final)
 */

import { create } from 'zustand';
import { MicCapture } from '../voice/mic-capture';
import { VoiceWebSocketClient, type VoiceServerEvent } from '../voice/voice-ws';

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'processing' | 'error';

export interface TranscriptEntry {
  utteranceId: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface VoiceSessionState {
  /** Current status of the voice session */
  status: VoiceStatus;
  /** Error message if status is 'error' */
  errorMessage: string | null;
  /** Current partial transcript text while speaking */
  partialText: string;
  /** All finalized transcript entries for this session */
  transcripts: TranscriptEntry[];
  /** The session ID (set on start) */
  sessionId: string | null;

  // Actions
  startVoice: () => Promise<void>;
  stopVoice: () => void;
  clearError: () => void;
  clearTranscripts: () => void;
}

// Singleton instances — shared across all consumers of the store
let micCapture: MicCapture | null = null;
let voiceWs: VoiceWebSocketClient | null = null;

function generateSessionId(): string {
  return `vs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useVoiceSession = create<VoiceSessionState>((set, get) => ({
  status: 'idle',
  errorMessage: null,
  partialText: '',
  transcripts: [],
  sessionId: null,

  async startVoice() {
    const state = get();
    if (state.status !== 'idle' && state.status !== 'error') return;

    set({ status: 'connecting', errorMessage: null, partialText: '' });

    try {
      // 1. Connect voice WebSocket
      voiceWs = new VoiceWebSocketClient();

      voiceWs.onEvent((event: VoiceServerEvent) => {
        handleServerEvent(event, set, get);
      });

      await voiceWs.connect();

      // 2. Start voice session on backend
      const sessionId = generateSessionId();
      voiceWs.startSession(sessionId, 16000);

      set({ sessionId });

      // 3. Wait for session.ready (with timeout)
      await waitForSessionReady(voiceWs, sessionId);

      // 4. Start microphone capture
      micCapture = new MicCapture();
      await micCapture.start((chunk: ArrayBuffer) => {
        voiceWs?.sendAudioChunk(chunk);
      });

      set({ status: 'listening' });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access.'
          : (err as Error).message;

      set({ status: 'error', errorMessage: message });

      // Clean up on failure
      cleanup();
    }
  },

  stopVoice() {
    const state = get();
    if (state.status === 'idle') return;

    cleanup();
    set({
      status: 'idle',
      partialText: '',
      sessionId: null,
    });
  },

  clearError() {
    const state = get();
    if (state.status === 'error') {
      set({ status: 'idle', errorMessage: null });
    }
  },

  clearTranscripts() {
    set({ transcripts: [], partialText: '' });
  },
}));

function handleServerEvent(
  event: VoiceServerEvent,
  set: (partial: Partial<VoiceSessionState>) => void,
  get: () => VoiceSessionState,
) {
  switch (event.type) {
    case 'speech.start':
      set({ status: 'speaking', partialText: '' });
      break;

    case 'transcript.partial':
      set({ partialText: event.text ?? '' });
      break;

    case 'transcript.final':
      if (event.text && event.utteranceId) {
        const current = get();
        set({
          transcripts: [
            ...current.transcripts,
            {
              utteranceId: event.utteranceId!,
              text: event.text!,
              isFinal: true,
              timestamp: Date.now(),
            },
          ],
          partialText: '',
          status: 'listening',
        });
      }
      break;

    case 'speech.end':
      set({ status: 'listening', partialText: '' });
      break;

    case 'error':
      set({
        status: 'error',
        errorMessage: event.message ?? `Error: ${event.code ?? 'unknown'}`,
      });
      break;
  }
}

function waitForSessionReady(ws: VoiceWebSocketClient, sessionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Voice session start timed out'));
    }, 5000);

    const originalHandler = ws['eventHandler'];

    ws.onEvent((event) => {
      // Forward to the real handler first
      originalHandler?.(event);

      if (event.type === 'session.ready' && event.sessionId === sessionId) {
        clearTimeout(timeout);
        // Restore the original handler
        ws.onEvent(originalHandler ?? (() => {}));
        resolve();
      } else if (event.type === 'error' && event.sessionId === sessionId) {
        clearTimeout(timeout);
        ws.onEvent(originalHandler ?? (() => {}));
        reject(new Error(event.message ?? 'Session start failed'));
      }
    });
  });
}

function cleanup(): void {
  if (micCapture) {
    micCapture.stop();
    micCapture = null;
  }
  if (voiceWs) {
    voiceWs.endSession();
    voiceWs.disconnect();
    voiceWs = null;
  }
}
