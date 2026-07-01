# Incident: All-tenant 524 timeouts on Compare Documents

- **Date detected:** 2026-07-01
- **Severity:** SEV-2 — intermittent `API error (524)` on Compare Documents and other AI calls, across all three deployments
- **Status:** Resolved 2026-07-01 (fix deployed to `spd-matrix` and `spd-matrix-leadingedge`)
- **Owner:** Clayton Chancey

---

## Summary

Users on every deployment (`wpf`, `leadingedge`, `demo`) intermittently hit `API error (524)` — Cloudflare's edge timeout for "no response from origin" — when running Compare Documents or other AI-backed features. This surfaced after two prior rounds of "FOB audit 524 fixes" (`77a1e2f`, `710eefb`), which reduced processing time for the `fob-audit` analysis mode specifically but did not resolve the issue, because those changes never touched the actual root cause.

## Impact

- **Who:** All SyncroDoc instances — `wpf`, `leadingedge`, `demo` — on every `analysisMode`, not just FOB Audit.
- **What:** Compare Documents (and any other call through `/api/gemini/:model`) would occasionally fail with a 524 partway through, with no clear pattern tied to document size or tenant.
- **Reported by:** Leading Edge users during FOB Audit UAT, but confirmed to affect all tenants.

## Root cause

`functions/api/gemini/[model].js` builds a `TransformStream` and sends `: keepalive\n\n` SSE comments every 15 seconds specifically to prevent Cloudflare's ~100-second idle/no-data timeout from firing while Gemini is "thinking." That mechanism worked correctly for the AI processing wait itself — the problem was earlier in the request:

- On every call, before the keepalive stream was created, the handler ran `await getAppSettings(sql)` — a Postgres query (via Hyperdrive) to check whether Vertex AI routing was enabled.
- `createSqlClient()` (`functions/api/history/_db.js`) opens a **brand-new dedicated connection per request** (`postgres(..., {max: 1, connect_timeout: 10})`) with no query-level/statement timeout.
- If that one-time settings lookup was ever slow (Postgres/Hyperdrive hiccup, connection churn, lock contention), **zero bytes reached the client during the stall** — the keepalive timer hadn't started yet — so Cloudflare's edge saw total silence and returned a 524 before Gemini was ever reached.

This affected every tenant and every analysis mode identically, since all of them route through this same file. FOB Audit and large SPD analyses weren't the cause — they simply have more/longer requests in flight, making them more likely to catch a transient hiccup in this shared code path. The two prior "FOB audit 524 fixes" were scoped to `analysisMode === 'fob-audit'` in `index.html` and never touched `functions/api/gemini/[model].js`'s request ordering, which is why they didn't resolve it.

## Resolution (what was done 2026-07-01)

1. **Reordered `onRequestPost`** in `functions/api/gemini/[model].js` so the keepalive `TransformStream` starts immediately after model extraction — before the Vertex AI settings DB lookup, JWT minting, `request.text()`, and the Gemini `fetch()`. All of that work now runs inside the existing background async IIFE, after the streaming `Response` has already been returned to the client.
2. **Added a `withTimeout()` helper** wrapping `getAppSettings()` in a 5-second cap, so a hung database call can no longer add unbounded latency — on timeout it falls through to the same Consumer API fallback the code already used on a thrown DB error.
3. **Deployed** to `spd-matrix` (wpf) and `spd-matrix-leadingedge` via the standard binding-swap process (see `INSTANCE-DEPLOY.md`), with `wrangler.toml` verified reverted to production values afterward.
4. **Verified** with `npm test` (150 existing unit tests pass) and live `wrangler pages deployment tail` monitoring on both instances during real usage.

## Residual risk / follow-ups

- [ ] `spd-matrix-demo` has not yet received this fix — apply the same deploy when convenient.
- [ ] The per-request dedicated Postgres connection (`max: 1`) for a rarely-changing settings check is still wasteful; consider a short in-memory cache of `app_settings` to cut connection churn further, though the ordering fix already prevents it from causing 524s.
- [ ] Separately verify the hardcoded Consumer API `Referer` header (`app.syncrodocsystems.com`, added in `10aba71`) matches the referrer configured on the live Gemini key — a mismatch would show up as fast `403`s, a distinct failure mode from this incident's 524s.

## Lessons

- When a fix targets one `analysisMode`/code path but the symptom keeps recurring across all tenants, that's a signal the earlier fix addressed a scoped symptom, not the shared root cause — check the single endpoint every mode routes through.
- A keepalive/heartbeat mechanism only protects against silence *after* it starts — anything awaited before it is constructed is an unprotected timeout gap, regardless of how reliable that dependency normally is.
