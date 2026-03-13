import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { addClient, handleCommand } from '../services/messaging.js';
import { registry } from '../services/miniapp-registry.js';
import { AiChatService, type AiMessage } from '../services/ai/chat-service.js';
import { VoiceSession } from '../services/voice/voice-session.js';
import { AzureOpenAIWhisperAdapter } from '../services/voice/azure-openai-whisper-adapter.js';
import { OpenAIWhisperAdapter } from '../services/voice/openai-whisper-adapter.js';
import type { SttAdapter } from '../services/voice/stt-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ServerOptions {
  host: string;
  port: number;
}

export async function createServer(options: ServerOptions) {
  const app = Fastify({ logger: false });
  const aiChatService = new AiChatService();

  // Register WebSocket support
  await app.register(fastifyWebsocket);

  // Serve the frontend build from dist/frontend/
  const frontendDir = join(__dirname, '..', 'frontend');
  await app.register(fastifyStatic, {
    root: frontendDir,
    prefix: '/',
    wildcard: false,
  });

  // WebSocket endpoint for MiniApp messaging and AI events
  app.get('/ws', { websocket: true }, (socket, _req) => {
    addClient(socket);
    const aiMessages: AiMessage[] = [];
    let activeAiRequestId: string | null = null;

    function sendAiEvent(event: Record<string, unknown>): void {
      socket.send(
        JSON.stringify({
          type: 'ai:event',
          event,
        }),
      );
    }

    socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'command:invoke') {
          const { miniAppId, command, requestId, data } = msg;
          try {
            const result = await handleCommand(miniAppId, command, data);
            socket.send(
              JSON.stringify({
                type: 'command:response',
                requestId,
                data: result,
              }),
            );
          } catch (err) {
            socket.send(
              JSON.stringify({
                type: 'command:response',
                requestId,
                error: (err as Error).message,
              }),
            );
          }
        } else if (msg.type === 'ai:prompt') {
          const requestId = typeof msg.requestId === 'string' ? msg.requestId : `ai-${Date.now()}`;
          const text = typeof msg.text === 'string' ? msg.text.trim() : '';

          if (!text) {
            sendAiEvent({
              type: 'error',
              requestId,
              message: 'Prompt cannot be empty.',
            });
            return;
          }

          if (activeAiRequestId) {
            sendAiEvent({
              type: 'error',
              requestId,
              message: 'Another AI request is already running. Wait for it to finish.',
            });
            return;
          }

          activeAiRequestId = requestId;

          try {
            const config = await getAiConfigFromPreferences();
            aiMessages.push({ role: 'user', content: text });

            sendAiEvent({
              type: 'message_start',
              requestId,
              provider: config.provider,
              model: config.model,
            });

            const result = await aiChatService.chat(config, aiMessages);
            aiMessages.push({ role: 'assistant', content: result.text });

            sendAiEvent({
              type: 'message_update',
              requestId,
              text: result.text,
              provider: result.provider,
              model: result.model,
            });

            sendAiEvent({
              type: 'message_end',
              requestId,
              text: result.text,
              provider: result.provider,
              model: result.model,
              usage: result.usage,
            });
          } catch (err) {
            sendAiEvent({
              type: 'error',
              requestId,
              message: (err as Error).message,
            });
          } finally {
            activeAiRequestId = null;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  // ─── Voice Streaming WebSocket ────────────────────────────────────────────

  /** Active voice sessions keyed by sessionId */
  const voiceSessions = new Map<string, VoiceSession>();

  /**
   * Read a raw (unmasked) preference value from the preference MiniApp's storage.
   * Returns the default if the preference MiniApp is not yet activated.
   */
  async function getPreference(key: string): Promise<string | number | boolean | undefined> {
    try {
      const result = (await handleCommand('preference', 'preferences.getRaw', {
        key,
      })) as { value: string | number | boolean };
      return result.value;
    } catch {
      return undefined;
    }
  }

  async function getAiConfigFromPreferences(): Promise<{
    provider: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens: number;
  }> {
    return {
      provider: ((await getPreference('ai.provider')) as string) ?? 'openai',
      model: ((await getPreference('ai.model')) as string) ?? '',
      apiKey: ((await getPreference('ai.apiKey')) as string) ?? '',
      baseUrl: ((await getPreference('ai.baseUrl')) as string) ?? '',
      maxTokens: ((await getPreference('ai.maxTokens')) as number) ?? 4096,
    };
  }

  /**
   * Create an STT adapter from preference-stored voice configuration.
   * Returns null if no API key is configured.
   */
  async function createSttAdapter(): Promise<SttAdapter | null> {
    const apiKey = (await getPreference('voice.apiKey')) as string | undefined;
    if (!apiKey) return null;

    const provider = ((await getPreference('voice.provider')) as string) ?? 'openai-whisper';

    if (provider === 'openai-whisper') {
      const model = ((await getPreference('voice.model')) as string) ?? 'whisper-1';
      const baseUrl =
        ((await getPreference('voice.baseUrl')) as string) ?? 'https://api.openai.com/v1';
      return new OpenAIWhisperAdapter({ apiKey, model, baseUrl });
    }

    if (provider === 'azure-openai-whisper') {
      const endpoint = (await getPreference('voice.baseUrl')) as string | undefined;
      const deployment = (await getPreference('voice.azureDeployment')) as string | undefined;
      const apiVersion =
        ((await getPreference('voice.azureApiVersion')) as string | undefined) ?? '2024-06-01';

      if (!endpoint || !deployment) {
        return null;
      }

      return new AzureOpenAIWhisperAdapter({
        apiKey,
        endpoint,
        deployment,
        apiVersion,
      });
    }

    // Unknown provider
    return null;
  }

  /**
   * Read VAD-related preferences for voice session configuration.
   */
  async function getVadConfigFromPreferences(): Promise<{
    silenceTimeoutMs?: number;
    energyThreshold?: number;
  }> {
    const silenceTimeoutMs = (await getPreference('voice.silenceTimeoutMs')) as number | undefined;
    const energyThreshold = (await getPreference('voice.energyThreshold')) as number | undefined;
    return {
      ...(silenceTimeoutMs !== undefined ? { silenceTimeoutMs } : {}),
      ...(energyThreshold !== undefined ? { energyThreshold } : {}),
    };
  }

  app.get('/ws/voice', { websocket: true }, (socket, req) => {
    let session: VoiceSession | null = null;

    socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      // Binary messages are audio chunks
      if (Buffer.isBuffer(raw) || raw instanceof ArrayBuffer) {
        // Check if this is actually a JSON control message (text frame)
        // WebSocket text frames arrive as Buffer too — try parsing as JSON first
        let isJson = false;
        try {
          const str = Buffer.isBuffer(raw)
            ? raw.toString('utf-8')
            : Buffer.from(raw).toString('utf-8');
          // Quick check: JSON messages start with '{'
          if (str.length > 0 && str[0] === '{') {
            const msg = JSON.parse(str);
            isJson = true;
            await handleVoiceControlMessage(msg);
          }
        } catch {
          // Not JSON — treat as binary audio
        }

        if (!isJson && session) {
          const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          await session.processAudioChunk(buf);
        }
        return;
      }

      // Array of buffers — concatenate
      if (Array.isArray(raw)) {
        if (session) {
          const buf = Buffer.concat(raw);
          await session.processAudioChunk(buf);
        }
      }
    });

    async function handleVoiceControlMessage(msg: { type: string; [key: string]: unknown }) {
      if (msg.type === 'session.start') {
        const sessionId = msg.sessionId as string;
        const sampleRate = (msg.sampleRate as number) ?? 16000;
        const channels = (msg.channels as number) ?? 1;
        const format = (msg.format as string) ?? 'pcm_s16le';

        const adapter = await createSttAdapter();
        if (!adapter) {
          socket.send(
            JSON.stringify({
              type: 'error',
              sessionId,
              code: 'NO_STT_PROVIDER',
              message:
                'No STT provider configured. Check Preferences -> Voice for provider credentials.',
            }),
          );
          return;
        }

        const vadConfig = await getVadConfigFromPreferences();

        session = new VoiceSession(sessionId, socket, adapter, {
          sampleRate,
          channels,
          format,
          vad: vadConfig,
        });
        voiceSessions.set(sessionId, session);

        console.log(
          `[voice] Session ${sessionId} started (${format}, ${sampleRate}Hz, ${channels}ch)`,
        );

        socket.send(
          JSON.stringify({
            type: 'session.ready',
            sessionId,
          }),
        );
      } else if (msg.type === 'session.end') {
        const sessionId = msg.sessionId as string;
        if (session) {
          session.close();
          voiceSessions.delete(session.sessionId);
          session = null;
        }
        console.log(`[voice] Session ${sessionId} ended by client`);
      }
    }

    socket.on('close', () => {
      if (session) {
        console.log(`[voice] Session ${session.sessionId} closed (connection lost)`);
        voiceSessions.delete(session.sessionId);
        session.close();
        session = null;
      }
    });

    socket.on('error', (err) => {
      console.error('[voice] WebSocket error:', err.message);
    });
  });

  // REST API: Get all registered MiniApp manifests (for initial Dock load)
  app.get('/api/miniapps', async () => {
    return registry.getManifests();
  });

  // REST API: Activate a MiniApp
  app.post<{ Params: { id: string } }>('/api/miniapps/:id/activate', async (req) => {
    const { id } = req.params;
    registry.activate(id);
    return { id, activated: true };
  });

  // REST API: Deactivate a MiniApp
  app.post<{ Params: { id: string } }>('/api/miniapps/:id/deactivate', async (req) => {
    const { id } = req.params;
    registry.deactivate(id);
    return { id, deactivated: true };
  });

  // SPA fallback — serve index.html for all non-API, non-asset routes
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) {
      reply.code(404);
      return { error: 'Not found' };
    }
    return reply.sendFile('index.html');
  });

  await app.listen({ host: options.host, port: options.port });
  return app;
}
