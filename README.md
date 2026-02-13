# SPD MATRIX

![SPD MATRIX Interface](screenshot.png)

**SPD MATRIX** is a browser-based tool for comparing pension plan documents across multiple plan units. Built for post-merger standardization, it uses Google Gemini's 1M-token context window to analyze complete SPDs side-by-side, producing executive summaries, comparison matrices, and detailed language extractions with exact page citations—work that would cost thousands at a law firm, completed in minutes for a few dollars.

**Key Features:**
- **Three-phase analysis:** Document summary → Comparison matrix → Detailed language extraction with citations
- **Interactive tables:** Sort columns, filter by value, drag-reorder rows via visible handles, and ask AI to group related provisions
- **Interactive chat:** Ask follow-up questions about the analysis with full document context
- **Session history:** Save, reload, and duplicate analyses with Railway PostgreSQL backend
- **Persistent document storage:** PDFs stored in Cloudflare R2 for seamless session reload and clickable citations
- **Merge workspace:** Select provisions from the comparison table, generate an AI-synthesized integrated column, then produce a formatted SPD draft — all editable with inline AI rework
- **Action-flagged notes:** Mark annotations as "actionable" to pass them as instructions to the AI during draft generation; toggle note types inline from the Merge selection view
- **Notes/annotations:** Highlight text and add Google Docs-style notes that persist across sessions
- **Sticky table headers:** Column labels stay visible while scrolling through large comparison matrices
- **Multi-format export:** Export results as CSV, XLSX, Word (.docx), PDF, or push directly to Google Sheets (including Summary tab)
- **Session inactivity timeout:** Auto-logout after 4 hours of inactivity with a 5-minute warning dialog
- **Cross-browser PDF viewer:** PDF.js-based citation viewer ensures correct page navigation in Safari, Chrome, and all browsers

## Getting Started

### Local Development
1. Copy `config.example.js` to `config.js` and add your [Gemini API key](https://aistudio.google.com/app/apikey)
2. Open `index.html` in a browser
3. Upload plan documents and click "Compare Documents"

### Cloudflare Pages Deployment
The repo is configured for Cloudflare Pages deployment with a unified codebase:
- **Single `index.html`**: Auto-detects local vs. Cloudflare environment at runtime
- **Server-side API proxy**: Pages Function at `functions/api/gemini/[model].js` proxies requests, keeping the API key hidden
- **Custom domain support**: Pages supports external DNS via CNAME (works with Squarespace, GoDaddy, etc.)
- **Cloudflare Access**: Multi-provider authentication (Google OAuth, Microsoft Entra ID, OTP fallback) with email allowlist

```bash
wrangler pages deploy .                    # Deploy to production
wrangler pages secret put GEMINI_API_KEY   # Add API key (first time only)
```

For local testing with proxy: `wrangler pages dev .` (uses `.dev.vars` for secrets)

**Custom Domain Setup:**
1. In Cloudflare Pages dashboard, add custom domain (e.g., `spd-matrix.yourdomain.com`)
2. Add CNAME record in your DNS provider pointing to `spd-matrix.pages.dev`
3. Cloudflare handles SSL automatically

## Development History

```mermaid
%%{init: { 'theme': 'neutral' } }%%
gitGraph TB:
    commit id: "d0f2cd3"
    branch anthropic-agent
    commit id: "ada75b7"
    commit id: "ce4a76b"
    commit id: "649b993"
    commit id: "cf93985"
    commit id: "8ce5174"
    commit id: "58c61fa"
    commit id: "fabb649"
    commit id: "a6a7244"
    checkout main
    merge anthropic-agent
    branch gemini-rework
    commit id: "11cae84"
    commit id: "0fe413f"
    commit id: "66ac310"
    checkout main
    merge gemini-rework
    branch updated-approach
    commit id: "8b4790d"
    commit id: "b972f4c"
    checkout main
    merge updated-approach
    branch gemini-model-upgrade
    commit id: "d9e30d5"
    checkout main
    merge gemini-model-upgrade
    branch chat-with-results
    commit id: "444b5be"
    commit id: "82cc701"
    commit id: "dbf55c3"
    checkout main
    merge chat-with-results
    branch ui-refresh
    commit id: "d2a25ac"
    commit id: "fd35c3c"
    commit id: "941d401"
    commit id: "b02ee8e"
    commit id: "a82669d"
    commit id: "1c17518"
    checkout main
    merge ui-refresh
```

### Timeline

**November 5, 2025 — Initial Development (Claude API)**
- `d0f2cd3` Project structure and configuration scaffold
- `ada75b7` SPD Plan Comparison Agent chat interface with Claude integration
- `ce4a76b` Page title update and CLAUDE.md documentation
- `649b993` Plan Docs file upload with base64 PDF encoding
- `cf93985` File upload implementation refinements
- `8ce5174` System prompt integration with prompt caching
- `58c61fa` "Compare Documents" button for initial interaction workflow
- `fabb649` Documentation updates
- `a6a7244` UI redesign with modern light mode and monochrome aesthetic

**November 11, 2025 — Gemini Migration**
- `11cae84` **Major pivot:** Migrate from Claude to Google Gemini 2.5 Pro (10x page limits, 5x context)
- `0fe413f` Three-output tabbed interface (Summary, Comparison, Language)
- `66ac310` UX improvements: loading indicators, smart progress detection

**November 12, 2025 — Three-Phase Workflow**
- `8b4790d` Multi-turn workflow experiment (reverted)
- `b972f4c` **Architecture change:** Three-phase sequential API with progressive context engineering

**November 21, 2025 — Gemini 3 Pro + Chat**
- `d9e30d5` Upgrade to Gemini 3 Pro Preview (65k token output, advanced reasoning)
- `444b5be` Interactive chat feature for post-comparison analysis
- `82cc701` Chat UI refactor to permanent collapsed sidebar
- `dbf55c3` README update with three-phase and chat documentation

**November 25-26, 2025 — Production Polish**
- `d2a25ac` Live streaming tabs replace static loading screen
- `fd35c3c` Smarter tab switching and status updates during streaming
- `941d401` UI polish: citation highlighting, downloads, chat panel, settings
- `b02ee8e` QA test outputs and comparative analysis
- `a82669d` Rebrand to "SPD MATRIX" with professional enterprise UI
- `1c17518` Repository cleanup (remove internal directories)
- `3a5e982` **Clickable citations:** Click any citation to open the source PDF at the referenced page

**November 28, 2025 — Cloudflare Pages & Unified Codebase**
- Convert from Cloudflare Workers to Pages for custom domain support with external DNS
- Pages Function proxies Gemini API requests with server-side key injection (never exposed to browser)
- Custom domain configured via CNAME from Squarespace DNS
- Cloudflare Access configured with email allowlist policy
- **Unified codebase:** Single `index.html` with runtime environment detection (eliminates duplicate files)
- **Citation regex fix:** Handle quoted filenames in model output (e.g., `("filename.pdf", Page 6)`)
- Settings modal adapts to show API key input (local) or "Secured server-side" indicator (Cloudflare)

**December 15, 2025 — Session History**
- Railway PostgreSQL backend for persistent storage
- User-specific session history via Cloudflare Access email header
- Save/load analyses with all three phases and chat messages preserved
- Hyperdrive connection pooling for optimal database performance

**December 18, 2025 — Notes Feature**
- Google Docs-style annotations on any highlighted text in analysis tabs
- Text anchoring with prefix/suffix context for reliable restoration
- Immediate auto-save to PostgreSQL backend
- Notes persist across sessions and reload with saved analyses
- Markdown support in note content with inline rendering

**December 22, 2025 — Multi-Provider Authentication**
- Replaced slow email OTP as primary login with instant social login options
- Added Google OAuth identity provider (works with any email via Google account)
- Added Microsoft Entra ID identity provider (multi-tenant, supports any MS365 organization)
- Email allowlist policy unchanged—controls WHO can access regardless of login method
- Users now see three login options: Google, Microsoft, or One-time PIN fallback

**December 22, 2025 — Persistent Document Storage (Cloudflare R2)**
- PDFs now stored in Cloudflare R2 object storage after analysis completes
- Session reload fetches documents from R2—no need to re-upload files
- Citations work immediately when loading saved sessions (R2 URL with `#page=N`)
- Chat feature works with reloaded sessions (documents re-sent to Gemini from R2)
- R2 cascade delete: files automatically removed when analysis is deleted
- Foundation for future session sharing (authenticated users can access shared documents)

**January 7, 2026 — Sticky Table Headers**
- Table column headers now freeze at the top when scrolling through comparison matrices
- Output header ("Comparison Spreadsheet", etc.) also sticks to prevent content gaps
- Subtle box-shadow provides visual separation between frozen header and scrolled content

**January 7, 2026 — Safari Compatibility & PDF.js Viewer**
- **Notes popup fix:** Safari-specific event delegation issues prevented note popups from reopening after clicking the close button; replaced inline `onclick` with `addEventListener` and added direct click handlers on highlight elements
- **PDF.js citation viewer:** Safari's built-in PDF viewer ignores `#page=N` URL fragments; added `viewer.html` using PDF.js to ensure citations navigate to the correct page in all browsers
- **Old session citation fix:** Citations in pre-R2 sessions showed "File not found" due to overly strict file filtering; now correctly displays "PDF unavailable (pre-storage session)" with proper tooltip messaging

**January 22, 2026 — Citation Regex Fix**
- Fixed clickable citations not working when Gemini outputs `p.` page format (e.g., `(filename.pdf, p. 1)`)
- Citation regex now matches `p`, `p.`, `pg`, `pg.`, and `page` prefixes

**February 5, 2026 — Export Menu & Google Sheets Integration**
- Replaced single "Download" buttons with Export dropdown menus on all three analysis tabs
- Summary tab offers CSV and XLSX export; Comparison and Citations tabs add "Push to Google Sheets"
- XLSX generation uses SheetJS (already loaded for file reading) with auto-sized columns
- Google Sheets integration uses Google Identity Services OAuth with the existing Cloudflare Access OAuth Client ID
- Sheets export creates a formatted spreadsheet (bold frozen header, text wrapping, sized columns) and opens it in a new tab
- Markdown formatting (`**bold**`, `<br>` tags) stripped during export; separator rows filtered out
- Google Sheets API enabled in existing "SPD Matrix Auth" GCP project; OAuth consent screen set to Production
- Export buttons now correctly appear when loading saved analyses (bug fix)

**February 5, 2026 — Interactive Table Controls**
- Comparison and Citations tabs now render as interactive tables with sort, filter, and drag-reorder
- Click any column header to sort (ascending, descending, original); click the filter button to filter by value
- Drag rows from the first column to manually reorder
- AI-powered table rearrangement: ask the chat to "group similar provisions together" and the table reorganizes with labeled group headers
- Dual representation: markdown stays as source of truth for streaming/persistence; structured data drives interactive rendering after streaming completes
- View state (sort, filters, row order, AI groups) persists to `table_view_state` JSONB column and restores on session reload
- XLSX and Google Sheets exports respect the current view state (active sort, filtered rows excluded, group headers included)
- Citation highlighting applied per-cell to prevent regex from matching across HTML tag boundaries

**February 5, 2026 — Duplicate Session**
- Duplicate button on every history card (owned and shared) creates a full server-side copy
- Server-side endpoint copies analysis outputs, R2 files (with new keys), chat messages, notes with replies (remapping parent IDs), and table view state
- Duplicated sessions are fully independent—deleting the original doesn't affect the copy
- Rename modal opens immediately after duplication for convenient naming
- Toast notification system for non-blocking feedback
- New item added to local state directly to avoid Hyperdrive query cache staleness on sidebar refresh

**February 5, 2026 — Draft Workspace & Action-Flagged Notes**
- New "Draft" tab (4th tab) replaces "Coming Soon" — enabled after comparison completes
- Three-phase draft workflow: Selection → Integration → Draft Document
- Selection phase renders the comparison table with per-cell checkboxes; users choose which plan provisions to include (multiple plans per row supported for AI synthesis)
- Per-cell mini-prompts: textarea appears on selected cells for specific instructions (e.g., "prefer San Diego's language")
- Action-flagged notes: toggle any annotation between "observational" (yellow) and "actionable" (orange); actionable notes are passed as AI instructions during generation
- AI integration phase synthesizes selected provisions into a unified view via Gemini streaming
- AI draft phase transforms the integrated column into a formatted SPD section, using the original source documents' writing style as reference
- Both phases produce editable contenteditable divs with debounced auto-save
- Inline AI rework: highlight text in either editor → selection hint popup → enter instruction → AI replaces the selection (uses `execCommand` for browser undo support)
- Full persistence: selections, cell prompts, integrated column, draft content, and current phase saved to `draft_state` JSONB column and restored on session reload
- Export draft as TXT or Markdown
- In-app dialog system replaces all native `alert()`/`prompt()` calls with styled modals
- Fixed drag-and-drop breaking text selection on Comparison/Language tabs: rows are only made `draggable` when mousedown is on the first column, preserving normal text selection and note-taking elsewhere

**February 6, 2026 — UAT Feedback Fixes**
- Renamed "Draft" tab to "Merge" (display text only; all internal identifiers unchanged)
- Fixed AI Rework silently failing: the modal dialog was stealing focus, causing `execCommand('insertText')` to have no selection to replace; now saves the Range before the dialog and restores it after the AI responds
- Added DOCX and PDF export to the Merge tab via `html-docx-js` and `html2pdf.js` CDN libraries
- Actionable notes now visible inline in the Merge selection view: colored indicators on rows with notes, expandable panels with Obs/Act toggle switches
- Added visible drag handles (`⋮⋮`) to the first column of interactive tables so users can see and grab the drag target

**February 13, 2026 — UAT Feedback Round 2**
- Fixed old analysis content flashing when starting a new comparison: `runThreePhaseComparison()` now clears all previous state and output HTML before beginning
- Fixed "Plan Docs (0 files)" badge not updating when loading a saved session from history: `updateFilesCount()` now called after each R2 file restore
- Hardened DOCX/PDF export on Merge tab: downgraded `html-docx-js` to v0.3.1 (stable), added try/catch with user-visible error dialogs and library-load guards on all export methods
- Added Word (.docx) and PDF export to the Summary tab (previously only offered TXT and XLSX)
- Added "New Analysis" (+) button to the main header bar for discoverability (previously only available inside the History sidebar)
- Added client-side session inactivity timeout: warns after 4 hours of inactivity, auto-logs out via Cloudflare Access after 5-minute grace period

## License

MIT License. See [LICENSE](LICENSE) for details.
