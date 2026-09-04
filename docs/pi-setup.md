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

## 4b. Whisper, for voice

Transcription runs on the Pi too, so audio never leaves the house. Build
whisper.cpp and fetch the multilingual `small` model:

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
GOOGLE_APPLICATION_CREDENTIALS=/etc/truenorth/service-account.json
NEXT_PUBLIC_FIREBASE_API_KEY=…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=truenorth-155de.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=truenorth-155de
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=truenorth-155de.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
NEXT_PUBLIC_FIREBASE_APP_ID=…
NEXT_PUBLIC_FIREBASE_VAPID_KEY=…
NOTION_TOKEN=…                  # when the Notion phase lands
ENGINE_AUTH=subscription        # or api_key
ANTHROPIC_API_KEY=              # only if ENGINE_AUTH=api_key
```

```bash
chmod 600 /etc/truenorth/env
```

Add the Pi's Tailscale hostname to Firebase Authentication → Settings →
Authorized domains, e.g. `truenorth.<tailnet>.ts.net`. Sign-in is refused from
any domain not on that list.

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
curl -s http://localhost:3000/entrar | head -c 200
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
ExecStart=/usr/bin/curl -fsS -X POST -H "Authorization: Bearer ${ENGINE_LOCAL_TOKEN}" http://localhost:3000/api/engine/daily
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
plans written, messages suggested, and the error if one failed. A full run for a
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

The app's own heartbeat is at `workers/pi-01` in Firestore; Settings shows it,
so "is the engine up" can be answered from the phone.
