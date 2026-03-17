/**
 * Global proxy dispatcher for Node.js fetch().
 *
 * When HTTP_PROXY / HTTPS_PROXY (or their lowercase variants) are set in the
 * environment, this module installs an undici `EnvHttpProxyAgent` as the
 * global dispatcher so that **every** `fetch()` call in the process
 * automatically routes through the configured proxy.
 *
 * `EnvHttpProxyAgent` honours the standard env vars:
 *   HTTP_PROXY / http_proxy
 *   HTTPS_PROXY / https_proxy
 *   NO_PROXY / no_proxy
 *
 * Call `initGlobalProxyDispatcher()` once, early in the process lifecycle
 * (before any outbound HTTP traffic), e.g. in the CLI start command.
 */

import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

let initialized = false;

export function initGlobalProxyDispatcher(): void {
  if (initialized) return;
  initialized = true;

  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;

  if (!proxyUrl) return;

  // EnvHttpProxyAgent reads HTTP(S)_PROXY and NO_PROXY from process.env
  // internally, so we don't need to pass the URL explicitly.
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
