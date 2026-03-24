import type { Meta, StoryObj } from '@storybook/web-components-vite';

import './index';
import './marked-entry';

type MarkdownStoryArgs = {
  streaming: boolean;
  unsafeHtml: boolean;
};

const sampleMarkdown = dedent(`
  # Mission Notes

  DeskTalk can render **markdown** with tables, lists, and code blocks.

  ## Checklist

  - Review deployment logs
  - Confirm data pipeline health
  - Ship release candidate

  ## Example

  | Service | Status | Latency |
  | ------- | ------ | ------- |
  | API     | Ready  | 32 ms   |
  | Queue   | Warm   | 12 ms   |
  | Search  | Busy   | 58 ms   |

  > Links dispatch a custom event instead of navigating immediately.

  [Open deployment guide](https://example.com/docs)

  \`\`\`bash
  pnpm build
  pnpm lint
  \`\`\`
`);

function dedent(value: string): string {
  const lines = value.replaceAll('\r\n', '\n').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  const minIndent = Math.min(
    ...lines
      .filter((line) => line.trim() !== '')
      .map((line) => line.match(/^\s*/)?.[0].length ?? 0),
  );
  return lines.map((line) => line.slice(minIndent)).join('\n');
}

function createMarkdownStory(args: MarkdownStoryArgs): HTMLElement {
  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.maxWidth = '760px';

  const markdown = document.createElement('dt-markdown') as HTMLElement & {
    content: string;
    streaming: boolean;
  };

  if (args.unsafeHtml) {
    markdown.setAttribute('unsafe-html', '');
  }

  if (args.streaming) {
    markdown.setAttribute('streaming', '');
    markdown.content = '# Streaming report\n\nLoading **results**';
    setTimeout(() => {
      markdown.content =
        '# Streaming report\n\nLoading **results**...\n\n- Nodes online\n- Cache warm';
      markdown.streaming = false;
    }, 800);
  } else {
    markdown.textContent = sampleMarkdown;
  }

  container.appendChild(markdown);
  return container;
}

const meta = {
  title: 'Components/Markdown',
  tags: ['autodocs'],
  args: {
    streaming: false,
    unsafeHtml: false,
  },
  render: createMarkdownStory,
} satisfies Meta<MarkdownStoryArgs>;

export default meta;

type Story = StoryObj<MarkdownStoryArgs>;

export const Playground: Story = {};

export const Streaming: Story = {
  args: {
    streaming: true,
  },
};
