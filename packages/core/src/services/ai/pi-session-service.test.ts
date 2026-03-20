import { describe, expect, it } from 'vitest';
import type { AssistantMessage, ToolCall } from '@mariozechner/pi-ai';
import { scrubHtmlToolCallArgs, summarizeHtml } from './pi-session-service';

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
  it('replaces generate_html content with a summary in place', () => {
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
          name: 'generate_html',
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

  it('ignores non-generate_html tool calls and missing content', () => {
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
          name: 'read_html_guidelines',
          arguments: { topic: 'cards' },
        },
        {
          type: 'toolCall',
          id: 'tool-2',
          name: 'generate_html',
          arguments: { title: 'Preview' },
        },
      ],
    } as unknown as AssistantMessage;

    scrubHtmlToolCallArgs(message);

    expect((message.content[0] as ToolCall).arguments).toEqual({ topic: 'cards' });
    expect((message.content[1] as ToolCall).arguments).toEqual({ title: 'Preview' });
  });
});
