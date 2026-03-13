/**
 * OpenAI Whisper STT adapter.
 *
 * Uses the /v1/audio/transcriptions endpoint to transcribe complete
 * audio buffers. Audio is sent as WAV (PCM s16le, 16kHz, mono) since
 * Whisper requires a file-like format.
 */

import type { SttAdapter, SttTranscript } from './stt-adapter.js';

/**
 * Create a minimal WAV header for PCM s16le audio.
 */
function createWavBuffer(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // subchunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export class OpenAIWhisperAdapter implements SttAdapter {
  readonly name = 'openai-whisper';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(options: { apiKey: string; model?: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'whisper-1';
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  }

  async transcribe(audioBuffer: Buffer, sampleRate: number): Promise<SttTranscript> {
    const wavBuffer = createWavBuffer(audioBuffer, sampleRate);
    const durationMs = Math.round((audioBuffer.length / 2 / sampleRate) * 1000);

    // Build multipart/form-data manually to avoid heavy dependencies
    const boundary = `----DeskTalkBoundary${Date.now()}`;
    const parts: Buffer[] = [];

    // model field
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${this.model}\r\n`,
      ),
    );

    // response_format field
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`,
      ),
    );

    // file field
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      ),
    );
    parts.push(wavBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Whisper API error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as { text: string };

    return {
      text: result.text.trim(),
      durationMs,
    };
  }

  close(): void {
    // No persistent resources to clean up
  }
}
