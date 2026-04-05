import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { httpClient } from '../http-client';
import { DEFAULT_THEME_PREFERENCES } from '../theme';
import styles from './OnboardPage.module.scss';
import { useOnboarding, ONBOARD_STEPS, type OnboardStep } from '../stores/onboarding';
import { Modal } from './Modal';

export interface OnboardPageProps {
  onComplete: () => void;
  locale: string;
  accentColor: string;
  onLanguageChange: (locale: string) => Promise<void>;
  onAccentColorChange: (accentColor: string) => void;
}

interface AiProviderOption {
  id: string;
  models: string[];
}

const DEFAULT_LANGUAGE = 'en';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '简体中文' },
];

/** AI providers shown during onboarding. */
const AI_PROVIDERS = [
  // Subscription (OAuth) providers
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    authType: 'subscription' as const,
    supportsBaseUrl: false,
  },
  {
    id: 'openai-codex',
    label: 'OpenAI Codex',
    authType: 'subscription' as const,
    supportsBaseUrl: false,
  },
  {
    id: 'claude-pro',
    label: 'Claude Pro/Max',
    authType: 'subscription' as const,
    supportsBaseUrl: false,
  },
  {
    id: 'gemini-cli',
    label: 'Google Gemini CLI',
    authType: 'subscription' as const,
    supportsBaseUrl: false,
  },
  {
    id: 'google-antigravity',
    label: 'Google Antigravity',
    authType: 'subscription' as const,
    supportsBaseUrl: false,
  },
  // API-key providers
  {
    id: 'openai',
    label: 'OpenAI',
    authType: 'api-key' as const,
    supportsBaseUrl: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    authType: 'api-key' as const,
    supportsBaseUrl: false,
  },
  {
    id: 'google',
    label: 'Google Gemini',
    authType: 'api-key' as const,
    supportsBaseUrl: false,
  },
  {
    id: 'azure-openai-responses',
    label: 'Azure OpenAI',
    authType: 'api-key' as const,
    supportsBaseUrl: true,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    authType: 'api-key' as const,
    supportsBaseUrl: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    authType: 'api-key' as const,
    supportsBaseUrl: true,
  },
  {
    id: 'xai',
    label: 'xAI',
    authType: 'api-key' as const,
    supportsBaseUrl: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    authType: 'api-key' as const,
    supportsBaseUrl: true,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    authType: 'api-key' as const,
    supportsBaseUrl: true,
  },
] as const;

/** STT providers shown during onboarding. */
const STT_PROVIDERS = [
  {
    id: 'openai-whisper',
    label: 'OpenAI Whisper',
    supportsModel: true,
    supportsBaseUrl: true,
    supportsAzureDeployment: false,
    supportsAzureApiVersion: false,
  },
  {
    id: 'azure-openai-whisper',
    label: 'Azure OpenAI Whisper',
    supportsModel: false,
    supportsBaseUrl: true,
    supportsAzureDeployment: true,
    supportsAzureApiVersion: true,
  },
] as const;

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

export function OnboardPage({
  onComplete,
  locale,
  accentColor,
  onLanguageChange,
  onAccentColorChange,
}: OnboardPageProps) {
  const store = useOnboarding();
  const [providerOptions, setProviderOptions] = useState<AiProviderOption[]>([]);
  const backLabel = $localize`onboard.common.back:Back`;
  const nextLabel = $localize`onboard.common.next:Next`;
  const skipLabel = $localize`onboard.common.skip:Skip`;
  const defaultBadgeLabel = $localize`onboard.common.default:Default`;
  const setDefaultLabel = $localize`onboard.common.setDefault:Set as default`;
  const deleteLabel = $localize`onboard.common.delete:Delete`;
  const providerLabel = $localize`onboard.common.provider:Provider`;
  const apiKeyLabel = $localize`onboard.common.apiKey:API Key`;
  const addProviderLabel = $localize`onboard.common.addProvider:Add provider`;
  const modelOptionalLabel = $localize`onboard.common.modelOptional:Model (optional)`;
  const baseUrlOptionalLabel = $localize`onboard.common.baseUrlOptional:Base URL (optional)`;

  useEffect(() => {
    let cancelled = false;

    void httpClient
      .get<{ providers: AiProviderOption[] }>('/api/ai/providers')
      .then(({ data }) => {
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

  useEffect(() => {
    if (store.language === DEFAULT_LANGUAGE && locale !== store.language) {
      store.setLanguage(locale);
    }
  }, [locale, store]);

  useEffect(() => {
    if (
      store.accentColor === DEFAULT_THEME_PREFERENCES.accentColor &&
      accentColor !== store.accentColor
    ) {
      store.setAccentColor(accentColor);
    }
  }, [accentColor, store]);

  function renderStepDots() {
    return (
      <div className={styles.stepIndicator}>
        {ONBOARD_STEPS.map((s, i) => {
          let className = styles.dot;
          if (i === store.stepIndex) className = styles.dotActive;
          else if (i < store.stepIndex) className = styles.dotCompleted;
          return <div key={s} className={className} />;
        })}
      </div>
    );
  }

  function renderWelcome() {
    const pickerValue = isHexColor(store.accentColor)
      ? store.accentColor
      : DEFAULT_THEME_PREFERENCES.accentColor;

    return (
      <>
        <div className={styles.header}>
          <h1 className={styles.title}>{$localize`onboard.welcome.title:Welcome to DeskTalk`}</h1>
          <p className={styles.subtitle}>
            {$localize`onboard.welcome.subtitle:Choose your language and accent before creating your admin account`}
          </p>
        </div>
        <div className={styles.body}>
          <p className={styles.welcomeText}>
            {$localize`onboard.welcome.body:DeskTalk is a browser-based desktop environment with an AI assistant and modular MiniApps. Since this is the first time running DeskTalk, you'll need to create an administrator account.`}
          </p>
          <div className={styles.welcomeOptions}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="onboard-language">
                {$localize`onboard.welcome.languageLabel:Language`}
              </label>
              <OnboardSelect
                id="onboard-language"
                value={store.language}
                options={LANGUAGE_OPTIONS}
                onChange={async (nextValue) => {
                  store.setLanguage(nextValue);
                  await onLanguageChange(nextValue);
                }}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="onboard-accent-color-text">
                {$localize`onboard.welcome.accentColorLabel:Accent Color`}
              </label>
              <div className={styles.colorControl}>
                <input
                  id="onboard-accent-color"
                  type="color"
                  className={styles.colorInput}
                  value={pickerValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    store.setAccentColor(nextValue);
                    onAccentColorChange(nextValue);
                  }}
                  aria-label={$localize`onboard.welcome.accentColorPicker:Accent color picker`}
                />
                <input
                  id="onboard-accent-color-text"
                  className={styles.input}
                  type="text"
                  value={store.accentColor}
                  placeholder={DEFAULT_THEME_PREFERENCES.accentColor}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    store.setAccentColor(nextValue);
                    onAccentColorChange(nextValue);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className={styles.footer}>
          <span />
          <dt-button variant="primary" onClick={store.goNext}>
            {$localize`onboard.welcome.getStarted:Get Started`}
          </dt-button>
        </div>
      </>
    );
  }

  function renderAccount() {
    return (
      <>
        <div className={styles.header}>
          <h1 className={styles.title}>{$localize`onboard.account.title:Create Admin Account`}</h1>
          <p className={styles.subtitle}>
            {$localize`onboard.account.subtitle:Choose your credentials`}
          </p>
        </div>
        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-username">
              {$localize`onboard.account.username:Username`}
            </label>
            <input
              id="onboard-username"
              className={styles.input}
              type="text"
              placeholder={$localize`onboard.account.usernamePlaceholder:e.g. admin`}
              autoComplete="username"
              value={store.username}
              onChange={(e) => store.setUsername(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-displayname">
              {$localize`onboard.account.displayName:Display Name`}
            </label>
            <input
              id="onboard-displayname"
              className={styles.input}
              type="text"
              placeholder={$localize`onboard.account.displayNamePlaceholder:Your display name`}
              autoComplete="name"
              value={store.displayName}
              onChange={(e) => store.setDisplayName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-password">
              {$localize`onboard.account.password:Password`}
            </label>
            <input
              id="onboard-password"
              className={styles.input}
              type="password"
              placeholder={$localize`onboard.account.passwordPlaceholder:At least 8 characters`}
              autoComplete="new-password"
              value={store.password}
              onChange={(e) => store.setPassword(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-confirm">
              {$localize`onboard.account.confirmPassword:Confirm Password`}
            </label>
            <input
              id="onboard-confirm"
              className={styles.input}
              type="password"
              placeholder={$localize`onboard.account.confirmPasswordPlaceholder:Re-enter your password`}
              autoComplete="new-password"
              value={store.confirmPassword}
              onChange={(e) => store.setConfirmPassword(e.target.value)}
            />
          </div>
          <div className={styles.error}>{store.error}</div>
        </div>
        <div className={styles.footer}>
          <dt-button variant="secondary" onClick={store.goBack}>
            {backLabel}
          </dt-button>
          <dt-button
            variant="primary"
            onClick={() => {
              if (store.validateAccount()) store.goNext();
            }}
            disabled={
              !store.username || !store.displayName || !store.password || !store.confirmPassword
            }
          >
            {nextLabel}
          </dt-button>
        </div>
      </>
    );
  }

  function renderAiConfig() {
    return (
      <>
        <div className={styles.header}>
          <h1 className={styles.title}>{$localize`onboard.ai.title:AI Configuration`}</h1>
          <p className={styles.subtitle}>
            {$localize`onboard.ai.subtitle:Configure your AI provider (optional)`}
          </p>
        </div>
        <div className={styles.body}>
          <p className={styles.hintText}>
            {$localize`onboard.ai.body:Set up an AI provider so DeskTalk's assistant is ready to use. You can change these settings later in Preferences.`}
          </p>
          <div className={styles.providerList}>
            {store.aiProviders.map((item, index) => {
              const selectedProvider = AI_PROVIDERS.find(
                (provider) => provider.id === item.provider,
              );
              const providerOption = providerOptions.find(
                (provider) => provider.id === item.provider,
              );
              const availableProviders = AI_PROVIDERS.filter(
                (provider) =>
                  provider.id === item.provider ||
                  !store.aiProviders.some(
                    (configuredProvider) => configuredProvider.provider === provider.id,
                  ),
              );

              const modelOptions = [
                { value: '', label: 'Select model' },
                ...(providerOption?.models ?? []).map((model) => ({ value: model, label: model })),
              ];
              if (item.model && !modelOptions.some((option) => option.value === item.model)) {
                modelOptions.push({ value: item.model, label: `${item.model} (custom)` });
              }

              return (
                <div key={item.provider} className={styles.providerCard}>
                  <dt-card variant="outlined">
                    <div className={styles.providerCardBody}>
                      <div className={styles.providerCardHeader}>
                        <div className={styles.providerCardTitleRow}>
                          <div className={styles.providerCardTitle}>
                            {selectedProvider?.label ?? item.provider}
                          </div>
                          {index === 0 && (
                            <dt-badge variant="default">{defaultBadgeLabel}</dt-badge>
                          )}
                        </div>
                        <div className={styles.providerCardActions}>
                          <dt-button
                            onClick={() => store.setDefaultAiProvider(item.provider)}
                            disabled={index === 0}
                            variant="secondary"
                            size="sm"
                          >
                            {setDefaultLabel}
                          </dt-button>
                          <dt-button
                            onClick={() => store.removeAiProvider(item.provider)}
                            disabled={store.aiProviders.length === 1}
                            variant="danger"
                            size="sm"
                          >
                            {deleteLabel}
                          </dt-button>
                        </div>
                      </div>

                      <div className={styles.providerFieldGrid}>
                        <div className={styles.field}>
                          <label
                            className={styles.label}
                            htmlFor={`onboard-ai-provider-${item.provider}`}
                          >
                            {providerLabel}
                          </label>
                          <OnboardSelect
                            id={`onboard-ai-provider-${item.provider}`}
                            value={item.provider}
                            options={availableProviders.map((provider) => ({
                              value: provider.id,
                              label: provider.label,
                            }))}
                            onChange={(nextValue) =>
                              store.updateAiProvider(item.provider, 'provider', nextValue)
                            }
                          />
                        </div>
                        {selectedProvider?.authType === 'subscription' ? (
                          <OnboardSubscriptionAuth
                            providerId={item.provider}
                            authenticated={item.authenticated ?? false}
                            onAuthChange={(authenticated) =>
                              store.setAiProviderAuthenticated(item.provider, authenticated)
                            }
                          />
                        ) : (
                          <div className={styles.field}>
                            <label
                              className={styles.label}
                              htmlFor={`onboard-ai-apikey-${item.provider}`}
                            >
                              {apiKeyLabel}
                            </label>
                            <input
                              id={`onboard-ai-apikey-${item.provider}`}
                              className={styles.input}
                              type="password"
                              placeholder={$localize`onboard.ai.apiKeyPlaceholder:Enter your API key`}
                              autoComplete="off"
                              value={item.apiKey}
                              onChange={(e) =>
                                store.updateAiProvider(item.provider, 'apiKey', e.target.value)
                              }
                            />
                          </div>
                        )}
                        {(providerOption?.models?.length ?? 0) > 0 ? (
                          <div className={styles.field}>
                            <label
                              className={styles.label}
                              htmlFor={`onboard-ai-model-${item.provider}`}
                            >
                              {modelOptionalLabel}
                            </label>
                            <OnboardSelect
                              id={`onboard-ai-model-${item.provider}`}
                              value={item.model}
                              options={modelOptions}
                              onChange={(nextValue) =>
                                store.updateAiProvider(item.provider, 'model', nextValue)
                              }
                            />
                          </div>
                        ) : (
                          <div className={styles.field}>
                            <label
                              className={styles.label}
                              htmlFor={`onboard-ai-model-${item.provider}`}
                            >
                              {modelOptionalLabel}
                            </label>
                            <input
                              id={`onboard-ai-model-${item.provider}`}
                              className={styles.input}
                              type="text"
                              placeholder={$localize`onboard.ai.modelPlaceholder:e.g. gpt-4o`}
                              value={item.model}
                              onChange={(e) =>
                                store.updateAiProvider(item.provider, 'model', e.target.value)
                              }
                            />
                          </div>
                        )}
                        {selectedProvider?.supportsBaseUrl && (
                          <div className={styles.field}>
                            <label
                              className={styles.label}
                              htmlFor={`onboard-ai-baseurl-${item.provider}`}
                            >
                              {baseUrlOptionalLabel}
                            </label>
                            <input
                              id={`onboard-ai-baseurl-${item.provider}`}
                              className={styles.input}
                              type="text"
                              placeholder={$localize`onboard.ai.baseUrlPlaceholder:Custom API endpoint`}
                              value={item.baseUrl}
                              onChange={(e) =>
                                store.updateAiProvider(item.provider, 'baseUrl', e.target.value)
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </dt-card>
                </div>
              );
            })}
          </div>
          <div className={styles.providerActionButtonWrap}>
            <dt-button
              onClick={() => {
                const nextProvider = AI_PROVIDERS.find(
                  (provider) =>
                    !store.aiProviders.some(
                      (configuredProvider) => configuredProvider.provider === provider.id,
                    ),
                );
                if (nextProvider) {
                  store.addAiProvider(nextProvider.id);
                }
              }}
              disabled={store.aiProviders.length >= AI_PROVIDERS.length}
              variant="secondary"
            >
              {addProviderLabel}
            </dt-button>
          </div>
        </div>
        <div className={styles.footer}>
          <dt-button variant="secondary" onClick={store.goBack}>
            {backLabel}
          </dt-button>
          <div className={styles.footerActions}>
            <dt-button variant="ghost" onClick={store.goNext}>
              {skipLabel}
            </dt-button>
            <dt-button variant="primary" onClick={store.goNext}>
              {nextLabel}
            </dt-button>
          </div>
        </div>
      </>
    );
  }

  function renderVoiceConfig() {
    return (
      <>
        <div className={styles.header}>
          <h1 className={styles.title}>{$localize`onboard.voice.title:Voice Configuration`}</h1>
          <p className={styles.subtitle}>
            {$localize`onboard.voice.subtitle:Configure speech-to-text (optional)`}
          </p>
        </div>
        <div className={styles.body}>
          <p className={styles.hintText}>
            {$localize`onboard.voice.body:Set up a speech-to-text provider for voice input. You can change these settings later in Preferences.`}
          </p>
          <div className={styles.providerList}>
            {store.voiceProviders.map((item, index) => {
              const selectedProvider = STT_PROVIDERS.find(
                (provider) => provider.id === item.provider,
              );
              const availableProviders = STT_PROVIDERS.filter(
                (provider) =>
                  provider.id === item.provider ||
                  !store.voiceProviders.some(
                    (configuredProvider) => configuredProvider.provider === provider.id,
                  ),
              );

              return (
                <div key={item.provider} className={styles.providerCard}>
                  <dt-card variant="outlined">
                    <div className={styles.providerCardBody}>
                      <div className={styles.providerCardHeader}>
                        <div className={styles.providerCardTitleRow}>
                          <div className={styles.providerCardTitle}>
                            {selectedProvider?.label ?? item.provider}
                          </div>
                          {index === 0 && (
                            <dt-badge variant="default">{defaultBadgeLabel}</dt-badge>
                          )}
                        </div>
                        <div className={styles.providerCardActions}>
                          <dt-button
                            onClick={() => store.setDefaultVoiceProvider(item.provider)}
                            disabled={index === 0}
                            variant="secondary"
                            size="sm"
                          >
                            {setDefaultLabel}
                          </dt-button>
                          <dt-button
                            onClick={() => store.removeVoiceProvider(item.provider)}
                            disabled={store.voiceProviders.length === 1}
                            variant="danger"
                            size="sm"
                          >
                            {deleteLabel}
                          </dt-button>
                        </div>
                      </div>

                      <div className={styles.providerFieldGrid}>
                        <div className={styles.field}>
                          <label className={styles.label}>
                            {$localize`onboard.voice.provider:STT Provider`}
                          </label>
                          <OnboardSelect
                            value={item.provider}
                            options={availableProviders.map((provider) => ({
                              value: provider.id,
                              label: provider.label,
                            }))}
                            onChange={(nextValue) =>
                              store.updateVoiceProvider(item.provider, 'provider', nextValue)
                            }
                          />
                        </div>
                        <div className={styles.field}>
                          <label
                            className={styles.label}
                            htmlFor={`onboard-stt-apikey-${item.provider}`}
                          >
                            {apiKeyLabel}
                          </label>
                          <input
                            id={`onboard-stt-apikey-${item.provider}`}
                            className={styles.input}
                            type="password"
                            placeholder={$localize`onboard.voice.apiKeyPlaceholder:Enter your STT API key`}
                            autoComplete="off"
                            value={item.apiKey}
                            onChange={(e) =>
                              store.updateVoiceProvider(item.provider, 'apiKey', e.target.value)
                            }
                          />
                        </div>
                        {selectedProvider?.supportsModel && (
                          <div className={styles.field}>
                            <label
                              className={styles.label}
                              htmlFor={`onboard-stt-model-${item.provider}`}
                            >
                              {$localize`onboard.voice.model:Model`}
                            </label>
                            <input
                              id={`onboard-stt-model-${item.provider}`}
                              className={styles.input}
                              type="text"
                              value={item.model}
                              onChange={(e) =>
                                store.updateVoiceProvider(item.provider, 'model', e.target.value)
                              }
                            />
                          </div>
                        )}
                        {selectedProvider?.supportsBaseUrl && (
                          <div className={styles.field}>
                            <label
                              className={styles.label}
                              htmlFor={`onboard-stt-baseurl-${item.provider}`}
                            >
                              {$localize`onboard.voice.baseUrl:Base URL`}
                            </label>
                            <input
                              id={`onboard-stt-baseurl-${item.provider}`}
                              className={styles.input}
                              type="text"
                              value={item.baseUrl}
                              onChange={(e) =>
                                store.updateVoiceProvider(item.provider, 'baseUrl', e.target.value)
                              }
                            />
                          </div>
                        )}
                        {selectedProvider?.supportsAzureDeployment && (
                          <div className={styles.field}>
                            <label
                              className={styles.label}
                              htmlFor={`onboard-stt-deployment-${item.provider}`}
                            >
                              {$localize`onboard.voice.azureDeployment:Azure Deployment`}
                            </label>
                            <input
                              id={`onboard-stt-deployment-${item.provider}`}
                              className={styles.input}
                              type="text"
                              value={item.azureDeployment}
                              onChange={(e) =>
                                store.updateVoiceProvider(
                                  item.provider,
                                  'azureDeployment',
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        )}
                        {selectedProvider?.supportsAzureApiVersion && (
                          <div className={styles.field}>
                            <label
                              className={styles.label}
                              htmlFor={`onboard-stt-api-version-${item.provider}`}
                            >
                              {$localize`onboard.voice.azureApiVersion:Azure API Version`}
                            </label>
                            <input
                              id={`onboard-stt-api-version-${item.provider}`}
                              className={styles.input}
                              type="text"
                              value={item.azureApiVersion}
                              onChange={(e) =>
                                store.updateVoiceProvider(
                                  item.provider,
                                  'azureApiVersion',
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </dt-card>
                </div>
              );
            })}
          </div>
          <div className={styles.providerActionButtonWrap}>
            <dt-button
              onClick={() => {
                const nextProvider = STT_PROVIDERS.find(
                  (provider) =>
                    !store.voiceProviders.some(
                      (configuredProvider) => configuredProvider.provider === provider.id,
                    ),
                );
                if (nextProvider) {
                  store.addVoiceProvider(nextProvider.id);
                }
              }}
              disabled={store.voiceProviders.length >= STT_PROVIDERS.length}
              variant="secondary"
            >
              {addProviderLabel}
            </dt-button>
          </div>
        </div>
        <div className={styles.footer}>
          <dt-button variant="secondary" onClick={store.goBack}>
            {backLabel}
          </dt-button>
          <div className={styles.footerActions}>
            <dt-button variant="ghost" onClick={store.goNext}>
              {skipLabel}
            </dt-button>
            <dt-button variant="primary" onClick={store.goNext}>
              {nextLabel}
            </dt-button>
          </div>
        </div>
      </>
    );
  }

  function renderDone() {
    const displayUserName = store.displayName || store.username;

    return (
      <>
        <div className={styles.header}>
          <h1 className={styles.title}>{$localize`onboard.done.title:All Set!`}</h1>
          <p className={styles.subtitle}>
            {$localize`onboard.done.subtitle:Your admin account is ready`}
          </p>
        </div>
        <div className={styles.body}>
          <p className={styles.doneText}>
            {$localize`onboard.done.body:Welcome, ${displayUserName}. Click below to enter your DeskTalk desktop.`}
          </p>
          <div className={styles.error}>{store.error}</div>
        </div>
        <div className={styles.footer}>
          <dt-button variant="secondary" onClick={store.goBack}>
            {backLabel}
          </dt-button>
          <dt-button
            variant="primary"
            onClick={() => store.submit(onComplete)}
            disabled={store.loading}
          >
            {store.loading
              ? $localize`onboard.done.loading:Setting up...`
              : $localize`onboard.done.enter:Enter Desktop`}
          </dt-button>
        </div>
      </>
    );
  }

  const stepRenderers: Record<OnboardStep, () => ReactNode> = {
    welcome: renderWelcome,
    account: renderAccount,
    aiConfig: renderAiConfig,
    voiceConfig: renderVoiceConfig,
    done: renderDone,
  };

  return (
    <div className={styles.page}>
      <Modal size="medium">
        {renderStepDots()}
        {stepRenderers[store.step]()}
      </Modal>
    </div>
  );
}

interface OnboardSelectProps {
  id?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => Promise<void> | void;
}

function OnboardSelect({ id, value, options, disabled = false, onChange }: OnboardSelectProps) {
  return (
    <div className={styles.providerSelectWrap}>
      <dt-select
        id={id}
        value={value}
        options={options}
        disabled={disabled}
        ondt-change={(event) => {
          void onChange(event.detail.value);
        }}
      />
    </div>
  );
}

// ── Subscription provider auth for onboarding ──────────────────────────

type OnboardSubscriptionState =
  | { phase: 'idle' }
  | {
      phase: 'pending';
      url: string;
      instructions?: string;
      progress?: string;
      usesCallbackServer?: boolean;
      manualCodePrompt?: { message: string; placeholder?: string; allowEmpty?: boolean };
    }
  | { phase: 'authenticated' }
  | { phase: 'error'; message: string };

interface OnboardSubscriptionAuthProps {
  providerId: string;
  authenticated: boolean;
  onAuthChange: (authenticated: boolean) => void;
}

function OnboardSubscriptionAuth({
  providerId,
  authenticated,
  onAuthChange,
}: OnboardSubscriptionAuthProps) {
  const [state, setState] = useState<OnboardSubscriptionState>(
    authenticated ? { phase: 'authenticated' } : { phase: 'idle' },
  );
  const [manualCode, setManualCode] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Sync external authenticated prop
  useEffect(() => {
    if (authenticated && state.phase !== 'authenticated') {
      setState({ phase: 'authenticated' });
    }
  }, [authenticated, state.phase]);

  const handleLogin = useCallback(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ phase: 'pending', url: '', instructions: undefined });
    setManualCode('');

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
                    usesCallbackServer: Boolean(data.usesCallbackServer),
                    progress: prev.phase === 'pending' ? prev.progress : undefined,
                    manualCodePrompt:
                      prev.phase === 'pending' ? prev.manualCodePrompt : undefined,
                  }));
                } else if (eventType === 'prompt') {
                  setState((prev) =>
                    prev.phase === 'pending'
                      ? {
                          ...prev,
                          manualCodePrompt: {
                            message: String(data.message ?? ''),
                            placeholder: data.placeholder ? String(data.placeholder) : undefined,
                            allowEmpty: Boolean(data.allowEmpty),
                          },
                        }
                      : prev,
                  );
                } else if (eventType === 'progress') {
                  setState((prev) =>
                    prev.phase === 'pending'
                      ? { ...prev, progress: String(data.message ?? '') }
                      : prev,
                  );
                } else if (eventType === 'done') {
                  setState({ phase: 'authenticated' });
                  onAuthChange(true);
                } else if (eventType === 'error') {
                  setState({
                    phase: 'error',
                    message: String(data.message ?? 'Login failed'),
                  });
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
  }, [providerId, onAuthChange]);

  const handleLogout = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    fetch(`/api/ai/providers/${providerId}/logout`, {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then(() => {
        setState({ phase: 'idle' });
        onAuthChange(false);
      })
      .catch(() => {
        setState({ phase: 'idle' });
        onAuthChange(false);
      });
  }, [providerId, onAuthChange]);

  const handleCopyAndOpen = useCallback((url: string, code?: string) => {
    if (code) {
      void navigator.clipboard.writeText(code);
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleSubmitCode = useCallback(
    (code: string) => {
      if (!code.trim()) return;
      fetch(`/api/ai/providers/${providerId}/login/code`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      }).catch(() => {
        // Submission failure is not critical — the SSE stream will
        // report errors if the login flow itself fails.
      });
    },
    [providerId],
  );

  if (state.phase === 'authenticated') {
    return (
      <div className={styles.subscriptionAuthConnected}>
        <span className={styles.subscriptionAuthStatusConnected}>Connected</span>
        <dt-button onClick={handleLogout} variant="danger" size="sm">
          Logout
        </dt-button>
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
            <dt-button
              onClick={() => handleCopyAndOpen(state.url, state.instructions)}
              variant="primary"
              size="sm"
            >
              {state.instructions ? 'Copy Code & Open' : 'Open in Browser'}
            </dt-button>
          )}
          <dt-button onClick={handleLogout} variant="secondary" size="sm">
            Cancel
          </dt-button>
        </div>
        {state.manualCodePrompt && (
          <div className={styles.manualCodeInput}>
            <div className={styles.manualCodeHint}>{state.manualCodePrompt.message}</div>
            <div className={styles.manualCodeRow}>
              <input
                className={styles.input}
                type="text"
                placeholder={state.manualCodePrompt.placeholder ?? 'Paste code or URL'}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitCode(manualCode);
                }}
              />
              <dt-button
                onClick={() => handleSubmitCode(manualCode)}
                variant="primary"
                size="sm"
                disabled={!state.manualCodePrompt.allowEmpty && !manualCode.trim()}
              >
                Submit
              </dt-button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className={styles.subscriptionAuth}>
        <span className={styles.subscriptionAuthError}>Error: {state.message}</span>
        <dt-button onClick={handleLogin} variant="primary" size="sm">
          Retry
        </dt-button>
      </div>
    );
  }

  // idle
  return (
    <div className={styles.subscriptionAuth}>
      <span>Not connected</span>
      <dt-button onClick={handleLogin} variant="primary" size="sm">
        Login
      </dt-button>
    </div>
  );
}
