import { describe, expect, it } from 'vitest';
import { extractToolCall, getToolCallSummary, simplifyToolCallMarkdown } from './tool-call-summary';

describe('getToolCallSummary', () => {
  it('formats read tool calls with a path', () => {
    expect(getToolCallSummary('read', { path: '/tmp/example.ts' })).toBe('Read /tmp/example.ts');
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

  it('formats action tool calls', () => {
    expect(getToolCallSummary('action', { name: 'setTheme' })).toBe('Invoke setTheme');
  });

  it('formats action tool calls without name', () => {
    expect(getToolCallSummary('action', {})).toBe('Invoke action');
  });

  it('formats generate_html tool calls with title', () => {
    expect(getToolCallSummary('generate_html', { title: 'My Dashboard' })).toBe(
      'Generate HTML: My Dashboard',
    );
  });

  it('formats generate_html tool calls without title', () => {
    expect(getToolCallSummary('generate_html', {})).toBe('Generate HTML');
  });

  it('formats read_html_guidelines tool calls', () => {
    expect(getToolCallSummary('read_html_guidelines', {})).toBe('Read HTML guidelines');
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
});
