# LiveApp Request API

This document specifies the network layer for LiveApps — how AI-generated applications make HTTP requests at runtime despite running inside sandboxed iframes.

## Overview

LiveApps run inside sandboxed iframes hosted by the Preview MiniApp. Browser `fetch()` inside that iframe is constrained by normal browser rules: same-origin requests work, but cross-origin requests are limited by CORS and the iframe cannot safely bypass those restrictions on its own.

The request bridge provides a backend-proxied API:

| API                              | Use case                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `DeskTalk.request(url, options)` | Call external HTTP APIs, webhooks, feeds, and JSON endpoints through the Preview backend |

This follows the same bridge pattern as `DeskTalk.exec()` and `DeskTalk.storage.*()`.

## Architecture

```
LiveApp iframe (sandboxed)
  |
  |  window.DeskTalk.request(url, options)
  |
  v
Preview MiniApp frontend (postMessage relay)
  |
  |  preview.bridge.request command
  |
  v
Preview MiniApp backend (Node.js)
  |
  |- Validate URL, method, headers, timeout
  |- Resolve hostname and block private/loopback IPs
  |- Perform fetch()
  |
  v
External HTTP server
```

## API

```js
const response = await DeskTalk.request('https://api.github.com/repos/octocat/Hello-World', {
  method: 'GET',
  headers: {
    accept: 'application/json',
  },
});

if (response.ok) {
  const data = JSON.parse(response.body);
  console.log(data.full_name);
}
```

### Signature

```ts
DeskTalk.request(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    json?: unknown;
    timeoutMs?: number;
  },
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  url: string;
}>;
```

### Options

| Field       | Description                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `method`    | HTTP method. Defaults to `"GET"`.                                                                                                          |
| `headers`   | String-to-string request headers.                                                                                                          |
| `body`      | Raw string request body.                                                                                                                   |
| `json`      | Convenience field. Serialized with `JSON.stringify()` and sent as the body. Sets `content-type: application/json` if not already provided. |
| `timeoutMs` | Request timeout in milliseconds. Defaults to `30000`, capped at `60000`.                                                                   |

Rules:

- Provide either `body` or `json`, not both.
- `GET` and `HEAD` requests cannot include a body.
- Only `http:` and `https:` URLs are supported.
- Redirects are **not followed automatically**. Redirect responses are returned as-is.

### Response

| Field        | Description                                                 |
| ------------ | ----------------------------------------------------------- |
| `ok`         | `true` when the response status is in the 2xx range.        |
| `status`     | Numeric HTTP status code.                                   |
| `statusText` | Response status text.                                       |
| `headers`    | Response headers as a plain object.                         |
| `body`       | Response body decoded as text.                              |
| `truncated`  | `true` if the body exceeded the size limit and was cut off. |
| `url`        | Final response URL returned by the backend fetch layer.     |

The response body is returned as text. LiveApps should parse JSON themselves:

```js
const res = await DeskTalk.request('https://api.example.com/tasks');
const tasks = JSON.parse(res.body);
```

## Bridge Protocol

Request operations use the existing `postMessage` bridge protocol with `kind: 'request'`:

```js
// Request (iframe -> parent)
{
  type: 'desktalk:bridge-request',
  streamId: '...',
  token: '...',
  requestId: 'req-123',
  kind: 'request',
  payload: {
    url: 'https://api.example.com/tasks',
    options: {
      method: 'POST',
      json: { title: 'Buy milk' },
    },
  },
}

// Response (parent -> iframe)
{
  type: 'desktalk:bridge-response',
  streamId: '...',
  token: '...',
  requestId: 'req-123',
  ok: true,
  result: {
    ok: true,
    status: 201,
    statusText: 'Created',
    headers: { 'content-type': 'application/json' },
    body: '{"id":"a1"}',
    truncated: false,
    url: 'https://api.example.com/tasks',
  },
}
```

## Security

The request API is intentionally more restrictive than a normal browser fetch because it runs on the backend and could otherwise be abused for SSRF.

### Destination restrictions

- Requests to `localhost` and `*.localhost` are blocked.
- Requests to private, loopback, and link-local IPs are blocked after DNS resolution.
- Direct IP URLs are also checked against the same policy.

Blocked ranges include:

- IPv4: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`
- IPv6: `::1/128`, `fc00::/7`, `fe80::/10`

### Request validation

- Only `http` and `https` protocols are allowed.
- Embedded credentials in URLs are rejected.
- Header names and values are validated.
- The backend manages sensitive transport headers such as `host` and `content-length`.

### Resource limits

- Default timeout: `30s`
- Maximum timeout: `60s`
- Maximum concurrent requests per LiveApp session: `4`
- Maximum response body size: `5 MB`

If the response exceeds the body limit, the backend stops reading and returns the partial body with `truncated: true`.

## Limitations

- **No streaming responses.** The full response body is returned in one bridge result.
- **No binary response API.** Bodies are decoded as text.
- **No automatic redirects.** Handle 3xx responses explicitly in LiveApp code if needed.
- **No cookie jar.** Requests are stateless unless the LiveApp sends cookie headers itself.

## Example patterns

### JSON POST

```js
const createRes = await DeskTalk.request('https://api.example.com/tasks', {
  method: 'POST',
  json: { title: 'Buy milk', status: 'todo' },
  headers: {
    authorization: `Bearer ${token}`,
  },
});
```

### Form-encoded request

```js
const tokenRes = await DeskTalk.request('https://auth.example.com/token', {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials&scope=tasks:read',
});
```

### Defensive JSON parsing

```js
const res = await DeskTalk.request('https://api.example.com/data');
if (!res.ok) {
  throw new Error(`Request failed: ${res.status} ${res.statusText}`);
}

let data;
try {
  data = JSON.parse(res.body);
} catch {
  throw new Error('API returned invalid JSON.');
}
```
