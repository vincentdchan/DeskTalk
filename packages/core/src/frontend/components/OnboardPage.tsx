import { useEffect, useState, type ReactNode } from 'react';
import styles from './OnboardPage.module.scss';
import { useOnboarding, ONBOARD_STEPS, type OnboardStep } from '../stores/onboarding';

export interface OnboardPageProps {
  onComplete: () => void;
}

interface DtSelectElement extends HTMLElement {
  options: Array<{ value: string; label: string }>;
  value: string;
  disabled: boolean;
}

/** AI providers shown during onboarding. */
const AI_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', supportsBaseUrl: true },
  { id: 'anthropic', label: 'Anthropic', supportsBaseUrl: false },
  { id: 'google', label: 'Google Gemini', supportsBaseUrl: false },
  { id: 'azure-openai-responses', label: 'Azure OpenAI', supportsBaseUrl: true },
  { id: 'mistral', label: 'Mistral', supportsBaseUrl: true },
  { id: 'groq', label: 'Groq', supportsBaseUrl: true },
  { id: 'xai', label: 'xAI', supportsBaseUrl: true },
  { id: 'openrouter', label: 'OpenRouter', supportsBaseUrl: true },
  { id: 'ollama', label: 'Ollama', supportsBaseUrl: true },
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

export function OnboardPage({ onComplete }: OnboardPageProps) {
  const store = useOnboarding();

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
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>Welcome to DeskTalk</div>
          <div className={styles.subtitle}>Let&apos;s create your admin account</div>
        </div>
        <div className={styles.body}>
          <p className={styles.welcomeText}>
            DeskTalk is a browser-based desktop environment with an AI assistant and modular
            MiniApps. Since this is the first time running DeskTalk, you&apos;ll need to create an
            administrator account.
          </p>
        </div>
        <div className={styles.footer}>
          <span />
          <button className={styles.buttonPrimary} type="button" onClick={store.goNext}>
            Get Started
          </button>
        </div>
      </>
    );
  }

  function renderAccount() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>Create Admin Account</div>
          <div className={styles.subtitle}>Choose your credentials</div>
        </div>
        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-username">
              Username
            </label>
            <input
              id="onboard-username"
              className={styles.input}
              type="text"
              placeholder="e.g. admin"
              autoComplete="username"
              value={store.username}
              onChange={(e) => store.setUsername(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-displayname">
              Display Name
            </label>
            <input
              id="onboard-displayname"
              className={styles.input}
              type="text"
              placeholder="Your display name"
              autoComplete="name"
              value={store.displayName}
              onChange={(e) => store.setDisplayName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-password">
              Password
            </label>
            <input
              id="onboard-password"
              className={styles.input}
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={store.password}
              onChange={(e) => store.setPassword(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-confirm">
              Confirm Password
            </label>
            <input
              id="onboard-confirm"
              className={styles.input}
              type="password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              value={store.confirmPassword}
              onChange={(e) => store.setConfirmPassword(e.target.value)}
            />
          </div>
          <div className={styles.error}>{store.error}</div>
        </div>
        <div className={styles.footer}>
          <button className={styles.buttonSecondary} type="button" onClick={store.goBack}>
            Back
          </button>
          <button
            className={styles.buttonPrimary}
            type="button"
            onClick={() => {
              if (store.validateAccount()) store.goNext();
            }}
            disabled={
              !store.username || !store.displayName || !store.password || !store.confirmPassword
            }
          >
            Next
          </button>
        </div>
      </>
    );
  }

  function renderAiConfig() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>AI Configuration</div>
          <div className={styles.subtitle}>Configure your AI provider (optional)</div>
        </div>
        <div className={styles.body}>
          <p className={styles.hintText}>
            Set up an AI provider so DeskTalk&apos;s assistant is ready to use. You can change these
            settings later in Preferences.
          </p>
          <div className={styles.providerList}>
            {store.aiProviders.map((item, index) => {
              const selectedProvider = AI_PROVIDERS.find(
                (provider) => provider.id === item.provider,
              );
              const availableProviders = AI_PROVIDERS.filter(
                (provider) =>
                  provider.id === item.provider ||
                  !store.aiProviders.some(
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
                            <span className={styles.providerDefaultBadge}>Default</span>
                          )}
                        </div>
                        <div className={styles.providerCardActions}>
                          <div className={styles.providerButtonWrap}>
                            <OnboardButton
                              onPress={() => store.setDefaultAiProvider(item.provider)}
                              disabled={index === 0}
                              variant="secondary"
                              size="sm"
                            >
                              Set as default
                            </OnboardButton>
                          </div>
                          <div className={styles.providerButtonWrap}>
                            <OnboardButton
                              onPress={() => store.removeAiProvider(item.provider)}
                              disabled={store.aiProviders.length === 1}
                              variant="danger"
                              size="sm"
                            >
                              Delete
                            </OnboardButton>
                          </div>
                        </div>
                      </div>

                      <div className={styles.providerFieldGrid}>
                        <div className={styles.field}>
                          <label
                            className={styles.label}
                            htmlFor={`onboard-ai-provider-${item.provider}`}
                          >
                            Provider
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
                        <div className={styles.field}>
                          <label
                            className={styles.label}
                            htmlFor={`onboard-ai-apikey-${item.provider}`}
                          >
                            API Key
                          </label>
                          <input
                            id={`onboard-ai-apikey-${item.provider}`}
                            className={styles.input}
                            type="password"
                            placeholder="Enter your API key"
                            autoComplete="off"
                            value={item.apiKey}
                            onChange={(e) =>
                              store.updateAiProvider(item.provider, 'apiKey', e.target.value)
                            }
                          />
                        </div>
                        <div className={styles.field}>
                          <label
                            className={styles.label}
                            htmlFor={`onboard-ai-model-${item.provider}`}
                          >
                            Model (optional)
                          </label>
                          <input
                            id={`onboard-ai-model-${item.provider}`}
                            className={styles.input}
                            type="text"
                            placeholder="e.g. gpt-4o"
                            value={item.model}
                            onChange={(e) =>
                              store.updateAiProvider(item.provider, 'model', e.target.value)
                            }
                          />
                        </div>
                        {selectedProvider?.supportsBaseUrl && (
                          <div className={styles.field}>
                            <label
                              className={styles.label}
                              htmlFor={`onboard-ai-baseurl-${item.provider}`}
                            >
                              Base URL (optional)
                            </label>
                            <input
                              id={`onboard-ai-baseurl-${item.provider}`}
                              className={styles.input}
                              type="text"
                              placeholder="Custom API endpoint"
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
            <OnboardButton
              onPress={() => {
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
              Add provider
            </OnboardButton>
          </div>
        </div>
        <div className={styles.footer}>
          <button className={styles.buttonSecondary} type="button" onClick={store.goBack}>
            Back
          </button>
          <div className={styles.footerActions}>
            <button className={styles.buttonSecondary} type="button" onClick={store.goNext}>
              Skip
            </button>
            <button className={styles.buttonPrimary} type="button" onClick={store.goNext}>
              Next
            </button>
          </div>
        </div>
      </>
    );
  }

  function renderVoiceConfig() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>Voice Configuration</div>
          <div className={styles.subtitle}>Configure speech-to-text (optional)</div>
        </div>
        <div className={styles.body}>
          <p className={styles.hintText}>
            Set up a speech-to-text provider for voice input. You can change these settings later in
            Preferences.
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
                            <span className={styles.providerDefaultBadge}>Default</span>
                          )}
                        </div>
                        <div className={styles.providerCardActions}>
                          <div className={styles.providerButtonWrap}>
                            <OnboardButton
                              onPress={() => store.setDefaultVoiceProvider(item.provider)}
                              disabled={index === 0}
                              variant="secondary"
                              size="sm"
                            >
                              Set as default
                            </OnboardButton>
                          </div>
                          <div className={styles.providerButtonWrap}>
                            <OnboardButton
                              onPress={() => store.removeVoiceProvider(item.provider)}
                              disabled={store.voiceProviders.length === 1}
                              variant="danger"
                              size="sm"
                            >
                              Delete
                            </OnboardButton>
                          </div>
                        </div>
                      </div>

                      <div className={styles.providerFieldGrid}>
                        <div className={styles.field}>
                          <label className={styles.label}>STT Provider</label>
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
                            API Key
                          </label>
                          <input
                            id={`onboard-stt-apikey-${item.provider}`}
                            className={styles.input}
                            type="password"
                            placeholder="Enter your STT API key"
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
                              Model
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
                              Base URL
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
                              Azure Deployment
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
                              Azure API Version
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
            <OnboardButton
              onPress={() => {
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
              Add provider
            </OnboardButton>
          </div>
        </div>
        <div className={styles.footer}>
          <button className={styles.buttonSecondary} type="button" onClick={store.goBack}>
            Back
          </button>
          <div className={styles.footerActions}>
            <button className={styles.buttonSecondary} type="button" onClick={store.goNext}>
              Skip
            </button>
            <button className={styles.buttonPrimary} type="button" onClick={store.goNext}>
              Next
            </button>
          </div>
        </div>
      </>
    );
  }

  function renderDone() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>All Set!</div>
          <div className={styles.subtitle}>Your admin account is ready</div>
        </div>
        <div className={styles.body}>
          <p className={styles.doneText}>
            Welcome, {store.displayName || store.username}. Click below to enter your DeskTalk
            desktop.
          </p>
          <div className={styles.error}>{store.error}</div>
        </div>
        <div className={styles.footer}>
          <button className={styles.buttonSecondary} type="button" onClick={store.goBack}>
            Back
          </button>
          <button
            className={styles.buttonPrimary}
            type="button"
            onClick={() => store.submit(onComplete)}
            disabled={store.loading}
          >
            {store.loading ? 'Setting up...' : 'Enter Desktop'}
          </button>
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
      <div className={styles.card}>
        {renderStepDots()}
        {stepRenderers[store.step]()}
      </div>
    </div>
  );
}

interface OnboardButtonProps {
  children: ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onPress: () => Promise<void> | void;
}

function OnboardButton({
  children,
  disabled = false,
  variant = 'primary',
  size = 'md',
  onPress,
}: OnboardButtonProps) {
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

interface OnboardSelectProps {
  id?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => Promise<void> | void;
}

function OnboardSelect({ id, value, options, disabled = false, onChange }: OnboardSelectProps) {
  const [selectElement, setSelectElement] = useState<DtSelectElement | null>(null);

  useEffect(() => {
    if (!selectElement) {
      return;
    }

    if (id) {
      selectElement.setAttribute('id', id);
    } else {
      selectElement.removeAttribute('id');
    }
  }, [id, selectElement]);

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
