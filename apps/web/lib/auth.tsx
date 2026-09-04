'use client';

import {
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { firebase, isFirebaseConfigured } from './firebase';

/**
 * Authentication: email and password, sign-in only.
 *
 * There is deliberately no sign-up screen. Accounts are created by the
 * administrator in the Firebase console, so the list of people who can even
 * attempt to sign in is a decision rather than an open door. Until a callable
 * Cloud Function exists, "the administrator creates a user" means Firebase
 * console → Authentication → Users → Add user.
 *
 * Having an account still grants nothing on its own: the security rules show a
 * person a company only once somebody inside it has invited their address and
 * they have redeemed the invitation.
 */

export interface AuthState {
  /** null while we do not yet know, which is different from signed out. */
  user: FirebaseUser | null;
  loading: boolean;
  configured: boolean;
  error: string | null;
  notice: string | null;
  /** True once signed in with an address the person has not confirmed. */
  needsVerification: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  reloadUser: () => Promise<void>;
  clearMessages: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Mirrors the signed-in account into `users/{uid}`. Written on every sign-in so
 * a changed display name follows along, but preferences already stored there
 * are left alone.
 */
async function ensureUserDocument(user: FirebaseUser): Promise<void> {
  const { db } = firebase();
  const ref = doc(db, 'users', user.uid);
  const existing = await getDoc(ref);

  const identity = {
    displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Sin nombre',
    email: user.email ?? '',
    emailVerified: user.emailVerified,
    lastSeenAt: serverTimestamp(),
  };

  if (existing.exists()) {
    await setDoc(ref, identity, { merge: true });
    return;
  }

  await setDoc(ref, {
    ...identity,
    createdAt: serverTimestamp(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Costa_Rica',
    notifyHour: 6,
    locale: 'es',
    theme: 'system',
    reduceTransparency: false,
    fcmTokens: [],
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const { auth } = firebase();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
      if (next) void ensureUserDocument(next).catch((cause) => setError(describe(cause)));
    });
  }, []);

  const signIn = useCallback(async (address: string, password: string) => {
    setError(null);
    setNotice(null);
    try {
      const { auth } = firebase();
      await signInWithEmailAndPassword(auth, address.trim(), password);
    } catch (cause) {
      setError(describe(cause));
    }
  }, []);

  const resetPassword = useCallback(async (address: string) => {
    setError(null);
    setNotice(null);
    try {
      const { auth } = firebase();
      await sendPasswordResetEmail(auth, address.trim());
      setNotice(`Te mandamos un enlace para cambiar la contraseña a ${address.trim()}.`);
    } catch (cause) {
      setError(describe(cause));
    }
  }, []);

  const resendVerification = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      const { auth } = firebase();
      if (!auth.currentUser) return;
      await sendEmailVerification(auth.currentUser);
      setNotice('Te mandamos el correo de confirmación otra vez.');
    } catch (cause) {
      setError(describe(cause));
    }
  }, []);

  /** After confirming by email, the token still says unverified until reload. */
  const reloadUser = useCallback(async () => {
    const { auth } = firebase();
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    // Force a fresh ID token so the rules see email_verified.
    await auth.currentUser.getIdToken(true);
    setUser({ ...auth.currentUser } as FirebaseUser);
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = firebase();
    await fbSignOut(auth);
  }, []);

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      configured: isFirebaseConfigured,
      error,
      notice,
      needsVerification: Boolean(user && !user.emailVerified),
      signIn,
      resetPassword,
      resendVerification,
      reloadUser,
      clearMessages,
      signOut,
    }),
    [
      user,
      loading,
      error,
      notice,
      signIn,
      resetPassword,
      resendVerification,
      reloadUser,
      clearMessages,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** Firebase error codes are not for people. Translate the ones we cause. */
function describe(cause: unknown): string {
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.';
    case 'auth/invalid-email':
      return 'Ese correo no parece válido.';
    case 'auth/weak-password':
      return 'La contraseña necesita al menos seis caracteres.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
    case 'auth/network-request-failed':
      return 'No hay conexión con Firebase. Revisá tu red.';
    case 'auth/unauthorized-domain':
      return 'Este dominio no está autorizado en Firebase Authentication.';
    case 'auth/operation-not-allowed':
      return 'El ingreso con correo y contraseña está desactivado en la consola de Firebase.';
    case 'auth/user-disabled':
      return 'Esta cuenta está desactivada. Hablá con el administrador.';
    case 'permission-denied':
      return 'Tu cuenta todavía no tiene acceso. Pedí una invitación al administrador.';
    default:
      return cause instanceof Error ? cause.message : 'Algo salió mal al ingresar.';
  }
}
