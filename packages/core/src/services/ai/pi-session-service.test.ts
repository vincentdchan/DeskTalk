import { afterEach, describe, expect, it, vi } from 'vitest';
import * as PiCodingAgent from '@mariozechner/pi-coding-agent';
import type { AssistantMessage, ToolCall } from '@mariozechner/pi-ai';
import {
  PiSessionService,
  createDeskTalkAgentSession,
  scrubHtmlToolCallArgs,
  summarizeHtml,
} from './pi-session-service';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('summarizeHtml', () => {
  it('summarizes title, card count, and headings', () => {
    const html = [
      '<html>',
      '  <head><title>Roadmap</title></head>',
      '  <body>',
      '    <h1>Main <em>Plan</em></h1>',
      '    <dt-card><h2>Phase 1</h2></dt-card>',
      '    <dt-card><h3>Phase 2</h3></dt-card>',
      '  </body>',
      '</html>',
    ].join('\n');

    expect(summarizeHtml(html)).toContain('Title: Roadmap');
    expect(summarizeHtml(html)).toContain('Sections: 2 dt-card(s)');
    expect(summarizeHtml(html)).toContain(
      'Headings:\n  h1: Main Plan\n  h2: Phase 1\n  h3: Phase 2',
    );
  });

  it('limits headings and includes byte-size banner', () => {
    const headings = Array.from({ length: 10 }, (_, index) => `<h2>Item ${index + 1}</h2>`).join(
      '',
    );
    const html = `<html><body>${headings}</body></html>`;
    const summary = summarizeHtml(html);

    expect(summary).toMatch(/^\[HTML content removed from context to save tokens/);
    expect(summary).toContain('  h2: Item 8');
    expect(summary).not.toContain('  h2: Item 9');
  });
});

describe('scrubHtmlToolCallArgs', () => {
  it('replaces create_liveapp content with a summary in place', () => {
    const originalHtml =
      '<html><head><title>Preview</title></head><body><h1>Hello</h1></body></html>';
    const message = {
      role: 'assistant',
      provider: 'openai',
      model: 'gpt',
      usage: { total: 12 },
      timestamp: Date.now(),
      content: [
        { type: 'text', text: 'Done' },
        {
          type: 'toolCall',
          id: 'tool-1',
          name: 'create_liveapp',
          arguments: { title: 'Preview', content: originalHtml },
        },
      ],
    } as unknown as AssistantMessage;

    scrubHtmlToolCallArgs(message);

    const toolCall = message.content[1] as ToolCall;
    expect(toolCall.arguments.content).not.toBe(originalHtml);
    expect(toolCall.arguments.content).toContain('Title: Preview');
    expect(toolCall.arguments.content).toContain('  h1: Hello');
  });

  it('ignores non-create_liveapp tool calls and missing content', () => {
    const message = {
      role: 'assistant',
      provider: 'openai',
      model: 'gpt',
      usage: { total: 12 },
      timestamp: Date.now(),
      content: [
        {
          type: 'toolCall',
          id: 'tool-1',
          name: 'read_manual',
          arguments: { page: 'html/layouts' },
        },
        {
          type: 'toolCall',
          id: 'tool-2',
          name: 'create_liveapp',
          arguments: { title: 'Preview' },
        },
      ],
    } as unknown as AssistantMessage;

    scrubHtmlToolCallArgs(message);

    expect((message.content[0] as ToolCall).arguments).toEqual({ page: 'html/layouts' });
    expect((message.content[1] as ToolCall).arguments).toEqual({ title: 'Preview' });
  });
});

describe('PiSessionService.getHistory', () => {
  it('hydrates ask_user tool calls with checkpoint answers when the tool result is still waiting', () => {
    const history = PiSessionService.prototype.getHistory.call({
      session: {
        messages: [
          {
            role: 'assistant',
            provider: 'openai',
            model: 'gpt',
            usage: { total: 12 },
            timestamp: 100,
            content: [
              {
                type: 'toolCall',
                id: 'tool-ask-1',
                name: 'ask_user',
                arguments: {
                  question: 'Which theme would you prefer?',
                  type: 'select',
                  options: ['Light', 'Dark'],
                },
              },
            ],
          },
          {
            role: 'toolResult',
            toolCallId: 'tool-ask-1',
            toolName: 'ask_user',
            timestamp: 101,
            content: [
              { type: 'text', text: '[Waiting for user response. Question ID: question-1]' },
            ],
          },
          {
            role: 'user',
            timestamp: 102,
            content:
              '[Agent Question Answer]\n{"questionId":"question-1","question":"Which theme would you prefer?","answer":"Dark"}\n[/Agent Question Answer]',
          },
        ],
      },
      getMessageMetadata: () => undefined,
      getSessionId: () => 'session-1',
      pendingQuestionStore: {
        list: () => [
          {
            questionId: 'question-1',
            sessionId: 'session-1',
            toolCallId: 'tool-ask-1',
            question: 'Which theme would you prefer?',
            questionType: 'select',
            options: ['Light', 'Dark'],
            status: 'answered',
            answer: 'Dark',
            createdAt: 100,
            answeredAt: 102,
          },
        ],
      },
    }) as ReturnType<PiSessionService['getHistory']>;

    expect(history).toHaveLength(1);
    expect(history[0]?.toolCall).toEqual({
      toolName: 'ask_user',
      params: {
        question: 'Which theme would you prefer?',
        questionType: 'select',
        options: ['Light', 'Dark'],
        answer: 'Dark',
      },
    });
  });

  it('preserves historical tool-result answers for pre-checkpoint sessions', () => {
    const history = PiSessionService.prototype.getHistory.call({
      session: {
        messages: [
          {
            role: 'assistant',
            provider: 'openai',
            model: 'gpt',
            usage: { total: 12 },
            timestamp: 100,
            content: [
              {
                type: 'toolCall',
                id: 'tool-ask-1',
                name: 'ask_user',
                arguments: {
                  question: 'Which theme would you prefer?',
                  type: 'select',
                  options: ['Light', 'Dark'],
                },
              },
            ],
          },
          {
            role: 'toolResult',
            toolCallId: 'tool-ask-1',
            toolName: 'ask_user',
            timestamp: 101,
            content: [{ type: 'text', text: 'Dark' }],
          },
        ],
      },
      getMessageMetadata: () => undefined,
      getSessionId: () => 'session-1',
      pendingQuestionStore: { list: () => [] },
    }) as ReturnType<PiSessionService['getHistory']>;

    expect(history).toHaveLength(1);
    expect(history[0]?.toolCall?.params).toMatchObject({ answer: 'Dark' });
  });
});

describe('PiSessionService.getProviderOptions', () => {
  it('returns a resolved model when the provider is available but no model is explicitly saved', async () => {
    const result = await PiSessionService.prototype.getProviderOptions.call({
      syncProviderCredentials: async () => {},
      getPreference: async (key: string) => (key === 'ai.defaultProvider' ? 'openai' : undefined),
      modelRegistry: {
        getAvailable: () => [{ provider: 'openai', id: 'gpt-4o' }],
        getAll: () => [{ provider: 'openai', id: 'gpt-4o' }],
        find: (provider: string, model: string) =>
          provider === 'openai' && model === 'gpt-4o' ? { provider, id: model } : undefined,
      },
      authStorage: {
        hasAuth: () => false,
      },
    } as unknown as PiSessionService);

    expect(result.defaultProvider).toBe('openai');
    expect(result.providers.find((provider) => provider.id === 'openai')).toMatchObject({
      configured: true,
      model: '',
      resolvedModel: 'gpt-4o',
    });
  });
});

describe('pi thinking defaults', () => {
  it('creates pi sessions with thinking disabled', async () => {
    const setThinkingLevel = vi.fn();
    const session = { setThinkingLevel } as unknown as PiCodingAgent.AgentSession;
    const createAgentSessionSpy = vi
      .spyOn(PiCodingAgent, 'createAgentSession')
      .mockResolvedValue({
        session,
        extensionsResult: {} as never,
      });

    const result = await createDeskTalkAgentSession({
      cwd: '/tmp/desktalk-test',
    });

    expect(result).toBe(session);
    expect(createAgentSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp/desktalk-test',
        thinkingLevel: 'off',
      }),
    );
    expect(setThinkingLevel).toHaveBeenCalledWith('off');
  });

  it('reapplies thinking off when syncing provider preferences', async () => {
    const targetModel = { provider: 'openai', id: 'gpt-5' };
    const setModel = vi.fn();
    const setThinkingLevel = vi.fn();

    await PiSessionService.prototype['syncPreferences'].call({
      resourceLoader: { reload: async () => {} },
      syncProviderCredentials: async () => {},
      getPreference: async (key: string) => {
        if (key === 'ai.defaultProvider') {
          return 'openai';
        }
        return undefined;
      },
      modelRegistry: {
        find: (provider: string, model: string) =>
          provider === 'openai' && model === 'gpt-5' ? targetModel : undefined,
        getAvailable: () => [targetModel],
      },
      session: {
        model: { provider: 'openai', id: 'gpt-4o' },
        setModel,
        setThinkingLevel,
      },
    });

    expect(setModel).toHaveBeenCalledWith(targetModel);
    expect(setThinkingLevel).toHaveBeenCalledWith('off');
  });
});
