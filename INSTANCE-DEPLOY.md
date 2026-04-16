# Instance Deployment Runbook

This file is a Claude Code runbook for deploying a new SPD Matrix instance at `{SLUG}.syncrodocsystems.com`. Claude Code should follow these instructions step-by-step, automating CLI commands and guiding the user through manual dashboard steps.

## Critical: Cloudflare Pages Gotchas

Two platform behaviors that differ from documentation. **Ignoring these will break the deployment.**

### 1. Bindings MUST be in `wrangler.toml` (dashboard bindings don't work)

Cloudflare Pages dashboard accepts Hyperdrive/R2 binding configurations, but **Pages Functions cannot access them at runtime** (`env.DB` will be `undefined`). Bindings must be defined in `wrangler.toml`.

**Impact on multi-tenant:** Since all instances share the same codebase, deploying to a non-production instance requires temporarily swapping the Hyperdrive ID and R2 bucket name in `wrangler.toml`, deploying, then reverting. See Phase 3 for the exact process.

**Risk:** If `wrangler.toml` is not reverted after a non-production deploy and production is deployed next, production will point at the wrong database. The deploy steps below include explicit revert-and-verify safeguards.

### 2. `Cf-Access-Authenticated-User-Email` header not injected for `syncrodocsystems.com` subdomains

Cloudflare Access authenticates users and sets a `CF_Authorization` JWT cookie, but does not reliably inject the `Cf-Access-Authenticated-User-Email` header into requests reaching Pages Functions on `syncrodocsystems.com` subdomains. The codebase includes a JWT cookie parser fallback in `getUserEmail()` (`functions/api/history/_db.js`) that extracts the email from the cookie payload. No action needed during deployment — this is handled in code.

---

## Prerequisites

Before starting, verify the following tools are authenticated:

```bash
wrangler whoami        # Cloudflare CLI
```

If `wrangler` is not authenticated, ask the user to run `! wrangler login` in the prompt.

## Step 0: Collect Parameters

Ask the user for the following before proceeding. Use AskUserQuestion where appropriate.

| Parameter | Example | Description |
|-----------|---------|-------------|
| `SLUG` | `demo` | Workspace slug — becomes `{SLUG}.syncrodocsystems.com`. Lowercase alphanumeric + hyphens only. |
| `ADMIN_EMAIL` | `clayton@foray-consulting.com` | Initial admin user email. |
| `ACCESS_EMAILS` | (list) | Email addresses for Cloudflare Access allowlist. Must include `ADMIN_EMAIL`. |

Validate that `SLUG` matches `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` (no leading/trailing hyphens, lowercase only).

Confirm the naming convention with the user before proceeding:
- Pages project: `spd-matrix-{SLUG}`
- R2 bucket: `spd-matrix-{SLUG}-documents`
- Hyperdrive config: `spd-matrix-{SLUG}-db`
- Railway database: `spd-matrix-{SLUG}`
- GCP project: `spd-matrix-{SLUG}` (or user's preference)

---

## Phase 1: Create Infrastructure

Steps 1A, 1B, and 1C are independent and can be started in parallel.

### Step 1A: Railway PostgreSQL (Manual)

Guide the user through creating the database:

> **Action needed in Railway Dashboard (https://railway.com/dashboard):**
>
> 1. Create a new **Project** (for full isolation) or add a PostgreSQL **Service** to an existing project
> 2. Name it `spd-matrix-{SLUG}`
> 3. Wait for provisioning to complete
> 4. Go to **Variables** and copy the `DATABASE_PUBLIC_URL`
> 5. **Important:** Ensure public networking is enabled (Settings > Networking > Public Networking)
>
> Paste the `DATABASE_PUBLIC_URL` here when ready.

Once the user provides the URL, store it as `DATABASE_URL` for subsequent steps.

Initialize the schema:

```bash
psql "{DATABASE_URL}" -f schema.sql
```

Verify the schema was applied:

```bash
psql "{DATABASE_URL}" -c "\dt"
```

Expected tables: `users`, `analyses`, `chat_messages`, `notes`, `shared_analyses`, `share_tokens`, `app_settings`.

Insert the admin user record immediately (don't wait for first login):

```bash
psql "{DATABASE_URL}" -c "INSERT INTO users (email, is_admin) VALUES ('{ADMIN_EMAIL}', true);"
```

### Step 1B: Cloudflare R2 Bucket (Automated)

```bash
wrangler r2 bucket create spd-matrix-{SLUG}-documents
```

### Step 1C: Cloudflare Pages Project (Automated)

```bash
wrangler pages project create spd-matrix-{SLUG} --production-branch=main
```

---

## Phase 2: Cloudflare Hyperdrive (depends on Step 1A)

Create a Hyperdrive configuration pointing to the Railway database:

```bash
wrangler hyperdrive create spd-matrix-{SLUG}-db --connection-string="{DATABASE_URL}"
```

**Save the returned Hyperdrive ID** — this is needed for the deploy step. Store it as `HYPERDRIVE_ID`.

---

## Phase 3: Deploy with Binding Swap (depends on Steps 1B, 1C, 2)

### Step 3A: Environment Variables (Manual)

> **Action needed in Cloudflare Dashboard:**
>
> Go to **Workers & Pages** > `spd-matrix-{SLUG}` > **Settings** > **Environment variables** (Production):
>
> Add `GEMINI_API_KEY` = your Gemini consumer API key
> (This serves as a fallback until Vertex AI is configured via the admin panel)
>
> Confirm when done.

### Step 3B: Swap Bindings and Deploy (Automated)

**This is the critical multi-tenant step.** The `wrangler.toml` contains production binding IDs. We must temporarily swap them to the new instance's IDs, deploy, then revert.

1. **Read current `wrangler.toml`** and note the production values:
   - Hyperdrive ID: `158d316aa903469cb2034df36a03b32a`
   - R2 bucket: `spd-matrix-documents`

2. **Swap to instance-specific values:**
   - Replace the Hyperdrive `id` with `{HYPERDRIVE_ID}`
   - Replace the R2 `bucket_name` with `spd-matrix-{SLUG}-documents`

3. **Deploy:**
   ```bash
   wrangler pages deploy . --project-name=spd-matrix-{SLUG} --commit-dirty=true
   ```

4. **IMMEDIATELY revert `wrangler.toml`** back to production values:
   - Hyperdrive `id` → `158d316aa903469cb2034df36a03b32a`
   - R2 `bucket_name` → `spd-matrix-documents`

5. **Verify revert** by reading `wrangler.toml` and confirming production IDs are restored.

**NEVER commit `wrangler.toml` while it has non-production IDs.**

---

## Phase 4: DNS (depends on Step 1C)

### Step 4A: Custom Domain (Manual — auto-creates CNAME)

> **Action needed in Cloudflare Dashboard:**
>
> Go to **Workers & Pages** > `spd-matrix-{SLUG}` > **Custom domains**:
>
> Add custom domain: `{SLUG}.syncrodocsystems.com`
>
> Cloudflare will automatically create the required CNAME record.
> Click **Activate domain** when prompted.
>
> Confirm when done.

Note: The custom domain may show "Initializing" status briefly. This is normal — it typically activates within minutes.

---

## Phase 5: Cloudflare Access (depends on Step 4)

Guide the user through creating the Access application:

> **Action needed in Cloudflare Zero Trust Dashboard:**
>
> Go to **Access** > **Applications** > **Add an application**:
>
> 1. Type: **Self-hosted**
> 2. Application name: `SPD MATRIX {SLUG}` (uppercase slug for display)
> 3. Click **+ Add public hostname** and enter: `{SLUG}.syncrodocsystems.com`
> 4. Session duration: **24 hours**
>
> **Policies** section (same page):
> 5. Click **+ Create new policy**
> 6. Policy name: `{SLUG} Users`
> 7. Action: **Allow**
> 8. Selector: **Emails**
> 9. Add these emails:
>    {list ACCESS_EMAILS, one per line}
>
> **Authentication** tab (later in wizard):
> 10. Enable login methods: **Google**, **Azure AD**, **One-time PIN**
>
> 11. Click through remaining steps (Experience settings, Advanced settings — defaults are fine) and **Save**
>
> Confirm when done.

---

## Phase 6: GCP Project and Vertex AI (can run in parallel with Phases 4-5)

Guide the user through creating a new GCP project with Vertex AI:

> **Action needed in Google Cloud Console (https://console.cloud.google.com):**
>
> ### Create Project
> 1. Click the project selector dropdown > **New Project**
> 2. Project name: `spd-matrix-{SLUG}` (or your preference)
> 3. Click **Create** and wait for provisioning
> 4. Switch to the new project
>
> ### Enable Vertex AI API
> 5. Go to **APIs & Services** > **Library**
> 6. Search for **Vertex AI API**
> 7. Click **Enable**
>
> Alternatively, if `gcloud` CLI is available:
> ```bash
> gcloud projects create spd-matrix-{SLUG} --name="SPD Matrix {SLUG}"
> gcloud config set project spd-matrix-{SLUG}
> gcloud services enable aiplatform.googleapis.com
> ```
>
> ### Enable Billing
> 8. Go to **Billing** and link a billing account to this project
>    (Vertex AI requires billing to be enabled)
>
> ### Create Service Account
> 9. Go to **IAM & Admin** > **Service Accounts**
> 10. Click **Create Service Account**
>     - Name: `spd-matrix-{SLUG}`
>     - ID: `spd-matrix-{SLUG}` (auto-generated)
> 11. Grant role: **Vertex AI User** (`roles/aiplatform.user`)
> 12. Click **Done**
>
> ### Download Key
> 13. Click on the new service account
> 14. Go to **Keys** tab > **Add Key** > **Create new key**
> 15. Key type: **JSON**
> 16. Download the JSON key file — you'll upload this in the app's admin panel
>
> Confirm when done.

---

## Phase 7: Admin Setup and Vertex AI Configuration (depends on Steps 3B, 5, 6)

### Step 7A: First Login and Admin Verification

Ask the user to:

> **Action needed:**
>
> 1. Open `{SLUG}.syncrodocsystems.com` in your browser
> 2. Log in through Cloudflare Access with `{ADMIN_EMAIL}`
> 3. The app should load with admin status already active (green dot on settings gear)
>
> Confirm when you've logged in.

The admin user was pre-inserted in Step 1A. If admin is not detected, verify:

```bash
psql "{DATABASE_URL}" -c "SELECT email, is_admin FROM users WHERE email = '{ADMIN_EMAIL}';"
```

### Step 7B: Configure Vertex AI (Manual, in app)

> **Action needed in the app at `{SLUG}.syncrodocsystems.com`:**
>
> 1. Click the **settings gear** icon (should show green admin dot)
> 2. In the admin section, switch to **Vertex AI** mode
> 3. Upload the **JSON key file** you downloaded from GCP
>    - This auto-fills: Service Account Email, Private Key, Project ID
> 4. Set **Region** to `us-central1` (or your preferred region)
> 5. Click **Test Connection** — verify it succeeds
> 6. Click **Save**
>
> Confirm when Vertex AI is working.

---

## Phase 8: Verification

Guide the user through each check:

### 8A: Authentication
> 1. Open `{SLUG}.syncrodocsystems.com` in an **incognito/private** window
> 2. Verify: Cloudflare Access login screen appears
> 3. Log in with an allowlisted email — verify the app loads
> 4. (Optional) Try a non-allowlisted email — verify access is denied

### 8B: Core Functionality
> 1. Upload a test PDF in the "Plan Docs" section
> 2. Click "Compare Documents" — verify the three-phase analysis runs
> 3. After completion, click a citation link — verify the PDF viewer opens to the correct page
> 4. Try the Chat tab — verify responses work

### 8C: Marketing Site Routing
> 1. Go to `syncrodocsystems.com`
> 2. Click **Login**
> 3. Enter `{SLUG}` as the workspace slug
> 4. Verify: redirected to `{SLUG}.syncrodocsystems.com`

### 8D: History Persistence
> 1. Refresh the page
> 2. Verify: the analysis you just ran appears in the history sidebar
> 3. Click it — verify it loads with all tabs populated

---

## Phase 9: Post-Deploy Housekeeping

After successful verification:

1. Update the **Active Instances** table in `CLAUDE.md`:

   | Slug | Pages Project | Domain(s) | Client |
   |------|--------------|-----------|--------|
   | `{SLUG}` | `spd-matrix-{SLUG}` | `{SLUG}.syncrodocsystems.com` | {purpose} |

2. Record the instance's Hyperdrive ID and R2 bucket name for future deploys:

   | Instance | Hyperdrive ID | R2 Bucket |
   |----------|--------------|-----------|
   | Production (`wpf`) | `158d316aa903469cb2034df36a03b32a` | `spd-matrix-documents` |
   | `{SLUG}` | `{HYPERDRIVE_ID}` | `spd-matrix-{SLUG}-documents` |

3. Delete any temporary debug endpoints (e.g., `functions/api/debug.js`).

4. Tell the user the instance is live and provide a summary of what was created.

---

## Deploying Code Updates to Non-Production Instances

When deploying code changes to existing non-production instances, use the same binding swap process from Phase 3B:

1. Swap `wrangler.toml` Hyperdrive ID and R2 bucket to the instance's values
2. Deploy: `wrangler pages deploy . --project-name=spd-matrix-{SLUG} --commit-dirty=true`
3. **Immediately revert** `wrangler.toml` to production values
4. Verify revert

For production deploys, no swap is needed — `wrangler.toml` already has production values:
```bash
wrangler pages deploy . --project-name=spd-matrix
```

---

## Troubleshooting

### API calls return 500 or "No saved analyses"
- **Most likely:** Binding mismatch. Verify the deployed `wrangler.toml` had the correct Hyperdrive ID and R2 bucket for this instance. Redeploy with the correct values if needed.
- Check that Railway has public networking enabled
- Check `wrangler pages deployment tail --project-name=spd-matrix-{SLUG}` for error details

### Admin panel not showing despite is_admin=true
- This is the JWT cookie fallback issue. Verify `getUserEmail()` in `functions/api/history/_db.js` includes the `CF_Authorization` cookie parser. If it only checks the `Cf-Access-Authenticated-User-Email` header, it won't work for `syncrodocsystems.com` subdomains.

### Vertex AI returns 403
- Verify the service account has the `Vertex AI User` role
- Verify billing is enabled on the GCP project
- Verify the Vertex AI API is enabled
- Try the "Test Connection" button in the admin panel

### DNS not resolving
- Cloudflare proxied CNAMEs should resolve near-instantly
- Verify the custom domain was added to the Pages project (it auto-creates the CNAME)

### User can't log in
- Verify their email is in the Cloudflare Access allowlist
- Check Zero Trust > Access > Applications > the correct application
- Ensure the public hostname was added to the Access application
- Ensure login methods (Google/Azure AD/OTP) are enabled

### Instance shows data from another instance
- **CRITICAL:** The `wrangler.toml` was deployed with the wrong Hyperdrive ID. Immediately redeploy with the correct binding values for this instance.

---

## Maintaining the Instance

- **Adding users:** Zero Trust > Access > Applications > `SPD MATRIX {SLUG}` > Policies > edit email list
- **Code updates:** Use the binding swap process described above
- **Schema migrations:** Every change to `schema.sql` must be applied manually to this instance's Railway database **before or alongside** the code deploy that references it. All new statements in `schema.sql` are idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.), so safest is to run the whole file: `psql "{DATABASE_URL}" -f schema.sql`. Missing this step causes silent 500s on affected endpoints — the UI renders empty state ("No saved analyses yet", missing notes, etc.) while the data sits in the DB unreachable. See README's "Database Migrations" section for the current schema snapshot.
- **Resetting data:** `psql "{DATABASE_URL}" -c "TRUNCATE users, analyses, chat_messages, notes, shared_analyses, share_tokens, app_settings CASCADE;"` then re-insert admin user
- **Logs:** `wrangler pages deployment tail --project-name=spd-matrix-{SLUG}`
