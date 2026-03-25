import { describe, it, expect } from 'vitest';
import type {
  MainToChildMessage,
  ChildToMainMessage,
  ActivateMessage,
  CommandInvokeMessage,
  DeactivateMessage,
  ReadyMessage,
  CommandResponseMessage,
  EventBroadcastMessage,
  ChildErrorMessage,
} from './backend-ipc';

describe('backend-ipc types', () => {
  it('should define an ActivateMessage shape', () => {
    const msg: ActivateMessage = {
      type: 'activate',
      miniAppId: 'note',
      backendPath: '@desktalk/miniapp-note/backend',
      packageRoot: '/path/to/miniapp-note',
      paths: {
        home: '/home/alice',
        data: '/data/note',
        storage: '/storage/note.json',
        log: '/logs/note.log',
        cache: '/cache/note',
      },
      locale: 'en',
    };
    expect(msg.type).toBe('activate');
    expect(msg.miniAppId).toBe('note');
  });

  it('should define a CommandInvokeMessage shape', () => {
    const msg: CommandInvokeMessage = {
      type: 'command:invoke',
      requestId: 'req-1',
      command: 'notes.list',
      data: { tag: 'work' },
    };
    expect(msg.type).toBe('command:invoke');
    expect(msg.command).toBe('notes.list');
  });

  it('should define a DeactivateMessage shape', () => {
    const msg: DeactivateMessage = { type: 'deactivate' };
    expect(msg.type).toBe('deactivate');
  });

  it('should define a ReadyMessage shape', () => {
    const msg: ReadyMessage = { type: 'ready', miniAppId: 'note' };
    expect(msg.type).toBe('ready');
  });

  it('should define a CommandResponseMessage with data', () => {
    const msg: CommandResponseMessage = {
      type: 'command:response',
      requestId: 'req-1',
      data: [{ id: 'n1', title: 'Test' }],
    };
    expect(msg.error).toBeUndefined();
    expect(msg.data).toBeDefined();
  });

  it('should define a CommandResponseMessage with error', () => {
    const msg: CommandResponseMessage = {
      type: 'command:response',
      requestId: 'req-1',
      error: 'Not found',
    };
    expect(msg.error).toBe('Not found');
  });

  it('should define an EventBroadcastMessage shape', () => {
    const msg: EventBroadcastMessage = {
      type: 'event',
      miniAppId: 'note',
      event: 'note:updated',
      data: { id: 'n1' },
    };
    expect(msg.type).toBe('event');
    expect(msg.event).toBe('note:updated');
  });

  it('should define a ChildErrorMessage shape', () => {
    const msg: ChildErrorMessage = {
      type: 'error',
      message: 'Something went wrong',
    };
    expect(msg.type).toBe('error');
  });

  it('MainToChildMessage union covers activate, command:invoke, and deactivate', () => {
    const messages: MainToChildMessage[] = [
      {
        type: 'activate',
        miniAppId: 'note',
        backendPath: '@desktalk/miniapp-note/backend',
        packageRoot: '/path',
        paths: { home: '', data: '', storage: '', log: '', cache: '' },
        locale: 'en',
      },
      { type: 'command:invoke', requestId: 'r1', command: 'notes.list', data: null },
      { type: 'deactivate' },
    ];
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.type)).toEqual(['activate', 'command:invoke', 'deactivate']);
  });

  it('ChildToMainMessage union covers ready, command:response, event, and error', () => {
    const messages: ChildToMainMessage[] = [
      { type: 'ready', miniAppId: 'note' },
      { type: 'command:response', requestId: 'r1', data: [] },
      { type: 'event', miniAppId: 'note', event: 'test', data: {} },
      { type: 'error', message: 'oops' },
    ];
    expect(messages).toHaveLength(4);
    expect(messages.map((m) => m.type)).toEqual(['ready', 'command:response', 'event', 'error']);
  });
});
