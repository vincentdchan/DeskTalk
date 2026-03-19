import React, { useRef, useEffect } from 'react';
import styles from '../PreviewApp.module.css';
import type { PreviewBridgeRequestMessage, PreviewBridgeResponseMessage } from '../types';

interface HtmlViewportProps {
  /** The full HTML string to render (static or accumulated streaming content). */
  html: string;
  /** Whether the content is still streaming. */
  streaming?: boolean;
  /** Receive bridge requests from generated HTML. */
  onBridgeRequest?: (
    request: PreviewBridgeRequestMessage,
    respond: (response: PreviewBridgeResponseMessage) => void,
  ) => void;
}

export function HtmlViewport({ html, streaming, onBridgeRequest }: HtmlViewportProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!onBridgeRequest) return;

    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) {
        return;
      }

      const data = event.data as PreviewBridgeRequestMessage | undefined;
      if (!data || data.type !== 'desktalk:bridge-request') {
        return;
      }

      onBridgeRequest(data, (response) => {
        iframe.contentWindow?.postMessage(response, '*');
      });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onBridgeRequest]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Write HTML content into the iframe via srcdoc-like approach.
    // Using document.write for streaming so partial HTML renders progressively.
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(html);
    if (!streaming) {
      doc.close();
    }
  }, [html, streaming]);

  return (
    <iframe
      ref={iframeRef}
      className={styles.htmlViewport}
      sandbox="allow-scripts allow-same-origin"
      title="HTML Preview"
    />
  );
}
