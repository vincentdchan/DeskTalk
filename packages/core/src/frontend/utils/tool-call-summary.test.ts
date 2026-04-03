import { describe, expect, it } from 'vitest';
import { extractToolCall, getToolCallSummary, simplifyToolCallMarkdown } from './tool-call-summary';

describe('getToolCallSummary', () => {
  it('formats read tool calls with a path', () => {
    expect(getToolCallSummary('read', { path: '/tmp/example.ts' })).toBe('Read /tmp/example.ts');
  });

  it('shortens paths under the current user home to ~', () => {
    expect(
      getToolCallSummary('read', { path: '/Users/duzhongchen/projects/demo/index.html' }),
    ).toBe('Read ~/projects/demo/index.html');
  });

  it('shortens paths under DeskTalk data to <dt-data>', () => {
    expect(
      getToolCallSummary('read', {
        path: '/Users/duzhongchen/Library/Application Support/DeskTalk/ai-sessions/session.jsonl',
      }),
    ).toBe('Read <dt-data>/ai-sessions/session.jsonl');
  });

  it('shortens paths under DeskTalk home to <dt-home>', () => {
    expect(
      getToolCallSummary('edit', {
        path: '/Users/duzhongchen/Library/Application Support/DeskTalk/home/admin/documents/index.html',
      }),
    ).toBe('Edit <dt-home>/documents/index.html');
  });

  it('falls back to filePath param for read tool', () => {
    expect(getToolCallSummary('Read', { filePath: '/tmp/example.ts' })).toBe(
      'Read /tmp/example.ts',
    );
  });

  it('returns "Read file" when no path param provided', () => {
    expect(getToolCallSummary('read', {})).toBe('Read file');
  });

  it('formats desktop list action', () => {
    expect(getToolCallSummary('desktop', { action: 'list' })).toBe('List windows');
  });

  it('formats desktop open action with miniAppId', () => {
    expect(getToolCallSummary('desktop', { action: 'open', miniAppId: 'preview' })).toBe(
      'Open preview',
    );
  });

  it('formats desktop focus action with windowId', () => {
    expect(getToolCallSummary('desktop', { action: 'focus', windowId: 'win-1' })).toBe(
      'Focus window win-1',
    );
  });

  it('formats desktop maximize action', () => {
    expect(getToolCallSummary('desktop', { action: 'maximize' })).toBe('Maximize window');
  });

  it('formats desktop close action', () => {
    expect(getToolCallSummary('desktop', { action: 'close', windowId: 'win-2' })).toBe(
      'Close window win-2',
    );
  });

  it('formats layout focus_direction action', () => {
    expect(getToolCallSummary('layout', { action: 'focus_direction', direction: 'left' })).toBe(
      'Focus left',
    );
  });

  it('formats layout swap action', () => {
    expect(getToolCallSummary('layout', { action: 'swap', direction: 'right' })).toBe('Swap right');
  });

  it('formats layout resize action', () => {
    expect(getToolCallSummary('layout', { action: 'resize', delta: 0.1 })).toBe(
      'Resize focused split +0.1',
    );
  });

  it('formats layout rotate action', () => {
    expect(getToolCallSummary('layout', { action: 'rotate' })).toBe('Rotate focused split');
  });

  it('formats layout equalize action', () => {
    expect(getToolCallSummary('layout', { action: 'equalize' })).toBe('Equalize focused split');
  });

  it('formats layout split_mode action', () => {
    expect(getToolCallSummary('layout', { action: 'split_mode', mode: 'vertical' })).toBe(
      'Set split mode vertical',
    );
  });

  it('formats action tool calls', () => {
    expect(getToolCallSummary('action', { name: 'setTheme' })).toBe('Invoke setTheme');
  });

  it('formats action tool calls without name', () => {
    expect(getToolCallSummary('action', {})).toBe('Invoke action');
  });

  it('formats create_liveapp tool calls with title', () => {
    expect(getToolCallSummary('create_liveapp', { title: 'My Dashboard' })).toBe(
      'Create LiveApp: My Dashboard',
    );
  });

  it('formats create_liveapp tool calls without title', () => {
    expect(getToolCallSummary('create_liveapp', {})).toBe('Create LiveApp');
  });

  it('formats generate_icon tool calls with liveapp id', () => {
    expect(
      getToolCallSummary('generate_icon', { liveAppId: 'project-tracker_html-stream-1' }),
    ).toBe('Generate icon: project-tracker_html-stream-1');
  });

  it('formats generate_icon tool calls without liveapp id', () => {
    expect(getToolCallSummary('generate_icon', {})).toBe('Generate icon');
  });

  it('formats edit tool calls with a path', () => {
    expect(getToolCallSummary('edit', { path: '/tmp/preview/index.html' })).toBe(
      'Edit /tmp/preview/index.html',
    );
  });

  it('formats undo_edit tool calls with a path', () => {
    expect(getToolCallSummary('undo_edit', { path: '/tmp/preview/index.html' })).toBe(
      'Undo edit /tmp/preview/index.html',
    );
  });

  it('formats redo_edit tool calls with a path', () => {
    expect(getToolCallSummary('redo_edit', { path: '/tmp/preview/index.html' })).toBe(
      'Redo edit /tmp/preview/index.html',
    );
  });

  it('formats read_manual tool calls without a page', () => {
    expect(getToolCallSummary('read_manual', {})).toBe('Read manual');
  });

  it('formats read_manual tool calls with a page', () => {
    expect(getToolCallSummary('read_manual', { page: 'html/tokens' })).toBe(
      'Read manual: html/tokens',
    );
  });

  it('formats ask_user tool calls', () => {
    expect(getToolCallSummary('ask_user', { question: 'Continue?' })).toBe('Asked user: Continue?');
  });

  it('falls back to tool name for unknown tools', () => {
    expect(getToolCallSummary('UnknownTool', {})).toBe('UnknownTool');
  });
});

describe('extractToolCall', () => {
  it('extracts tool name and json payload when xml-like output follows', () => {
    expect(
      extractToolCall(
        'Called the Read tool with the following input: {"filePath":"/tmp/test.ts"}<path>/tmp/test.ts</path>',
      ),
    ).toEqual({
      toolName: 'Read',
      rawParams: '{"filePath":"/tmp/test.ts"}',
    });
  });

  it('returns null for non-tool-call lines', () => {
    expect(extractToolCall('hello world')).toBeNull();
  });
});

describe('simplifyToolCallMarkdown', () => {
  it('replaces verbose tool output with a compact summary', () => {
    const content = [
      'First line',
      'Called the Read tool with the following input: {"filePath":"/tmp/test.ts"}',
      '<path>/tmp/test.ts</path>',
      '<type>file</type>',
      '<content>1: hello</content>',
      'After tool call',
    ].join('\n');

    expect(simplifyToolCallMarkdown(content)).toBe(
      ['First line', '- Read /tmp/test.ts', 'After tool call'].join('\n'),
    );
  });

  it('keeps surrounding content and collapses extra blank lines', () => {
    const content = [
      'Before',
      '',
      'Called the Read tool with the following input: {"path":"/src/index.ts"}',
      '',
      '',
      'Done',
    ].join('\n');

    expect(simplifyToolCallMarkdown(content)).toBe(
      ['Before', '', '- Read /src/index.ts', '', 'Done'].join('\n'),
    );
  });

  it('summarizes edit tool calls with the file path', () => {
    const content = [
      'Called the edit tool with the following input: {"path":"/Users/duzhongchen/Library/Application Support/DeskTalk/home/admin/documents/index.html","oldText":"A","newText":"B"}',
      '{"ok":true}',
    ].join('\n');

    expect(simplifyToolCallMarkdown(content)).toBe('- Edit <dt-home>/documents/index.html');
  });

  it('summarizes layout tool calls with action details', () => {
    const content = [
      'Called the layout tool with the following input: {"action":"resize","delta":0.1}',
      '{"ok":true}',
    ].join('\n');

    expect(simplifyToolCallMarkdown(content)).toBe('- Resize focused split +0.1');
  });
});
