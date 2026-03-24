import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';
import './milkdown-entry';

type MarkdownEditorStoryArgs = {
  placeholder: string;
  readonly: boolean;
};

function createMarkdownEditorStory(args: MarkdownEditorStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.height = '520px';

  const stack = document.createElement('dt-stack');
  stack.setAttribute('gap', '12');
  stack.style.height = '100%';

  const toolbar = document.createElement('dt-stack');
  toolbar.setAttribute('direction', 'row');
  toolbar.setAttribute('gap', '8');
  toolbar.setAttribute('align', 'center');

  const badge = document.createElement('dt-badge');
  badge.textContent = args.readonly ? 'Read only' : 'Editable';
  badge.setAttribute('variant', args.readonly ? 'neutral' : 'info');
  toolbar.appendChild(badge);

  const editor = document.createElement('dt-markdown-editor') as HTMLElement & { value: string };
  editor.style.height = '100%';
  editor.setAttribute('placeholder', args.placeholder);
  if (args.readonly) {
    editor.setAttribute('readonly', '');
  }
  editor.value =
    '# Operations Journal\n\nStart typing here.\n\n- Capture findings\n- Track tasks\n- Share updates';

  stack.append(toolbar, editor);
  container.appendChild(stack);
  return container;
}

const meta = {
  title: 'Components/Markdown Editor',
  tags: ['autodocs'],
  args: {
    placeholder: 'Write something...',
    readonly: false,
  },
  render: createMarkdownEditorStory,
} satisfies Meta<MarkdownEditorStoryArgs>;

export default meta;

type Story = StoryObj<MarkdownEditorStoryArgs>;

export const Playground: Story = {};

export const Readonly: Story = {
  args: {
    readonly: true,
  },
};
