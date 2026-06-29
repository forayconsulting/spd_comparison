# Security Posture — SyncroDoc

## Context

This document is a client-facing security posture summary. It answers the questions clients ask during procurement and vendor review: where does my data go, who can see it, what happens to it, and how is the stack hardened?

SyncroDoc is a browser-based document comparison and analysis tool. Four external dependencies carry the security story:

1. **Cloudflare Access (Zero Trust)** — edge authentication gate
2. **Cloudflare Pages + Pages Functions** — UI and business logic host
3. **Railway PostgreSQL (via Cloudflare Hyperdrive)** — metadata, sessions, notes
4. **Cloudflare R2** — document (PDF) storage
5. **Google Gemini API or Google Cloud Vertex AI** — configurable LLM backend

Every client gets a dedicated stack by default — separate Cloudflare Pages project, separate Railway database, separate R2 bucket, separate Cloudflare Access policy. Hard tenant isolation is the baseline, not an enterprise tier.

---

## 1. Architecture at a Glance

```
 Browser
    │  (HTTPS, authenticated session cookie set by Cloudflare Access)
    ▼
 ┌────────────────────────────────────────────────────────┐
 │  Cloudflare Access (Zero Trust)                         │
 │   • Enforces email allowlist at the edge                │
 │   • Google OAuth / Microsoft Entra ID / OTP             │
 │   • No unauthenticated request reaches application code │
 └────────────────────────────────────────────────────────┘
    │  (injects Cf-Access-Authenticated-User-Email + CF_Authorization JWT)
    ▼
 ┌────────────────────────────────────────────────────────┐
 │  Cloudflare Pages (static SPA) + Pages Functions (API) │
 │   • index.html served from edge                         │
 │   • functions/api/* = serverless Workers runtime        │
 │   • Secrets: Pages env vars (encrypted, server-only)    │
 └────────────────────────────────────────────────────────┘
          │                       │                       │
          ▼                       ▼                       ▼
  ┌───────────────┐    ┌─────────────────┐    ┌──────────────────────┐
  │ Cloudflare    │    │ Cloudflare      │    │ Google Gemini API    │
  │ Hyperdrive    │    │ R2 Bucket       │    │  — OR —              │
  │     │         │    │  (PDFs, AES-256)│    │ Google Cloud Vertex  │
  │     ▼         │    └─────────────────┘    │   AI (regional)      │
  │ Railway       │                           └──────────────────────┘
  │ PostgreSQL    │
  │ (TLS in/out)  │
  └───────────────┘
```

**No component of the stack is self-hosted.** Every tier runs on a major vendor (Cloudflare, Railway, Google), each with its own SOC 2 / ISO 27001 posture. The application is the composition layer; hardening is primarily about how we wire these services together.

---

## 2. Authentication — Cloudflare Access Zero Trust

**Edge enforcement.** Every request to a client's SyncroDoc subdomain is intercepted by Cloudflare Access *before* reaching our Pages Function. No unauthenticated request can execute any business logic. There is no bypass path, no "anonymous mode," no unauthenticated API.

**Login method options (configurable per client):**

| Method | Use Case |
|---|---|
| Google OAuth | Any Google-backed email, including Google Workspace for Business |
| Microsoft Entra ID | Multi-tenant — any Microsoft 365 organization. Client-specific Entra tenant also supported. |
| One-time PIN (email) | Fallback for users without Google/Microsoft. OTP sent to email, 6-digit code. |

**The identity provider is not the access gate.** Any of the above may authenticate the user, but Cloudflare Access then validates the returned email against an **email allowlist policy** unique to that client. Only emails in the client's allowlist are let through.

**Session duration:** Configurable in the Cloudflare Zero Trust dashboard, from 15 minutes to 1 month. Each client decides their own posture. No application-level override.

**Identity delivery to the backend:**
- Primary: `Cf-Access-Authenticated-User-Email` request header, injected by Cloudflare Access
- Fallback: `CF_Authorization` JWT cookie, for domain configurations where the header isn't injected by default

**Auto-provisioning:** On first login, the backend creates a user row keyed by email. No self-service signup — the Cloudflare Access allowlist is the gate.

**No custom password handling.** No password resets, no account lockout policy, no MFA implementation — all of those are delegated to the chosen IdP (Google, Microsoft, or OTP). This reduces the attack surface significantly and inherits the security investments those providers make.

---

## 3. Authorization & Multi-User Isolation

**Roles:**
- **System admin** — can edit app settings (including Vertex AI config)
- **Workspace admin** — can manage members in a shared workspace
- **Workspace member** — can view/edit workspace content
- **Owner** — implicit role on analyses they created

**Access checks on every query.** Every query that reads analyses, chats, notes, or files applies row-level filtering. Every analysis access check verifies ownership, an explicit share, or workspace membership before any detail is returned. File download re-verifies the user against the object's key and then falls back to share and workspace-membership checks. Admin endpoints gate on the admin flag and return 403 on failure.

**SQL safety.** All queries use parameterized template literals. Zero string concatenation; no injection path.

**Share tokens.** For collaborators outside the allowlist, analyses can be shared via opaque tokens with:
- Expiration (`expires_at`)
- Maximum use count (`max_uses`)
- Active flag (`is_active`)

A token claim binds the recipient to a specific email for future access.

**CSRF posture.** Every API call requires the `Cf-Access-Authenticated-User-Email` header (or the `CF_Authorization` cookie with `SameSite` behavior controlled by Cloudflare). Custom headers cannot be set by cross-origin form submissions, which breaks the classic CSRF pattern.

---

## 4. UI & Business Logic — Cloudflare Pages

**Hosting model:** Single-page app served from Cloudflare's global edge. No Node.js server, no long-lived VM, no in-house infrastructure.

**API layer:** Cloudflare Pages Functions (V8 isolates running on the Cloudflare Workers runtime). Cold starts under 50ms; no persistent disk; no process state between requests. Each invocation is ephemeral.

**Secrets management:**
- API keys stored as Pages secrets (encrypted at rest in Cloudflare)
- Secrets are injected via environment bindings server-side only
- Secrets **never** reach the browser — the proxy pattern adds the credential on the server side just before forwarding to Google

**Hard evidence that keys stay server-side:** The browser sends requests to `/api/gemini/{model}`. The Pages Function attaches the API key (or a Vertex OAuth Bearer token) and forwards the request to Google. The browser never sees either credential in its network tab.

**TLS:** All traffic terminates at Cloudflare with TLS 1.2+ (TLS 1.3 where supported). Cloudflare-to-origin connections (to Railway, Google, R2) are also TLS.

**DDoS / WAF:** Cloudflare's edge provides baseline DDoS protection and rate limiting at the network layer, included at no additional cost per tenant.

---

## 5. Database Backend — Railway PostgreSQL via Hyperdrive

**Database per client.** Every deployed client runs on a separate Railway PostgreSQL service, with its own connection string and credentials. A compromise of one tenant's database would not expose another's.

**Connection path:** Pages Function → Cloudflare Hyperdrive → Railway PostgreSQL. Hyperdrive caches connections and query results at the edge; the underlying transport is TLS to Railway.

**Schema highlights:**
- `users` — id, email, is_admin flag, created_at
- `analyses` — user, workspace, file metadata, phase responses, notes, chat history
- `workspaces`, `workspace_members`, `documents`, `collections` — shared-workspace model
- `shared_analyses` — explicit share grants with email or user ID
- `notes` — per-analysis annotations with anchor text
- `app_settings` — admin key/value store
- `chat_messages` — per-analysis chat history with compaction markers

**What is stored in Railway:**
- Analysis metadata (filenames, timestamps, user associations)
- LLM responses (summary, comparison, language citations) — these are text outputs *about* the documents, not the documents themselves
- Chat transcripts
- User-authored notes

**What is NOT stored in Railway:**
- The PDF documents themselves (those live in R2)
- API keys or user passwords (no user passwords exist — auth is via Cloudflare Access)

**At-rest encryption:** Railway provides volume-level encryption. Network-level access controls (Railway credentials + Hyperdrive binding) combine with application-level row filtering to gate access.

---

## 6. Document Storage — Cloudflare R2

**Why R2:** S3-compatible object store with zero egress fees, AES-256 encryption at rest by default, TLS in transit, and geographic replication controlled at the bucket level.

**Key structure:** `{userId}/{analysisId}/{sanitized_filename}`

This means:
- Files are namespaced by user from the key itself — path traversal cannot cross user boundaries
- Deleting a user's R2 prefix deletes all their files
- Filename sanitization prevents path injection

**Upload validation:**
- File type whitelist: PDF, DOCX, DOC, XLSX, XLS, CSV, TXT
- Size limit: 20 MB per file
- Authorization: must own the target analysis

**Download authorization:**
- Compares `userId` extracted from R2 key to authenticated user
- Falls back to explicit share check
- Falls back to workspace membership check
- Returns 403 on any failure

**Cascade delete:** When an analysis is deleted, its R2 objects are deleted in the same request.

**Retention:** Documents persist until the analysis is deleted. Clients who need scheduled retention (e.g., 90-day auto-delete) can configure a cleanup policy.

---

## 7. LLM Optionality — Gemini Consumer API vs Vertex AI

This is the most client-relevant configurability. The same code supports two very different compliance profiles; the choice is runtime, not build-time, and transparent to the user.

### Dual-path proxy

The `/api/gemini/{model}` proxy checks the tenant's `app_settings.vertex_ai_enabled` on every request:

- **If enabled with all Vertex credentials present** → routes to Vertex AI regional endpoint using an OAuth Bearer token
- **Otherwise** → routes to Consumer API with the standard API key header

Request and response bodies are identical across both paths. The switch is fully transparent to the browser.

### Vertex AI authentication

The Vertex path mints a short-lived access token on each request:

1. Builds an RS256 JWT with the service account claims (iss/sub/aud/scope)
2. Signs it using the PEM private key via the Web Crypto API (`RSASSA-PKCS1-v1_5` + SHA-256) — no Node runtime required
3. Exchanges the JWT at `oauth2.googleapis.com/token` for a 1-hour access token
4. Attaches the token as `Authorization: Bearer` to the Vertex request

Tokens are minted per-request (~100ms overhead) rather than cached — acceptable because the subsequent Gemini call typically takes 30-120 seconds.

### Why clients care

| Dimension | Consumer Gemini API | Vertex AI |
|---|---|---|
| **Data residency** | US, no control | Regional endpoint (e.g., `us-central1`, `europe-west1`); inputs/outputs stay in region |
| **Training opt-out** | Paid tier: yes. Free tier: no. | **Always** excluded from training. Contractually guaranteed. |
| **Contracts** | Google APIs Terms of Service | Google Cloud Agreement + Data Processing Addendum (DPA). BAA available for HIPAA. |
| **Audit logs** | None exposed to customer | Cloud Audit Logs — customer can see who called what, when, from where |
| **Network isolation** | Public internet | VPC Service Controls and Private Service Connect available |
| **SLA** | Consumer best-effort | 99.5–99.9% depending on region |
| **Identity model** | Shared API key | Per-client Google Cloud service account with scoped IAM roles |

**Configuration flow (admin only):**
1. Admin opens the Settings modal → "Use Vertex AI?" toggle
2. Admin uploads the Google service account JSON (auto-parses email, key, project)
3. Admin specifies region (e.g., `us-central1`)
4. Admin clicks "Test Connection" — proxy mints a token and runs a minimal probe against the model to verify end-to-end
5. Admin saves — subsequent analyses route through Vertex AI

**Per-client Vertex project.** A client can provide their *own* Google Cloud project and service account. In that configuration, the LLM traffic flows through that client's GCP billing, audit logs, and data-residency settings — fully under their control.

### Failure mode — error propagation

The proxy returns `200 OK` immediately via a `TransformStream` so that Cloudflare's 524 timeout does not kill long-running Gemini calls while the model is thinking. Keepalive SSE comments flow every 15 seconds until real data arrives. Upstream errors are surfaced as SSE data events with `chunk.error` fields, which the client re-throws. There is no path where an upstream 403 silently becomes a 200 with empty content.

---

## 8. Per-Tenant Isolation (Default Deployment Model)

**Every client runs on a dedicated stack.** This is our default, not an enterprise-tier upgrade. When we onboard a new client, we provision an isolated set of cloud resources for them — no data-plane sharing with any other tenant.

| Resource | Dedicated per client |
|---|---|
| Cloudflare Pages project | Yes |
| Cloudflare Access policy | Yes (separate email allowlist) |
| Cloudflare Hyperdrive binding | Yes |
| Railway PostgreSQL database | Yes (fully separate service + credentials) |
| Cloudflare R2 bucket | Yes |
| Subdomain | Yes (`{slug}.syncrodocsystems.com`) |
| LLM backend | Client-configurable (Consumer Gemini or their own Vertex AI project) |
| Codebase | Shared (same Git repo, same deploy artifact — platform updates propagate to all tenants on deploy) |

**What this means in practice:**
- A database issue in one tenant cannot read another tenant's data — separate services, separate credentials, separate network paths.
- An R2 key compromise cannot cross buckets.
- A Cloudflare Access misconfiguration in one tenant has no effect on other tenants.
- Each tenant's login allowlist is managed independently by them.
- Each tenant can choose Consumer Gemini API (shared infrastructure) or provide their own Vertex AI project (fully isolated LLM layer).

**The only deviation from this default** is a deliberate, scoped choice for specific engagement types — **merger-advisory engagements** (e.g., two pension plans going through combination on a shared deal team) or formally declared **alliance clients** where the shared workspace *is* the product. In those cases, multiple client organizations share a single instance and isolation moves to the *workspace* layer: application-enforced row-level filtering + workspace membership checks, still behind a per-deployment Cloudflare Access policy. This is never the default and requires explicit scoping in the engagement contract.

**Within a tenant's own deployment,** user-level isolation is always enforced at the application layer: row-level SQL filters on every query + R2 keys prefixed with userId + workspace membership checks for shared content.

---

## 9. Data Sent to the LLM

Because SPDs and plan-related documents frequently contain participant references and sensitive legal text, clients will ask exactly what leaves the environment.

**Per analysis, the model receives:**
- All uploaded PDFs (base64-encoded as inline document parts) — up to three times, once per phase, to get a fresh analysis each pass
- The phase-specific prompt
- Prior phase outputs embedded in subsequent prompts (Phase 2 sees the Phase 1 summary; Phase 3 sees both)

**Chat mode:** Files attached to the first user turn only, then conversation history flows through `contents` as alternating user/model turns. Compaction kicks in after ten turn-pairs by default — a cheap model summarizes history so the context stays bounded.

**Compliance dimension:**
- On the **Vertex AI** path, inputs are never used for training. Regional data residency is guaranteed by the endpoint. Cloud Audit Logs capture every call.
- On the **Consumer API paid tier**, inputs are not used for training per Google's terms, though the contractual framework is lighter than Vertex AI.
- The **Consumer API free tier** is not appropriate for sensitive documents and is not recommended for any client workload.

If a client's compliance posture requires redaction before model exposure, the recommended pattern is to pre-process documents at upload time and/or route through a client-owned Vertex AI project with that client's own IAM scoping and audit logs.

---

## 10. Compliance Posture — What This Stack Can Support

| Framework | Path |
|---|---|
| **SOC 2 Type II** | Achievable. All infrastructure vendors (Cloudflare, Railway, Google) carry SOC 2. Remaining work is controls documentation and evidence collection. |
| **HIPAA** | Achievable on the Vertex AI path with a Google Cloud BAA, per-tenant Railway DB, per-tenant R2 bucket, and a Cloudflare enterprise BAA. |
| **GDPR** | Achievable. Vertex AI regional endpoints provide EU residency; Google Cloud DPA covers processing terms. Cloudflare offers EU-only data-plane routing. Railway regions are selectable. |
| **FedRAMP** | Requires a dedicated infrastructure configuration. Vertex AI has a FedRAMP-authorized tier; Cloudflare Access/Pages must be matched to the corresponding tier. |
| **ISO 27001** | Vendor posture supports it; internal controls work required. |

---

## 11. What Each Client Can Configure

Summary of the knobs available to a client on their own deployment:

- **Identity providers** — enable or disable Google, Microsoft, OTP
- **Email allowlist** — who can log in at all
- **Session duration** — 15 minutes to 1 month
- **Workspace model** — which of their users see which analyses
- **LLM backend** — Consumer Gemini API (default, shared) or Vertex AI (per-client project, region, service account)
- **Their own Google Cloud project for Vertex AI** — brings billing, audit logs, and IAM under client control
- **Data retention policy** — scheduled cleanup of old analyses and documents, configurable per tenant

---

## 12. Verification & Next Steps for a Client Review

A prospective client's security team can independently validate the posture by:

1. **Requesting the Cloudflare Access policy export** for their tenant (email allowlist, identity providers, session duration).
2. **Requesting the Cloudflare Pages environment variable inventory** for their tenant.
3. **Requesting the Railway database connection policy** (IP allowlist, credential rotation schedule).
4. **Requesting the Google Cloud IAM role binding** for the Vertex AI service account, if on that path.
5. **Running a penetration test** against their deployment. The attack surface is intentionally small: one SPA, one API proxy, one admin surface.
6. **Reviewing the source code** under NDA if their security posture requires it. The codebase is small enough to audit in a day or two, and we welcome that level of scrutiny.

We treat security as a shared conversation with every client — if there's a specific control, framework, or attestation that matters to your team, raise it and we'll walk through how it maps to this stack.
