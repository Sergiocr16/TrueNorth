import 'server-only';

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { accessSync, constants, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/**
 * The Admin SDK, for the server only.
 *
 * It bypasses every security rule, which is the point — the engine writes
 * plans and analyses that no client may — and also the danger. Nothing in
 * this module may be imported by browser code; `server-only` makes that a
 * build error rather than a leak.
 *
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS: on the Pi that is
 * /etc/truenorth/service-account.json, on a development machine a key kept
 * outside the repository. That file never enters the repo, and
 * `adminCredentials()` refuses it if the path points inside one.
 */

let app: App | null = null;

/** Where the key is, if a path was configured at all. */
function keyPath(): string | null {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw) return null;
  const expanded = raw.startsWith('~') ? raw.replace('~', homedir()) : raw;
  return resolve(expanded);
}

export interface CredentialStatus {
  ok: boolean;
  /** One sentence naming what is missing and what to do about it. */
  detail: string;
}

/**
 * What the server has to work with. Called before any route does real work, so
 * a missing key is explained rather than thrown as a stack trace.
 */
export function adminCredentials(): CredentialStatus {
  const path = keyPath();

  if (!path) {
    // Application Default Credentials: how a Google-hosted runtime works, and
    // how a developer machine works after `gcloud auth application-default
    // login`. Neither applies on the Pi.
    if (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT) {
      return { ok: true, detail: 'using application default credentials' };
    }
    return {
      ok: false,
      detail:
        'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at a service-account key kept outside the repository (on the Pi: /etc/truenorth/service-account.json).',
    };
  }

  // A key inside the working tree is one `git add .` away from being published.
  // The server runs from apps/web, so the repository root is two levels up.
  const repoRoot = resolve(process.cwd(), '..', '..');
  if (path.startsWith(`${repoRoot}/`) || path.startsWith(`${process.cwd()}/`)) {
    return {
      ok: false,
      detail: `The service-account key at ${path} is inside the repository. Move it outside the working tree; a key in the repo is one commit away from being published.`,
    };
  }

  try {
    accessSync(path, constants.R_OK);
  } catch {
    return {
      ok: false,
      detail: `No readable service-account key at ${path}. Download one from the Firebase console (Project settings → Service accounts → Generate new private key) and save it there.`,
    };
  }

  return { ok: true, detail: `using the service-account key at ${path}` };
}

/** Whether the server has credentials at all; used to explain rather than crash. */
export function adminConfigured(): boolean {
  return adminCredentials().ok;
}

function init(): App {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }

  const status = adminCredentials();
  if (!status.ok) throw new Error(status.detail);

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const path = keyPath();

  if (path) {
    // The path is runtime configuration, not something to bundle: the key is
    // read from wherever the machine keeps it.
    const key = JSON.parse(
      readFileSync(/* turbopackIgnore: true */ path, 'utf8'),
    ) as Parameters<typeof cert>[0];
    app = initializeApp({ credential: cert(key), projectId, storageBucket });
  } else {
    app = initializeApp({ projectId, storageBucket });
  }
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(init());
}

export function adminAuth(): Auth {
  return getAuth(init());
}

export function adminMessaging(): Messaging {
  return getMessaging(init());
}

/**
 * The default Storage bucket, named explicitly.
 *
 * The name is not taken from the app's options: another module may already
 * have initialised the app, and an app created without `storageBucket` cannot
 * be given one afterwards. Naming the bucket at the call site makes the order
 * of initialisation irrelevant.
 */
export function adminBucket() {
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!name) throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set');
  return getStorage(init()).bucket(name);
}
