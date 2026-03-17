/**
 * Azure OpenAI Whisper STT adapter.
 *
 * Uses the Azure OpenAI audio transcriptions endpoint with deployment-based
 * routing and api-key authentication.
 */

import type { SttAdapter, SttTranscript } from './stt-adapter';
import { createWavBuffer } from './audio-format';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export class AzureOpenAIWhisperAdapter implements SttAdapter {
  readonly name = 'azure-openai-whisper';
  private apiKey: string;
  private endpoint: string;
  private deployment: string;
  private apiVersion: string;

  constructor(options: {
    apiKey: string;
    endpoint: string;
    deployment: string;
    apiVersion?: string;
  }) {
    this.apiKey = options.apiKey;
    this.endpoint = trimTrailingSlash(options.endpoint);
    this.deployment = options.deployment;
    this.apiVersion = options.apiVersion ?? '2024-06-01';
  }

  async transcribe(
    audioBuffer: Buffer,
    sampleRate: number,
    language?: string,
  ): Promise<SttTranscript> {
    const wavBuffer = createWavBuffer(audioBuffer, sampleRate);
    const durationMs = Math.round((audioBuffer.length / 2 / sampleRate) * 1000);
    const boundary = `----DeskTalkBoundary${Date.now()}`;
    const parts: Buffer[] = [];

    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`,
      ),
    );

    // language field (ISO-639-1 code, e.g. 'en', 'zh')
    if (language) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`,
        ),
      );
    }

    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      ),
    );
    parts.push(wavBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const url = `${this.endpoint}/openai/deployments/${encodeURIComponent(this.deployment)}/audio/transcriptions?api-version=${encodeURIComponent(this.apiVersion)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI Whisper API error (${response.status}): ${errorText}`);
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
