import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildToMainMessage } from './backend-ipc';

// We test the BackendProcessManager by mocking child_process.fork.
// The mock returns an EventEmitter that simulates a child process.

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
    stdout: EventEmitter | null;
    stderr: EventEmitter | null;
  };
  child.send = vi.fn();
  child.kill = vi.fn();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

// We'll dynamically import the module after mocking
let processManager: Awaited<
  typeof import('./backend-process-manager')
>['processManager'];

let mockChild: ReturnType<typeof createMockChild>;

vi.mock('node:child_process', () => ({
  fork: vi.fn(() => {
    mockChild = createMockChild();
    return mockChild;
  }),
}));

// Mock messaging module so broadcastEvent doesn't need real WebSocket clients
const broadcastEventSpy = vi.fn();
vi.mock('./messaging.js', () => ({
  broadcastEvent: (...args: unknown[]) => broadcastEventSpy(...args),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import to get a fresh singleton (the map inside is stateful)
  // Note: we can't fully reset the singleton across tests without re-importing
  const mod = await import('./backend-process-manager');
  processManager = mod.processManager;
});

describe('BackendProcessManager', () => {
  it('spawn() sends an activate message and waits for ready', async () => {
    const spawnPromise = processManager.spawn(
      'test-app',
      '@desktalk/miniapp-test/backend',
      '/pkg/root',
      { data: '/d', storage: '/s', log: '/l', cache: '/c' },
      'en',
    );

    // Child should have received an activate message
    expect(mockChild.send).toHaveBeenCalledTimes(1);
    const sentMsg = mockChild.send.mock.calls[0][0];
    expect(sentMsg.type).toBe('activate');
    expect(sentMsg.miniAppId).toBe('test-app');

    // Simulate child reporting ready
    mockChild.emit('message', {
      type: 'ready',
      miniAppId: 'test-app',
    } as ChildToMainMessage);

    await spawnPromise;
    expect(processManager.isRunning('test-app')).toBe(true);
  });

  it('sendCommand() routes to the child and resolves with result', async () => {
    // First spawn
    const spawnPromise = processManager.spawn(
      'cmd-app',
      '@desktalk/miniapp-cmd/backend',
      '/pkg',
      { data: '/d', storage: '/s', log: '/l', cache: '/c' },
      'en',
    );
    mockChild.emit('message', {
      type: 'ready',
      miniAppId: 'cmd-app',
    } as ChildToMainMessage);
    await spawnPromise;

    // Now send a command
    const cmdPromise = processManager.sendCommand('cmd-app', 'items.list', { filter: 'all' });

    // The process manager should have sent a command:invoke IPC message
    expect(mockChild.send).toHaveBeenCalledTimes(2); // activate + command
    const cmdMsg = mockChild.send.mock.calls[1][0];
    expect(cmdMsg.type).toBe('command:invoke');
    expect(cmdMsg.command).toBe('items.list');

    // Simulate child response
    mockChild.emit('message', {
      type: 'command:response',
      requestId: cmdMsg.requestId,
      data: [{ id: '1' }, { id: '2' }],
    } as ChildToMainMessage);

    const result = await cmdPromise;
    expect(result).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('sendCommand() rejects when child responds with error', async () => {
    const spawnPromise = processManager.spawn(
      'err-app',
      '@desktalk/miniapp-err/backend',
      '/pkg',
      { data: '/d', storage: '/s', log: '/l', cache: '/c' },
      'en',
    );
    mockChild.emit('message', {
      type: 'ready',
      miniAppId: 'err-app',
    } as ChildToMainMessage);
    await spawnPromise;

    const cmdPromise = processManager.sendCommand('err-app', 'fail.cmd', {});
    const cmdMsg = mockChild.send.mock.calls[1][0];

    mockChild.emit('message', {
      type: 'command:response',
      requestId: cmdMsg.requestId,
      error: 'Something broke',
    } as ChildToMainMessage);

    await expect(cmdPromise).rejects.toThrow('Something broke');
  });

  it('sendCommand() throws when no process is running', async () => {
    await expect(
      processManager.sendCommand('nonexistent', 'cmd', {}),
    ).rejects.toThrow('No running process for miniApp: nonexistent');
  });

  it('relays event broadcasts from child to broadcastEvent', async () => {
    const spawnPromise = processManager.spawn(
      'evt-app',
      '@desktalk/miniapp-evt/backend',
      '/pkg',
      { data: '/d', storage: '/s', log: '/l', cache: '/c' },
      'en',
    );
    mockChild.emit('message', {
      type: 'ready',
      miniAppId: 'evt-app',
    } as ChildToMainMessage);
    await spawnPromise;

    // Simulate child emitting an event
    mockChild.emit('message', {
      type: 'event',
      miniAppId: 'evt-app',
      event: 'item:created',
      data: { id: 'new-1' },
    } as ChildToMainMessage);

    expect(broadcastEventSpy).toHaveBeenCalledWith('evt-app', 'item:created', { id: 'new-1' });
  });

  it('kill() sends deactivate and removes from running set', async () => {
    const spawnPromise = processManager.spawn(
      'kill-app',
      '@desktalk/miniapp-kill/backend',
      '/pkg',
      { data: '/d', storage: '/s', log: '/l', cache: '/c' },
      'en',
    );
    mockChild.emit('message', {
      type: 'ready',
      miniAppId: 'kill-app',
    } as ChildToMainMessage);
    await spawnPromise;

    expect(processManager.isRunning('kill-app')).toBe(true);

    const killPromise = processManager.kill('kill-app');

    // Check that deactivate was sent
    const deactivateMsg = mockChild.send.mock.calls[1][0];
    expect(deactivateMsg.type).toBe('deactivate');

    // Simulate child exiting
    mockChild.emit('exit', 0, null);
    await killPromise;

    expect(processManager.isRunning('kill-app')).toBe(false);
  });

  it('spawn() is idempotent for the same miniAppId', async () => {
    const p1 = processManager.spawn(
      'dup-app',
      '@desktalk/miniapp-dup/backend',
      '/pkg',
      { data: '/d', storage: '/s', log: '/l', cache: '/c' },
      'en',
    );
    mockChild.emit('message', {
      type: 'ready',
      miniAppId: 'dup-app',
    } as ChildToMainMessage);
    await p1;

    // Second spawn should be a no-op (no new child created)
    await processManager.spawn(
      'dup-app',
      '@desktalk/miniapp-dup/backend',
      '/pkg',
      { data: '/d', storage: '/s', log: '/l', cache: '/c' },
      'en',
    );
    // Only one activate message should have been sent
    expect(mockChild.send).toHaveBeenCalledTimes(1);
  });
});
