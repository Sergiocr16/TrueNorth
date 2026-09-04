# Firebase setup

What to create in the console, in order, and where each value goes. Nothing in
this checklist requires sharing a credential over chat.

## 1. Create the project

Firebase console → **Add project** → name it `truenorth-aditum`.
Disable Google Analytics; nothing here needs it.

Then **upgrade to the Blaze plan**. This is not optional: Cloud Functions on
the free plan cannot call external APIs, and TrueNorth calls both Notion and
Anthropic. Set a **budget alert** at whatever number makes you comfortable —
at this scale the Firebase side stays inside the free allowances and the real
cost is the model.

## 2. Enable the services

### By hand, in the Firebase console

| Service | Where | Setting | Needed for |
| --- | --- | --- | --- |
| **Authentication** | Build → Authentication | Enable **Google** *and* **Email link (passwordless sign-in)** — both, not just one | Signing in |
| **Firestore** | Build → Firestore Database → Create | **Production mode**, region `nam5` or `us-central1` | Everything |
| **Storage** | Build → Storage | Same region. Holds voice recordings only | Voice |
| **Cloud Messaging** | Project settings → Cloud Messaging | Generate a **Web Push certificate** key pair. The public key is the VAPID value | Push notifications |
| **App Hosting** | Build → App Hosting | Connect the GitHub repo, root `apps/web` | Deploying |

### By hand, in the Google Cloud console (same project)

| API | Needed for |
| --- | --- |
| **Cloud Speech-to-Text** | Transcribing dictated updates |

### Enabled automatically

You do not need to turn these on yourself. The first `firebase deploy` asks to
enable whatever it needs and does it for you:

- Cloud Functions, Cloud Build, Artifact Registry, Eventarc, Pub/Sub
- **Cloud Scheduler** — enabled when the first scheduled function deploys
- **Secret Manager** — enabled when a function first declares a secret

All of that requires the Blaze plan, which is why step 1 comes first.

## 3. Register the web app

Project settings → **Your apps** → **Web** (`</>`) → nickname `TrueNorth web`.

Firebase shows a config object. Copy those six values into `apps/web/.env.local`
(create it from `apps/web/.env.example`):

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=truenorth-aditum.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=truenorth-aditum
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=truenorth-aditum.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
```

**These seven values are public.** They ship inside the JavaScript bundle every
visitor downloads. What protects the data is `firestore.rules`, not secrecy
here. `.env.local` is gitignored anyway, which keeps the repo clean rather than
secret.

## 4. The one file that is actually secret

Project settings → **Service accounts** → *Generate new private key* produces a
JSON containing `"type": "service_account"` and `"private_key"`.

That file bypasses every security rule in this repo. Treat it accordingly:

- **Never** paste it into a chat, an issue, or a commit.
- It is only needed by the Cloud Functions (which get credentials automatically
  and need no file) and by the **Raspberry Pi worker**.
- On the Pi: store it at `/etc/truenorth/service-account.json`, owned by the
  service user, mode `600`, on an encrypted disk.
- If it ever leaks, revoke it in the same screen and generate a new one.

Generate it when the worker is built, not before.

## 5. Deploy the rules

```bash
cp .firebaserc.example .firebaserc     # then set your project id
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

## 6. Local development against the emulators

```bash
npx firebase-tools emulators:start
# then in apps/web/.env.local
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

The emulator suite runs Auth, Firestore, Functions and Storage locally, with a
UI on `http://localhost:4000`. Rule tests run against it, and no real data is
touched.

## 7. Extensions and third parties, when their phase arrives

- **Trigger Email** extension (Extensions → browse) pointed at the `mail`
  collection, using Resend SMTP. Needed for the daily email fallback.
- **Notion**: create a public integration at
  `notion.so/my-integrations`, set the OAuth redirect to the deployed callback,
  and store the client secret in **Secret Manager**, never in the repo.
- **Anthropic API key**: only for the fallback path. Secret Manager as well,
  with a spend cap set in the Anthropic console.

## Checklist

Needed before the app can talk to Firebase at all:

- [ ] Project created, **Blaze enabled**, budget alert set
- [ ] Google **and** email-link sign-in both enabled
- [ ] Firestore created in production mode
- [ ] Web app registered, values in `apps/web/.env.local`
- [ ] `.firebaserc` set from the example
- [ ] Rules and indexes deployed

Needed later, per phase:

- [ ] Storage created — voice
- [ ] Web Push certificate generated — push notifications
- [ ] Speech-to-Text API enabled in GCP — voice
- [ ] App Hosting backend connected to GitHub — deploying
- [ ] Trigger Email extension over Resend — the email fallback

Deliberately not yet:

- [ ] Service-account key **not** generated (wait until the Raspberry Pi worker
      exists, then keep it off the repo and out of any chat)
