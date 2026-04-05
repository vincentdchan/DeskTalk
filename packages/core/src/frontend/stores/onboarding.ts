/**
 * Onboarding Zustand store.
 *
 * Manages all state for the multi-step onboarding wizard:
 * - Step navigation (welcome, account, aiConfig, voiceConfig, done)
 * - Admin account form fields and validation
 * - AI provider configuration (skippable)
 * - Voice/STT provider configuration (skippable)
 * - Submission to POST /api/setup
 */

import { create } from 'zustand';
import { getErrorMessage, httpClient } from '../http-client';
import { DEFAULT_THEME_PREFERENCES } from '../theme';

const DEFAULT_LANGUAGE = 'en';

// ─── Types ───────────────────────────────────────────────────────────────────

export type OnboardStep = 'welcome' | 'account' | 'aiConfig' | 'voiceConfig' | 'done';

export const ONBOARD_STEPS: OnboardStep[] = [
  'welcome',
  'account',
  'aiConfig',
  'voiceConfig',
  'done',
];

export interface AiOnboardingProvider {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Whether a subscription provider has been OAuth-authenticated. */
  authenticated?: boolean;
}

export interface VoiceOnboardingProvider {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  azureDeployment: string;
  azureApiVersion: string;
}

const DEFAULT_AI_PROVIDER: AiOnboardingProvider = {
  provider: 'openai',
  apiKey: '',
  model: '',
  baseUrl: '',
};

function createAiProvider(provider = DEFAULT_AI_PROVIDER.provider): AiOnboardingProvider {
  return {
    provider,
    apiKey: '',
    model: '',
    baseUrl: '',
  };
}

const DEFAULT_VOICE_PROVIDER: VoiceOnboardingProvider = {
  provider: 'openai-whisper',
  apiKey: '',
  model: 'whisper-1',
  baseUrl: 'https://api.openai.com/v1',
  azureDeployment: '',
  azureApiVersion: '2024-06-01',
};

function createVoiceProvider(provider = DEFAULT_VOICE_PROVIDER.provider): VoiceOnboardingProvider {
  if (provider === 'azure-openai-whisper') {
    return {
      provider,
      apiKey: '',
      model: '',
      baseUrl: '',
      azureDeployment: '',
      azureApiVersion: '2024-06-01',
    };
  }

  return {
    provider,
    apiKey: '',
    model: 'whisper-1',
    baseUrl: 'https://api.openai.com/v1',
    azureDeployment: '',
    azureApiVersion: '2024-06-01',
  };
}

export interface OnboardingState {
  // Step
  step: OnboardStep;
  stepIndex: number;

  // Account
  language: string;
  accentColor: string;
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;

  // AI config
  aiProviders: AiOnboardingProvider[];

  // Voice/STT config
  voiceProviders: VoiceOnboardingProvider[];

  // UI
  error: string;
  loading: boolean;

  // Actions — navigation
  goNext: () => void;
  goBack: () => void;

  // Actions — field setters
  setLanguage: (value: string) => void;
  setAccentColor: (value: string) => void;
  setUsername: (value: string) => void;
  setDisplayName: (value: string) => void;
  setPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  addAiProvider: (provider?: string) => void;
  removeAiProvider: (provider: string) => void;
  setDefaultAiProvider: (provider: string) => void;
  updateAiProvider: (provider: string, field: keyof AiOnboardingProvider, value: string) => void;
  setAiProviderAuthenticated: (provider: string, authenticated: boolean) => void;
  addVoiceProvider: (provider?: string) => void;
  removeVoiceProvider: (provider: string) => void;
  setDefaultVoiceProvider: (provider: string) => void;
  updateVoiceProvider: (
    provider: string,
    field: keyof VoiceOnboardingProvider,
    value: string,
  ) => void;

  // Actions — validation & submission
  validateAccount: () => boolean;
  submit: (onComplete: () => void) => Promise<void>;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useOnboarding = create<OnboardingState>((set, get) => ({
  // Step
  step: 'welcome',
  stepIndex: 0,

  // Account
  language: DEFAULT_LANGUAGE,
  accentColor: DEFAULT_THEME_PREFERENCES.accentColor,
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',

  // AI config
  aiProviders: [createAiProvider()],

  // Voice/STT config
  voiceProviders: [createVoiceProvider()],

  // UI
  error: '',
  loading: false,

  // ─── Navigation ──────────────────────────────────────────────────────

  goNext() {
    const { stepIndex } = get();
    const nextIndex = stepIndex + 1;
    if (nextIndex < ONBOARD_STEPS.length) {
      set({ step: ONBOARD_STEPS[nextIndex], stepIndex: nextIndex, error: '' });
    }
  },

  goBack() {
    const { stepIndex } = get();
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      set({ step: ONBOARD_STEPS[prevIndex], stepIndex: prevIndex, error: '' });
    }
  },

  // ─── Field Setters ───────────────────────────────────────────────────

  setLanguage: (value) => set({ language: value }),
  setAccentColor: (value) => set({ accentColor: value }),
  setUsername: (value) => set({ username: value }),
  setDisplayName: (value) => set({ displayName: value }),
  setPassword: (value) => set({ password: value }),
  setConfirmPassword: (value) => set({ confirmPassword: value }),
  addAiProvider: (provider = DEFAULT_AI_PROVIDER.provider) =>
    set((state) => {
      if (state.aiProviders.some((item) => item.provider === provider)) {
        return state;
      }
      return { aiProviders: [...state.aiProviders, createAiProvider(provider)] };
    }),
  removeAiProvider: (provider) =>
    set((state) => {
      if (state.aiProviders.length === 1) {
        return state;
      }
      return { aiProviders: state.aiProviders.filter((item) => item.provider !== provider) };
    }),
  setDefaultAiProvider: (provider) =>
    set((state) => {
      const nextProviders = state.aiProviders.filter((item) => item.provider !== provider);
      const selectedProvider = state.aiProviders.find((item) => item.provider === provider);
      if (!selectedProvider) {
        return state;
      }
      return { aiProviders: [selectedProvider, ...nextProviders] };
    }),
  updateAiProvider: (provider, field, value) =>
    set((state) => ({
      aiProviders: state.aiProviders.map((item) =>
        item.provider === provider ? { ...item, [field]: value } : item,
      ),
    })),
  setAiProviderAuthenticated: (provider, authenticated) =>
    set((state) => ({
      aiProviders: state.aiProviders.map((item) =>
        item.provider === provider ? { ...item, authenticated } : item,
      ),
    })),
  addVoiceProvider: (provider = DEFAULT_VOICE_PROVIDER.provider) =>
    set((state) => {
      if (state.voiceProviders.some((item) => item.provider === provider)) {
        return state;
      }
      return { voiceProviders: [...state.voiceProviders, createVoiceProvider(provider)] };
    }),
  removeVoiceProvider: (provider) =>
    set((state) => {
      if (state.voiceProviders.length === 1) {
        return state;
      }
      return { voiceProviders: state.voiceProviders.filter((item) => item.provider !== provider) };
    }),
  setDefaultVoiceProvider: (provider) =>
    set((state) => {
      const nextProviders = state.voiceProviders.filter((item) => item.provider !== provider);
      const selectedProvider = state.voiceProviders.find((item) => item.provider === provider);
      if (!selectedProvider) {
        return state;
      }
      return { voiceProviders: [selectedProvider, ...nextProviders] };
    }),
  updateVoiceProvider: (provider, field, value) =>
    set((state) => ({
      voiceProviders: state.voiceProviders.map((item) =>
        item.provider === provider ? { ...item, [field]: value } : item,
      ),
    })),

  // ─── Validation ──────────────────────────────────────────────────────

  validateAccount() {
    const { username, displayName, password, confirmPassword } = get();

    if (!username.trim()) {
      set({ error: $localize`onboard.account.errors.usernameRequired:Username is required.` });
      return false;
    }
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(username)) {
      set({
        error: $localize`onboard.account.errors.usernameInvalid:Username must be 1-32 alphanumeric characters, hyphens, or underscores.`,
      });
      return false;
    }
    if (!displayName.trim()) {
      set({
        error: $localize`onboard.account.errors.displayNameRequired:Display name is required.`,
      });
      return false;
    }
    if (password.length < 8) {
      set({
        error: $localize`onboard.account.errors.passwordShort:Password must be at least 8 characters.`,
      });
      return false;
    }
    if (password !== confirmPassword) {
      set({ error: $localize`onboard.account.errors.passwordMismatch:Passwords do not match.` });
      return false;
    }
    return true;
  },

  // ─── Submission ──────────────────────────────────────────────────────

  async submit(onComplete) {
    const { username, displayName, password, language, accentColor, aiProviders, voiceProviders } =
      get();

    set({ error: '', loading: true });

    try {
      const payload: Record<string, unknown> = {
        language: language.trim() || DEFAULT_LANGUAGE,
        accentColor: accentColor.trim() || DEFAULT_THEME_PREFERENCES.accentColor,
        username: username.trim(),
        displayName: displayName.trim(),
        password,
      };

      const trimmedAiProviders = aiProviders.map((provider) => ({
        provider: provider.provider,
        apiKey: provider.apiKey.trim(),
        model: provider.model.trim(),
        baseUrl: provider.baseUrl.trim(),
        authenticated: provider.authenticated,
      }));
      const hasAiConfig = trimmedAiProviders.some(
        (provider) =>
          provider.apiKey ||
          provider.model ||
          provider.baseUrl ||
          provider.authenticated ||
          provider.provider !== 'openai',
      );

      if (hasAiConfig) {
        payload.aiConfig = {
          defaultProvider: trimmedAiProviders[0]?.provider ?? 'openai',
          providers: trimmedAiProviders.map((provider) => ({
            provider: provider.provider,
            apiKey: provider.apiKey || undefined,
            model: provider.model || undefined,
            baseUrl: provider.baseUrl || undefined,
          })),
        };
      }

      const trimmedVoiceProviders = voiceProviders.map((provider) => ({
        provider: provider.provider,
        apiKey: provider.apiKey.trim(),
        model: provider.model.trim(),
        baseUrl: provider.baseUrl.trim(),
        azureDeployment: provider.azureDeployment.trim(),
        azureApiVersion: provider.azureApiVersion.trim(),
      }));
      const hasVoiceConfig = trimmedVoiceProviders.some(
        (provider) =>
          provider.apiKey ||
          provider.model ||
          provider.baseUrl ||
          provider.azureDeployment ||
          provider.azureApiVersion !== '2024-06-01' ||
          provider.provider !== 'openai-whisper',
      );

      if (hasVoiceConfig) {
        payload.voiceConfig = {
          defaultProvider: trimmedVoiceProviders[0]?.provider ?? 'openai-whisper',
          providers: trimmedVoiceProviders.map((provider) => ({
            provider: provider.provider,
            apiKey: provider.apiKey || undefined,
            model: provider.model || undefined,
            baseUrl: provider.baseUrl || undefined,
            azureDeployment: provider.azureDeployment || undefined,
            azureApiVersion: provider.azureApiVersion || undefined,
          })),
        };
      }

      await httpClient.post('/api/setup', payload);
      onComplete();
    } catch (err) {
      set({ error: getErrorMessage(err, 'Network error. Please try again.') });
    } finally {
      set({ loading: false });
    }
  },
}));
