'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Locale, ThemePreference } from '@truenorth/core';
import { getDictionary, type Dictionary } from './i18n/dictionary';

/**
 * Per-viewer preferences: language, theme and reduced transparency. These are
 * conveniences, so they live in localStorage and every access is guarded — a
 * private window or a browser blocking site data must still render correctly.
 */

const STORAGE_KEY = 'truenorth.preferences';

interface Preferences {
  locale: Locale;
  theme: ThemePreference;
  reduceTransparency: boolean;
}

const DEFAULTS: Preferences = {
  locale: 'es',
  theme: 'system',
  reduceTransparency: false,
};

interface PreferencesValue extends Preferences {
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemePreference) => void;
  setReduceTransparency: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

function read(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      locale: parsed.locale === 'en' ? 'en' : 'es',
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : 'system',
      reduceTransparency: Boolean(parsed.reduceTransparency),
    };
  } catch {
    return DEFAULTS;
  }
}

function write(prefs: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage can throw outright (private mode, blocked site data). The app
    // works without persistence, so this is not worth surfacing.
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    setPrefs(read());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
    root.setAttribute('data-reduce-transparency', String(prefs.reduceTransparency));
    root.lang = prefs.locale;
  }, [prefs.theme, prefs.reduceTransparency, prefs.locale]);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      write(next);
      return next;
    });
  }, []);

  const value = useMemo<PreferencesValue>(
    () => ({
      ...prefs,
      t: getDictionary(prefs.locale),
      setLocale: (locale) => update({ locale }),
      setTheme: (theme) => update({ theme }),
      setReduceTransparency: (reduceTransparency) => update({ reduceTransparency }),
    }),
    [prefs, update],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}

/** Shorthand for components that only need the strings. */
export function useT(): Dictionary {
  return usePreferences().t;
}
