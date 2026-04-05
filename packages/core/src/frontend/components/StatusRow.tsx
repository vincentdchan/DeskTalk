import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AiProviderOption } from '../stores/chat-session';
import styles from './StatusRow.module.scss';

export interface StatusRowProps {
  modelLabel: string;
  queuedCount: number;
  wsReady: boolean;
  providerOptions: AiProviderOption[];
  selectedProvider: string;
  onSelectProvider?: (providerId: string) => void;
}

export function StatusRow({
  modelLabel,
  queuedCount,
  wsReady,
  providerOptions,
  selectedProvider,
  onSelectProvider,
}: StatusRowProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ bottom: number; right: number } | null>(null);

  const configuredProviders = useMemo(
    () => providerOptions.filter((provider) => provider.configured),
    [providerOptions],
  );

  // Position the portal-rendered dropdown above the trigger button
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setDropdownPos(null);
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({
      bottom: window.innerHeight - rect.top,
      right: window.innerWidth - rect.right,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const dropdown =
    isOpen && dropdownPos
      ? createPortal(
          <ul
            ref={dropdownRef}
            className={styles.modelDropdown}
            style={{ bottom: dropdownPos.bottom, right: dropdownPos.right }}
          >
            {configuredProviders.map((provider) => (
              <li key={provider.id}>
                <button
                  type="button"
                  className={`${styles.modelDropdownItem} ${
                    selectedProvider === provider.id ? styles.modelDropdownItemActive : ''
                  }`}
                  onClick={() => {
                    onSelectProvider?.(provider.id);
                    setIsOpen(false);
                  }}
                >
                  <span className={styles.modelLabel}>{provider.id}</span>
                  {provider.authType === 'subscription' ? (
                    <span className={styles.subscriptionBadge}>sub</span>
                  ) : null}
                  {provider.model ? (
                    <span className={styles.modelProvider}>{provider.model}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className={styles.statusRow}>
      <div className={styles.modelSelector}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.modelTrigger}
          onClick={() => setIsOpen((open) => !open)}
          disabled={!wsReady || configuredProviders.length === 0}
        >
          {wsReady ? modelLabel : 'offline'}
          {wsReady && configuredProviders.length > 0 ? (
            <span className={styles.modelSelectorChevron}>▾</span>
          ) : null}
        </button>
        {dropdown}
      </div>
      {queuedCount > 0 ? <span className={styles.statusItem}>{queuedCount} queued</span> : null}
    </div>
  );
}
