import { describe, expect, it } from 'vitest';
import { simplifyPath } from './path';

describe('simplifyPath', () => {
  it('prefers <dt-home> over other path shortening rules', () => {
    expect(
      simplifyPath(
        '/Users/duzhongchen/Library/Application Support/DeskTalk/home/admin/pictures/cat.png',
      ),
    ).toBe('<dt-home>/pictures/cat.png');
  });

  it('uses <dt-data> for DeskTalk data paths outside user home', () => {
    expect(
      simplifyPath('/Users/duzhongchen/Library/Application Support/DeskTalk/miniapps/pkg/index.js'),
    ).toBe('<dt-data>/miniapps/pkg/index.js');
  });

  it('uses ~ for generic user-home paths', () => {
    expect(simplifyPath('/Users/duzhongchen/Workspace/DeskTalk/docs/spec.md')).toBe(
      '~/Workspace/DeskTalk/docs/spec.md',
    );
  });

  it('leaves unrelated paths unchanged', () => {
    expect(simplifyPath('/tmp/preview/index.html')).toBe('/tmp/preview/index.html');
  });
});
