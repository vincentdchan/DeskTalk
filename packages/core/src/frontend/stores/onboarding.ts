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

export interface OnboardingState {
  // Step
  step: OnboardStep;
  stepIndex: number;

  // Account
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;

  // AI config
  aiProviders: AiOnboardingProvider[];

  // Voice/STT config
  sttProvider: string;
  sttApiKey: string;

  // UI
  error: string;
  loading: boolean;

  // Actions — navigation
  goNext: () => void;
  goBack: () => void;

  // Actions — field setters
  setUsername: (value: string) => void;
  setDisplayName: (value: string) => void;
  setPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  addAiProvider: (provider?: string) => void;
  removeAiProvider: (provider: string) => void;
  setDefaultAiProvider: (provider: string) => void;
  updateAiProvider: (provider: string, field: keyof AiOnboardingProvider, value: string) => void;
  setSttProvider: (value: string) => void;
  setSttApiKey: (value: string) => void;

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
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',

  // AI config
  aiProviders: [createAiProvider()],

  // Voice/STT config
  sttProvider: 'openai-whisper',
  sttApiKey: '',

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
  setSttProvider: (value) => set({ sttProvider: value }),
  setSttApiKey: (value) => set({ sttApiKey: value }),

  // ─── Validation ──────────────────────────────────────────────────────

  validateAccount() {
    const { username, displayName, password, confirmPassword } = get();

    if (!username.trim()) {
      set({ error: 'Username is required.' });
      return false;
    }
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(username)) {
      set({ error: 'Username must be 1-32 alphanumeric characters, hyphens, or underscores.' });
      return false;
    }
    if (!displayName.trim()) {
      set({ error: 'Display name is required.' });
      return false;
    }
    if (password.length < 8) {
      set({ error: 'Password must be at least 8 characters.' });
      return false;
    }
    if (password !== confirmPassword) {
      set({ error: 'Passwords do not match.' });
      return false;
    }
    return true;
  },

  // ─── Submission ──────────────────────────────────────────────────────

  async submit(onComplete) {
    const { username, displayName, password, aiProviders, sttProvider, sttApiKey } = get();

    set({ error: '', loading: true });

    try {
      const payload: Record<string, unknown> = {
        username: username.trim(),
        displayName: displayName.trim(),
        password,
      };

      const trimmedAiProviders = aiProviders.map((provider) => ({
        provider: provider.provider,
        apiKey: provider.apiKey.trim(),
        model: provider.model.trim(),
        baseUrl: provider.baseUrl.trim(),
      }));
      const hasAiConfig = trimmedAiProviders.some(
        (provider) =>
          provider.apiKey || provider.model || provider.baseUrl || provider.provider !== 'openai',
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

      // Include Voice/STT config only if the user provided an API key
      if (sttApiKey.trim()) {
        payload.voiceConfig = {
          provider: sttProvider,
          apiKey: sttApiKey.trim(),
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
