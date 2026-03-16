import React, { useEffect, useRef, useCallback } from 'react';
import { useCommand, useEvent } from '@desktalk/sdk';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { TerminalOutputEvent, TerminalExitEvent } from '../types';

interface TerminalViewProps {
  tabId: string;
  visible: boolean;
}

export function TerminalView({ tabId, visible }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(false);

  const sendInput = useCommand<{ tabId: string; data: string }, void>('terminal.input');
  const sendResize = useCommand<{ tabId: string; cols: number; rows: number }, void>(
    'terminal.resize',
  );

  // Initialize xterm.js once per mount
  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
      },
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: 14,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);

    // Fit after a brief delay to ensure layout is ready
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    // Forward user input to backend
    term.onData((data) => {
      sendInput({ tabId, data }).catch(console.error);
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      mountedRef.current = false;
    };
    // tabId is stable per component instance
  }, [tabId]);

  // Handle resize when visibility changes or window resizes
  const handleResize = useCallback(() => {
    if (!visible || !fitAddonRef.current || !termRef.current) return;
    try {
      fitAddonRef.current.fit();
      const { cols, rows } = termRef.current;
      sendResize({ tabId, cols, rows }).catch(console.error);
    } catch {
      // fit() can throw if container is not visible yet
    }
  }, [visible, tabId, sendResize]);

  useEffect(() => {
    if (visible) {
      // Small delay for layout to settle
      const timer = setTimeout(handleResize, 50);
      return () => clearTimeout(timer);
    }
  }, [visible, handleResize]);

  // Window resize listener
  useEffect(() => {
    const observer = new ResizeObserver(() => handleResize());
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [handleResize]);

  // Listen for PTY output events
  useEvent<TerminalOutputEvent>('terminal.output', (event) => {
    if (event.tabId === tabId && termRef.current) {
      termRef.current.write(event.data);
    }
  });

  // Listen for PTY exit events
  useEvent<TerminalExitEvent>('terminal.exit', (event) => {
    if (event.tabId === tabId && termRef.current) {
      termRef.current.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
    }
  });

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: visible ? 'block' : 'none',
      }}
    />
  );
}
