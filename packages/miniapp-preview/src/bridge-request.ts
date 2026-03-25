import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { TextDecoder } from 'node:util';
import type { PreviewBridgeRequestResult } from './types';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_HEADERS = 32;
const MAX_HEADER_NAME_LENGTH = 128;
const MAX_HEADER_VALUE_LENGTH = 4_096;
const BLOCKED_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'transfer-encoding',
]);
const VALID_HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const VALID_METHOD = /^[A-Za-z]+$/;

export interface ValidatedBridgeRequest {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

function assertText(value: string, label: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return value;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost' || normalized.endsWith('.localhost');
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function expandIpv6(address: string): number[] | null {
  let normalized = address.toLowerCase();
  const zoneIndex = normalized.indexOf('%');
  if (zoneIndex >= 0) {
    normalized = normalized.slice(0, zoneIndex);
  }

  if (normalized === '::') {
    return new Array(8).fill(0);
  }

  const hasCompression = normalized.includes('::');
  const [left, right = ''] = normalized.split('::');
  const leftParts = left ? left.split(':').filter(Boolean) : [];
  const rightParts = right ? right.split(':').filter(Boolean) : [];

  const expandedParts = [...leftParts];
  if (hasCompression) {
    const missing = 8 - (leftParts.length + rightParts.length);
    if (missing < 0) {
      return null;
    }
    for (let index = 0; index < missing; index += 1) {
      expandedParts.push('0');
    }
  }
  expandedParts.push(...rightParts);

  if (expandedParts.length !== 8) {
    return null;
  }

  return expandedParts.map((part) => Number.parseInt(part || '0', 16));
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1') {
    return true;
  }

  const parts = expandIpv6(normalized);
  if (!parts) {
    return false;
  }

  const first = parts[0];
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address);
  }
  return false;
}

function normalizeHostname(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

async function assertPublicDestination(url: URL): Promise<void> {
  const hostname = normalizeHostname(url.hostname);

  if (isLocalHostname(hostname)) {
    throw new Error('Requests to localhost are blocked by the LiveApp network policy.');
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedAddress(hostname)) {
      throw new Error('Requests to private or loopback IP addresses are blocked.');
    }
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error('Could not resolve the request hostname.');
  }

  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new Error('Requests to private or loopback IP addresses are blocked.');
    }
  }
}

function normalizeHeaders(input: Record<string, string> | undefined): Record<string, string> {
  if (!input) {
    return {};
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('request options.headers must be an object of string values.');
  }

  const entries = Object.entries(input);
  if (entries.length > MAX_HEADERS) {
    throw new Error(`Too many request headers; maximum is ${MAX_HEADERS}.`);
  }

  const normalized: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (typeof value !== 'string') {
      throw new Error(`Request header ${name} must be a string.`);
    }
    if (!name || name.length > MAX_HEADER_NAME_LENGTH || !VALID_HEADER_NAME.test(name)) {
      throw new Error(`Request header ${name} is invalid.`);
    }
    if (value.length > MAX_HEADER_VALUE_LENGTH) {
      throw new Error(`Request header ${name} is too long.`);
    }

    const lowerName = name.toLowerCase();
    if (BLOCKED_REQUEST_HEADERS.has(lowerName)) {
      throw new Error(`Request header ${name} is managed by DeskTalk and cannot be overridden.`);
    }
    normalized[lowerName] = value;
  }

  return normalized;
}

export function validateBridgeRequestInput(input: {
  url: string;
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    json?: unknown;
    timeoutMs?: number;
  };
}): ValidatedBridgeRequest {
  const rawUrl = assertText(input.url, 'url');
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }
  if (url.username || url.password) {
    throw new Error('Embedded URL credentials are not supported.');
  }

  const options = input.options ?? {};
  const method = (options.method ?? 'GET').trim().toUpperCase();
  if (!VALID_METHOD.test(method)) {
    throw new Error('request options.method must contain only letters.');
  }

  const headers = normalizeHeaders(options.headers);
  let body: string | undefined;
  if (options.body !== undefined && options.json !== undefined) {
    throw new Error('Provide either request options.body or request options.json, not both.');
  }

  if (options.body !== undefined) {
    if (typeof options.body !== 'string') {
      throw new Error('request options.body must be a string.');
    }
    body = options.body;
  }

  if (options.json !== undefined) {
    body = JSON.stringify(options.json);
    if (!('content-type' in headers)) {
      headers['content-type'] = 'application/json';
    }
  }

  if ((method === 'GET' || method === 'HEAD') && body !== undefined) {
    throw new Error(`${method} requests cannot include a body.`);
  }

  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(
      1_000,
      typeof options.timeoutMs === 'number' ? Math.floor(options.timeoutMs) : DEFAULT_TIMEOUT_MS,
    ),
  );

  return { url, method, headers, body, timeoutMs };
}

async function readResponseBody(response: Response): Promise<{ body: string; truncated: boolean }> {
  if (!response.body) {
    return { body: '', truncated: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let totalBytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      const allowedBytes = value.byteLength - (totalBytes - MAX_RESPONSE_BYTES);
      if (allowedBytes > 0) {
        body += decoder.decode(value.subarray(0, allowedBytes), { stream: true });
      }
      truncated = true;
      await reader.cancel();
      break;
    }

    body += decoder.decode(value, { stream: true });
  }

  body += decoder.decode();
  return { body, truncated };
}

export async function runBridgeRequest(
  request: ValidatedBridgeRequest,
): Promise<PreviewBridgeRequestResult> {
  await assertPublicDestination(request.url);

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), request.timeoutMs);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
      signal: abortController.signal,
    });
    const responseBody = await readResponseBody(response);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody.body,
      truncated: responseBody.truncated,
      url: response.url || request.url.toString(),
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('DeskTalk request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
