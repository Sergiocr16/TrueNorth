import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { adminAuth, adminBucket, adminCredentials, adminDb } from '../../../../server/admin';

/**
 * Company logo upload.
 *
 * The browser used to write straight to Storage, and the rule that authorised
 * it read Firestore to check membership. That is a cross-service rule, and it
 * needs a grant the CLI does not create, so every upload came back as
 * `storage/unauthorized`. Rather than depend on a console click, the write
 * happens here: the ID token is verified, membership is checked with the Admin
 * SDK, and the object is written by the server. Clients no longer touch the
 * logos folder at all — see `storage.rules`.
 *
 * The object is saved with a Firebase download token, which is what makes the
 * returned URL work in a plain `<img src>` without a signed URL that expires
 * or a bucket that is public.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Kept in step with the note under the picker and with the old Storage rule. */
const MAX_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  const idToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!idToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'malformed_upload' }, { status: 400 });
  }

  const companyId = String(form.get('companyId') ?? '');
  const file = form.get('file');
  if (!companyId || !(file instanceof File)) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // What the rules would have checked, checked here instead.
  const member = await adminDb()
    .collection('companies')
    .doc(companyId)
    .collection('members')
    .doc(uid)
    .get();
  if (!member.exists) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const extension = EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: 'not_an_image' }, { status: 415 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
  }

  const bucket = adminBucket();
  const name = `logos/${companyId}/logo.${extension}`;
  const token = randomUUID();

  await bucket.file(name).save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    metadata: {
      cacheControl: 'public, max-age=3600',
      // This token is what the download URL below authenticates with.
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  // A previous logo in another format would otherwise sit there for ever,
  // still served by its own URL. One logo per company, one object.
  const [existing] = await bucket.getFiles({ prefix: `logos/${companyId}/` });
  await Promise.all(
    existing.filter((f) => f.name !== name).map((f) => f.delete().catch(() => undefined)),
  );

  const logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    name,
  )}?alt=media&token=${token}`;

  await adminDb().collection('companies').doc(companyId).update({ logoUrl });

  return NextResponse.json({ logoUrl });
}
