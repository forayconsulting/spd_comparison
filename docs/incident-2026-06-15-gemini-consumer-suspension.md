# Incident: Gemini API key suspended (CONSUMER_SUSPENDED) — all SyncroDoc deployments down

- **Date detected:** 2026-06-15
- **Suspension effective:** 2026-06-12 03:52 PDT (Google notice)
- **Severity:** SEV-1 — core AI analysis (FOB Audit / document comparison) down on **all three** deployments
- **Status:** Resolved 2026-06-15 (mitigation deployed; durable fix tracked below)
- **Owner:** Clayton Chancey

---

## Summary

The shared "BackupGemini" consumer API key (`…UbDs`, project `gen-lang-client-0908406240`)
was suspended by Google Cloud Trust & Safety for **"abusive activity consistent with
hijacked resources."** Because all three deployments (`wpf`, `leadingedge`, `demo`) and
local dev shared this one key, every document-comparison/FOB-audit run failed with a
`403 CONSUMER_SUSPENDED`. This was **not** a billing/out-of-funds problem — the billing
account was open and the project was active.

This is the **second** key lost to the same failure mode (the original key was hijacked in
the May 2026 ~$9,500 fraud incident).

## Impact

- **Who:** All SyncroDoc/SPD Matrix instances — `wpf` (Western Pension Fund),
  `leadingedge` (Leading Edge FOB Audit pilot), `demo`.
- **What:** Login, upload, history all worked; **audits/comparisons failed** at the Gemini
  call. Retrying did nothing (the key itself was suspended).
- **Reported by:** Tia Pitt (Leading Edge) — email "SyncroDoc Onboarding", 2026-06-15 12:16 PM,
  asking if her access had been suspended. The app showed the raw upstream error.

## Timeline

- **2026-06-12 03:52 PDT** — Google `google-cloud-compliance@google.com` emails the project
  owner (`cchancey1@gmail.com`): project `gen-lang-client-0908406240` suspended.
- **2026-06-15 12:16 PM** — Tia Pitt reports the error to the team.
- **2026-06-15 ~3:53 PM** — Triaged. Confirmed `CONSUMER_SUSPENDED` is project-wide (even
  Cloud Logging on the project returns suspended), billing account open, project active.
- **2026-06-15 ~4:1x PM** — Identified a healthy fallback key, locked it, fixed the proxy
  leak, deployed to all three instances. Leading Edge verified working (live FOB audit).

## Root cause

1. **Key leak vector (the real bug):** `functions/api/gemini/[model].js` forwarded Google's
   upstream error `message` verbatim to the browser. Google's auth/permission errors **echo
   the full API key** (`Permission denied: Consumer 'api_key:AIza…' has been suspended`).
   So on *any* error, the key was shown to every user — and screenshotted/emailed around.
2. **Unrestricted key:** the key had no HTTP-referrer or IP restriction, so a leaked copy was
   immediately usable by anyone who found it. Google's abuse systems flagged the resulting
   third-party usage as "hijacked resources" and suspended the project.
3. **Single shared key + personal project:** one personal AI Studio consumer key carried
   production, multi-tenant, multi-client traffic. One suspension took down everything.

## Resolution (what was done 2026-06-15)

1. **Failover key:** switched all three deployments + local dev to a healthy key
   (`…cUbw`) in project `gen-lang-client-0154120059` (billing `01509D-7FE2F4-37912E`, open;
   already the billing account behind `spd-matrix-demo`/`spd-matrix-auth`).
2. **Locked the key** (`gcloud services api-keys update`):
   - API target restricted to `generativelanguage.googleapis.com`.
   - HTTP-referrer restricted to `app.syncrodocsystems.com`.
   - Verified: bare key (no referrer) → `403 blocked`; with referrer → `200 OK`.
3. **Fixed the proxy** (`functions/api/gemini/[model].js`):
   - `redactSecrets()` strips any `AIza…` key from error text before it leaves the server.
   - Sends a server-side `Referer` (`GEMINI_KEY_REFERER`, default
     `https://app.syncrodocsystems.com`) so the locked key works. This value is set
     server-side only and never reaches the browser, so a leaked key string is unusable
     without also forging the referrer.
4. **Deployed** to `spd-matrix-leadingedge`, `spd-matrix`, `spd-matrix-demo` (production /
   branch `main`, per-instance Hyperdrive + R2 binding swaps), rotated each project's
   `GEMINI_API_KEY` secret, updated local `.dev.vars`/`config.js`.

## Residual risk / follow-ups

- [ ] **Durable fix:** migrate off browser-exposable consumer API keys to **Vertex AI**
  (service-account auth, no leakable key) — the proxy already supports it — and/or the
  planned move off Gemini entirely. The new key is still a personal AI-Studio key in a
  personal GCP project: same class as the two that were burned.
- [ ] **HTTP-referrer restriction is spoofable** — it blocks dumb replay of a leaked key, not
  a targeted attacker. Primary protection is now: don't leak the key (redaction) + API-target
  restriction. Treat referrer-lock as defense-in-depth.
- [ ] **Per-instance keys** instead of one shared key, so one suspension can't take down all
  tenants.
- [ ] **Revoke the Cloudflare API token** created for this deploy (pasted in chat).
- [ ] **Appeal** the suspended `gen-lang-client-0908406240` project (optional; low value given
  the migration).
- [ ] Local **browser-direct** dev (opening `index.html`) won't work with the locked key
  (`localhost` referrer not allowlisted) — use `wrangler pages dev` (proxy path) or add
  `localhost` to the key's allowed referrers.

## Lessons

- **Never forward upstream provider errors to the client unfiltered** — they can contain
  secrets. Redact at the proxy.
- **Restrict API keys at creation** (referrer/IP + API target), always.
- A **single shared credential** across tenants turns one suspension into a full outage.
