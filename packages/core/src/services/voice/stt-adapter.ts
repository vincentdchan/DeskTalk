/**
 * Speech-to-Text adapter interface.
 *
 * Abstracts the STT provider so the voice pipeline can swap providers
 * without changing the session manager or segmenter logic.
 */

export interface SttTranscript {
  text: string;
  /** Confidence score 0-1 if available from provider */
  confidence?: number;
  /** Duration of the audio in milliseconds */
  durationMs?: number;
}

export interface SttAdapter {
  /** Human-readable name of the provider */
  readonly name: string;

  /**
   * Transcribe a complete audio buffer.
   *
   * @param audioBuffer - Raw PCM s16le audio at 16kHz mono
   * @param sampleRate - Sample rate (always 16000 for v1)
   * @param language - Optional ISO-639-1 language code (e.g. 'en', 'zh') to hint the STT engine
   * @returns Transcript result
   */
  transcribe(audioBuffer: Buffer, sampleRate: number, language?: string): Promise<SttTranscript>;

  /**
   * Clean up any resources held by the adapter.
   */
  close(): void;
}
