import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Config } from '../schema';
import {
  AI_PROVIDER_DEFINITIONS,
  DEFAULT_AI_PROVIDER_ID,
  getAiProviderConfigKeys,
  getAiProviderDefinition,
  parseAiEnabledProviders,
  serializeAiEnabledProviders,
} from '../schema';
import styles from '../styles/PreferenceApp.module.css';

interface AiProviderListProps {
  config: Config;
  onChange: (key: string, value: string | number | boolean) => Promise<void> | void;
}

interface AiProviderOption {
  id: string;
  models: string[];
}

export function AiProviderList({ config, onChange }: AiProviderListProps) {
  const [providerOptions, setProviderOptions] = useState<AiProviderOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/ai/providers', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data: { providers?: AiProviderOption[] }) => {
        if (!cancelled) {
          setProviderOptions(data.providers ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviderOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const providerOptionsById = useMemo(
    () => new Map(providerOptions.map((provider) => [provider.id, provider])),
    [providerOptions],
  );

  const enabledProviders = useMemo(() => {
    const providers = parseAiEnabledProviders(config['ai.enabledProviders']);
    const defaultProvider =
      typeof config['ai.defaultProvider'] === 'string' && config['ai.defaultProvider']
        ? String(config['ai.defaultProvider'])
        : DEFAULT_AI_PROVIDER_ID;

    if (!providers.includes(defaultProvider)) {
      providers.unshift(defaultProvider);
    }

    return providers;
  }, [config]);

  const updateOrder = useCallback(
    async (providerIds: string[]) => {
      const nextProviders = providerIds.length > 0 ? providerIds : [DEFAULT_AI_PROVIDER_ID];
      await onChange('ai.enabledProviders', serializeAiEnabledProviders(nextProviders));
      await onChange('ai.defaultProvider', nextProviders[0]);
    },
    [onChange],
  );

  const handleAddProvider = useCallback(async () => {
    const nextProvider = AI_PROVIDER_DEFINITIONS.find(
      (provider) => !enabledProviders.includes(provider.id),
    );
    if (!nextProvider) {
      return;
    }

    await updateOrder([...enabledProviders, nextProvider.id]);
  }, [enabledProviders, updateOrder]);

  const handleProviderChange = useCallback(
    async (providerId: string, nextProviderId: string) => {
      if (providerId === nextProviderId || enabledProviders.includes(nextProviderId)) {
        return;
      }

      const nextProviders = enabledProviders.map((currentProviderId) =>
        currentProviderId === providerId ? nextProviderId : currentProviderId,
      );
      await updateOrder(nextProviders);
    },
    [enabledProviders, updateOrder],
  );

  const handleDeleteProvider = useCallback(
    async (providerId: string) => {
      if (enabledProviders.length === 1) {
        return;
      }

      const nextProviders = enabledProviders.filter(
        (currentProviderId) => currentProviderId !== providerId,
      );
      await updateOrder(nextProviders);

      for (const key of getAiProviderConfigKeys(providerId)) {
        await onChange(key, '');
      }
    },
    [enabledProviders, onChange, updateOrder],
  );

  const handleSetDefault = useCallback(
    async (providerId: string) => {
      if (enabledProviders[0] === providerId) {
        return;
      }

      const nextProviders = [
        providerId,
        ...enabledProviders.filter((currentProviderId) => currentProviderId !== providerId),
      ];
      await updateOrder(nextProviders);
    },
    [enabledProviders, updateOrder],
  );

  return (
    <div className={styles.providerGroup}>
      <div className={styles.providerGroupHeader}>
        <div>
          <div className={styles.rowLabel}>Providers</div>
          <div className={styles.rowDescription}>
            Add providers, keep your default at the top, and remove anything you no longer use.
          </div>
        </div>
        <div className={styles.providerActionButtonWrap}>
          <ProviderButton
            onPress={handleAddProvider}
            disabled={enabledProviders.length >= AI_PROVIDER_DEFINITIONS.length}
            variant="secondary"
          >
            Add provider
          </ProviderButton>
        </div>
      </div>

      <div className={styles.providerList}>
        {enabledProviders.map((providerId, index) => {
          const definition = getAiProviderDefinition(providerId);
          const providerOption = providerOptionsById.get(providerId);
          if (!definition) {
            return null;
          }

          const availableOptions = AI_PROVIDER_DEFINITIONS.filter(
            (provider) => provider.id === providerId || !enabledProviders.includes(provider.id),
          );

          const configuredModel = String(config[`ai.providers.${providerId}.model`] ?? '');
          const modelOptions = [
            { value: '', label: 'Select model' },
            ...(providerOption?.models ?? []).map((model) => ({ value: model, label: model })),
          ];
          if (configuredModel && !modelOptions.some((option) => option.value === configuredModel)) {
            modelOptions.push({ value: configuredModel, label: `${configuredModel} (custom)` });
          }

          return (
            <div key={providerId} className={styles.providerCard}>
              <dt-card variant="outlined">
                <div className={styles.providerCardBody}>
                  <div className={styles.providerCardHeader}>
                    <div className={styles.providerCardTitleRow}>
                      <div className={styles.providerCardTitle}>{definition.label}</div>
                      {index === 0 && <span className={styles.providerDefaultBadge}>Default</span>}
                    </div>
                    <div className={styles.providerCardActions}>
                      <div className={styles.providerButtonWrap}>
                        <ProviderButton
                          onPress={() => handleSetDefault(providerId)}
                          disabled={index === 0}
                          variant="secondary"
                          size="sm"
                        >
                          Set as default
                        </ProviderButton>
                      </div>
                      <div className={styles.providerButtonWrap}>
                        <ProviderButton
                          onPress={() => handleDeleteProvider(providerId)}
                          disabled={enabledProviders.length === 1}
                          variant="danger"
                          size="sm"
                        >
                          Delete
                        </ProviderButton>
                      </div>
                    </div>
                  </div>

                  <div className={styles.providerFieldGrid}>
                    <div className={styles.providerField}>
                      <label
                        className={styles.providerFieldLabel}
                        htmlFor={`ai-provider-${providerId}`}
                      >
                        Provider
                      </label>
                      <ProviderSelect
                        value={providerId}
                        options={availableOptions.map((provider) => ({
                          value: provider.id,
                          label: provider.label,
                        }))}
                        onChange={(nextValue) => handleProviderChange(providerId, nextValue)}
                      />
                    </div>

                    {definition.authType === 'subscription' ? (
                      <SubscriptionAuth providerId={providerId} />
                    ) : (
                      definition.supportsApiKey && (
                        <ProviderTextField
                          id={`ai-provider-key-${providerId}`}
                          label="API Key"
                          value={String(config[`ai.providers.${providerId}.apiKey`] ?? '')}
                          sensitive
                          onCommit={(value) => onChange(`ai.providers.${providerId}.apiKey`, value)}
                        />
                      )
                    )}

                    {(providerOption?.models?.length ?? 0) > 0 ? (
                      <div className={styles.providerField}>
                        <label
                          className={styles.providerFieldLabel}
                          htmlFor={`ai-provider-model-${providerId}`}
                        >
                          Model
                        </label>
                        <ProviderSelect
                          value={configuredModel}
                          options={modelOptions}
                          onChange={(value) => onChange(`ai.providers.${providerId}.model`, value)}
                        />
                      </div>
                    ) : (
                      <ProviderTextField
                        id={`ai-provider-model-${providerId}`}
                        label="Model"
                        value={configuredModel}
                        onCommit={(value) => onChange(`ai.providers.${providerId}.model`, value)}
                      />
                    )}

                    {definition.supportsBaseUrl && (
                      <ProviderTextField
                        id={`ai-provider-base-url-${providerId}`}
                        label="Base URL"
                        value={String(config[`ai.providers.${providerId}.baseUrl`] ?? '')}
                        onCommit={(value) => onChange(`ai.providers.${providerId}.baseUrl`, value)}
                      />
                    )}
                  </div>
                </div>
              </dt-card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Subscription provider auth UI ──────────────────────────────────────

type SubscriptionState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'authenticated' }
  | { phase: 'pending'; url: string; instructions?: string; progress?: string }
  | { phase: 'error'; message: string };

function SubscriptionAuth({ providerId }: { providerId: string }) {
  const [state, setState] = useState<SubscriptionState>({ phase: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  // Check initial auth status on mount
  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'checking' });

    fetch(`/api/ai/providers/${providerId}/auth-status`, { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data: { authenticated: boolean }) => {
        if (!cancelled) {
          setState(data.authenticated ? { phase: 'authenticated' } : { phase: 'idle' });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ phase: 'idle' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const handleLogin = useCallback(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ phase: 'pending', url: '', instructions: undefined });

    fetch(`/api/ai/providers/${providerId}/login`, {
      method: 'POST',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (res) => {
        const reader = res.body?.getReader();
        if (!reader) {
          setState({ phase: 'error', message: 'No response stream' });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ') && eventType) {
              try {
                const data = JSON.parse(line.slice(6)) as Record<string, unknown>;

                if (eventType === 'auth') {
                  setState((prev) => ({
                    phase: 'pending',
                    url: String(data.url ?? ''),
                    instructions: data.instructions ? String(data.instructions) : undefined,
                    progress: prev.phase === 'pending' ? prev.progress : undefined,
                  }));
                } else if (eventType === 'progress') {
                  setState((prev) =>
                    prev.phase === 'pending'
                      ? { ...prev, progress: String(data.message ?? '') }
                      : prev,
                  );
                } else if (eventType === 'done') {
                  setState({ phase: 'authenticated' });
                } else if (eventType === 'error') {
                  setState({ phase: 'error', message: String(data.message ?? 'Login failed') });
                }
              } catch {
                // ignore malformed JSON
              }
              eventType = '';
            }
          }
        }
      })
      .catch((err: unknown) => {
        if ((err as DOMException)?.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ phase: 'error', message });
      });
  }, [providerId]);

  const handleLogout = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    fetch(`/api/ai/providers/${providerId}/logout`, {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then(() => setState({ phase: 'idle' }))
      .catch(() => setState({ phase: 'idle' }));
  }, [providerId]);

  const handleCopyAndOpen = useCallback((url: string, code?: string) => {
    if (code) {
      void navigator.clipboard.writeText(code);
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  if (state.phase === 'checking') {
    return (
      <div className={styles.subscriptionAuth}>
        <div className={styles.subscriptionAuthStatus}>Checking...</div>
      </div>
    );
  }

  if (state.phase === 'authenticated') {
    return (
      <div className={styles.subscriptionAuthConnected}>
        <div className={styles.subscriptionAuthStatus}>
          <span className={styles.subscriptionAuthStatusConnected}>Connected</span>
        </div>
        <ProviderButton onPress={handleLogout} variant="danger" size="sm">
          Logout
        </ProviderButton>
      </div>
    );
  }

  if (state.phase === 'pending') {
    return (
      <div className={styles.subscriptionAuthPending}>
        <div className={styles.subscriptionAuthStatus}>
          {state.instructions && (
            <div>
              Code: <span className={styles.subscriptionAuthCode}>{state.instructions}</span>
            </div>
          )}
          {state.progress && (
            <div className={styles.subscriptionAuthProgress}>{state.progress}</div>
          )}
          {!state.progress && !state.instructions && (
            <div className={styles.subscriptionAuthProgress}>Starting login...</div>
          )}
        </div>
        <div className={styles.providerCardActions}>
          {state.url && (
            <ProviderButton
              onPress={() => handleCopyAndOpen(state.url, state.instructions)}
              variant="primary"
              size="sm"
            >
              Copy Code &amp; Open
            </ProviderButton>
          )}
          <ProviderButton onPress={handleLogout} variant="secondary" size="sm">
            Cancel
          </ProviderButton>
        </div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className={styles.subscriptionAuth}>
        <div className={styles.subscriptionAuthStatus}>Error: {state.message}</div>
        <ProviderButton onPress={handleLogin} variant="primary" size="sm">
          Retry
        </ProviderButton>
      </div>
    );
  }

  // idle
  return (
    <div className={styles.subscriptionAuth}>
      <div className={styles.subscriptionAuthStatus}>Not connected</div>
      <ProviderButton onPress={handleLogin} variant="primary" size="sm">
        Login
      </ProviderButton>
    </div>
  );
}

interface ProviderButtonProps {
  children: React.ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onPress: () => Promise<void> | void;
}

interface DtSelectElement extends HTMLElement {
  options: Array<{ value: string; label: string }>;
  value: string;
  disabled: boolean;
}

function ProviderButton({
  children,
  disabled = false,
  variant = 'primary',
  size = 'md',
  onPress,
}: ProviderButtonProps) {
  const [buttonElement, setButtonElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!buttonElement) {
      return;
    }

    const handleClick = () => {
      void onPress();
    };

    buttonElement.addEventListener('click', handleClick);
    return () => buttonElement.removeEventListener('click', handleClick);
  }, [buttonElement, onPress]);

  return (
    <dt-button
      ref={(element: HTMLElement | null) => setButtonElement(element)}
      disabled={disabled}
      variant={variant}
      size={size}
    >
      {children}
    </dt-button>
  );
}

interface ProviderSelectProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => Promise<void> | void;
}

function ProviderSelect({ value, options, disabled = false, onChange }: ProviderSelectProps) {
  const [selectElement, setSelectElement] = useState<DtSelectElement | null>(null);

  useEffect(() => {
    if (!selectElement) {
      return;
    }

    selectElement.options = options;
  }, [options, selectElement]);

  useEffect(() => {
    if (!selectElement) {
      return;
    }

    selectElement.value = value;
  }, [selectElement, value]);

  useEffect(() => {
    if (!selectElement) {
      return;
    }

    selectElement.disabled = disabled;
  }, [disabled, selectElement]);

  useEffect(() => {
    if (!selectElement) {
      return;
    }

    const handleChange = (event: Event) => {
      void onChange((event as CustomEvent<{ value: string }>).detail.value);
    };

    selectElement.addEventListener('dt-change', handleChange);
    return () => selectElement.removeEventListener('dt-change', handleChange);
  }, [onChange, selectElement]);

  return (
    <div className={styles.providerSelectWrap}>
      <dt-select ref={(element: DtSelectElement | null) => setSelectElement(element)} />
    </div>
  );
}

interface ProviderTextFieldProps {
  id: string;
  label: string;
  value: string;
  sensitive?: boolean;
  onCommit: (value: string) => Promise<void> | void;
}

function ProviderTextField({
  id,
  label,
  value,
  sensitive = false,
  onCommit,
}: ProviderTextFieldProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const commit = useCallback(() => {
    if (localValue !== value) {
      void onCommit(localValue);
    }
  }, [localValue, onCommit, value]);

  return (
    <div className={styles.providerField}>
      <label className={styles.providerFieldLabel} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={sensitive ? 'password' : 'text'}
        className={sensitive ? styles.textInputSensitive : styles.textInput}
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
      />
    </div>
  );
}
