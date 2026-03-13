import React, { useState, useCallback } from 'react';
import styles from '../styles/InfoPanel.module.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function InfoPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');

    // TODO: Send to AI backend via WebSocket
    // For now, show a placeholder response
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: 'AI integration not yet configured. Connect a pi agent session to enable AI features.',
      },
    ]);
  }, [input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className={styles.infoPanel}>
      <div className={styles.header}>
        <span>AI Assistant</span>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.placeholder}>
            Ask the AI to interact with your MiniApps
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={msg.role === 'user' ? styles.messageUser : styles.messageAssistant}
            >
              {msg.content}
            </div>
          ))
        )}
      </div>

      <div className={styles.inputArea}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI..."
        />
        <button className={styles.sendButton} onClick={handleSend}>
          Send
        </button>
      </div>

      <div className={styles.statusBar}>
        <span>Model: not configured</span>
        <span>Tokens: 0</span>
      </div>
    </div>
  );
}
