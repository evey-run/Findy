import { create } from 'zustand';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
}

interface AuthState {
  user: AuthUser | null;
  checked: boolean; // true after the first /api/auth/me probe
  signupOpen: boolean; // true if registration is still allowed
  loading: boolean;
  error: string | null;
  fetchMe: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  checked: false,
  signupOpen: false,
  loading: false,
  error: null,

  fetchMe: async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const { user } = await res.json();
        set({ user, checked: true });
      } else {
        set({ user: null, checked: true });
      }
    } catch {
      set({ user: null, checked: true });
    }
  },

  fetchStatus: async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const { signupOpen } = await res.json();
        set({ signupOpen });
      }
    } catch {
      // ignore
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Login failed');
      }
      const { user } = await res.json();
      set({ user, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Login failed' });
      throw err;
    }
  },

  register: async (name, email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Registration failed');
      }
      const { user } = await res.json();
      set({ user, loading: false, signupOpen: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Registration failed' });
      throw err;
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    set({ user: null });
  },
}));
