import 'server-only';

import { adminMessaging } from './admin';

/**
 * Sending push from the Pi. One multicast to a person's devices, carrying
 * both a `notification` block and the same text as data: iOS shows a
 * notification message on its own while the app is closed — a data-only
 * message waited until the app was opened — and the data is what the
 * service worker and the page read for the tag and where a tap opens.
 * Tokens that Firebase reports dead are removed from the profile, so a
 * wiped phone stops being tried.
 */

export interface PushData {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Gone, or never a token at all: either way it will never deliver. */
const DEAD_TOKEN_CODES = ['registration-token-not-registered', 'invalid-registration-token', 'invalid-argument'];

/** The routes the Pi's timers call: a shared secret, nothing else. */
export function authorizedByLocalToken(request: Request): boolean {
  const expected = process.env.ENGINE_LOCAL_TOKEN;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(expected) && provided === expected;
}

export async function sendToTokens(
  profileRef: FirebaseFirestore.DocumentReference,
  tokens: string[],
  data: PushData,
): Promise<{ sent: number; dead: string[] }> {
  if (tokens.length === 0) return { sent: 0, dead: [] };
  const result = await adminMessaging().sendEachForMulticast({
    tokens,
    notification: { title: data.title, body: data.body },
    data: { ...data },
    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { 'content-available': 1 } } },
    webpush: {
      headers: { Urgency: 'high', TTL: '600' },
      notification: { icon: '/icons/192', badge: '/icons/192m', tag: data.tag },
    },
  });
  const dead = result.responses
    .map((r, i) => (r.success ? null : { token: tokens[i]!, code: r.error?.code ?? '' }))
    .filter((x): x is { token: string; code: string } => Boolean(x))
    .filter((x) => DEAD_TOKEN_CODES.some((code) => x.code.includes(code)))
    .map((x) => x.token);
  if (dead.length > 0) {
    await profileRef.update({ fcmTokens: tokens.filter((t) => !dead.includes(t)) });
  }
  return { sent: result.successCount, dead };
}
