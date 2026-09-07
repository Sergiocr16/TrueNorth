'use client';

import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { firebase, vapidKey } from './firebase';

/**
 * Push on this device.
 *
 * A token identifies one browser on one device, so it lives in two places: on
 * the user's document, where the server reads it to send, and in this
 * browser's storage, so the toggle knows whether *this* device is the one
 * subscribed. On iOS all of this only works inside the app installed from
 * "Add to Home Screen"; Safari itself never gets a token.
 */

const TOKEN_KEY = 'truenorth.pushToken';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export function currentPushToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function pushSupport(): Promise<'unsupported' | 'denied' | 'ok'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (!(await isSupported())) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

/** The worker is registered with the public config, which it cannot import. */
async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const query = new URLSearchParams({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  });
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query.toString()}`);
}

/** Asks permission, subscribes this device, and records the token. */
export async function enablePush(uid: string): Promise<PushState> {
  const support = await pushSupport();
  if (support !== 'ok') return support;
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';

  const { app, db } = firebase();
  const registration = await registerWorker();
  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return 'off';

  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* the server still has it; the toggle just cannot remember */
  }
  return 'on';
}

/**
 * While the app is open, Firebase hands a message to the page instead of the
 * worker, and nothing would show. This shows it the same way the worker
 * does, so a reminder still appears while the person is looking at the app.
 * Returns the function that stops listening.
 */
export async function listenForeground(): Promise<() => void> {
  if ((await pushSupport()) !== 'ok' || Notification.permission !== 'granted' || !currentPushToken()) {
    return () => undefined;
  }
  const { app } = firebase();
  const registration =
    (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ?? (await registerWorker());
  return onMessage(getMessaging(app), ({ data }) => {
    void registration.showNotification(data?.title ?? 'TrueNorth', {
      body: data?.body ?? '',
      icon: '/icons/192',
      badge: '/icons/192m',
      tag: data?.tag ?? 'truenorth',
      data: { url: data?.url ?? '/today' },
    });
  });
}

/** Unsubscribes this device and forgets its token. */
export async function disablePush(uid: string): Promise<void> {
  const token = currentPushToken();
  const { app, db } = firebase();
  if (token) await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
  try {
    if (await isSupported()) await deleteToken(getMessaging(app));
  } catch {
    /* already gone */
  }
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to forget */
  }
}
