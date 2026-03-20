function getToolCallSummary(toolName: string, params: Record<string, unknown>): string {
  const path = typeof params.filePath === 'string' ? params.filePath : null;
  const title = typeof params.title === 'string' ? params.title : null;
  const miniAppId = typeof params.miniAppId === 'string' ? params.miniAppId : null;
  const pattern = typeof params.pattern === 'string' ? params.pattern : null;
  const command = typeof params.command === 'string' ? params.command : null;
  const url = typeof params.url === 'string' ? params.url : null;
  const description = typeof params.description === 'string' ? params.description : null;
  const name = toolName.toLowerCase();

  if (name === 'read' && path) return `- Read ${path}`;
  if (name === 'open' && title) return `- Open "${title}"`;
  if (name === 'open' && path) return `- Open "${path}"`;
  if (name === 'open' && miniAppId) return `- Open ${miniAppId}`;
  if (name === 'glob' && pattern) return `- Find ${pattern}`;
  if (name === 'grep' && pattern) return `- Search ${pattern}`;
  if (name === 'bash' && command) return `- Run ${command}`;
  if (name === 'webfetch' && url) return `- Fetch ${url}`;
  if (description) return `- ${description}`;

  const target = path ?? pattern ?? command ?? url;
  return target ? `- ${toolName} ${target}` : `- ${toolName}`;
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
        simplified.push(getToolCallSummary(toolName, params));
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
