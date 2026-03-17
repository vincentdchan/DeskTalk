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
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;

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
  setAiProvider: (value: string) => void;
  setAiApiKey: (value: string) => void;
  setAiModel: (value: string) => void;
  setAiBaseUrl: (value: string) => void;
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
  aiProvider: 'openai',
  aiApiKey: '',
  aiModel: '',
  aiBaseUrl: '',

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
  setAiProvider: (value) => set({ aiProvider: value }),
  setAiApiKey: (value) => set({ aiApiKey: value }),
  setAiModel: (value) => set({ aiModel: value }),
  setAiBaseUrl: (value) => set({ aiBaseUrl: value }),
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
    const {
      username,
      displayName,
      password,
      aiProvider,
      aiApiKey,
      aiModel,
      aiBaseUrl,
      sttProvider,
      sttApiKey,
    } = get();

    set({ error: '', loading: true });

    try {
      const payload: Record<string, unknown> = {
        username: username.trim(),
        displayName: displayName.trim(),
        password,
      };

      // Include AI config only if the user provided an API key
      if (aiApiKey.trim()) {
        payload.aiConfig = {
          provider: aiProvider,
          apiKey: aiApiKey.trim(),
          model: aiModel.trim() || undefined,
          baseUrl: aiBaseUrl.trim() || undefined,
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
