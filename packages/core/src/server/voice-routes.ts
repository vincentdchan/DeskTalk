import type { FastifyInstance } from 'fastify';
import type pino from 'pino';
import { getStoredPreference } from '../services/preferences';
import { VoiceSession } from '../services/voice/voice-session';
import { AzureOpenAIWhisperAdapter } from '../services/voice/azure-openai-whisper-adapter';
import { OpenAIWhisperAdapter } from '../services/voice/openai-whisper-adapter';
import type { SttAdapter } from '../services/voice/stt-adapter';

export interface VoiceRoutesOptions {
  logger: pino.Logger;
}

async function getPreference(key: string): Promise<string | number | boolean | undefined> {
  return getStoredPreference(key);
}

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

  return null;
}

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

export async function voiceRoutes(
  app: FastifyInstance,
  options: VoiceRoutesOptions,
): Promise<void> {
  const voiceSessions = new Map<string, VoiceSession>();
  const voiceLog = options.logger.child({ scope: 'voice' });

  app.get('/ws/voice', { websocket: true }, (socket) => {
    let session: VoiceSession | null = null;

    socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      if (Buffer.isBuffer(raw) || raw instanceof ArrayBuffer) {
        let isJson = false;
        try {
          const str = Buffer.isBuffer(raw)
            ? raw.toString('utf-8')
            : Buffer.from(raw).toString('utf-8');
          if (str.length > 0 && str[0] === '{') {
            const msg = JSON.parse(str);
            isJson = true;
            await handleVoiceControlMessage(msg);
          }
        } catch {
          // Not JSON, treat as binary audio.
        }

        if (!isJson && session) {
          const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          await session.processAudioChunk(buf);
        }
        return;
      }

      if (Array.isArray(raw) && session) {
        const buf = Buffer.concat(raw);
        await session.processAudioChunk(buf);
      }
    });

    async function handleVoiceControlMessage(msg: { type: string; [key: string]: unknown }) {
      if (msg.type === 'session.start') {
        const sessionId = msg.sessionId as string;
        const sampleRate = (msg.sampleRate as number) ?? 16000;
        const channels = (msg.channels as number) ?? 1;
        const format = (msg.format as string) ?? 'pcm_s16le';
        const prefLanguage = (await getPreference('general.language')) as string | undefined;
        const language = (msg.language as string | undefined) ?? prefLanguage;

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

        session = new VoiceSession(
          sessionId,
          socket,
          adapter,
          {
            sampleRate,
            channels,
            format,
            vad: vadConfig,
            language,
          },
          voiceLog.child({ sessionId }),
        );
        voiceSessions.set(sessionId, session);

        voiceLog.info(
          { sessionId, format, sampleRate, channels, language },
          'voice session started',
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
        voiceLog.info({ sessionId }, 'voice session ended by client');
      }
    }

    socket.on('close', () => {
      if (session) {
        voiceLog.info({ sessionId: session.sessionId }, 'voice session closed (connection lost)');
        voiceSessions.delete(session.sessionId);
        session.close();
        session = null;
      }
    });

    socket.on('error', (err) => {
      voiceLog.error({ err: err.message }, 'voice WebSocket error');
    });
  });
}
