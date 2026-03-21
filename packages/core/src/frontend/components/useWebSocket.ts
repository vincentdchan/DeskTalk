import { useEffect, useRef, useState } from 'react';
import { initMessaging } from '@desktalk/sdk';

const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 15000;

export type WebSocketStatus = 'connecting' | 'connected' | 'reconnecting';

export function useWebSocket(): {
  status: WebSocketStatus;
  socket: WebSocket | null;
  retryInSeconds: number | null;
} {
  const [status, setStatus] = useState<WebSocketStatus>('connecting');
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [retryInSeconds, setRetryInSeconds] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const retryIntervalRef = useRef<number | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY_MS);
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;
    let disposed = false;

    const clearRetryTimers = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (retryIntervalRef.current !== null) {
        window.clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimeoutRef.current !== null) {
        return;
      }

      const delayMs = retryDelayRef.current;
      const retryAt = Date.now() + delayMs;
      setStatus('reconnecting');
      setRetryInSeconds(Math.max(1, Math.ceil(delayMs / 1000)));

      retryIntervalRef.current = window.setInterval(() => {
        const secondsLeft = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
        setRetryInSeconds(secondsLeft);
      }, 1000);

      reconnectTimeoutRef.current = window.setTimeout(() => {
        clearRetryTimers();
        setRetryInSeconds(null);
        connect();
      }, delayMs);

      retryDelayRef.current = Math.min(retryDelayRef.current * 2, MAX_RETRY_DELAY_MS);
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      clearRetryTimers();
      setRetryInSeconds(null);
      setStatus(hasConnectedRef.current ? 'reconnecting' : 'connecting');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setSocket(ws);

      ws.addEventListener('open', () => {
        if (disposed || wsRef.current !== ws) {
          return;
        }

        console.log('[shell] WebSocket connected');
        hasConnectedRef.current = true;
        retryDelayRef.current = INITIAL_RETRY_DELAY_MS;
        initMessaging(ws);
        setStatus('connected');
        setRetryInSeconds(null);
      });

      ws.addEventListener('close', () => {
        const isActiveSocket = wsRef.current === ws;

        if (!isActiveSocket) {
          return;
        }

        wsRef.current = null;
        setSocket(null);

        if (disposed) {
          return;
        }

        console.log('[shell] WebSocket disconnected');
        scheduleReconnect();
      });

      ws.addEventListener('error', (event) => {
        console.error('[shell] WebSocket error:', event);
      });
    };

    connect();

    return () => {
      disposed = true;
      clearRetryTimers();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, []);

  return { status, socket, retryInSeconds };
}
