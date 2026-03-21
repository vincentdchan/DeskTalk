import { describe, expect, it } from 'vitest';
import { createReadManualTool } from './manual-tool';

describe('createReadManualTool', () => {
  const tool = createReadManualTool();

  it('returns the manual overview when no page is provided', async () => {
    const result = await tool.execute('tool-1', {}, undefined, undefined, {} as never);
    const content = result.content[0];

    expect(result.details).toMatchObject({ ok: true, page: 'overview' });
    expect(content?.type).toBe('text');
    if (!content || content.type !== 'text') {
      throw new Error('Expected text content');
    }
    expect(content.text).toContain('DeskTalk Manual');
    expect(content.text).toContain('html/tokens');
  });

  it('returns a manual page and related references', async () => {
    const result = await tool.execute(
      'tool-2',
      { page: 'editing/preview' },
      undefined,
      undefined,
      {} as never,
    );
    const content = result.content[0];

    expect(result.details).toMatchObject({
      ok: true,
      page: 'editing/preview',
      title: 'Preview Editing',
    });
    expect(content?.type).toBe('text');
    if (!content || content.type !== 'text') {
      throw new Error('Expected text content');
    }
    expect(content.text).toContain('Preferred Flow');
    expect(content.text).toContain('Related pages:');
    expect(content.text).toContain('desktop/actions');
  });
});
