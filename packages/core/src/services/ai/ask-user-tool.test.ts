import { describe, expect, it, vi } from 'vitest';
import { createAskUserTool } from './ask-user-tool';

describe('createAskUserTool', () => {
  it('returns an error result when select options are missing', async () => {
    const sendQuestion = vi.fn();
    const tool = createAskUserTool({ sendQuestion });

    const result = await tool.execute(
      'tool-1',
      { question: 'Pick one', type: 'select' },
      undefined,
      undefined,
      {} as never,
    );

    expect(sendQuestion).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ ok: false });
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'ask_user requires non-empty options for select questions.',
    });
  });

  it('waits for the user answer and returns it as plain text', async () => {
    let resolveAnswer: ((value: string) => void) | undefined;
    const sendQuestion = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveAnswer = resolve;
        }),
    );
    const tool = createAskUserTool({ sendQuestion });

    const resultPromise = tool.execute(
      'tool-2',
      {
        question: 'Which theme?',
        type: 'multi_select',
        options: ['Light', 'Dark'],
      },
      undefined,
      undefined,
      {} as never,
    );

    expect(sendQuestion).toHaveBeenCalledWith({
      question: 'Which theme?',
      questionType: 'multi_select',
      options: ['Light', 'Dark'],
      signal: undefined,
    });

    resolveAnswer?.('["Dark"]');
    const result = await resultPromise;

    expect(result.details).toMatchObject({ ok: true, answer: '["Dark"]' });
    expect(result.content[0]).toMatchObject({ type: 'text', text: '["Dark"]' });
  });
});
