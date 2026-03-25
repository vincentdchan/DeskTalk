import { describe, expect, it } from 'vitest';
import { runBridgeRequest, validateBridgeRequestInput } from './bridge-request';

describe('validateBridgeRequestInput', () => {
  it('fills defaults and normalizes json payloads', () => {
    expect(
      validateBridgeRequestInput({
        url: 'https://example.com/tasks',
        options: { method: 'POST', json: { ok: true } },
      }),
    ).toEqual({
      url: new URL('https://example.com/tasks'),
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
      timeoutMs: 30_000,
    });
  });

  it('rejects invalid URLs and methods', () => {
    expect(() => validateBridgeRequestInput({ url: 'file:///tmp/nope' })).toThrow(
      'Only http and https URLs are supported',
    );
    expect(() =>
      validateBridgeRequestInput({
        url: 'https://example.com',
        options: { method: 'PO ST' },
      }),
    ).toThrow('request options.method must contain only letters');
  });

  it('rejects conflicting or invalid bodies', () => {
    expect(() =>
      validateBridgeRequestInput({
        url: 'https://example.com',
        options: { body: 'x', json: { ok: true } },
      }),
    ).toThrow('Provide either request options.body or request options.json');

    expect(() =>
      validateBridgeRequestInput({
        url: 'https://example.com',
        options: { method: 'GET', body: 'x' },
      }),
    ).toThrow('GET requests cannot include a body');
  });

  it('rejects blocked headers', () => {
    expect(() =>
      validateBridgeRequestInput({
        url: 'https://example.com',
        options: { headers: { Host: 'evil.test' } },
      }),
    ).toThrow('managed by DeskTalk');
  });
});

describe('runBridgeRequest', () => {
  it('blocks localhost destinations before making the request', async () => {
    const request = validateBridgeRequestInput({ url: 'http://localhost:3000/test' });

    await expect(runBridgeRequest(request)).rejects.toThrow('localhost');
  });

  it('blocks private IPv4 destinations before making the request', async () => {
    const request = validateBridgeRequestInput({ url: 'http://127.0.0.1:3000/test' });

    await expect(runBridgeRequest(request)).rejects.toThrow('private or loopback');
  });

  it('blocks private IPv6 destinations before making the request', async () => {
    const request = validateBridgeRequestInput({ url: 'http://[::1]:3000/test' });

    await expect(runBridgeRequest(request)).rejects.toThrow('private or loopback');
  });
});
