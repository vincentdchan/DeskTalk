import React from 'react';
import { Streamdown } from 'streamdown';
import type { ChatMessage } from '../stores/chat-session';
import { getToolCallSummary, simplifyToolCallMarkdown } from '../utils/tool-call-summary';
import { ThinkingBlock } from './ThinkingBlock';
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

  const hasThinking = Boolean(message.thinkingContent);
  const hasContent = Boolean(message.content);
  const isEmptyAssistant = message.role === 'assistant' && !hasContent && !hasThinking;

  if (isEmptyAssistant && !isThinking) {
    return null;
  }

  // Determine if thinking is still actively streaming:
  // thinking is streaming when the AI is running, there's thinking content, but no text content yet
  const isStreamingThinking = isStreaming && hasThinking && !hasContent;

  // Show bouncing dots only when there's no content at all (no thinking, no text)
  const showBouncingDots = isThinking && !hasThinking && !hasContent;

  return (
    <div className={message.role === 'user' ? styles.messageUser : styles.messageAssistant}>
      <div className={styles.messageHeader}>
        <span className={styles.messageSpeaker}>{message.role === 'user' ? 'ME' : 'AI'}</span>
        {message.role === 'user' && message.source === 'voice' && (
          <span className={styles.voiceSourceBadge}>voice</span>
        )}
      </div>
      {hasThinking && (
        <ThinkingBlock
          content={message.thinkingContent!}
          isStreaming={isStreamingThinking}
          defaultExpanded={isStreamingThinking}
        />
      )}
      {showBouncingDots ? (
        <div className={styles.thinkingIndicator}>
          <span className={styles.thinkingDot} />
          <span className={styles.thinkingDot} />
          <span className={styles.thinkingDot} />
        </div>
      ) : hasContent ? (
        <MarkdownMessage content={message.content} isStreaming={isStreaming} />
      ) : null}
    </div>
  );
}
