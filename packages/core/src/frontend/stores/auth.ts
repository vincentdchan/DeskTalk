import { create } from 'zustand';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'normal';
  onboarded: boolean;
}

interface AuthStatus {
  setupMode: boolean;
  devMode: boolean;
  devSessionId?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  setupMode: boolean;
  devMode: boolean;

  /** Check auth status and attempt to restore session. */
  checkAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboard: () => Promise<void>;
  createFirstAdmin: (username: string, password: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  setupMode: false,
  devMode: false,

  checkAuth: async () => {
    set({ loading: true, error: null });
    try {
      // First, get auth status (includes dev mode info)
      const statusRes = await fetch('/api/auth/status');
      const status = (await statusRes.json()) as AuthStatus;

      set({ setupMode: status.setupMode, devMode: status.devMode });

      // In dev mode, if we have a dev session ID, set the cookie and try to auth
      if (status.devMode && status.devSessionId) {
        // The backend has already created the session; set the cookie client-side
        // so subsequent requests include it
        document.cookie = `desktalk_session=${status.devSessionId}; path=/; samesite=strict; max-age=${7 * 24 * 60 * 60}`;
      }

      if (status.setupMode) {
        set({ user: null, loading: false });
        return;
      }

      // Try to get current user
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const user = (await meRes.json()) as AuthUser;
        set({ user, loading: false });
      } else {
        set({ user: null, loading: false });
      }
    } catch (err) {
      set({ user: null, loading: false, error: (err as Error).message });
    }
  },

  login: async (username: string, password: string) => {
    set({ error: null });
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error: string };
      set({ error: body.error });
      throw new Error(body.error);
    }

    const user = (await res.json()) as AuthUser;
    set({ user, error: null });
  },

  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    set({ user: null });
  },

  completeOnboard: async () => {
    const res = await fetch('/api/auth/onboard', { method: 'POST' });
    if (res.ok) {
      const user = (await res.json()) as AuthUser;
      set({ user });
    }
  },

  createFirstAdmin: async (username: string, password: string) => {
    set({ error: null });
    // In setup mode, create the first user via the users endpoint (no auth required)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error: string };
      set({ error: body.error });
      throw new Error(body.error);
    }

    // Now login as that user
    const loginRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (loginRes.ok) {
      const user = (await loginRes.json()) as AuthUser;
      set({ user, setupMode: false, error: null });
    }
  },
}));
