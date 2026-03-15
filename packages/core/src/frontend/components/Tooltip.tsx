import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.scss';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  delay?: number;
  disabled?: boolean;
}

export function Tooltip({ children, content, delay = 0, disabled = false }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = document.createElement('div');
    el.id = 'dt-tooltip-portal';
    document.body.appendChild(el);
    setContainer(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const left = rect.left + rect.width / 2;
    const top = rect.top - 24;
    setPosition({ left, top });
  }, []);

  const handleMouseEnter = () => {
    if (disabled) return;
    updatePosition();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (delay > 0) {
      timeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, delay);
    } else {
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      setIsVisible(false);
    }
  }, [disabled]);

  const tooltip = isVisible ? (
    <div
      className={styles.tooltip}
      style={{
        left: position.left,
        top: position.top,
      }}
    >
      {content}
    </div>
  ) : null;

  return (
    <div
      ref={triggerRef}
      className={styles.tooltipTrigger}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      {container && createPortal(tooltip, container)}
    </div>
  );
}
