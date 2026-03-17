import type { ReactNode } from 'react';
import styles from './OnboardPage.module.scss';
import { useOnboarding, ONBOARD_STEPS, type OnboardStep } from '../stores/onboarding';

export interface OnboardPageProps {
  onComplete: () => void;
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
  { id: 'openai-whisper', label: 'OpenAI Whisper' },
  { id: 'azure-openai-whisper', label: 'Azure OpenAI Whisper' },
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
    const selectedProvider = AI_PROVIDERS.find((p) => p.id === store.aiProvider);
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
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-ai-provider">
              Provider
            </label>
            <select
              id="onboard-ai-provider"
              className={styles.select}
              value={store.aiProvider}
              onChange={(e) => store.setAiProvider(e.target.value)}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-ai-apikey">
              API Key
            </label>
            <input
              id="onboard-ai-apikey"
              className={styles.input}
              type="password"
              placeholder="Enter your API key"
              autoComplete="off"
              value={store.aiApiKey}
              onChange={(e) => store.setAiApiKey(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-ai-model">
              Model (optional)
            </label>
            <input
              id="onboard-ai-model"
              className={styles.input}
              type="text"
              placeholder="e.g. gpt-4o"
              value={store.aiModel}
              onChange={(e) => store.setAiModel(e.target.value)}
            />
          </div>
          {selectedProvider?.supportsBaseUrl && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="onboard-ai-baseurl">
                Base URL (optional)
              </label>
              <input
                id="onboard-ai-baseurl"
                className={styles.input}
                type="text"
                placeholder="Custom API endpoint"
                value={store.aiBaseUrl}
                onChange={(e) => store.setAiBaseUrl(e.target.value)}
              />
            </div>
          )}
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
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-stt-provider">
              STT Provider
            </label>
            <select
              id="onboard-stt-provider"
              className={styles.select}
              value={store.sttProvider}
              onChange={(e) => store.setSttProvider(e.target.value)}
            >
              {STT_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-stt-apikey">
              API Key
            </label>
            <input
              id="onboard-stt-apikey"
              className={styles.input}
              type="password"
              placeholder="Enter your STT API key"
              autoComplete="off"
              value={store.sttApiKey}
              onChange={(e) => store.setSttApiKey(e.target.value)}
            />
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
