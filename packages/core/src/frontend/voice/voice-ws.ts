/**
 * Voice WebSocket client for the dedicated /ws/voice endpoint.
 *
 * Handles:
 * - Session start/end control messages (JSON)
 * - Binary audio chunk streaming
 * - Receiving server events (transcript, speech, error)
 */

export type VoiceServerEventType =
  | 'session.ready'
  | 'speech.start'
  | 'speech.end'
  | 'transcript.partial'
  | 'transcript.final'
  | 'error';

export interface VoiceServerEvent {
  type: VoiceServerEventType;
  sessionId: string;
  utteranceId?: string;
  text?: string;
  timestamp?: number;
  durationMs?: number;
  code?: string;
  message?: string;
}

export type VoiceEventHandler = (event: VoiceServerEvent) => void;

export class VoiceWebSocketClient {
  private ws: WebSocket | null = null;
  private eventHandler: VoiceEventHandler | null = null;
  private sessionId: string | null = null;

  /**
   * Connect to the voice WebSocket endpoint.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${location.host}/ws/voice`;
      const ws = new WebSocket(wsUrl);

      ws.binaryType = 'arraybuffer';

      ws.addEventListener('open', () => {
        this.ws = ws;
        console.log('[voice-ws] Connected');
        resolve();
      });

      ws.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data) as VoiceServerEvent;
            this.eventHandler?.(msg);
          } catch {
            // Ignore malformed messages
          }
        }
      });

      ws.addEventListener('close', () => {
        console.log('[voice-ws] Disconnected');
        this.ws = null;
      });

      ws.addEventListener('error', (event) => {
        console.error('[voice-ws] Error:', event);
        reject(new Error('Voice WebSocket connection failed'));
      });
    });
  }

  /**
   * Register a handler for server events.
   */
  onEvent(handler: VoiceEventHandler): void {
    this.eventHandler = handler;
  }

  /**
   * Start a voice session.
   */
  startSession(sessionId: string, sampleRate = 16000): void {
    this.sessionId = sessionId;
    this.sendControl({
      type: 'session.start',
      sessionId,
      format: 'pcm_s16le',
      sampleRate,
      channels: 1,
    });
  }

  /**
   * End the current voice session.
   */
  endSession(): void {
    if (this.sessionId) {
      this.sendControl({
        type: 'session.end',
        sessionId: this.sessionId,
      });
      this.sessionId = null;
    }
  }

  /**
   * Send a binary audio chunk (PCM s16le).
   */
  sendAudioChunk(chunk: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
    }
  }

  /**
   * Send a JSON control message.
   */
  private sendControl(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Close the WebSocket connection.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.sessionId = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
