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
  /** How many characters of `html` have been written to the document so far. */
  const writtenLengthRef = useRef(0);
  /** Whether we've called doc.open() for the current streaming session. */
  const docOpenRef = useRef(false);
  /** Tracks whether the previous render was in streaming mode. */
  const wasStreamingRef = useRef(Boolean(streaming));

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

  // ── Append-only streaming write ──────────────────────────────────────────
  //
  // Instead of rewriting the entire document on every chunk, we only write
  // the new portion. This gives the browser true progressive rendering and
  // avoids re-executing scripts or losing DOM state on each update.

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = Boolean(streaming);

    if (!streaming) {
      // ── Static / final render ────────────────────────────────────
      // If we were streaming, preserve the already-written document and only
      // flush any remaining tail before closing. Rewriting would refresh the
      // iframe and discard the injected bridge/runtime state.
      if (wasStreaming && docOpenRef.current) {
        const newContent = html.slice(writtenLengthRef.current);
        if (newContent.length > 0) {
          doc.write(newContent);
          writtenLengthRef.current = html.length;
        }
        doc.close();
        docOpenRef.current = false;
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();
      writtenLengthRef.current = html.length;
      docOpenRef.current = false;
      return;
    }

    // ── Streaming render ───────────────────────────────────────────

    // Open the document once at the start of a streaming session.
    if (!docOpenRef.current) {
      doc.open();
      docOpenRef.current = true;
      writtenLengthRef.current = 0;
    }

    // Write only the newly-appended portion.
    const newContent = html.slice(writtenLengthRef.current);
    if (newContent.length > 0) {
      doc.write(newContent);
      writtenLengthRef.current = html.length;
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
