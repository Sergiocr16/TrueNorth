# Raspberry Pi setup

The Pi is the server: it runs the Next.js app, Claude Code and the daily timer,
and is reached over Tailscale. This is the runbook, in order. Nothing here is
optional except where it says so.

## 1. Hardware

- Raspberry Pi 5, 8 GB.
- NVMe HAT with an NVMe drive, or a USB SSD. **Not an SD card**: they fail under
  continuous writes, and this machine writes every minute.
- A small UPS. A power cut at 02:00 is a morning with no plan.
- Wired Ethernet if at all possible.

## 2. Operating system

Ubuntu Server 24.04 LTS, arm64. During install: enable SSH, create the user
`truenorth`, and enable **full-disk encryption** — customer data passes through
this machine, and a stolen drive should be worthless.

After first boot:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
sudo timedatectl set-timezone America/Costa_Rica
```

The timezone matters: the 02:00 timer and every date in the app assume it.

## 3. Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
```

Sign in with the same Tailscale account as the phone. `--ssh` lets you reach
the Pi with `ssh truenorth@<pi-name>` from anywhere, with no port open on the
router. Then, in the Tailscale admin console, enable **HTTPS certificates** and
**MagicDNS** for the tailnet — that is what gives the app a real certificate.

Turn off the SSH server's password login once Tailscale SSH works:

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## 4. Node, pnpm, Claude Code

Match the versions the repo pins (`.nvmrc`, `packageManager` in `package.json`).

```bash
# as the truenorth user
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
source ~/.bashrc
nvm install 26.8.1 && nvm alias default 26.8.1
npm i -g pnpm@11

curl -fsSL https://claude.ai/install.sh | bash
claude --version
claude            # sign in with the subscription; follow the prompt, then exit
```

Confirm headless mode answers before going further:

```bash
echo 'Reply with the single word ok.' | claude -p --output-format json
```

If that returns JSON with `"result": "ok"`, the engine will work.

## 4b. Whisper, for voice — skip until voice lands

Voice dictation is not built yet. When it is, transcription runs on the Pi too,
so audio never leaves the house. Build whisper.cpp and fetch the multilingual
`small` model:

```bash
sudo apt install -y cmake ffmpeg
git clone https://github.com/ggml-org/whisper.cpp /opt/whisper
cd /opt/whisper && cmake -B build && cmake --build build -j4 --config Release
sh ./models/download-ggml-model.sh small
```

Check it understands Spanish before wiring anything:

```bash
ffmpeg -i prueba.m4a -ar 16000 -ac 1 -c:a pcm_s16le prueba.wav
./build/bin/whisper-cli -m models/ggml-small.bin -l es -f prueba.wav \
  --prompt "TAR-966, Portal de proveedores, Módulo financiero, Pruebas QA, Depende de otra TAR"
```

The `--prompt` is the vocabulary hint; the server builds it from the company's
real project names, task codes, people and Notion statuses on every call.

Expect the `small` model to take roughly two to three times the length of the
clip on a Pi 5, so a 30-second update is a 45 to 90 second wait. That is fine
for a flow that ends in cards you review. If it proves too slow or too
inaccurate in real use, `base` is faster and weaker, and Google Speech-to-Text
(see `docs/firebase-setup.md`) is the cloud alternative — but measure with real
dictations before switching.

Add to `/etc/truenorth/env`:

```bash
WHISPER_BIN=/opt/whisper/build/bin/whisper-cli
WHISPER_MODEL=/opt/whisper/models/ggml-small.bin
```

## 5. The repository and its secrets

```bash
sudo mkdir -p /opt/truenorth /etc/truenorth
sudo chown truenorth:truenorth /opt/truenorth /etc/truenorth
git clone --branch production https://github.com/Sergiocr16/TrueNorth.git /opt/truenorth
```

Two files go in `/etc/truenorth/`, and only there:

**`service-account.json`** — from Firebase console → Project settings → Service
accounts → *Generate new private key*. This is the one genuinely secret
credential in the whole system. Copy it over with `scp` through Tailscale, never
paste it anywhere.

```bash
chmod 600 /etc/truenorth/service-account.json
```

**`env`** — the server's environment:

```bash
# /etc/truenorth/env
NODE_ENV=production
PORT=3000

# Firebase — the same values as apps/web/.env.local on the laptop. The
# NEXT_PUBLIC_ ones are baked into the bundle at build time, so a change here
# needs `pnpm build` again, not just a restart.
GOOGLE_APPLICATION_CREDENTIALS=/etc/truenorth/service-account.json
NEXT_PUBLIC_FIREBASE_API_KEY=…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=truenorth-155de.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=truenorth-155de
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=truenorth-155de.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
NEXT_PUBLIC_FIREBASE_APP_ID=…
NEXT_PUBLIC_FIREBASE_VAPID_KEY=…

# Engine
ENGINE_LOCAL_TOKEN=…            # long random string; the timer and the selftest send it
ENGINE_AUTH=subscription        # or api_key
ANTHROPIC_API_KEY=              # only if ENGINE_AUTH=api_key
ENGINE_MODEL=claude-opus-5      # pinned: the analysis, plans and follow-up all use it
ASK_MODEL=claude-sonnet-5       # the assistant: one question, seconds not a minute
CLAUDE_BIN=/home/truenorth/.local/bin/claude
ENGINE_WORKDIR=/var/tmp/truenorth-engine   # empty dir the child runs in; created if missing
WORKER_ID=pi-01                 # the heartbeat document the app watches

# Notion — when the sync (ADR-006 "Fase 0") lands. Two databases.
NOTION_TOKEN=…
NOTION_TASKS_DB=…               # "Tareas Software"
NOTION_BACKLOG_DB=…             # "ADITUM Backlog"
```

```bash
chmod 600 /etc/truenorth/env
openssl rand -hex 32            # a good ENGINE_LOCAL_TOKEN
```

Sign-in is refused from any domain Firebase Authentication does not know, so
the Pi's tailnet name has to be on its authorized-domains list. The repo
carries a script that adds it with the service account, no console needed:

```bash
cd /opt/truenorth/apps/web
GOOGLE_APPLICATION_CREDENTIALS=/etc/truenorth/service-account.json \
  node scripts/authorize-domain.mjs truenorth.<tailnet>.ts.net
```

## 5b. Firestore rules and indexes — from the laptop, once

The rules and indexes live in the repo (`firestore.rules`,
`firestore.indexes.json`, `storage.rules`) but they only take effect when
deployed, and **an undeployed rule fails closed**: a new collection reads as
"insufficient permissions" until this runs. Do it from the laptop, where
`firebase-tools` is signed in, every time those files change:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

The rules have emulator tests; they need Java 21 or newer on the machine that
runs them (`/usr/libexec/java_home -v 21` on a Mac picks it):

```bash
npx firebase-tools emulators:exec --only firestore \
  "pnpm --filter @truenorth/core exec vitest run src/rules.test.ts"
```

## 6. Build and run as a service

```bash
cd /opt/truenorth
pnpm install --frozen-lockfile
pnpm build
```

`/etc/systemd/system/truenorth.service`:

```ini
[Unit]
Description=TrueNorth web app and engine
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=truenorth
WorkingDirectory=/opt/truenorth/apps/web
EnvironmentFile=/etc/truenorth/env
Environment=PATH=/home/truenorth/.nvm/versions/node/v26.8.1/bin:/home/truenorth/.local/bin:/usr/bin:/bin
ExecStart=/home/truenorth/.nvm/versions/node/v26.8.1/bin/node ../../node_modules/next/dist/bin/next start -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

The `PATH` line is what lets the server find `claude` when it spawns it.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now truenorth
sudo systemctl status truenorth
curl -s http://localhost:3000/sign-in | head -c 200
```

## 7. HTTPS through Tailscale

```bash
sudo tailscale serve --bg --https=443 http://localhost:3000
tailscale serve status
```

The app is now at `https://<pi-name>.<tailnet>.ts.net` from any device on the
tailnet, with a certificate the phone trusts. Open it on the phone, sign in,
and use *Add to Home Screen*: that is the installed PWA, and the only mode in
which iOS delivers push.

## 8. The daily timer

`/etc/systemd/system/truenorth-daily.service`:

```ini
[Unit]
Description=TrueNorth daily engine run

[Service]
Type=oneshot
User=truenorth
EnvironmentFile=/etc/truenorth/env
# A full run is minutes, not seconds: one analysis, one plan per person, one
# follow-up per manager, each a model call. Give curl the same patience the
# route has (maxDuration 1800).
ExecStart=/usr/bin/curl -fsS --max-time 1800 -X POST -H "Authorization: Bearer ${ENGINE_LOCAL_TOKEN}" http://localhost:3000/api/engine/daily
```

`/etc/systemd/system/truenorth-daily.timer`:

```ini
[Unit]
Description=Run the TrueNorth engine every morning

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

`Persistent=true` means a run missed because the Pi was off happens as soon as
it comes back, rather than being skipped. Add `ENGINE_LOCAL_TOKEN=<random>` to
`/etc/truenorth/env`; the route refuses calls without it, so nothing on the
tailnet can trigger a run by accident.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now truenorth-daily.timer
systemctl list-timers truenorth-daily.timer
```

### The reminder timer

Push is sent by the same server, once per person per day, at the hour each
person chose in *Ajustes*. A second timer calls the route every hour; the
route only sends to people whose hour it is.

`/etc/systemd/system/truenorth-notify.service`:

```ini
[Unit]
Description=TrueNorth reminder push

[Service]
Type=oneshot
User=truenorth
EnvironmentFile=/etc/truenorth/env
ExecStart=/usr/bin/curl -fsS --max-time 120 -X POST -H "Authorization: Bearer ${ENGINE_LOCAL_TOKEN}" http://localhost:3000/api/push/hourly
```

`/etc/systemd/system/truenorth-notify.timer`:

```ini
[Unit]
Description=Send the TrueNorth reminder to whoever chose this hour

[Timer]
OnCalendar=*-*-* *:05:00
Persistent=false

[Install]
WantedBy=timers.target
```

`Persistent=false` on purpose: a reminder that fires late is noise, not a
reminder. Enable it like the daily timer. Push needs the person to have turned
on *Aviso diario* on the phone, from the installed app — iOS delivers nothing to
Safari — and `NEXT_PUBLIC_FIREBASE_VAPID_KEY` in the env (Firebase console →
Cloud Messaging → Web Push certificates).

### Checking the engine

Two routes exist for this, both behind the same token. The first talks to
Claude Code with sample data and touches no database, so it separates a Claude
problem (not signed in, binary not on the service PATH) from a Firestore one:

```bash
source /etc/truenorth/env
curl -s -H "Authorization: Bearer $ENGINE_LOCAL_TOKEN" http://localhost:3000/api/engine/selftest | jq .plan.headline

# The team follow-up runs on the same sample data:
curl -s -H "Authorization: Bearer $ENGINE_LOCAL_TOKEN" \
  'http://localhost:3000/api/engine/selftest?step=followup' | jq '.followUp.messages[].ask'
```

The second is the real thing, for one company, today. It is what the timer
calls without `?company=`:

```bash
curl -s -X POST -H "Authorization: Bearer $ENGINE_LOCAL_TOKEN" "http://localhost:3000/api/engine/daily?company=<companyId>" | jq .
```

Afterwards *Ajustes → Motor* in the app shows the heartbeat: host, last run,
plans written, messages suggested, and the error if one failed. *Hoy* has the
plan, *Seguimiento* the team reading and the messages to send, *Briefing* the
analysis. A full run for a
company of four takes three to four minutes: one analysis, one plan per person,
and one team follow-up per manager, each a `claude -p` call of forty to sixty
seconds, run one after another on purpose.

The follow-up is the expensive step — about $0.15 a call on ADITUM's data,
roughly what the rest of the run costs together — because it reads the whole
team at once. That is deliberate: deciding who to write to needs everybody side
by side. See ADR-006.

If the selftest fails with `could not start claude`, the service PATH does not
include the binary: set `CLAUDE_BIN=/home/truenorth/.local/bin/claude` in
`/etc/truenorth/env`. If it fails with an authentication error, run
`claude` once interactively as the `truenorth` user and sign in again.

## 8b. First morning: what to do once, by hand

1. Open the app on the phone, sign in, install it to the home screen.
2. *Equipo* → add the people on the team (they need no account) and write
   *Lo que espero* for each. Responsibles on tasks come from Notion by name,
   so the names here should match the ones in Notion.
3. Run the engine once by hand (`?company=<id>` above) instead of waiting for
   02:00, and read *Seguimiento*. The first day the "has not moved" signals
   have nothing to say — `statusChangedAt` only exists from the first Notion
   sync onward — so expect overdue, blocked and workload, not silence.
4. Check *Ajustes → Motor* says the last run was OK and what it cost.

## 8c. Before the Pi: testing from the phone against the laptop

The same thing works with the laptop as the server, which is how this was
built. `tailscale serve` on a spare port in front of `next dev`, the laptop's
tailnet name authorized in Firebase Auth (same script as §5), and that name in
`allowedDevOrigins` in `apps/web/next.config.ts` so Next accepts the dev
requests:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:3000
# https://<laptop>.<tailnet>.ts.net:8443 — off with: tailscale serve --https=8443 off
```

Everything the phone does goes to the real Firestore either way; the only
difference is which machine runs the server and whether it is on at 02:00.

## 9. Deploying a new version

`/usr/local/bin/truenorth-deploy`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/truenorth
sudo -u truenorth git pull --ff-only origin production
sudo -u truenorth bash -lc 'pnpm install --frozen-lockfile && pnpm build'
systemctl restart truenorth
systemctl --no-pager status truenorth | head -5
```

```bash
sudo chmod +x /usr/local/bin/truenorth-deploy
```

A release is then: merge `main` into `production`, push, and run
`sudo truenorth-deploy` on the Pi.

## 10. When something is wrong

| Symptom | Look at |
| --- | --- |
| App does not load on the phone | Is Tailscale connected on the phone? `tailscale status` on the Pi. |
| Loads but sign-in is refused | The `ts.net` hostname is missing from Authorized domains. |
| No plan this morning | `journalctl -u truenorth-daily --since today`, then `journalctl -u truenorth --since 01:55`. |
| Engine says Claude failed | `claude -p` by hand as the `truenorth` user; a signed-out session or an exhausted usage window both surface there. |
| Firestore permission errors in the log | The service account is missing or not readable by the service user. |
| "Insufficient permissions" in the app on a new screen | The rules in the repo were not deployed (§5b). |
| No reminder arrived | Is the timer running (`systemctl list-timers truenorth-notify.timer`)? Was the toggle turned on from the installed app? `curl … /api/push/hourly?hour=<h>` reports sent/skipped/dead per run. |
| *Seguimiento* is empty for an admin | The engine has not run today, or the company has nobody on the team but you. Members with `access: member` never see it. |
| The engine ran but every message repeats yesterday's | It should not: identical signals are dropped in code. Check `followups/{date}_{uid}` in Firestore for what was actually written. |

The app's own heartbeat is at `workers/pi-01` in Firestore; Settings shows it,
so "is the engine up" can be answered from the phone.
