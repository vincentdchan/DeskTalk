import React from 'react';
import { Streamdown } from 'streamdown';
import type { ChatMessage } from '../stores/chat-session';
import { getToolCallSummary, simplifyToolCallMarkdown } from '../utils/tool-call-summary';
import { ThinkingBlock } from './ThinkingBlock';
import { AgentQuestion, type AgentQuestionData } from './info-panel/AgentQuestion';
import styles from './ChatMessageItem.module.scss';

export type { ChatMessage };

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getAgentQuestionPreview(question: AgentQuestionData): string {
  if (question.answer === undefined) {
    return question.question;
  }

  return `${question.question}: ${question.answer}`;
}

function getAskUserToolSummary(question: AgentQuestionData): string {
  return question.question ? `Asked user: ${question.question}` : 'Ask user';
}

function getCompactPreview(message: ChatMessage, isThinking: boolean): string {
  if (message.toolCall) {
    if (message.toolCall.toolName === 'ask_user') {
      const question = message.toolCall.params as unknown as AgentQuestionData;
      return toSingleLine(
        question.answer === undefined
          ? getAskUserToolSummary(question)
          : getAgentQuestionPreview(question),
      );
    }

    return toSingleLine(getToolCallSummary(message.toolCall.toolName, message.toolCall.params));
  }

  if (message.content) {
    return toSingleLine(simplifyToolCallMarkdown(message.content));
  }

  if (message.thinkingContent) {
    return toSingleLine(simplifyToolCallMarkdown(message.thinkingContent));
  }

  return isThinking ? 'Thinking...' : '';
}

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
  compact = false,
}: {
  message: ChatMessage;
  isThinking: boolean;
  isStreaming: boolean;
  compact?: boolean;
}) {
  if (compact) {
    const compactPreview = getCompactPreview(message, isThinking);

    if (!compactPreview) {
      return null;
    }

    return (
      <div
        className={`${message.role === 'user' ? styles.messageUser : styles.messageAssistant} ${styles.messageCompact}`}
      >
        <span className={styles.messageSpeaker}>{message.role === 'user' ? 'ME' : 'AI'}</span>
        <span className={styles.compactMessageText}>{compactPreview}</span>
      </div>
    );
  }

  // Tool call messages render as compact one-liners
  if (message.toolCall) {
    if (message.toolCall.toolName === 'ask_user') {
      const question = message.toolCall.params as unknown as AgentQuestionData;
      if (question.answer !== undefined) {
        return <AgentQuestion question={question} />;
      }

      return (
        <ToolCallMessage toolName={message.toolCall.toolName} params={message.toolCall.params} />
      );
    }

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
