import { simplifyPath } from '@desktalk/sdk';

function getToolCallSummary(toolName: string, params: Record<string, unknown>): string {
  const name = toolName.toLowerCase();
  const filePath =
    typeof params.path === 'string'
      ? params.path
      : typeof params.filePath === 'string'
        ? params.filePath
        : null;
  const displayPath = filePath ? simplifyPath(filePath) : null;

  // Built-in read tool (pi-coding-agent) — param is `path`
  if (name === 'read') {
    return displayPath ? `Read ${displayPath}` : 'Read file';
  }

  // desktop — action-based summary
  if (name === 'desktop') {
    const action = typeof params.action === 'string' ? params.action : null;
    const miniAppId = typeof params.miniAppId === 'string' ? params.miniAppId : null;
    const windowId = typeof params.windowId === 'string' ? params.windowId : null;

    if (action === 'list') return 'List windows';
    if (action === 'open' && miniAppId) return `Open ${miniAppId}`;
    if (action === 'focus') return windowId ? `Focus window ${windowId}` : 'Focus window';
    if (action === 'maximize') return windowId ? `Maximize window ${windowId}` : 'Maximize window';
    if (action === 'close') return windowId ? `Close window ${windowId}` : 'Close window';
    return action ? `Desktop ${action}` : 'Desktop';
  }

  // action — invoke MiniApp action
  if (name === 'action') {
    const actionName = typeof params.name === 'string' ? params.name : null;
    return actionName ? `Invoke ${actionName}` : 'Invoke action';
  }

  // create_liveapp — generate visual content
  if (name === 'create_liveapp') {
    const title = typeof params.title === 'string' ? params.title : null;
    return title ? `Create LiveApp: ${title}` : 'Create LiveApp';
  }

  if (name === 'generate_icon') {
    const liveAppId = typeof params.liveAppId === 'string' ? params.liveAppId : null;
    return liveAppId ? `Generate icon: ${liveAppId}` : 'Generate icon';
  }

  if (name === 'edit') {
    return displayPath ? `Edit ${displayPath}` : 'Edit file';
  }

  if (name === 'undo_edit') {
    return displayPath ? `Undo edit ${displayPath}` : 'Undo edit';
  }

  if (name === 'redo_edit') {
    return displayPath ? `Redo edit ${displayPath}` : 'Redo edit';
  }

  if (name === 'read_manual') {
    const page = typeof params.page === 'string' ? params.page : null;
    return page ? `Read manual: ${page}` : 'Read manual';
  }

  if (name === 'ask_user') {
    return 'Ask user';
  }

  return toolName;
}

function extractToolCall(line: string): { toolName: string; rawParams: string } | null {
  const prefix = 'Called the ';
  const suffix = ' tool with the following input:';

  if (!line.startsWith(prefix)) {
    return null;
  }

  const suffixIndex = line.indexOf(suffix);
  if (suffixIndex === -1) {
    return null;
  }

  const toolName = line.slice(prefix.length, suffixIndex).trim();
  const payload = line.slice(suffixIndex + suffix.length).trim();
  const jsonStart = payload.indexOf('{');
  if (!toolName || jsonStart === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = jsonStart; index < payload.length; index += 1) {
    const char = payload[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          toolName,
          rawParams: payload.slice(jsonStart, index + 1),
        };
      }
    }
  }

  return null;
}

function simplifyToolCallMarkdown(content: string): string {
  const lines = content.split('\n');
  const simplified: string[] = [];
  let skippingToolOutput = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const toolCall = extractToolCall(trimmed);

    if (toolCall) {
      const { toolName, rawParams } = toolCall;

      try {
        const params = JSON.parse(rawParams) as Record<string, unknown>;
        simplified.push(`- ${getToolCallSummary(toolName, params)}`);
      } catch {
        simplified.push(`- ${toolName}`);
      }

      skippingToolOutput = true;
      continue;
    }

    if (skippingToolOutput) {
      if (
        trimmed.startsWith('<path>') ||
        trimmed.startsWith('<type>') ||
        trimmed.startsWith('<content>') ||
        trimmed.startsWith('</path>') ||
        trimmed.startsWith('</type>') ||
        trimmed.startsWith('</content>') ||
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        /^\d+:\s/.test(trimmed) ||
        trimmed.startsWith('(End of file')
      ) {
        continue;
      }

      if (trimmed.length === 0) {
        skippingToolOutput = false;
        continue;
      }

      skippingToolOutput = false;
    }

    simplified.push(line);
  }

  return simplified
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export { extractToolCall, getToolCallSummary, simplifyToolCallMarkdown };
