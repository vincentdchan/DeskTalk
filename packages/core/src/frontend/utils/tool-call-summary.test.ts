import { describe, expect, it } from 'vitest';
import { extractToolCall, getToolCallSummary, simplifyToolCallMarkdown } from './tool-call-summary';

describe('getToolCallSummary', () => {
  it('formats read tool calls with a file path', () => {
    expect(getToolCallSummary('Read', { filePath: '/tmp/example.ts' })).toBe(
      '- Read /tmp/example.ts',
    );
  });

  it('prefers open titles over other identifiers', () => {
    expect(
      getToolCallSummary('Open', {
        title: 'Preview Window',
        miniAppId: 'preview',
        filePath: '/tmp/example.ts',
      }),
    ).toBe('- Open "Preview Window"');
  });

  it('falls back to description or tool name when needed', () => {
    expect(getToolCallSummary('CustomTool', { description: 'Do a custom thing' })).toBe(
      '- Do a custom thing',
    );
    expect(getToolCallSummary('CustomTool', {})).toBe('- CustomTool');
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
      'Called the Bash tool with the following input: {"command":"pnpm lint"}',
      '',
      '',
      'Done',
    ].join('\n');

    expect(simplifyToolCallMarkdown(content)).toBe(
      ['Before', '', '- Run pnpm lint', '', 'Done'].join('\n'),
    );
  });
});
