import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Config } from '../schema';
import {
  DEFAULT_VOICE_PROVIDER_ID,
  VOICE_PROVIDER_DEFINITIONS,
  getVoiceProviderConfigKeys,
  getVoiceProviderDefinition,
  parseVoiceEnabledProviders,
  serializeVoiceEnabledProviders,
} from '../schema';
import styles from '../styles/PreferenceApp.module.css';

interface DtSelectElement extends HTMLElement {
  options: Array<{ value: string; label: string }>;
  value: string;
  disabled: boolean;
}

interface VoiceProviderListProps {
  config: Config;
  onChange: (key: string, value: string | number | boolean) => Promise<void> | void;
}

export function VoiceProviderList({ config, onChange }: VoiceProviderListProps) {
  const enabledProviders = useMemo(() => {
    const providers = parseVoiceEnabledProviders(config['voice.enabledProviders']);
    const defaultProvider =
      typeof config['voice.defaultProvider'] === 'string' && config['voice.defaultProvider']
        ? String(config['voice.defaultProvider'])
        : DEFAULT_VOICE_PROVIDER_ID;

    if (!providers.includes(defaultProvider)) {
      providers.unshift(defaultProvider);
    }

    return providers;
  }, [config]);

  const updateOrder = useCallback(
    async (providerIds: string[]) => {
      const nextProviders = providerIds.length > 0 ? providerIds : [DEFAULT_VOICE_PROVIDER_ID];
      await onChange('voice.enabledProviders', serializeVoiceEnabledProviders(nextProviders));
      await onChange('voice.defaultProvider', nextProviders[0]);
    },
    [onChange],
  );

  const handleAddProvider = useCallback(async () => {
    const nextProvider = VOICE_PROVIDER_DEFINITIONS.find(
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

      for (const key of getVoiceProviderConfigKeys(providerId)) {
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
            Add STT providers, keep your default at the top, and remove unused items.
          </div>
        </div>
        <div className={styles.providerActionButtonWrap}>
          <ProviderButton
            onPress={handleAddProvider}
            disabled={enabledProviders.length >= VOICE_PROVIDER_DEFINITIONS.length}
            variant="secondary"
          >
            Add provider
          </ProviderButton>
        </div>
      </div>

      <div className={styles.providerList}>
        {enabledProviders.map((providerId, index) => {
          const definition = getVoiceProviderDefinition(providerId);
          if (!definition) {
            return null;
          }

          const availableOptions = VOICE_PROVIDER_DEFINITIONS.filter(
            (provider) => provider.id === providerId || !enabledProviders.includes(provider.id),
          );

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
                    <ProviderSelectField
                      label="Provider"
                      value={providerId}
                      options={availableOptions.map((provider) => ({
                        value: provider.id,
                        label: provider.label,
                      }))}
                      onChange={(nextValue) => handleProviderChange(providerId, nextValue)}
                    />

                    {definition.supportsApiKey && (
                      <ProviderTextField
                        id={`voice-provider-key-${providerId}`}
                        label="API Key"
                        value={String(config[`voice.providers.${providerId}.apiKey`] ?? '')}
                        sensitive
                        onCommit={(value) =>
                          onChange(`voice.providers.${providerId}.apiKey`, value)
                        }
                      />
                    )}

                    {definition.supportsModel && (
                      <ProviderTextField
                        id={`voice-provider-model-${providerId}`}
                        label="Model"
                        value={String(config[`voice.providers.${providerId}.model`] ?? '')}
                        onCommit={(value) => onChange(`voice.providers.${providerId}.model`, value)}
                      />
                    )}

                    {definition.supportsBaseUrl && (
                      <ProviderTextField
                        id={`voice-provider-base-url-${providerId}`}
                        label="Base URL"
                        value={String(config[`voice.providers.${providerId}.baseUrl`] ?? '')}
                        onCommit={(value) =>
                          onChange(`voice.providers.${providerId}.baseUrl`, value)
                        }
                      />
                    )}

                    {definition.supportsAzureDeployment && (
                      <ProviderTextField
                        id={`voice-provider-deployment-${providerId}`}
                        label="Azure Deployment"
                        value={String(
                          config[`voice.providers.${providerId}.azureDeployment`] ?? '',
                        )}
                        onCommit={(value) =>
                          onChange(`voice.providers.${providerId}.azureDeployment`, value)
                        }
                      />
                    )}

                    {definition.supportsAzureApiVersion && (
                      <ProviderTextField
                        id={`voice-provider-api-version-${providerId}`}
                        label="Azure API Version"
                        value={String(
                          config[`voice.providers.${providerId}.azureApiVersion`] ?? '',
                        )}
                        onCommit={(value) =>
                          onChange(`voice.providers.${providerId}.azureApiVersion`, value)
                        }
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

function ProviderButton({
  children,
  disabled = false,
  variant = 'primary',
  size = 'md',
  onPress,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onPress: () => Promise<void> | void;
}) {
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

function ProviderSelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => Promise<void> | void;
}) {
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

    const handleChange = (event: Event) => {
      void onChange((event as CustomEvent<{ value: string }>).detail.value);
    };

    selectElement.addEventListener('dt-change', handleChange);
    return () => selectElement.removeEventListener('dt-change', handleChange);
  }, [onChange, selectElement]);

  return (
    <div className={styles.providerField}>
      <label className={styles.providerFieldLabel}>{label}</label>
      <div className={styles.providerSelectWrap}>
        <dt-select ref={(element: DtSelectElement | null) => setSelectElement(element)} />
      </div>
    </div>
  );
}

function ProviderTextField({
  id,
  label,
  value,
  sensitive = false,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  sensitive?: boolean;
  onCommit: (value: string) => Promise<void> | void;
}) {
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
