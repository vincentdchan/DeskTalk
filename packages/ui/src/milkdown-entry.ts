import { Crepe } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import prosemirrorCss from '@milkdown/kit/prose/view/style/prosemirror.css?raw';
import resetCss from '@milkdown/crepe/theme/common/reset.css?raw';
import blockEditCss from '@milkdown/crepe/theme/common/block-edit.css?raw';
import cursorCss from '@milkdown/crepe/theme/common/cursor.css?raw';
import linkTooltipCss from '@milkdown/crepe/theme/common/link-tooltip.css?raw';
import listItemCss from '@milkdown/crepe/theme/common/list-item.css?raw';
import placeholderCss from '@milkdown/crepe/theme/common/placeholder.css?raw';
import toolbarCss from '@milkdown/crepe/theme/common/toolbar.css?raw';
import tableCss from '@milkdown/crepe/theme/common/table.css?raw';

import type { DtMilkdownRuntime } from './lib/milkdown-loader';

declare global {
  interface Window {
    __DtMilkdown?: DtMilkdownRuntime;
  }
}

window.__DtMilkdown = {
  Crepe,
  replaceAll,
  cssText: [
    prosemirrorCss,
    resetCss,
    blockEditCss,
    cursorCss,
    linkTooltipCss,
    listItemCss,
    placeholderCss,
    toolbarCss,
    tableCss,
  ].join('\n'),
};
