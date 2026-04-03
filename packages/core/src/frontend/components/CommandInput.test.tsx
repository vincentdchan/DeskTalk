import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandInput } from './CommandInput';
import { useChatSession } from '../stores/chat-session';

function resetChatSession(): void {
  useChatSession.setState({
    messages: [],
    draftInput: '',
    isAiRunning: false,
    activeRequestId: null,
    modelLabel: 'not configured',
    tokenCount: 0,
    providerOptions: [],
    selectedProvider: '',
    currentSessionId: null,
    sessions: [],
    pendingQuestion: null,
  });
}

describe('CommandInput', () => {
  beforeEach(() => {
    resetChatSession();
  });

  it('renders pending text questions inside the command input frame', () => {
    const html = renderToStaticMarkup(
      <CommandInput
        onSubmit={vi.fn()}
        onAnswer={vi.fn()}
        onCancelAi={() => false}
        isAiRunning={false}
        pendingQuestion={{
          questionId: 'question-1',
          question: 'What should we name this session?',
          questionType: 'text',
        }}
        queuedCount={0}
        isVoiceActive={false}
        onVoiceToggle={vi.fn()}
        modelLabel="GPT"
        wsReady
      />,
    );

    expect(html).toContain('What should we name this session?');
    expect(html).toContain('Type your answer...');
    expect(html).toContain('Press Enter to submit your answer.');
  });

  it('renders pending select questions as option chips with a submit button', () => {
    const html = renderToStaticMarkup(
      <CommandInput
        onSubmit={vi.fn()}
        onAnswer={vi.fn()}
        onCancelAi={() => false}
        isAiRunning={false}
        pendingQuestion={{
          questionId: 'question-2',
          question: 'Pick a theme',
          questionType: 'select',
          options: ['Light', 'Dark'],
        }}
        queuedCount={0}
        isVoiceActive={false}
        onVoiceToggle={vi.fn()}
        modelLabel="GPT"
        wsReady
      />,
    );

    expect(html).toContain('Pick a theme');
    expect(html).toContain('Choose an option, then press Enter.');
    expect(html).toContain('Light');
    expect(html).toContain('Dark');
    expect(html).toContain('Submit');
  });

  it('renders pending confirm questions without the textarea', () => {
    const html = renderToStaticMarkup(
      <CommandInput
        onSubmit={vi.fn()}
        onAnswer={vi.fn()}
        onCancelAi={() => false}
        isAiRunning={false}
        pendingQuestion={{
          questionId: 'question-3',
          question: 'Continue?',
          questionType: 'confirm',
        }}
        queuedCount={0}
        isVoiceActive={false}
        onVoiceToggle={vi.fn()}
        modelLabel="GPT"
        wsReady
      />,
    );

    expect(html).toContain('Continue?');
    expect(html).toContain('Yes');
    expect(html).toContain('No');
    expect(html).not.toContain('<textarea');
  });
});
