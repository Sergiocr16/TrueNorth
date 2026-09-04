import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

/**
 * The Firebase client.
 *
 * Every value in this config is public by design: it ships inside the bundle
 * any visitor downloads. What protects the data is firestore.rules, not secrecy
 * here. The one credential that is genuinely secret, the service-account key,
 * never reaches the browser: it belongs to the Cloud Functions and the
 * Raspberry Pi worker.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Whether the app has been given a project to talk to. The UI uses this to
 * explain itself rather than throw: a checkout with no `.env.local` should say
 * so plainly instead of failing with an SDK error nobody can read.
 */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

let cached: {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
} | null = null;

/**
 * Initialises once and reuses. Called lazily rather than at module load so a
 * server render never touches the client SDK, and so an unconfigured build
 * still compiles.
 */
export function firebase() {
  if (cached) return cached;
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase is not configured. Copy apps/web/.env.example to .env.local and fill it in.',
    );
  }

  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (useEmulators) {
    // Guarded so hot reload does not connect twice, which the SDK rejects.
    const w = window as unknown as { __tnEmulators?: boolean };
    if (!w.__tnEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      w.__tnEmulators = true;
    }
  }

  // Survive a reload and, on an installed PWA, a cold launch.
  void setPersistence(auth, browserLocalPersistence);

  cached = { app, auth, db, storage };
  return cached;
}

export const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';
