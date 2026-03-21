import { stripDtInjections } from './strip-dt-injections';

export interface PreviewThemeRuntime {
  accentColor: string;
  mode: 'light' | 'dark';
}

const UI_BUNDLE_SCRIPT_TAG = '<script src="/api/ui/desktalk-ui.js" data-dt-ui></script>';

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function createThemeLinkTag(accentColor: string, mode: 'light' | 'dark'): string {
  const params = new URLSearchParams({ accent: accentColor, theme: mode });
  return `<link rel="stylesheet" href="/api/ui/desktalk-theme.css?${params.toString()}" data-dt-theme>`;
}

function createHtmlBridgeScript(streamId: string, bridgeToken: string): string {
  const serializedStreamId = serializeForInlineScript(streamId);
  const serializedBridgeToken = serializeForInlineScript(bridgeToken);

  return [
    '<script data-dt-bridge>',
    '(() => {',
    `  const streamId = ${serializedStreamId};`,
    `  const token = ${serializedBridgeToken};`,
    '  let requestCounter = 0;',
    '  const pending = new Map();',
    '  const REQUEST_TIMEOUT_MS = 30000;',
    '',
    '  function createError(message) {',
    '    return message instanceof Error ? message : new Error(String(message));',
    '  }',
    '',
    '  function normalizeExecArgs(programOrShell, argsOrOpts, maybeOpts) {',
    '    if (typeof programOrShell === "string" && /\\s/.test(programOrShell)',
    '        && (argsOrOpts === undefined || argsOrOpts === null',
    '            || (typeof argsOrOpts === "object" && !Array.isArray(argsOrOpts)))) {',
    '      return {',
    '        program: "sh",',
    '        args: ["-c", programOrShell],',
    '        options: (typeof argsOrOpts === "object" && argsOrOpts !== null) ? argsOrOpts : {},',
    '      };',
    '    }',
    '    return {',
    '      program: programOrShell,',
    '      args: Array.isArray(argsOrOpts) ? argsOrOpts : [],',
    '      options: (Array.isArray(argsOrOpts) ? maybeOpts : argsOrOpts) || {},',
    '    };',
    '  }',
    '',
    '  function request(kind, payload) {',
    '    return new Promise((resolve, reject) => {',
    '      const requestId = `dt-bridge-${Date.now()}-${++requestCounter}`;',
    '      const timeout = window.setTimeout(() => {',
    '        pending.delete(requestId);',
    "        reject(new Error('DeskTalk bridge request timed out.'));",
    '      }, REQUEST_TIMEOUT_MS);',
    '',
    '      pending.set(requestId, { resolve, reject, timeout });',
    '      window.parent.postMessage({',
    "        type: 'desktalk:bridge-request',",
    '        streamId,',
    '        token,',
    '        requestId,',
    '        kind,',
    '        payload,',
    "      }, '*');",
    '    });',
    '  }',
    '',
    "  window.addEventListener('message', (event) => {",
    '    const message = event.data;',
    "    if (!message || message.type !== 'desktalk:bridge-response') return;",
    '    if (message.streamId !== streamId || message.token !== token) return;',
    '    const pendingRequest = pending.get(message.requestId);',
    '    if (!pendingRequest) return;',
    '    pending.delete(message.requestId);',
    '    window.clearTimeout(pendingRequest.timeout);',
    '    if (message.ok) {',
    '      pendingRequest.resolve(message.result);',
    '      return;',
    '    }',
    '    pendingRequest.reject(createError(message.error || "DeskTalk bridge request failed."));',
    '  });',
    '',
    '  window.DeskTalk = Object.freeze({',
    '    getState(selector) {',
    "      return request('getState', { selector });",
    '    },',
    '    exec(programOrShell, argsOrOpts, maybeOpts) {',
    '      const n = normalizeExecArgs(programOrShell, argsOrOpts, maybeOpts);',
    "      return request('exec', { program: n.program, args: n.args, options: n.options });",
    '    },',
    '    execute(programOrShell, argsOrOpts, maybeOpts) {',
    '      const n = normalizeExecArgs(programOrShell, argsOrOpts, maybeOpts);',
    "      return request('exec', { program: n.program, args: n.args, options: n.options });",
    '    },',
    '  });',
    '})();',
    '</script>',
  ].join('\n');
}

function injectIntoHtmlHead(html: string, snippet: string): string {
  const headMatch = html.match(/<head(\s[^>]*)?>|<head>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertPos = headMatch.index + headMatch[0].length;
    return html.slice(0, insertPos) + '\n' + snippet + '\n' + html.slice(insertPos);
  }

  return snippet + '\n' + html;
}

export function injectDtRuntime(
  html: string,
  options: {
    theme: PreviewThemeRuntime;
    streamId: string;
    bridgeToken: string;
  },
): string {
  const cleanHtml = stripDtInjections(html);
  const snippet = [
    createThemeLinkTag(options.theme.accentColor, options.theme.mode),
    UI_BUNDLE_SCRIPT_TAG,
    createHtmlBridgeScript(options.streamId, options.bridgeToken),
  ].join('\n');
  return injectIntoHtmlHead(cleanHtml, snippet);
}
