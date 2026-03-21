import React, { useEffect, useState } from 'react';
import { Streamdown } from 'streamdown';
import styles from './ThinkingBlock.module.scss';

export function ThinkingBlock({
  content,
  isStreaming,
  defaultExpanded,
}: {
  content: string;
  isStreaming: boolean;
  defaultExpanded: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  return (
    <div className={styles.thinkingBlock}>
      <button
        type="button"
        className={styles.thinkingToggle}
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <span
          className={`${styles.thinkingChevron} ${isExpanded ? styles.thinkingChevronOpen : ''}`}
        >
          &#9654;
        </span>
        Thinking
        {isStreaming && <span className={styles.thinkingStreamingDot} />}
      </button>
      {isExpanded && (
        <Streamdown className={styles.thinkingContent} isAnimating={isStreaming} animated>
          {content}
        </Streamdown>
      )}
    </div>
  );
}
