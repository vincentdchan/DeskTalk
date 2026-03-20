import React from 'react';
import { Streamdown } from 'streamdown';
import type { ChatMessage } from '../stores/chat-session';
import { getToolCallSummary, simplifyToolCallMarkdown } from '../utils/tool-call-summary';
import styles from './ChatMessageItem.module.scss';

export type { ChatMessage };

function MarkdownMessage({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  return (
    <Streamdown className={styles.markdownContent} isAnimating={isStreaming} animated>
      {simplifyToolCallMarkdown(content)}
    </Streamdown>
  );
}

function ToolCallMessage({
  toolName,
  params,
}: {
  toolName: string;
  params: Record<string, unknown>;
}) {
  const summary = getToolCallSummary(toolName, params);
  return (
    <div className={styles.messageToolCall}>
      <span className={styles.toolCallLabel}>{summary}</span>
    </div>
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
  // Tool call messages render as compact one-liners
  if (message.toolCall) {
    return (
      <ToolCallMessage toolName={message.toolCall.toolName} params={message.toolCall.params} />
    );
  }

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
