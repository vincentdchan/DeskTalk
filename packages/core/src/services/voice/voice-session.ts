/**
 * Voice session manager.
 *
 * Manages per-session state: audio ingestion, VAD segmentation,
 * STT transcription, and event publishing back to the client.
 *
 * Each voice WebSocket connection gets one VoiceSession instance.
 */

import type { WebSocket } from 'ws';
import type pino from 'pino';
import { VadSegmenter, type VadConfig } from './vad-segmenter';
import type { SttAdapter } from './stt-adapter';

export type SessionState =
  | 'LISTENING'
  | 'IN_SPEECH'
  | 'WAITING_FOR_FINAL_SILENCE'
  | 'PROCESSING'
  | 'CLOSED';

export interface VoiceSessionConfig {
  sampleRate: number;
  channels: number;
  format: string;
  vad?: Partial<VadConfig>;
  /** ISO-639-1 language code (e.g. 'en', 'zh') to hint the STT engine */
  language?: string;
}

export interface TranscriptEntry {
  utteranceId: string;
  text: string;
  timestamp: number;
  durationMs?: number;
}

interface ServerEvent {
  type: string;
  sessionId: string;
  [key: string]: unknown;
}

let utteranceCounter = 0;

function nextUtteranceId(): string {
  return `u${++utteranceCounter}`;
}

export class VoiceSession {
  readonly sessionId: string;
  private ws: WebSocket;
  private sttAdapter: SttAdapter;
  private segmenter: VadSegmenter;
  private config: VoiceSessionConfig;
  private state: SessionState = 'LISTENING';
  private transcripts: TranscriptEntry[] = [];
  private chunkCount = 0;
  private createdAt: number;
  private currentUtteranceId: string | null = null;
  private logger: pino.Logger;

  constructor(
    sessionId: string,
    ws: WebSocket,
    sttAdapter: SttAdapter,
    config: VoiceSessionConfig,
    logger: pino.Logger,
  ) {
    this.sessionId = sessionId;
    this.ws = ws;
    this.sttAdapter = sttAdapter;
    this.config = config;
    this.segmenter = new VadSegmenter(config.vad);
    this.createdAt = Date.now();
    this.logger = logger;
  }

  /**
   * Process an incoming binary audio chunk from the client.
   */
  async processAudioChunk(chunk: Buffer): Promise<void> {
    if (this.state === 'CLOSED') return;

    this.chunkCount++;

    const { events, finalizedUtterance } = this.segmenter.processChunk(chunk);

    // Update our state to mirror the segmenter
    const segmenterState = this.segmenter.getState();
    if (segmenterState !== 'PROCESSING') {
      this.state = segmenterState;
    }

    // Emit VAD events to the client
    for (const event of events) {
      switch (event.type) {
        case 'speech_start':
          this.currentUtteranceId = nextUtteranceId();
          this.sendEvent({
            type: 'speech.start',
            sessionId: this.sessionId,
            utteranceId: this.currentUtteranceId,
            timestamp: event.timestamp,
          });
          break;

        case 'silence_timeout':
        case 'max_duration':
          // Speech ended — utterance will be finalized
          break;
      }
    }

    // If the segmenter finalized an utterance, transcribe it
    if (finalizedUtterance) {
      this.state = 'PROCESSING';
      const utteranceId = this.currentUtteranceId ?? nextUtteranceId();

      try {
        const transcript = await this.sttAdapter.transcribe(
          finalizedUtterance,
          this.config.sampleRate,
          this.config.language,
        );

        const entry: TranscriptEntry = {
          utteranceId,
          text: transcript.text,
          timestamp: Date.now(),
          durationMs: transcript.durationMs,
        };
        this.transcripts.push(entry);

        // Send final transcript
        this.sendEvent({
          type: 'transcript.final',
          sessionId: this.sessionId,
          utteranceId,
          text: transcript.text,
          durationMs: transcript.durationMs,
        });

        // Send speech end
        this.sendEvent({
          type: 'speech.end',
          sessionId: this.sessionId,
          utteranceId,
          timestamp: Date.now(),
        });
      } catch (err) {
        this.sendEvent({
          type: 'error',
          sessionId: this.sessionId,
          code: 'PROVIDER_ERROR',
          message: (err as Error).message,
        });
      } finally {
        this.segmenter.doneProcessing();
        this.state = 'LISTENING';
        this.currentUtteranceId = null;
      }
    }
  }

  /**
   * Close the session and clean up resources.
   */
  close(): void {
    this.state = 'CLOSED';
    this.segmenter.reset();
    this.logger.info(
      {
        chunks: this.chunkCount,
        transcripts: this.transcripts.length,
        durationMs: Date.now() - this.createdAt,
      },
      'voice session closed',
    );
  }

  getState(): SessionState {
    return this.state;
  }

  getTranscripts(): TranscriptEntry[] {
    return [...this.transcripts];
  }

  getChunkCount(): number {
    return this.chunkCount;
  }

  private sendEvent(event: ServerEvent): void {
    if (this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(event));
    }
  }
}
