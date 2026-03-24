import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHtmlBridgeScript } from './html-bridge-script';

type MessageListener = (event: { data: unknown }) => void;

interface BridgeStorageCollection {
  insert: (params: unknown) => Promise<void>;
  update: (id: string, params: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
  findById: (id: string) => Promise<unknown>;
  find: (filter: unknown, options?: unknown) => Promise<unknown[]>;
  findAll: () => Promise<unknown[]>;
  count: (filter?: unknown) => Promise<number>;
  compact: () => Promise<void>;
}

interface BridgeApi {
  getState: (selector: string) => Promise<unknown>;
  exec: (...args: unknown[]) => Promise<unknown>;
  execute: (...args: unknown[]) => Promise<unknown>;
  storage: {
    get: (name: string) => Promise<unknown>;
    set: (name: string, value: unknown) => Promise<void>;
    delete: (name: string) => Promise<boolean>;
    list: () => Promise<string[]>;
    collection: (name: string) => BridgeStorageCollection;
  };
}

function extractInlineScript(html: string): string {
  return html.replace(/^<script[^>]*>/, '').replace(/<\/script>\s*$/, '');
}

function createMockWindow() {
  const messageListeners = new Set<MessageListener>();
  const postMessage = vi.fn();

  const mockWindow = {
    parent: {
      postMessage,
    },
    setTimeout,
    clearTimeout,
    addEventListener: vi.fn((type: string, listener: MessageListener) => {
      if (type === 'message') {
        messageListeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: MessageListener) => {
      if (type === 'message') {
        messageListeners.delete(listener);
      }
    }),
  };

  function dispatchMessage(data: unknown) {
    for (const listener of messageListeners) {
      listener({ data });
    }
  }

  return { mockWindow, postMessage, dispatchMessage };
}

function installBridge(streamId = 'stream-1', token = 'token-1') {
  const script = createHtmlBridgeScript(streamId, token);
  const { mockWindow, postMessage, dispatchMessage } = createMockWindow();
  const evaluator = new Function('window', script ? extractInlineScript(script) : '');

  evaluator(mockWindow);

  return {
    DeskTalk: (mockWindow as unknown as { DeskTalk: BridgeApi }).DeskTalk,
    postMessage,
    dispatchMessage,
    streamId,
    token,
  };
}

async function resolveLatestRequest<T>(
  postMessage: ReturnType<typeof vi.fn>,
  dispatchMessage: (data: unknown) => void,
  result: T,
) {
  const [[request]] = postMessage.mock.calls.slice(-1);
  dispatchMessage({
    type: 'desktalk:bridge-response',
    streamId: request.streamId,
    token: request.token,
    requestId: request.requestId,
    ok: true,
    result,
  });
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createHtmlBridgeScript', () => {
  it('produces inline script markup with escaped inline values', () => {
    const script = createHtmlBridgeScript('s-1', '</script><img src=x onerror=1>');

    expect(script.startsWith('<script data-dt-bridge>')).toBe(true);
    expect(script.trim().endsWith('</script>')).toBe(true);
    expect(script).toContain('\\u003c/script>');
  });

  it('evaluates successfully and exposes a frozen DeskTalk API', () => {
    const { DeskTalk } = installBridge();

    expect(DeskTalk).toBeDefined();
    expect(Object.isFrozen(DeskTalk)).toBe(true);
    expect(typeof DeskTalk.getState).toBe('function');
    expect(typeof DeskTalk.exec).toBe('function');
    expect(typeof DeskTalk.execute).toBe('function');
    expect(Object.isFrozen(DeskTalk.storage)).toBe(true);
    expect(typeof DeskTalk.storage.collection).toBe('function');
  });

  it('sends getState requests and resolves matching responses', async () => {
    const { DeskTalk, postMessage, dispatchMessage, streamId, token } = installBridge();

    const pending = DeskTalk.getState('theme.current');

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'desktalk:bridge-request',
        streamId,
        token,
        kind: 'getState',
        payload: { selector: 'theme.current' },
      }),
      '*',
    );

    const [[request]] = postMessage.mock.calls;
    dispatchMessage({
      type: 'desktalk:bridge-response',
      streamId,
      token,
      requestId: request.requestId,
      ok: true,
      result: { mode: 'light' },
    });

    await expect(pending).resolves.toEqual({ mode: 'light' });
  });

  it('normalizes exec arguments for shell commands and explicit argv usage', async () => {
    const { DeskTalk, postMessage, dispatchMessage } = installBridge();

    const shellExec = DeskTalk.exec('ls -la', { cwd: '/tmp/demo' });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'exec',
        payload: {
          program: 'sh',
          args: ['-c', 'ls -la'],
          options: { cwd: '/tmp/demo' },
        },
      }),
      '*',
    );
    await resolveLatestRequest(postMessage, dispatchMessage, { code: 0 });
    await expect(shellExec).resolves.toEqual({ code: 0 });

    const argvExec = DeskTalk.execute('node', ['--version'], { env: { CI: '1' } });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'exec',
        payload: {
          program: 'node',
          args: ['--version'],
          options: { env: { CI: '1' } },
        },
      }),
      '*',
    );
    await resolveLatestRequest(postMessage, dispatchMessage, { stdout: 'v22' });
    await expect(argvExec).resolves.toEqual({ stdout: 'v22' });
  });

  it('maps storage APIs to the documented bridge requests', async () => {
    const { DeskTalk, postMessage, dispatchMessage } = installBridge();

    const getPromise = DeskTalk.storage.get('settings');
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'storage',
        payload: { action: 'kv.get', name: 'settings' },
      }),
      '*',
    );
    await resolveLatestRequest(postMessage, dispatchMessage, { value: { theme: 'light' } });
    await expect(getPromise).resolves.toEqual({ theme: 'light' });

    const setPromise = DeskTalk.storage.set('settings', { theme: 'dark' });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'storage',
        payload: { action: 'kv.set', name: 'settings', value: { theme: 'dark' } },
      }),
      '*',
    );
    await resolveLatestRequest(postMessage, dispatchMessage, {});
    await expect(setPromise).resolves.toBeUndefined();

    const deletePromise = DeskTalk.storage.delete('settings');
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'storage',
        payload: { action: 'kv.delete', name: 'settings' },
      }),
      '*',
    );
    await resolveLatestRequest(postMessage, dispatchMessage, { deleted: true });
    await expect(deletePromise).resolves.toBe(true);

    const listPromise = DeskTalk.storage.list();
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'storage',
        payload: { action: 'kv.list' },
      }),
      '*',
    );
    await resolveLatestRequest(postMessage, dispatchMessage, { names: ['settings', 'tasks'] });
    await expect(listPromise).resolves.toEqual(['settings', 'tasks']);
  });

  it('maps collection helpers to storage bridge requests', async () => {
    const { DeskTalk, postMessage, dispatchMessage } = installBridge();
    const tasks = DeskTalk.storage.collection('tasks');

    const insertPromise = tasks.insert({ id: 'a1', title: 'Buy milk' });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'storage',
        payload: {
          action: 'collection.insert',
          collection: 'tasks',
          params: { id: 'a1', title: 'Buy milk' },
        },
      }),
      '*',
    );
    await resolveLatestRequest(postMessage, dispatchMessage, {});
    await expect(insertPromise).resolves.toBeUndefined();

    const findPromise = tasks.find({ status: 'todo' }, { limit: 10 });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'storage',
        payload: {
          action: 'collection.find',
          collection: 'tasks',
          filter: { status: 'todo' },
          options: { limit: 10 },
        },
      }),
      '*',
    );
    await resolveLatestRequest(postMessage, dispatchMessage, {
      records: [{ id: 'a1', status: 'todo' }],
    });
    await expect(findPromise).resolves.toEqual([{ id: 'a1', status: 'todo' }]);

    const countPromise = tasks.count({ status: 'done' });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'storage',
        payload: {
          action: 'collection.count',
          collection: 'tasks',
          filter: { status: 'done' },
        },
      }),
      '*',
    );
    await resolveLatestRequest(postMessage, dispatchMessage, { count: 3 });
    await expect(countPromise).resolves.toBe(3);
  });
});
