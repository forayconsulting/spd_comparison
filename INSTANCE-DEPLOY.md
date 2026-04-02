# Instance Deployment Runbook

This file is a Claude Code runbook for deploying a new SPD Matrix instance at `{SLUG}.syncrodocsystems.com`. Claude Code should follow these instructions step-by-step, automating CLI commands and guiding the user through manual dashboard steps.

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

### Step 1B: Cloudflare R2 Bucket (Automated)

```bash
wrangler r2 bucket create spd-matrix-{SLUG}-documents
```

### Step 1C: Cloudflare Pages Project (Automated)

```bash
wrangler pages project create spd-matrix-{SLUG}
```

---

## Phase 2: Cloudflare Hyperdrive (depends on Step 1A)

Create a Hyperdrive configuration pointing to the Railway database:

```bash
wrangler hyperdrive create spd-matrix-{SLUG}-db --connection-string="{DATABASE_URL}"
```

Note the returned Hyperdrive **ID** — the user will need it for the Pages binding step.

Tell the user the Hyperdrive ID and ask them to save it for the next step.

---

## Phase 3: Configure and Deploy Pages (depends on Steps 1B, 1C, 2)

### Step 3A: Dashboard Bindings (Manual)

Guide the user through configuring bindings. These MUST be set in the dashboard — they override `wrangler.toml` and are per-project.

> **Action needed in Cloudflare Dashboard:**
>
> Go to **Workers & Pages** > `spd-matrix-{SLUG}` > **Settings** > **Bindings**:
>
> 1. Add **Hyperdrive** binding:
>    - Variable name: `DB` (must be exactly `DB`)
>    - Select config: `spd-matrix-{SLUG}-db`
>
> 2. Add **R2 Bucket** binding:
>    - Variable name: `DOCUMENTS` (must be exactly `DOCUMENTS`)
>    - Select bucket: `spd-matrix-{SLUG}-documents`
>
> Then go to **Settings** > **Environment variables** (Production):
>
> 3. Add `GEMINI_API_KEY` = your Gemini consumer API key
>    (This serves as a fallback until Vertex AI is configured via the admin panel)
>
> Confirm when done.

### Step 3B: Deploy (Automated)

Deploy twice — the second deploy picks up the dashboard-configured bindings:

```bash
wrangler pages deploy . --project-name=spd-matrix-{SLUG}
```

Wait for the first deploy to complete, then deploy again:

```bash
wrangler pages deploy . --project-name=spd-matrix-{SLUG}
```

After the second deploy, verify it's live:

```bash
wrangler pages deployment list --project-name=spd-matrix-{SLUG}
```

---

## Phase 4: DNS (depends on Step 1C)

### Step 4A: CNAME Record (Manual)

> **Action needed in Cloudflare Dashboard:**
>
> Go to **DNS** for `syncrodocsystems.com` and add a CNAME record:
>
> | Field | Value |
> |-------|-------|
> | Type | CNAME |
> | Name | `{SLUG}` |
> | Target | `spd-matrix-{SLUG}.pages.dev` |
> | Proxy | ON (orange cloud) |
>
> Confirm when done.

### Step 4B: Custom Domain (Manual)

> **Action needed in Cloudflare Dashboard:**
>
> Go to **Workers & Pages** > `spd-matrix-{SLUG}` > **Custom domains**:
>
> Add custom domain: `{SLUG}.syncrodocsystems.com`
>
> Confirm when done.

---

## Phase 5: Cloudflare Access (depends on Step 4)

Guide the user through creating the Access application:

> **Action needed in Cloudflare Zero Trust Dashboard:**
>
> Go to **Access** > **Applications** > **Add an application**:
>
> 1. Type: **Self-hosted**
> 2. Application name: `SPD MATRIX {SLUG}` (uppercase slug for display)
> 3. Application domain: `{SLUG}.syncrodocsystems.com`
> 4. Session duration: **24 hours**
>
> **Policies** tab:
> 5. Create an **Allow** policy
> 6. Policy name: `{SLUG} Users`
> 7. Selector: **Emails**
> 8. Add these emails:
>    {list ACCESS_EMAILS, one per line}
>
> **Authentication** tab:
> 9. Enable login methods: **Google**, **Azure AD**, **One-time PIN**
>
> 10. Save
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

### Step 7A: First Login and Admin Grant

Ask the user to:

> **Action needed:**
>
> 1. Open `{SLUG}.syncrodocsystems.com` in your browser
> 2. Log in through Cloudflare Access with `{ADMIN_EMAIL}`
> 3. The app should load — this creates your user record in the database
>
> Confirm when you've logged in.

Once confirmed, grant admin:

```bash
psql "{DATABASE_URL}" -c "UPDATE users SET is_admin = true WHERE email = '{ADMIN_EMAIL}';"
```

Verify:

```bash
psql "{DATABASE_URL}" -c "SELECT email, is_admin FROM users WHERE email = '{ADMIN_EMAIL}';"
```

### Step 7B: Configure Vertex AI (Manual, in app)

> **Action needed in the app at `{SLUG}.syncrodocsystems.com`:**
>
> 1. Refresh the page (admin status should now be detected — green dot on settings gear)
> 2. Click the **settings gear** icon
> 3. In the admin section, switch to **Vertex AI** mode
> 4. Upload the **JSON key file** you downloaded from GCP
>    - This auto-fills: Service Account Email, Private Key, Project ID
> 5. Set **Region** to `us-central1` (or your preferred region)
> 6. Click **Test Connection** — verify it succeeds
> 7. Click **Save**
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

2. Tell the user the instance is live and provide a summary of what was created.

---

## Troubleshooting

### API calls return 500
- Check that Hyperdrive binding variable is exactly `DB` (not `HYPERDRIVE` or anything else)
- Check that R2 binding variable is exactly `DOCUMENTS`
- Verify Railway has public networking enabled
- Check `wrangler pages deployment tail --project-name=spd-matrix-{SLUG}` for error details

### Vertex AI returns 403
- Verify the service account has the `Vertex AI User` role
- Verify billing is enabled on the GCP project
- Verify the Vertex AI API is enabled
- Try the "Test Connection" button in the admin panel

### DNS not resolving
- Cloudflare proxied CNAMEs should resolve near-instantly
- Verify the CNAME record exists: check Cloudflare DNS dashboard
- Verify the custom domain was added to the Pages project

### User can't log in
- Verify their email is in the Cloudflare Access allowlist
- Check Zero Trust > Access > Applications > the correct application
- Ensure login methods (Google/Azure AD/OTP) are enabled

---

## Maintaining the Instance

- **Adding users:** Zero Trust > Access > Applications > `SPD MATRIX {SLUG}` > Policies > edit email list
- **Code updates:** `wrangler pages deploy . --project-name=spd-matrix-{SLUG}` (same code, isolated infra)
- **Schema migrations:** Apply same SQL to this instance's Railway database manually
- **Resetting data:** `psql "{DATABASE_URL}" -c "TRUNCATE users, analyses, chat_messages, notes, shared_analyses, share_tokens, app_settings CASCADE;"` then re-run admin setup
- **Logs:** `wrangler pages deployment tail --project-name=spd-matrix-{SLUG}`
