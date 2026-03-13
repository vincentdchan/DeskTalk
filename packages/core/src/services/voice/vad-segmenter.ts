/**
 * Voice Activity Detection (VAD) and utterance segmenter.
 *
 * Uses energy-based detection on raw PCM s16le audio to determine
 * speech vs silence boundaries. Manages state transitions for
 * utterance segmentation with configurable thresholds.
 *
 * Design decisions:
 * - Energy-based VAD rather than ML-based for v1 simplicity
 * - RMS energy with configurable threshold
 * - Silence timeout finalizes utterances (800ms default)
 * - Minimum speech duration prevents noise spikes (300ms default)
 * - Maximum utterance duration caps long segments (15s default)
 */

export interface VadConfig {
  /** RMS energy threshold to consider as speech (0-32767 range). Default: 500 */
  energyThreshold: number;
  /** Silence duration (ms) before finalizing utterance. Default: 800 */
  silenceTimeoutMs: number;
  /** Minimum speech duration (ms) to count as valid utterance. Default: 300 */
  minSpeechDurationMs: number;
  /** Maximum utterance duration (ms). Default: 15000 */
  maxUtteranceDurationMs: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  energyThreshold: 500,
  silenceTimeoutMs: 800,
  minSpeechDurationMs: 300,
  maxUtteranceDurationMs: 15000,
};

export type VadState = 'LISTENING' | 'IN_SPEECH' | 'WAITING_FOR_FINAL_SILENCE' | 'PROCESSING';

export interface VadEvent {
  type: 'speech_start' | 'speech_end' | 'silence_timeout' | 'max_duration';
  timestamp: number;
}

/**
 * Compute RMS (Root Mean Square) energy of a PCM s16le buffer.
 */
function computeRmsEnergy(pcmBuffer: Buffer): number {
  const sampleCount = pcmBuffer.length / 2;
  if (sampleCount === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < pcmBuffer.length; i += 2) {
    const sample = pcmBuffer.readInt16LE(i);
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / sampleCount);
}

export class VadSegmenter {
  private config: VadConfig;
  private state: VadState = 'LISTENING';
  private speechStartTime = 0;
  private lastVoiceActivityTime = 0;
  private speechBuffer: Buffer[] = [];
  private speechBufferBytes = 0;

  constructor(config: Partial<VadConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
  }

  getState(): VadState {
    return this.state;
  }

  /**
   * Feed a chunk of PCM s16le audio into the segmenter.
   *
   * @param chunk - Raw PCM s16le audio buffer at 16kHz
   * @returns Array of events triggered by this chunk, plus the
   *          complete utterance buffer if the utterance was finalized.
   */
  processChunk(chunk: Buffer): {
    events: VadEvent[];
    finalizedUtterance: Buffer | null;
  } {
    const now = Date.now();
    const events: VadEvent[] = [];
    let finalizedUtterance: Buffer | null = null;

    const energy = computeRmsEnergy(chunk);
    const isSpeech = energy >= this.config.energyThreshold;

    switch (this.state) {
      case 'LISTENING':
        if (isSpeech) {
          this.state = 'IN_SPEECH';
          this.speechStartTime = now;
          this.lastVoiceActivityTime = now;
          this.speechBuffer = [chunk];
          this.speechBufferBytes = chunk.length;
          events.push({ type: 'speech_start', timestamp: now });
        }
        break;

      case 'IN_SPEECH':
        this.speechBuffer.push(chunk);
        this.speechBufferBytes += chunk.length;

        if (isSpeech) {
          this.lastVoiceActivityTime = now;
        }

        // Check max duration
        if (now - this.speechStartTime >= this.config.maxUtteranceDurationMs) {
          events.push({ type: 'max_duration', timestamp: now });
          finalizedUtterance = this.finalizeUtterance();
          break;
        }

        // Transition to waiting if we detect silence
        if (!isSpeech) {
          this.state = 'WAITING_FOR_FINAL_SILENCE';
        }
        break;

      case 'WAITING_FOR_FINAL_SILENCE':
        this.speechBuffer.push(chunk);
        this.speechBufferBytes += chunk.length;

        if (isSpeech) {
          // Speech resumed — go back to IN_SPEECH
          this.state = 'IN_SPEECH';
          this.lastVoiceActivityTime = now;
          break;
        }

        // Check max duration
        if (now - this.speechStartTime >= this.config.maxUtteranceDurationMs) {
          events.push({ type: 'max_duration', timestamp: now });
          finalizedUtterance = this.finalizeUtterance();
          break;
        }

        // Check if silence has lasted long enough
        if (now - this.lastVoiceActivityTime >= this.config.silenceTimeoutMs) {
          const speechDuration = this.lastVoiceActivityTime - this.speechStartTime;

          if (speechDuration >= this.config.minSpeechDurationMs) {
            events.push({ type: 'silence_timeout', timestamp: now });
            finalizedUtterance = this.finalizeUtterance();
          } else {
            // Too short to be real speech — discard and go back to listening
            this.reset();
          }
        }
        break;

      case 'PROCESSING':
        // While processing, buffer audio for the next utterance
        // In v1, just drop it and wait for reset
        break;
    }

    return { events, finalizedUtterance };
  }

  /**
   * Concatenate the speech buffer and transition to PROCESSING.
   */
  private finalizeUtterance(): Buffer {
    this.state = 'PROCESSING';
    const result = Buffer.concat(this.speechBuffer);
    this.speechBuffer = [];
    this.speechBufferBytes = 0;
    return result;
  }

  /**
   * Mark processing as complete and return to listening.
   */
  doneProcessing(): void {
    this.state = 'LISTENING';
    this.speechBuffer = [];
    this.speechBufferBytes = 0;
  }

  /**
   * Reset the segmenter to the initial listening state.
   */
  reset(): void {
    this.state = 'LISTENING';
    this.speechStartTime = 0;
    this.lastVoiceActivityTime = 0;
    this.speechBuffer = [];
    this.speechBufferBytes = 0;
  }

  /**
   * Get the current speech buffer size in bytes (for observability).
   */
  getBufferSizeBytes(): number {
    return this.speechBufferBytes;
  }
}
