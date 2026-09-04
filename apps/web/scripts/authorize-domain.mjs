#!/usr/bin/env node
// Adds a hostname to Firebase Authentication's authorized domains, which is
// what lets people sign in from the Pi's (or a laptop's) tailnet address.
// Uses the service-account key the engine already has; idempotent.
//
//   GOOGLE_APPLICATION_CREDENTIALS=/etc/truenorth/service-account.json \
//     node scripts/authorize-domain.mjs truenorth.tail22ffd4.ts.net
import { cert } from 'firebase-admin/app';
import { readFileSync } from 'node:fs';

const hostname = process.argv[2];
if (!hostname) {
  console.error('usage: authorize-domain.mjs <hostname>');
  process.exit(2);
}
const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!path) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set');
  process.exit(2);
}

const key = JSON.parse(readFileSync(path, 'utf8'));
const { access_token } = await cert(key).getAccessToken();
const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${key.project_id}/config`;
const headers = { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' };

const current = (await (await fetch(url, { headers })).json()).authorizedDomains ?? [];
if (current.includes(hostname)) {
  console.log(`${hostname} is already authorized`);
  process.exit(0);
}
const res = await fetch(`${url}?updateMask=authorizedDomains`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ authorizedDomains: [...current, hostname] }),
});
if (!res.ok) {
  console.error(`failed: HTTP ${res.status}`, await res.text());
  process.exit(1);
}
console.log(`authorized: ${[...current, hostname].join(', ')}`);
