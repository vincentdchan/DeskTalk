import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMessageItem, type ChatMessage } from './ChatMessageItem';

describe('ChatMessageItem', () => {
  it('renders unanswered ask_user history as a tool call summary', () => {
    const message: ChatMessage = {
      id: 'tool-1',
      role: 'assistant',
      content: '',
      toolCall: {
        toolName: 'ask_user',
        params: {
          question: 'Which theme would you prefer?',
          questionType: 'select',
          options: ['Light', 'Dark'],
        },
      },
    };

    const html = renderToStaticMarkup(
      <ChatMessageItem message={message} isThinking={false} isStreaming={false} />,
    );

    expect(html).toContain('Asked user: Which theme would you prefer?');
    expect(html).not.toContain('Waiting for answer');
  });

  it('renders answered ask_user history as a read-only question', () => {
    const message: ChatMessage = {
      id: 'tool-2',
      role: 'assistant',
      content: '',
      toolCall: {
        toolName: 'ask_user',
        params: {
          question: 'Which theme would you prefer?',
          questionType: 'select',
          options: ['Light', 'Dark'],
          answer: 'Dark',
        },
      },
    };

    const html = renderToStaticMarkup(
      <ChatMessageItem message={message} isThinking={false} isStreaming={false} />,
    );

    expect(html).toContain('Which theme would you prefer?');
    expect(html).toContain('Dark');
  });
});
