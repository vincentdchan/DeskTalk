import { useEffect, useMemo, useRef, useState } from 'react';
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
  const selectorRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const configuredProviders = useMemo(
    () => providerOptions.filter((provider) => provider.configured),
    [providerOptions],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (selectorRef.current?.contains(event.target as Node)) {
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

  return (
    <div className={styles.statusRow}>
      <div ref={selectorRef} className={styles.modelSelector}>
        <button
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
        {isOpen ? (
          <ul className={styles.modelDropdown}>
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
                  {provider.model ? (
                    <span className={styles.modelProvider}>{provider.model}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {queuedCount > 0 ? <span className={styles.statusItem}>{queuedCount} queued</span> : null}
    </div>
  );
}
