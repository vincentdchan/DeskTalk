import { describe, expect, it, vi } from 'vitest';
import { createAskUserTool, formatAskUserWaitingMessage } from './ask-user-tool';

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

  it('returns a waiting result after dispatching the question', async () => {
    const sendQuestion = vi.fn().mockResolvedValue({
      questionId: 'question-1',
      waitingMessage: formatAskUserWaitingMessage('question-1'),
    });
    const tool = createAskUserTool({ sendQuestion });

    const result = await tool.execute(
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
      toolCallId: 'tool-2',
      question: 'Which theme?',
      questionType: 'multi_select',
      options: ['Light', 'Dark'],
      signal: undefined,
    });

    expect(result.details).toMatchObject({
      ok: true,
      status: 'pending',
      questionId: 'question-1',
    });
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: formatAskUserWaitingMessage('question-1'),
    });
  });
});
