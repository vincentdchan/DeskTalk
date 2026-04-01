import { Crepe } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import prosemirrorCss from '@milkdown/kit/prose/view/style/prosemirror.css?inline';
import resetCss from '@milkdown/crepe/theme/common/reset.css?inline';
import blockEditCss from '@milkdown/crepe/theme/common/block-edit.css?inline';
import cursorCss from '@milkdown/crepe/theme/common/cursor.css?inline';
import linkTooltipCss from '@milkdown/crepe/theme/common/link-tooltip.css?inline';
import listItemCss from '@milkdown/crepe/theme/common/list-item.css?inline';
import placeholderCss from '@milkdown/crepe/theme/common/placeholder.css?inline';
import toolbarCss from '@milkdown/crepe/theme/common/toolbar.css?inline';
import tableCss from '@milkdown/crepe/theme/common/table.css?inline';

import type { DtMilkdownRuntime } from './lib/milkdown-loader';

declare global {
  interface Window {
    __DtMilkdown?: DtMilkdownRuntime;
  }
}

const cssEntries = [
  { name: 'prosemirror', css: prosemirrorCss },
  { name: 'reset', css: resetCss },
  { name: 'block-edit', css: blockEditCss },
  { name: 'cursor', css: cursorCss },
  { name: 'link-tooltip', css: linkTooltipCss },
  { name: 'list-item', css: listItemCss },
  { name: 'placeholder', css: placeholderCss },
  { name: 'toolbar', css: toolbarCss },
  { name: 'table', css: tableCss },
];

window.__DtMilkdown = {
  Crepe,
  replaceAll,
  cssText: cssEntries.map((e) => e.css).join('\n'),
  cssEntries,
};
