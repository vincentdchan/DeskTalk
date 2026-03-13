/**
 * AudioWorklet processor that captures microphone audio and resamples
 * to 16kHz mono 16-bit PCM (s16le) for speech-to-text processing.
 *
 * This file runs in the AudioWorklet thread and must be plain JavaScript
 * (no imports, no TypeScript). It is served as a static file.
 */

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._targetSampleRate = 16000;
    // sampleRate is a global in AudioWorkletGlobalScope
    this._sourceSampleRate = sampleRate;
    this._ratio = this._sourceSampleRate / this._targetSampleRate;
    // Accumulates fractional sample position for resampling
    this._resampleOffset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Take first channel (mono)
    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // Resample from source rate to 16kHz using linear interpolation
    const ratio = this._ratio;
    let offset = this._resampleOffset;
    const resampled = [];

    while (offset < channelData.length) {
      const index = Math.floor(offset);
      const frac = offset - index;

      let sample;
      if (index + 1 < channelData.length) {
        // Linear interpolation between adjacent samples
        sample = channelData[index] * (1 - frac) + channelData[index + 1] * frac;
      } else {
        sample = channelData[index];
      }

      // Clamp to [-1, 1] then convert to 16-bit integer
      sample = Math.max(-1, Math.min(1, sample));
      resampled.push(Math.round(sample * 32767));
      offset += ratio;
    }

    // Save fractional remainder for next process() call
    this._resampleOffset = offset - channelData.length;

    if (resampled.length > 0) {
      // Convert to Int16Array for efficient binary transfer
      const pcmData = new Int16Array(resampled);
      this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
