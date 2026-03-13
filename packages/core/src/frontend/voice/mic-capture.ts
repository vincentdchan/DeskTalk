/**
 * Microphone capture module using AudioWorklet API.
 *
 * Captures audio from the user's microphone, resamples to 16kHz mono
 * PCM s16le via the AudioWorklet processor, and delivers chunks via callback.
 */

export type AudioChunkHandler = (chunk: ArrayBuffer) => void;

export class MicCapture {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private chunkHandler: AudioChunkHandler | null = null;

  /**
   * Start capturing audio from the microphone.
   *
   * @param onChunk - Callback invoked with each PCM s16le audio chunk
   */
  async start(onChunk: AudioChunkHandler): Promise<void> {
    this.chunkHandler = onChunk;

    // Request microphone access
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: { ideal: 16000 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Create AudioContext
    this.audioContext = new AudioContext();

    // Load the AudioWorklet processor
    await this.audioContext.audioWorklet.addModule('/pcm-capture-processor.js');

    // Create source from microphone stream
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // Create worklet node
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');

    // Handle PCM chunks from the worklet
    this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (this.chunkHandler && event.data) {
        this.chunkHandler(event.data);
      }
    };

    // Connect: mic -> worklet -> (no output needed, we only capture)
    this.sourceNode.connect(this.workletNode);
    // Connect to destination to keep the audio pipeline alive
    // Use a gain node set to 0 to avoid feedback
    const silentGain = this.audioContext.createGain();
    silentGain.gain.value = 0;
    this.workletNode.connect(silentGain);
    silentGain.connect(this.audioContext.destination);

    console.log(
      `[mic] Started capture at ${this.audioContext.sampleRate}Hz, resampling to 16kHz in worklet`,
    );
  }

  /**
   * Stop capturing audio and release all resources.
   */
  stop(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.onmessage = null;
      this.workletNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    this.chunkHandler = null;
    console.log('[mic] Stopped capture');
  }

  /**
   * Check if capture is currently active.
   */
  isActive(): boolean {
    return this.stream !== null && this.audioContext !== null;
  }
}
