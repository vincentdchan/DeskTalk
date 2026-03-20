import React from 'react';
import { Streamdown } from 'streamdown';
import type { ChatMessage } from '../stores/chat-session';
import { simplifyToolCallMarkdown } from '../utils/tool-call-summary';
import styles from './ChatMessageItem.module.scss';

export type { ChatMessage };

function MarkdownMessage({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  return (
    <Streamdown className={styles.markdownContent} isAnimating={isStreaming} animated>
      {simplifyToolCallMarkdown(content)}
    </Streamdown>
  );
}

export function ChatMessageItem({
  message,
  isThinking,
  isStreaming,
}: {
  message: ChatMessage;
  isThinking: boolean;
  isStreaming: boolean;
}) {
  const isEmptyAssistant = message.role === 'assistant' && !message.content;

  if (isEmptyAssistant && !isThinking) {
    return null;
  }

  return (
    <div className={message.role === 'user' ? styles.messageUser : styles.messageAssistant}>
      <div className={styles.messageHeader}>
        <span className={styles.messageSpeaker}>{message.role === 'user' ? 'ME' : 'AI'}</span>
        {message.role === 'user' && message.source === 'voice' && (
          <span className={styles.voiceSourceBadge}>voice</span>
        )}
      </div>
      {isThinking ? (
        <div className={styles.thinkingIndicator}>
          <span className={styles.thinkingDot} />
          <span className={styles.thinkingDot} />
          <span className={styles.thinkingDot} />
        </div>
      ) : (
        <MarkdownMessage content={message.content} isStreaming={isStreaming} />
      )}
    </div>
  );
}
