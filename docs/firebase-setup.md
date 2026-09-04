# Firebase setup

What to create in the console, in order, and where each value goes. Nothing in
this checklist requires sharing a credential over chat.

## 1. Create the project

Firebase console → **Add project** → name it `truenorth-155de`.
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
| **Authentication** | Build → Authentication → Sign-in method | Enable **Email/Password** only. Leave the *Email link (passwordless)* sub-toggle **off**, and do not enable Google | Signing in |
| **Firestore** | Build → Firestore Database → Create | **Production mode**, region `nam5` or `us-central1` | Everything |
| **Storage** | Build → Storage | Same region. Holds voice recordings only | Voice |
| **Cloud Messaging** | ⚙️ → Project settings → **Cloud Messaging** tab → Web configuration → **Web Push certificates** → Generate key pair. Direct link: `console.firebase.google.com/project/_/settings/cloudmessaging` | The public key, a long string starting with `B`, is the VAPID value | Push notifications |
| ~~App Hosting~~ | — | Not used: the app is served from the Raspberry Pi (ADR-005). If a backend was created, delete it so it does not bill or build. | — |

Two traps in that Messaging row, both of which have already cost time:

- **Messaging in the left sidebar is not it.** That is the campaign composer and
  only ever offers "create your first campaign". The Web Push certificate lives
  in *project settings*, behind the gear icon.
- **The Web configuration section only appears once a web app is registered.**
  If the section is missing, do step 3 first.

Also worth knowing before testing push: on iPhone, web push only works when the
PWA has been **added to the home screen**. In Safari as a normal tab, iOS
delivers nothing no matter what permission was granted. Android works either
way.

### By hand, in the Google Cloud console (same project)

| API | Needed for |
| --- | --- |
| **Cloud Speech-to-Text** | Optional. Transcription runs on the Pi with Whisper (`docs/pi-setup.md` §4b); enable this only if that proves too slow or inaccurate in real use |

### Not used

Cloud Functions, Cloud Scheduler and Secret Manager are **not** part of this
setup: the engine, the daily timer and the secrets all live on the Raspberry Pi
(ADR-005, `docs/pi-setup.md`). Blaze is still required, because Storage,
Speech-to-Text and outbound calls from the Pi's service account need it.

## 3. Register the web app

Project settings → **Your apps** → **Web** (`</>`) → nickname `TrueNorth web`.

Firebase shows a config object. Copy those six values into `apps/web/.env.local`
(create it from `apps/web/.env.example`):

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=truenorth-155de.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=truenorth-155de
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=truenorth-155de.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
```

**These seven values are public.** They ship inside the JavaScript bundle every
visitor downloads. What protects the data is `firestore.rules`, not secrecy
here. `.env.local` is gitignored anyway, which keeps the repo clean rather than
secret.

## 3b. Creating people's accounts

There is no sign-up screen, by design: **you create every account**. Until a
callable Cloud Function exists, that means:

1. Firebase console → **Authentication → Users → Add user**.
2. Enter their email and a temporary password, and pass both to them.
3. In TrueNorth, open **Equipo → Compartir con alguien**, enter that same
   address, give them a role, and send the invitation.
4. They sign in, confirm their address from the email Firebase sends, and the
   app puts them straight into the company.

Two things worth knowing about that flow:

- **Confirming the address is not optional.** With password sign-in anyone can
  type any address at sign-up, so the rules refuse to redeem an invitation for
  an unverified account. Firebase sends the confirmation mail automatically.
- **An account on its own grants nothing.** Somebody who has credentials but no
  invitation sees a screen telling them so, and no data.

Only the addresses listed in `founders()` inside `firestore.rules` can create a
company from scratch. Everyone else joins by invitation. Members can invite each
other, because sharing a company or a project is their decision, not yours.

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
- [ ] Email/Password enabled, passwordless link and Google left off
- [ ] Firestore created in production mode
- [ ] Web app registered, values in `apps/web/.env.local`
- [ ] `.firebaserc` set from the example
- [ ] Rules and indexes deployed

Needed later, per phase:

- [ ] Storage created — voice
- [ ] Web Push certificate generated — push notifications
- [ ] Speech-to-Text API — optional; only if Whisper on the Pi falls short
- [ ] The Pi set up per `docs/pi-setup.md` — serving the app
- [ ] Trigger Email extension over Resend — the email fallback

Deliberately not yet:

- [ ] Service-account key generated **only when the Pi is being set up**, copied
      over with scp, kept off the repo and out of any chat

## Server credentials (the Admin SDK)

The browser uses the public web config, which ships in the bundle by design.
The engine is different: it writes plans and analyses that no client may write,
so it runs with a service-account key that bypasses the security rules. That
key is a secret. It never goes in the repo, in `.env.local` as a literal, or
into a chat window — only its **path** is configuration.

Generate one in the Firebase console: *Project settings → Service accounts →
Generate new private key*. It downloads as a JSON file.

**On a development machine**, keep it outside the working tree:

```bash
mkdir -p ~/.config/truenorth && chmod 700 ~/.config/truenorth
mv ~/Downloads/truenorth-*-firebase-adminsdk-*.json ~/.config/truenorth/service-account.json
chmod 600 ~/.config/truenorth/service-account.json
```

`apps/web/.env.local` then holds the path only:

```
GOOGLE_APPLICATION_CREDENTIALS=/Users/<you>/.config/truenorth/service-account.json
```

**On the Pi** the same file lives at `/etc/truenorth/service-account.json`,
owned by the `truenorth` user with mode 600, and the path is set in
`/etc/truenorth/env`. See `docs/pi-setup.md`.

The engine refuses to start if the path is empty, unreadable, or inside the
repository, and says which of the three it was. Without it, the app still runs:
the two routes that write answer 503 and the rest of the screens are unaffected.
Generate a separate key per machine, and revoke one in the console the moment a
machine is lost.

### Why logo uploads go through the server

`storage.rules` used to authorise the browser to write a logo by checking
membership in Firestore:

```
firestore.exists(/databases/(default)/documents/companies/$(companyId)/members/$(request.auth.uid))
```

That is a *cross-service* rule, and it does not work on permission alone: the
Cloud Storage rules engine needs its own IAM grant to read Firestore, which
deploying the rules with the CLI does not create. The rule failed closed, and
from the browser that is indistinguishable from being denied —
`storage/unauthorized`, even for a legitimate member.

Rather than depend on a console click that is invisible in the repository, the
upload moved to `POST /api/company/logo`. The route verifies the caller's ID
token, checks membership with the Admin SDK, validates the type and the 2 MB
limit, writes the object, and updates `logoUrl` on the company. Clients no
longer touch the `logos/` folder at all, so its rule is now `if false` for both
read and write.

Reading still works from a plain `<img src>` because the object is saved with a
`firebaseStorageDownloadTokens` metadata value and the route returns the
matching download URL. That URL authenticates with its own token, not with the
Storage rules, so nothing has to be made public and no signed URL expires.

The same shape applies to anything else the browser cannot be trusted to write
directly: verify the token, check membership, write with the Admin SDK.
