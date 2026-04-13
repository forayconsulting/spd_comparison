# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an SPD (Summary Plan Description) comparison tool for Western Pension Fund merger implementation. The goal is to compare pension plan documents across 5 plan units to support standardization efforts, producing three distinct outputs optimized for different user needs (attorneys, actuaries, project leads).

**Current Requirements:**
- Compare SPD/SMM documents from 5 plan units (San Diego, Vegas, Sacramento, Plan 4, San Francisco)
- Focus on Claims and Appeals Procedures (initial scope)
- Produce three coordinated outputs: Summary (markdown), Comparison Spreadsheet (Excel), Language Comparison (Excel)
- Support multi-session analysis as merger progresses
- Demo target: November 18, 2pm ET

See `requirements/new-requirements.md` for detailed business requirements.

## Architecture

### Three-Phase Sequential Analysis Application

The project uses a browser-based application (`index.html`) that integrates with Google's Gemini API using **three sequential API calls** with progressive context engineering:

- **Model:** Gemini 3.1 Pro Preview (most advanced reasoning model, 65k token output, 100MB file limit)
- **Context Window:** 1 million tokens (~750,000 words or ~1,500 pages)
- **Streaming:** Real-time SSE (Server-Sent Events) streaming via Fetch API
- **Workflow:** Three sequential phases, each re-uploading PDFs for fresh analysis
- **Output Format:** Markdown/text responses parsed and rendered into three tabs
- **Prompts:** Three focused, simple prompts (no complex system instruction)
- **UI:** Tabbed interface that populates progressively as each phase completes

### Key Components

**index.html:**
- Self-contained HTML/CSS/JS application (no build step)
- Dependencies loaded via CDN:
  - `marked.js` for markdown rendering
  - `prism.js` for syntax highlighting
  - `xlsx.js` for Excel file generation
- State management via `ChatApp` object pattern
- SSE streaming: parses `data: {JSON}` format, accumulates full response
- Four-tab UI: Summary, Comparison Spreadsheet, Language Comparison, Draft
- Excel generation: Client-side using SheetJS (xlsx.js)
- Modern monochrome aesthetic with glassmorphism effects

**API Integration:**
- Direct browser-to-Gemini API calls (CORS supported natively, no special headers needed)
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`
- Authentication: `x-goog-api-key` header
- Message format: `contents` array with `parts[]` structure (PDFs as inline base64)
- **Vanilla system instruction:** "You are a helpful assistant." (minimal, replicates manual Gemini UI experience)
- **No prompt caching:** PDFs re-uploaded in each phase for fresh analysis
- **Thinking:** Model performs internal reasoning automatically (API config not yet available)
- **Output directives:**
  - Phase 1: "Be as concise as possible without oversimplifying. Maximum 500 words response."
  - Phase 2 & 3: "Return ONLY the table with no preamble, introduction, or footnotes. Do not oversimplify. Do not condense. Complete this task as comprehensively and completely as possible."
- Response format: Plain text/markdown (rendered directly via marked.js)
- **Table styling:** Subtle borders added to all tables for better cell visibility; sticky headers keep column labels visible while scrolling

**Three-Phase Workflow:**
1. **Phase 1: Document Summary**
   - Prompt: "Comprehensively read all attached documents. Return an organized overview... Be as concise as possible without oversimplifying. Maximum 500 words response."
   - Uploads: All PDF files
   - Output: Concise markdown summary (max 500 words) of document structure, relationships, domain
   - Populates: Summary tab

2. **Phase 2: Comparison Table**
   - Prompt: "Read all attached documents. Here is a summary: <summary>...</summary>. Return a detailed comparison table... Return ONLY the comparison table with no preamble, introduction, or footnotes. Do not oversimplify. Do not condense. Complete this task as comprehensively and completely as possible."
   - Uploads: All PDF files (fresh)
   - Input: Phase 1 summary embedded in prompt
   - Output: Markdown table comparing procedural elements across plans (table only, no preamble)
   - Populates: Comparison tab

3. **Phase 3: Language Comparison**
   - Prompt: "Read all attached documents. Summary: <summary>...</summary>. Comparison: <comparison>...</comparison>. Create detailed version with full quotes and citations... (filename, page_number, paragraph_number)... Return ONLY the detailed comparison table with no preamble, introduction, or footnotes. Do not oversimplify. Do not condense. Complete this task as comprehensively and completely as possible."
   - Uploads: All PDF files (fresh)
   - Input: Phase 1 summary + Phase 2 comparison embedded in prompt
   - Output: Markdown table with full legal text and citations in format: (filename, page_number, paragraph_number) - table only, no preamble
   - Populates: Language tab

**Timeline Analysis (Minutes Analysis Mode):**

When `analysisMode === 'minutes-analysis'`, the app takes an entirely different path — a **2-phase AI workflow** produces structured JSON (not markdown tables), which feeds a **timeline workspace** that replaces the tab-based view entirely.

1. **Phase 1: Summary + Ontology**
   - Same Phase 1 prompt with minutes-specific addendum requesting a fenced `json` block containing `{meetings: [...], topics: [...]}`
   - Output: Text overview + JSON ontology parsed via `parseTimelineJSON()`
   - `PROMPT_TEMPLATES.phase1()` with `MODE_ADDENDA['minutes-analysis'].phase1`

2. **Phase 2: Topic Extraction**
   - Custom prompt `PROMPT_TEMPLATES.timelinePhase2(ontologyJSON, fileList)`
   - Output: Fenced JSON array of meeting objects with `{id, title, date, type, file, topics: {name: {text, citations}}}`
   - Stored in `comparisonResponse` for persistence (same DB column, different format)

- **Rendering:** `renderTimelineWorkspace()` → horizontal timeline with meeting nodes, topic blips, thread lines, detail panel, filters, chat sidebar
- **Topic colors:** `TIMELINE_TOPIC_COLORS` palette (10 colors), assigned by index from ontology
- **Custom AI filters:** `submitTimelineCustomFilter()` makes a single-turn API call to search meeting data
- **Chat:** Uses same multi-turn infrastructure but routes DOM elements via `getChatMessagesEl()`, `getChatInputEl()`, `getChatSendBtnEl()` helpers
- **Session restore:** `renderLoadedTimelineAnalysis()` rebuilds ontology from stored meetings JSON; graceful fallback to tab view if parsing fails
- **View state:** Zoom level, active topic, custom filters persisted to `table_view_state` JSONB column
- **No backend changes:** Same DB schema, same API endpoints

**Configuration:**
- `config.js` (gitignored) contains actual API key
- `config.example.js` provides template
- Configuration object:
  - `CONFIG.GEMINI_API_KEY`: API key from Google AI Studio
  - `CONFIG.MODEL`: Model to use (default: gemini-3.1-pro-preview)
  - `CONFIG.MAX_OUTPUT_TOKENS`: 32768 (Gemini 3.1 Pro supports up to 65,536 tokens)
  - `CONFIG.THINKING_LEVEL`: Controls reasoning depth - 'low' (fast), 'medium' (balanced), or 'high' (deep reasoning, default). Used in `thinkingConfig.thinkingLevel` API parameter.
  - `CONFIG.COMPACTION_MODEL`: Model for chat compaction (default: gemini-2.0-flash). Should be cheap/fast.
  - `CONFIG.COMPACTION_THRESHOLD`: Turn-pairs before compaction triggers (default: 10).

### File Structure

```
/
├── index.html                      # Main three-output interface (Gemini-powered)
├── viewer.html                     # PDF.js viewer for citation links (Safari-compatible)
├── timeline-prototype.html         # Standalone timeline visualization prototype (reference)
├── config.js                       # API key configuration (gitignored)
├── config.example.js               # Config template
├── wrangler.toml                   # Cloudflare Pages configuration
├── functions/                      # Cloudflare Pages Functions (API routes)
│   └── api/                        # API endpoints
│       ├── admin/settings.js       # Admin settings GET/POST (Vertex AI config)
│       ├── admin/test-vertex.js    # Vertex AI connection test endpoint
│       ├── gemini/[model].js       # Dual-path proxy: Vertex AI or Consumer API
│       └── gemini/_vertex.js       # JWT token minting for Vertex AI
├── plan_docs/                      # PDF files (gitignored)
├── legacy/                         # Legacy implementations
│   ├── index.html                  # Original single-output Claude version
│   ├── config.example.js           # Claude config template
│   └── requirements.md             # Original POC requirements
├── requirements/
│   ├── new-requirements.md         # Current merger implementation requirements
│   ├── system_prompt.md            # Three-output JSON generation system prompt
│   ├── output_schema.json          # JSON schema for three outputs
│   └── procedure_elements.md       # Standard procedure element list
├── tests/
│   ├── unit/                       # Vitest unit tests (npm test)
│   │   ├── api-error-handling.test.js  # API error propagation, SSE parsing, JSON recovery
│   │   ├── api-validation.test.js      # Admin settings, token validation, email checks
│   │   ├── db-helpers.test.js          # Database helper function tests
│   │   └── file-upload.test.js         # File upload validation tests
│   ├── e2e/                        # Playwright E2E tests (npm run test:e2e)
│   │   └── feedback-fixes.spec.cjs # UI feedback regression tests
│   ├── test-gemini.html            # CORS/API testing tool
│   └── QA/                         # QA test outputs (3 production runs)
│       ├── 1/, 2/, 3/              # Individual run outputs
│       └── QA_Analysis.md          # Comparative analysis of runs
└── README.md
```

## Running the Application

**Setup:**
1. Copy `config.example.js` to `config.js`
2. Add your Gemini API key to `config.js` (get one at https://aistudio.google.com/app/apikey)
3. Open `index.html` in a web browser

No build process, server, or dependencies installation required.

**Usage:**
1. Click "Plan Docs" section to expand file upload
2. Upload SPD/SMM PDFs for all 5 plan units
3. Click "Compare Documents" button
4. **Watch three-phase progress:**
   - Phase 1/3: Reading and identifying document structure...
   - Phase 2/3: Building comparison table across plans...
   - Phase 3/3: Extracting detailed language with citations...
5. **Tabs populate progressively:**
   - Summary tab appears after Phase 1 completes
   - Comparison tab appears after Phase 2 completes
   - Language tab appears after Phase 3 completes
   - 💬 Chat tab becomes enabled after Phase 3 completes
6. **Optional: Chat with Results**
   - Click the "💬 Chat" tab to enter split-view mode
   - Left panel shows comparison results (switchable via mini-tabs)
   - Right panel provides chat interface
   - Ask questions like "Can you dig in on vesting rules?"
   - Responses reference comparison table rows and cite documents
7. **Export results** using the Export dropdown in each tab (CSV, XLSX, Word, PDF, or Push to Google Sheets depending on tab)

## Implementation Notes

### Three-Phase Sequential Approach: Rationale

**Why Three Sequential Calls Instead of One?**

The application previously used a single API call with a complex 437-line system prompt that attempted to generate all three outputs in JSON format. This approach was replaced with three sequential calls for the following reasons:

**1. Higher Quality Results:**
- Each phase gets fresh document analysis without relying on cached context
- Model can focus on one specific task per call (summary, then comparison, then language extraction)
- Progressive context engineering: each phase builds on previous outputs explicitly in the prompt

**2. Better Reliability:**
- No JSON parsing failures (responses are plain text/markdown)
- Simpler prompts = more predictable outputs
- Model doesn't need to maintain complex JSON structure while reasoning

**3. More Interpretable Citations:**
- Explicit citation format: `(filename, page_number, paragraph_number)`
- Citations embedded directly in response text, not as separate metadata
- Format specified clearly in Phase 3 prompt

**4. Proven Manual Workflow:**
- This approach replicates a successful manual workflow demonstrated in `requirements/updated-approach.md`
- User testing showed this multi-step process produces higher quality results than single-shot generation

**Trade-offs:**
- **Higher Cost:** PDFs uploaded 3 times (3x token cost)
- **Longer Duration:** Three sequential API calls vs. one
- **No Caching:** Intentionally disabled to get fresh analysis each time

**Decision:** The quality and reliability improvements outweigh the cost increase. SPD comparison is a rare, high-value operation where quality matters more than speed/cost.

### Migration from Claude to Gemini

**Why We Migrated:**
- **10x higher PDF page limits:** 1,000 pages per PDF (vs 100 with Claude)
- **5x larger context window:** 1M tokens (vs 200k with Claude)
- **Lower cost:** ~40% cheaper for large document analysis
- **Direct browser support:** Native CORS, no special headers needed
- **Simpler streaming:** Standard SSE format

**Key Implementation Differences:**

| Feature | Claude (Legacy) | Gemini (Current) |
|---------|----------------|------------------|
| **API Endpoint** | `api.anthropic.com/v1/messages` | `generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent` |
| **Authentication** | `x-api-key` + `anthropic-dangerous-direct-browser-access: true` | `x-goog-api-key` (simple) |
| **Message Format** | `messages: [{role, content}]` | `contents: [{role, parts: [...]}]` |
| **System Prompt** | `system: [...]` array | `systemInstruction: {parts: [...]}` |
| **PDF Upload** | `{type: 'document', source: {...}}` | `{inline_data: {mime_type, data}}` |
| **Streaming Events** | Complex: `content_block_start/delta/stop` | Simple: `data: {JSON}` SSE |
| **Thinking Mode** | `thinking: {type: 'enabled', budget_tokens}` with visible thinking blocks | Built-in (internal reasoning, not exposed) |
| **Caching** | Explicit `cache_control: {type: "ephemeral"}` | Implicit (automatic, 75% savings) |
| **Multi-turn** | Requires `signature` field preservation | Standard `contents` history |

### System Prompt Integration

- 437-line specialized pension plan analyst prompt embedded in `index.html`
- Defines ERISA expertise, extraction methodology, XML output formats
- Sent as `systemInstruction: {parts: [{text: SYSTEM_PROMPT_TEXT}]}`
- Implicit caching: First request caches prompt, subsequent requests get 75% cost reduction
- Cache duration: Automatic (Google manages)
- Source: `requirements/system_prompt.md`

### Initial Workflow - Compare Documents Button

- First interaction shows prominent "Compare Documents" button instead of chat input
- Button disabled until files uploaded with dynamic helper text states:
  - No files: "Upload plan documents above to begin comparison"
  - Files uploading: "Waiting for files to finish uploading..." (warning color)
  - Ready: "Click to compare uploaded plan documents"
- Clicking button automatically sends: "Compare the attached plan documents."
- After first response, UI transitions to normal chat interface (textarea + Send button)
- Error handling: If first request fails, reverts to Compare button with retry instructions
- State detection: `isInitialState()` checks `messages.length === 0`

### Pre-flight Model Validation

Before starting any multi-phase analysis, `validateModelAccess()` makes a minimal API call (`Say "ok"`, maxOutputTokens: 10) to verify the configured model is accessible. This catches model-not-found, auth failures, and quota issues immediately (<2 seconds) instead of after uploading files across multiple phases. The pre-flight check runs at the top of `runThreePhaseComparison()`, protecting all analysis modes (cross-plan, amendment-tracking, minutes-analysis, invoice-analysis).

### Streaming Implementation

**Gemini SSE Format:**
```javascript
// Parse JSON chunks, detect API errors from proxy
const lines = event.split(/\r?\n/);
for (const line of lines) {
  if (line.startsWith('data: ')) {
    const chunk = JSON.parse(line.slice(6));
    if (chunk.error) {
      throw new Error(`API error (${chunk.error.code}): ${chunk.error.message}`);
    }
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      // Append to response
    }
  }
}
```

**API Error Propagation:**
The Cloudflare proxy returns `200 OK` immediately via `TransformStream` (to support keepalives), so upstream API errors arrive as SSE data events, not HTTP status codes. All 7 stream-parsing locations detect `chunk.error` and propagate the real API error message:
- `handleStreamChunk()` / `streamResponse()`: Sets `this.state.streamError`, checked after stream loop
- `handleChatStreamChunk()` / `streamChatResponseMultiTurn()`: Same state-based pattern
- `runCompaction()`, `streamDraftResponse()`, `streamRegenSectionResponse()`, `streamRegenResponse()`, `streamDraftReworkResponse()`: Inline `chunk.error` check with re-throw

The proxy (`functions/api/gemini/[model].js`) includes the upstream URL and a parsed error message in error events, aiding diagnosis of Vertex AI vs Consumer API routing issues.

**Internal Reasoning:**
- Gemini 3.1 Pro has configurable internal reasoning via `thinkingConfig.thinkingLevel` parameter
- Structure: `generationConfig: { thinkingConfig: { thinkingLevel: 'high' } }`
- Options: `'low'` (fast, cost-effective), `'medium'` (balanced), or `'high'` (deep reasoning, default)
- Reasoning happens internally and is not exposed in API responses
- No equivalent to Claude's visible thinking blocks

**State Management:**
- Messages stored as `{role, content, thinking}` objects (thinking always empty for Gemini)
- Current streaming state: `currentResponse`
- Finalized messages added to history after stream completes

## Plan Docs File Upload Feature

**Overview:**
Collapsible "Plan Docs" section enables drag-and-drop upload of PDF files for document comparison. Files are base64-encoded locally and included in message context.

**Implementation Approach:**
- **Base64 Encoding:** Files are read locally using FileReader API and converted to base64
- **Direct Inline Upload:** Base64 data sent directly in message `parts` array
- **Local Storage:** File data stored in `ChatApp.state.uploadedFiles` array
- **Automatic Inclusion:** All uploaded files with `status: 'uploaded'` are included in first user message only

**File Upload Process:**
1. User drags/drops or clicks to browse files
2. Files validated (20 MB max per file for inline upload)
3. FileReader converts to base64 string
4. File object stored with metadata: `{id, filename, size, mimeType, status, base64Data}`
5. Status updates: `uploading` → `uploaded` or `error`
6. `renderInputArea()` called to update Compare button state

**Message Format (Gemini):**
```javascript
{
  role: 'user',
  parts: [
    {
      inline_data: {
        mime_type: 'application/pdf',
        data: 'JVBERi0xLjQK...'  // base64 string
      }
    },
    {
      inline_data: {
        mime_type: 'application/pdf',
        data: 'JVBERi0xLjQK...'  // another PDF
      }
    },
    { text: 'Compare the attached plan documents.' }
  ]
}
```

**UI Components:**
- Collapsible panel between header and messages
- Drag-and-drop zone with visual feedback
- File cards showing: icon, full filename, size, status, remove button
- File count badge: "📁 Plan Docs (X files)"
- Status indicators: ✓ Uploaded, 🔄 Uploading..., ✗ Error
- Updated hint text: "Max 1,000 pages per PDF • 20 MB inline limit"

### PDF Page Limits - Gemini Advantages

**The Gemini Advantage:** 1,000 pages **per individual PDF document**

**Comparison:**
| Provider | Pages per PDF | Total Context | Max Output |
|----------|---------------|---------------|------------|
| **Gemini 3.1 Pro Preview** | 1,000 pages | 1M tokens (~1,500 pages total) | 65k tokens |
| Gemini 2.5 Pro | 1,000 pages | 1M tokens (~1,500 pages total) | 8k tokens |
| Claude Haiku/Sonnet | 100 pages | 200k tokens (~400 pages total) | 8k tokens |

**What Now Works (vs. Claude):**
- ✅ Large SPDs (100-1,000 pages each)
- ✅ Example: 156-page SPD + multiple SMMs in single request
- ✅ Multiple large documents (if combined pages < 1,000)
- ✅ Full document analysis instead of excerpts

**Constraints:**
- Individual PDF: 1,000 pages maximum
- File size: 20 MB per file (inline), 50 MB (via Files API, not yet implemented)
- Total request: 1M tokens context window
- Each page ≈ 258 tokens

**Testing Results:**
- ✅ 12.6 MB PDF (156 pages) + 49 KB PDF (2 pages): Works perfectly
- ✅ Real-time streaming with large documents
- ✅ No CORS issues (native browser support)

**Current Approach:**
- Upload full SPDs and large documents directly
- No need for excerpts or batching for documents <1,000 pages
- Can compare 6-10 complete SPDs simultaneously (if each <1,000 pages and total fits in context)

## Interactive Table Controls

**Overview:**
Comparison and Citations tabs use a dual representation: markdown is the source of truth for streaming and persistence, while structured data drives an interactive custom table renderer after streaming completes.

**Architecture:**
```
STREAMING         →  TRANSITION           →  INTERACTIVE
marked.parse()       parseTableData()         renderInteractiveTable()
(progressive)        (one-time parse)         (sort/filter/drag/group)
```

**Key Methods:**
- `parseTableData(markdown)`: Parses markdown table preserving raw cell formatting (bold, italic, `<br>`) into `{headers, rows, sortColumn, sortDirection, filters, rowOrder, groups}`
- `getViewRows(tableData)`: Applies current view state to return ordered/filtered rows with group headers interleaved
- `renderInteractiveTable(tab)`: Builds custom HTML table with sort indicators, filter buttons, draggable rows, and toolbar
- `highlightCitations()`: Applied per-cell (not on whole HTML) to prevent regex matching across HTML tag boundaries
- `getExportData(tab)`: Returns 2D array reflecting current view state for XLSX/Google Sheets export
- `saveTableViewState(tab)` / `applyTableViewState(tab, viewState)`: Persist/restore view state via PATCH endpoint

**Controls:**
- **Sort**: Click column header to cycle ascending → descending → original order
- **Filter**: Click filter button (▾) on header → dropdown with searchable checkboxes per unique value
- **Drag reorder**: Grab first column cell to drag rows to new positions
- **AI grouping**: Chat can respond with `{"action":"rearrange","tab":"...","groups":[...]}` JSON to group/reorder rows
- **Reset**: "Reset View" button in toolbar clears all customizations

**View State Persistence:**
- Stored in `table_view_state JSONB` column on `analyses` table
- Saved per-tab via PATCH `/api/history/analyses/:id` (merged with existing state)
- Restored on session load in `renderLoadedAnalysis()`
- Filters serialized as arrays (Sets not JSON-serializable)

**Transition Points:**
- After Phase 2/3 in `runThreePhaseComparison()`: parse + render interactive
- In `renderLoadedAnalysis()`: parse + apply saved view state + render
- In `renderComparisonTab()` / `renderLanguageTab()`: use interactive if data available, fallback to `marked.parse()`
- During streaming: `updateStreamingResponse()` continues using `marked.parse()` (no change)

**AI Chat Integration:**
- `buildChatSystemInstruction()` includes rearrangement instructions and row-ID reference table
- `sendChatMessage()` checks response for JSON rearrangement block via `parseRearrangementResponse()`
- If detected: applies grouping, re-renders table, switches to affected tab, shows human-readable message in chat

## Chat with Results Feature

**Overview:**
After the three-phase comparison completes, attorneys can engage in follow-up analysis via an interactive chat interface. This enables focused exploration of specific topics (e.g., "Analyze vesting rules") and validation of findings without re-running the full comparison.

**Architecture:**

**Split-View Layout:**
```
┌─────────────────────────────────────────────┐
│ [Summary] [Comparison] [Language] [💬 Chat] │ ← Tab bar (Chat enabled after Phase 3)
├──────────────────────┬──────────────────────┤
│ Results Panel (40%)  │ Chat Panel (60%)     │
│ [Sum][Cmp][Lng] ←───┤                      │
│ Mini-tabs            │ User: Can you dig... │
│                      │ Assistant: Based...   │
│ [Selected content]   │                      │
│                      │ ┌─────────────────┐  │
│                      │ │ Ask a question  │  │
└──────────────────────┴──┴─────────────────┴──┘
```

**Multi-Turn Architecture:**
Chat uses true multi-turn Gemini conversation instead of single-prompt-per-message. Analysis context is placed in `systemInstruction` (sent once), and the full conversation history flows through `contents` as alternating user/model turns. Documents are attached to the first user turn only.

**Compaction:**
After a configurable number of turn-pairs (default 10), conversation history is summarized by a cheap/fast model (default `gemini-2.0-flash`) and replaced with a compaction marker. This prevents context window exhaustion during long chat sessions while preserving conversational continuity.

- Compaction triggers automatically before the next message when the threshold is reached
- Summary is injected into `systemInstruction` as `CONVERSATION CONTEXT` for subsequent turns
- Only messages after the last compaction marker are sent as `contents` turns
- Visual "Conversation summarized" divider shown in chat UI
- Compaction state persists to DB via `is_compaction` flag on `chat_messages` table
- On session reload, `reconstructCompactionState()` rebuilds turn counters and summary from DB markers

**State Management:**
```javascript
state: {
  // Chat-specific properties
  chatMessages: [],              // [{role, content, timestamp, isCompactionMarker?, compactionSummary?}]
  isChatStreaming: false,        // Separate from main comparison streaming
  currentChatResponse: '',       // Accumulator for chat streaming
  chatPanelResultTab: 'comparison', // Which result to show in left panel
  // Multi-turn compaction
  chatTurnsSinceCompaction: 0,   // Turn-pairs since last compaction
  compactionSummary: null,       // Current compaction summary text
  compactionCount: 0,            // Total compactions this session
  isCompacting: false,           // True during compaction API call
}
```

**Key Methods:**
- `switchTab('chat')`: Activates split-view mode, hides normal tab view
- `switchMiniResultTab(resultType)`: Switches left panel between Summary/Comparison/Language
- `renderMiniResultPanel(resultType)`: Renders selected result in left panel
- `sendChatMessage(userQuestion)`: Checks compaction threshold, builds multi-turn contents, streams response
- `buildChatSystemInstruction()`: Builds `systemInstruction` with analysis context + compaction summary
- `buildChatContents(userQuestion)`: Builds `contents` array from post-compaction history + current question, attaching files to first user turn
- `getMessagesSinceCompaction()`: Returns only messages after the last compaction marker
- `streamChatResponseMultiTurn(contents, systemInstruction)`: Handles multi-turn streaming
- `runCompaction()`: Summarizes conversation via cheap model, inserts compaction marker
- `reconstructCompactionState()`: Rebuilds compaction state from DB `is_compaction` flags on session load
- `saveChatCompactionState()`: Persists compaction marker to backend
- `renderChatMessages()`: Renders chat history with compaction dividers

**UI Features:**
- **Chat tab**: Initially disabled, enabled after Phase 3 completes
- **Split view**: Pushes content (resizes), no overlays
- **Persistent history**: Chat messages remain when switching between tabs
- **Real-time streaming**: Responses stream with visual indicators
- **Mini-tabs**: Switch between Summary/Comparison/Language while chatting
- **Glassmorphism styling**: Matches existing design system
- **Auto-scroll**: Chat panel scrolls to bottom on new messages
- **Compaction dividers**: Visual "Conversation summarized" markers in chat history

**User Workflow:**
1. Complete three-phase comparison
2. Click "💬 Chat" tab
3. View comparison results in left panel (40%)
4. Ask questions in right panel chat interface (60%)
5. Receive context-aware responses that reference analysis
6. Switch between results using mini-tabs while chatting
7. Chat history persists across tab switches

**Citation Integration:**
The chat responses naturally reference:
- Comparison table rows (e.g., "See row for 'Vesting Service'")
- Specific plan differences (e.g., "San Diego requires 5 years vs. 3 years for Vegas")
- Document citations in format: (filename, page_number, paragraph_number)

**Cost Considerations:**
- Documents attached to first user turn in multi-turn `contents` (not re-uploaded per message)
- Compaction uses a cheap model (gemini-2.0-flash) to minimize overhead
- Trade-off: Compaction loses some conversational nuance but prevents context exhaustion
- Chat is opt-in, only used when attorneys need focused exploration

## Admin Panel & Vertex AI Support

**Overview:**
Admin users (identified by `is_admin` flag on users table) can configure the Gemini API backend via the Settings modal. The proxy supports two paths: Consumer API (API key, default) and Vertex AI (service account JWT auth).

**Admin Detection:**
- On page load, `checkAdminStatus()` calls `GET /api/admin/settings`
- If 200: user is admin, settings cached in `state.vertexAiSettings`, green dot shown on settings gear
- If 403: not admin, admin section hidden

**Vertex AI Proxy Path:**
- `functions/api/gemini/[model].js` reads `app_settings` table on each request
- If `vertex_ai_enabled === 'true'` and all credentials present: mint JWT → exchange for access token → forward to Vertex AI endpoint
- Otherwise: fall through to Consumer API with `GEMINI_API_KEY` env var
- Request/response body is identical between Consumer and Vertex AI — no client-side changes needed

**Token Minting (`functions/api/gemini/_vertex.js`):**
- Builds JWT with RS256 signing using Web Crypto API (`crypto.subtle`)
- Exchanges JWT for access token via `POST https://oauth2.googleapis.com/token`
- Access tokens valid for 1 hour; minted fresh per-request (~100ms overhead, negligible for 30-120s API calls)

**Database:**
- `users.is_admin BOOLEAN DEFAULT false` — admin flag
- `app_settings (key, value, updated_at, updated_by)` — key-value store for Vertex AI config
- Setting keys: `vertex_ai_enabled`, `vertex_ai_project_id`, `vertex_ai_location`, `vertex_ai_service_account_email`, `vertex_ai_private_key`

**Admin API Endpoints:**
- `GET /api/admin/settings` — returns all settings (private key masked)
- `POST /api/admin/settings` — upserts setting key/value pairs
- `POST /api/admin/test-vertex` — tests connection with stored credentials

**Settings Modal (admin section):**
- Radio toggle: Consumer API / Vertex AI
- Service account JSON file upload (auto-extracts email, key, project ID)
- Manual field entry: Project ID, Region, Service Account Email, PEM key
- "Test Connection" button verifies end-to-end Vertex AI access
- "Save" persists settings to database

## Notes Feature

**Overview:**
Users can add notes (similar to Google Docs comments) to any highlighted text in the Summary, Comparison, or Language tabs. Notes are immediately auto-saved to the backend and persist when analyses are reloaded.

**Architecture:**

**Text Selection & Anchoring:**
```
┌────────────────────────────────────────────────────┐
│ [Summary] [Comparison] [Language] [💬 Chat]        │
├────────────────────────────────────────────────────┤
│                                                    │
│  The plan provides for [highlighted text] which    │  ← User selects text
│  differs from...                                   │
│                      ┌──────────────────┐          │
│                      │ + Add Note       │          │  ← Selection hint appears
│                      └──────────────────┘          │
│                                                    │
│  After saving:                                     │
│                                                    │
│  The plan provides for [highlighted text] which    │  ← Yellow highlight
│  differs from...        ↑                          │
│                         └─ Click to open popup     │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Popup Interface:**
```
┌──────────────────────────────────────┐
│ Note                    [Delete] [×] │
├──────────────────────────────────────┤
│                                      │
│  Note content here...                │  ← View mode (click to edit)
│  *Supports markdown*                 │
│                                      │
├──────────────────────────────────────┤
│               [Cancel] [Save]        │  ← Edit mode only
└──────────────────────────────────────┘
```

**Database Schema:**
```sql
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    tab VARCHAR(20) NOT NULL CHECK (tab IN ('summary', 'comparison', 'language')),
    anchor_text TEXT NOT NULL,           -- Exact highlighted text
    anchor_prefix TEXT,                  -- ~50 chars before for disambiguation
    anchor_suffix TEXT,                  -- ~50 chars after for disambiguation
    content TEXT NOT NULL,               -- Note content (markdown)
    note_type VARCHAR(20) NOT NULL DEFAULT 'observational'
      CHECK (note_type IN ('observational', 'actionable')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**API Endpoints:**

All notes operations use PATCH `/api/history/analyses/:id`:

```javascript
// Add note
{ add_note: { tab, anchor_text, anchor_prefix, anchor_suffix, content, note_type } }
// Returns: { success: true, note_id, created_at }

// Update note
{ update_note: { note_id, content, note_type } }
// Returns: { success: true, updated_at }

// Delete note
{ delete_note: { note_id } }
// Returns: { success: true }
```

Notes are included in GET `/api/history/analyses/:id` response.

**State Management:**
```javascript
state: {
  notes: [],                  // [{id, tab, anchor_text, anchor_prefix, anchor_suffix, content, created_at}]
  activeNoteId: null,         // Currently open popup note ID
  pendingSelection: null,     // Temp selection before note created
  isNotePopupOpen: false,
  notePopupPosition: { top: 0, left: 0 },
  editingNoteContent: '',
  isEditingNote: false
}
```

**Key Methods:**
- `initNoteEvents()`: Sets up selection, click, scroll, and keyboard event handlers
- `captureTextSelection(tab)`: Captures selection with prefix/suffix context
- `findAnchorPosition(note, outputDiv)`: Finds anchor position with disambiguation
- `createRangeAtPosition(container, position, length)`: Creates Range using TreeWalker
- `applyNoteHighlights(tab)`: Applies yellow highlights to tab content after render
- `showSelectionHint(rect)` / `hideSelectionHint()`: Selection tooltip management
- `addNoteFromSelection()`: Creates new note from pending selection
- `openNotePopup(noteId, rect)` / `closeNotePopup()`: Popup lifecycle
- `renderNotePopupContent()`: Edit/view mode rendering with markdown
- `saveCurrentNote()` / `deleteCurrentNote()`: Note CRUD operations
- `saveNoteToBackend(note)` / `deleteNoteFromBackend(noteId)`: API calls

**Highlight Rendering Integration:**

Each render function calls `applyNoteHighlights(tab)` after markdown parsing:
```javascript
renderSummaryTab() {
  output.innerHTML = marked.parse(this.state.summaryResponse || '');
  this.applyNoteHighlights('summary');
}
// Same pattern for renderComparisonTab() and renderLanguageTab()
```

**Anchoring Strategy:**

Since AI outputs are locked-in after generation, exact text matching is safe:
1. Store highlighted text + 50 chars before/after for context
2. On restore, find all occurrences of anchor text
3. If multiple matches, disambiguate using prefix/suffix similarity scoring
4. Wrap matched text in `<mark class="note-highlight" data-note-id="...">` element

**User Workflow:**
1. Select text in any analysis tab (min 3 characters)
2. Click "+ Add Note" in selection hint
3. Type note content (markdown supported)
4. Click Save (or Ctrl+Enter) - immediately saved to backend
5. Yellow highlight appears; click to view/edit note
6. Notes persist when analysis is saved and reloaded

**Constraints:**
- Notes require a saved analysis (`currentAnalysisId` must exist)
- Selection hint hidden on scroll (position invalidates)
- Minimum 3 characters required for selection
- Notes only work on analysis tabs (not Chat tab)

**Safari Compatibility:**
Safari has known issues with event delegation on dynamically created `<mark>` elements. To ensure cross-browser compatibility:
- Note popup close button uses `addEventListener` instead of inline `onclick`
- Highlight elements (`<mark class="note-highlight">`) have direct click handlers attached in `applyNoteHighlights()`
- Empty `onclick=""` attribute added to highlights (Safari clickability fix)

**Action-Flagged Notes:**
Notes have a `note_type` field: `'observational'` (default, yellow highlight) or `'actionable'` (orange highlight). A toggle in the note popup switches between types. Actionable notes are gathered during draft generation and passed to Gemini as specific instructions. The `setNoteType(type)` method updates local state, re-renders highlights, and PATCHes the backend.

## Draft Workspace

**Overview:**
The Draft tab (4th tab, enabled after comparison completes) provides a three-phase workflow for building formatted SPD documents from comparison data. Users select provisions, AI synthesizes them, and produces an editable draft.

**Three-Phase Workflow:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase A: SELECTION                                               │
│ Comparison table with checkboxes per plan cell (columns 1-N)    │
│ Select which provisions to include + per-cell mini-prompts      │
│ → Click "Build Integrated Column"                                │
├─────────────────────────────────────────────────────────────────┤
│ Phase B: INTEGRATION                                             │
│ AI synthesizes selected provisions into unified view             │
│ ContentEditable div — edit freely, auto-saves                   │
│ Highlight text → AI Rework hint → enter instruction             │
│ → Click "Generate Draft"                                         │
├─────────────────────────────────────────────────────────────────┤
│ Phase C: DRAFT DOCUMENT                                          │
│ AI transforms integrated column into formatted SPD section       │
│ ContentEditable div — edit freely, auto-saves                   │
│ Highlight text → AI Rework hint → enter instruction             │
│ → Export as TXT or Markdown                                      │
└─────────────────────────────────────────────────────────────────┘
```

**State Management:**
```javascript
state: {
  draftSelections: {},          // { rowId: [colIndex, ...] }
  draftCellPrompts: {},         // { "rowId_colIndex": "instruction text" }
  draftIntegratedColumn: null,  // markdown string
  draftContent: null,           // markdown string
  draftPhase: 'selection',      // 'selection' | 'integration' | 'draft'
  isDraftStreaming: false,
  currentDraftResponse: ''
}
```

**Key Methods:**
- `renderDraftTab()`: Router dispatching to correct phase view
- `renderDraftSelectionView()`: Comparison table with checkboxes and mini-prompt textareas
- `toggleDraftSelection(rowId, colIndex)`: Toggle cell selection
- `updateCellPrompt(promptKey, value)`: Update per-cell instruction
- `buildIntegratedColumn()`: Gathers selections + cell prompts + actionable notes, streams AI response
- `generateDraft()`: Transforms integrated column into formatted SPD section
- `streamDraftResponse(prompt)`: SSE streaming with live markdown rendering
- `renderDraftIntegrationView()` / `renderDraftDocumentView()`: Phase nav + toolbar + contenteditable editor
- `initDraftEditorEvents(editorId)`: Mouseup listener for text selection → rework hint
- `startDraftRework()`: Shows in-app dialog, calls `reworkDraftSection(selectedText, instruction)`
- `reworkDraftSection(selectedText, instruction)`: Uses `execCommand('insertText')` for undo-safe replacement
- `saveDraftState()`: Debounced PATCH to backend
- `showAppDialog({title, message, mode, placeholder})`: Promise-based in-app dialog replacing native `alert()`/`prompt()`

**AI Generation Prompts:**
- Integration prompt instructs Gemini to synthesize selected provisions, preserving legal precision, marking conflicts with `[REVIEW NEEDED]`
- Draft prompt instructs Gemini to produce a formatted SPD section using the original source documents' writing style (length, phrasing, tone) as reference
- Both prompts include actionable notes as specific instructions and per-cell mini-prompts as context

**Persistence:**
Draft state stored in `draft_state JSONB` column on analyses table. Contains selections, cell prompts, integrated column, draft content, and current phase. Saved via debounced PATCH and restored on session reload.

**Drag-and-Drop vs. Text Selection:**
Table rows are NOT marked `draggable="true"` by default. The document mousedown handler dynamically sets `draggable` only when mousedown is on a first-column cell, ensuring text selection and note-taking work normally on all other columns.

## PDF.js Viewer for Citations

**Overview:**
Citation links (e.g., `(filename.pdf, page 15)`) open PDFs in a custom PDF.js-based viewer (`viewer.html`) instead of relying on browser-native PDF handling. This ensures consistent page navigation across all browsers.

**Why PDF.js:**
Safari's built-in PDF viewer has inconsistent support for `#page=N` URL fragments. Chrome's PDF viewer (also PDF.js-based) handles this reliably, but Safari may navigate to the wrong page or ignore the fragment entirely. Using PDF.js directly ensures consistent behavior.

**Implementation:**
- `viewer.html` - Minimal PDF.js viewer with navigation controls
- Uses PDF.js via CDN (v4.0.379)
- URL format: `/viewer.html?file=<encoded-pdf-url>&page=<page-number>`
- `openPdfAtPage()` routes all citation clicks through the viewer

**Features:**
- Page navigation (previous/next, direct input)
- Zoom controls (50%-200% + fit width)
- Keyboard shortcuts (arrow keys for navigation, +/- for zoom)
- Dark theme matching main app aesthetic

## Persistent Document Storage (Cloudflare R2)

**Overview:**
PDFs are stored in Cloudflare R2 object storage after analysis completes. This enables session reload without re-uploading files, clickable citations that work across sessions, and lays foundation for session sharing.

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│ SAVE FLOW (after Phase 3 completes)                             │
├─────────────────────────────────────────────────────────────────┤
│  1. POST /api/history/analyses → creates analysis, returns ID  │
│  2. For each PDF: POST /api/files (multipart) → uploads to R2  │
│  3. PATCH /api/history/analyses/:id → stores r2Key in metadata │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ LOAD FLOW (when user clicks history item)                       │
├─────────────────────────────────────────────────────────────────┤
│  1. GET /api/history/analyses/:id → returns analysis + r2Keys  │
│  2. Files initially show "Loading..." status                    │
│  3. For each file: GET /api/files/:key → fetches from R2       │
│  4. base64 restored, status becomes "Ready"                     │
│  5. Citations clickable immediately via R2 URL (no wait)        │
└─────────────────────────────────────────────────────────────────┘
```

**R2 Key Structure:** `{userId}/{analysisId}/{sanitized_filename}`

**API Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/files` | POST | Upload PDF to R2 (multipart: file + analysisId) |
| `/api/files/:userId/:analysisId/:filename` | GET | Download PDF from R2 (supports `#page=N`) |

**File Metadata Schema (stored in `analyses.file_metadata` JSONB):**
```javascript
[{
  filename: "Original Name.pdf",      // Display name
  size: 12345678,                      // Bytes
  mimeType: "application/pdf",
  uploadedAt: "2025-12-22T...",
  r2Key: "userId/analysisId/sanitized.pdf",  // R2 object key
  r2Etag: "abc123..."                  // For cache validation
}]
```

**File Status States:**
| Status | Meaning | Can Chat? | Can Click Citation? |
|--------|---------|-----------|---------------------|
| `uploading` | Local upload in progress | No | No |
| `uploaded` | Ready (has base64 + r2Key) | Yes | Yes |
| `loading` | Fetching from R2 | No | Yes (via R2 URL) |
| `metadata_only` | Legacy session, no R2 | No | No |
| `error` | R2 fetch failed | No | No |

**Wrangler Configuration:**
```toml
[[r2_buckets]]
binding = "DOCUMENTS"
bucket_name = "spd-matrix-documents"
```

**Cascade Delete:**
When an analysis is deleted, all associated R2 objects are deleted automatically (handled in DELETE `/api/history/analyses/:id`).

**Security:**
- Files keyed by userId—prevents cross-user access
- Download endpoint verifies user owns analysis
- Cloudflare Access enforces authentication before API access

## Database Migrations

**CRITICAL:** This project has no automated migration system. When code changes reference new database columns, constraints, or tables, the corresponding SQL must be applied manually to Railway PostgreSQL before or at the time of deployment. Failure to do so causes 500 errors on all affected endpoints.

**Connection:** Use `railway variables` to get the current `DATABASE_PUBLIC_URL`, then connect with `psql`. Or use `railway connect postgres` for an interactive shell.

**Checklist for code that touches DB queries:**
1. If you add a column to a `SELECT`, `INSERT`, or `WHERE` clause — run `ALTER TABLE ... ADD COLUMN` on Railway
2. If you change a `CHECK` constraint — drop and recreate it on Railway
3. Document the migration in the README's "Database Migrations" table

## Git Workflow

- Never commit `config.js` (contains API key)
- Never commit `plan_docs/` directory (contains client PDFs)
- Do not commit or push unless explicitly requested by user
- Legacy Claude implementation preserved in `legacy/` directory
- No staging/preview environments — deploy directly to production and test there

## Cloudflare Deployment

The `cloudflare/` directory contains a production-ready Cloudflare Workers deployment with server-side API key protection.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                  CLOUDFLARE EDGE                    │
├─────────────────────────────────────────────────────┤
│  ┌──────────────────┐                               │
│  │ Cloudflare Access │ ◄── OTP via email (optional) │
│  │ (Zero Trust)      │     Email allowlist          │
│  └────────┬─────────┘                               │
│           │                                         │
│           ▼                                         │
│  ┌──────────────────────────────────────┐          │
│  │ Cloudflare Worker                     │          │
│  │ - Serves static assets (public/)     │          │
│  │ - Proxies /api/gemini/* requests     │          │
│  │ - Injects API key server-side        │          │
│  │ - Key from GEMINI_API_KEY secret     │          │
│  └──────────────────────────────────────┘          │
└─────────────────────────────────────────────────────┘
                         │
                         ▼ (Worker makes server-side calls)
              ┌──────────────────┐
              │ Gemini API       │
              │ (googleapis.com) │
              └──────────────────┘
```

**Key Security Feature:** The Gemini API key is **never exposed to the browser**. Unlike the local development version where the key is in `config.js`, the Cloudflare version:
- Stores the key as a Wrangler secret (encrypted at rest)
- Injects the key server-side in the Worker proxy
- Browser only sees `/api/gemini/:model` endpoint, not the actual Google API

### File Structure

```
cloudflare/
├── wrangler.toml           # Wrangler CLI configuration
├── worker.js               # Worker script with API proxy
├── public/
│   └── index.html          # Modified app (fetches via /api/gemini)
└── .dev.vars               # Local secrets for development (gitignored)
```

### Key Differences from Local Version

| Aspect | Local (`index.html`) | Cloudflare (`cloudflare/public/index.html`) |
|--------|---------------------|---------------------------------------------|
| **API Key** | In `config.js` (browser) | Wrangler secret (server-side) |
| **API Endpoint** | Direct to `googleapis.com` | Proxied via `/api/gemini/:model` |
| **Settings Modal** | Editable API key input | Read-only "Secured server-side" notice |
| **Security** | Key visible in DevTools | Key never leaves server |

### Worker Proxy Implementation

The Worker (`worker.js`) handles two responsibilities:

**1. Static Asset Serving:**
```javascript
// Serve index.html and other static assets from public/
if (url.pathname === '/' || url.pathname === '/index.html') {
  return env.ASSETS.fetch(assetRequest);
}
return env.ASSETS.fetch(request);
```

**2. API Proxy:**
```javascript
// Proxy /api/gemini/:model requests to Google API
if (url.pathname.startsWith('/api/gemini/')) {
  const model = url.pathname.split('/')[3];
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  return fetch(geminiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY  // Injected server-side
    },
    body: request.body
  });
}
```

### Wrangler CLI Commands

**Prerequisites:**
```bash
npm install -g wrangler    # Install Wrangler CLI globally
wrangler login             # Authenticate with Cloudflare account
```

**Local Development:**
```bash
# Create .dev.vars with your API key for local testing (in project root)
echo "GEMINI_API_KEY=your-api-key-here" > .dev.vars

# Start local dev server (uses .dev.vars for secrets)
wrangler pages dev

# Server runs at http://localhost:PORT (port shown in output)
```

**Deployment:**
```bash
# Deploy to Cloudflare Pages (from project root)
# IMPORTANT: This is a Pages project, not Workers - use `wrangler pages deploy`
wrangler pages deploy

# Set secrets (only needed once, or when rotating keys)
# Use the Cloudflare Dashboard: Pages > spd-matrix > Settings > Environment variables
# Or use: wrangler pages secret put GEMINI_API_KEY

# Verify deployment
wrangler pages deployment tail    # Stream live logs
```

**Other Useful Commands:**
```bash
# View current deployment status
wrangler pages deployment list --project-name spd-matrix

# View logs from a deployment
wrangler pages deployment tail --project-name spd-matrix

# View account info and dashboard URL
wrangler whoami
```

### Configuration (`wrangler.toml`)

```toml
# Cloudflare Pages configuration
name = "spd-matrix"
pages_build_output_dir = "."      # Deploy from project root
compatibility_date = "2024-11-28"
compatibility_flags = ["nodejs_compat"]

# Hyperdrive binding for Railway PostgreSQL
[[hyperdrive]]
binding = "DB"
id = "..."

# R2 bucket for persistent document storage
[[r2_buckets]]
binding = "DOCUMENTS"
bucket_name = "spd-matrix-documents"
```

### Live Deployment

**URL:** https://spd-matrix.foray-consulting.workers.dev

**Managing the deployment:**
- Dashboard: https://dash.cloudflare.com → Workers & Pages → spd-matrix
- Logs: `wrangler tail` or Dashboard → Logs
- Metrics: Dashboard → Analytics

### Cloudflare Access (Authentication)

The application uses Cloudflare Zero Trust Access with multiple identity providers for seamless authentication. Users can choose their preferred login method while access is controlled via an email allowlist.

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│                    LOGIN SCREEN                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│              Sign in to SPD MATRIX                       │
│                                                          │
│        [ G  Sign in with Google    ]  ← Instant login   │
│        [ M  Sign in with Microsoft ]  ← MS365 accounts  │
│        [    One-time PIN           ]  ← Email fallback  │
│                                                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              Cloudflare Access validates:
              Is user's email in allowlist?
                           │
              ┌────────────┴────────────┐
              │                         │
           Yes ✓                     No ✗
              │                         │
         Access granted           Access denied
```

**Key Concepts:**
- **Selectors** = WHO is allowed (email allowlist - unchanged)
- **Login Methods** = HOW users authenticate (Google, Microsoft, OTP)

The email allowlist policy works with any identity provider - users authenticate via their chosen method, then Cloudflare checks if their email is in the allowlist.

**Configured Identity Providers:**

| Provider | Works For | Setup Location |
|----------|-----------|----------------|
| **Google OAuth** | Any email (users can create Google account with work email) | Google Cloud Console |
| **Microsoft Entra ID** | MS365 organizational accounts (multi-tenant) | Microsoft Entra Admin Center |
| **One-time PIN** | Fallback for edge cases | Built into Cloudflare |

**Google OAuth Configuration:**
- Google Cloud Console project: "SPD MATRIX Auth"
- OAuth consent screen: External
- Authorized redirect URI: `https://forayconsulting.cloudflareaccess.com/cdn-cgi/access/callback`
- Credentials stored in Cloudflare Zero Trust as identity provider

**Microsoft Entra ID Configuration:**
- App registration: "SPD MATRIX - Cloudflare Access"
- Supported account types: **Multi-tenant** (Any Microsoft Entra ID tenant)
  - Allows users from ANY MS365 organization
  - Personal Microsoft accounts (Outlook.com) have limited support
- Redirect URI: `https://forayconsulting.cloudflareaccess.com/cdn-cgi/access/callback`
- API permissions (Delegated): `email`, `openid`, `profile`, `User.Read`
- Client secret expires: December 2027 (24 months)

**Access Policy Configuration:**
- Policy name: "Approved Users"
- Action: Allow
- Selector: **Emails** (specific email allowlist)
- Login methods enabled: Google, Azure AD, One-time PIN

**Managing User Access:**
1. Go to Zero Trust → Access → Applications → SPD MATRIX → Policies
2. Edit the "Approved Users" policy
3. Add/remove emails in the "Emails" selector

**Session Duration:**
- Configurable in Settings → Authentication → Global session duration
- Options: 15 minutes to 1 month
- Longer sessions reduce login frequency for trusted users

### Multi-Tenant Deployment Model

SPD Matrix supports per-client isolation via separate Cloudflare Pages deployments of the same codebase. Each client gets their own subdomain, database, R2 bucket, and Cloudflare Access policy.

**Marketing Site & Login Routing:**
- Marketing site: `syncrodocsystems.com` (separate repo: `forayconsulting/syncrodocsystems_landing_page`, lives at `/Desktop/syncrodoc_systems_homepage`)
- Login button opens a workspace slug form: user enters slug (e.g., `wpf`) and is redirected to `{slug}.syncrodocsystems.com`
- The marketing site never validates slugs or reveals which workspaces exist. Authentication is handled entirely by Cloudflare Access at the destination.

**Per-Instance Infrastructure:**

| Component | Per-Instance? | Configuration |
|-----------|--------------|---------------|
| Cloudflare Pages project | Yes | Different project name, same codebase |
| Railway PostgreSQL | Yes | Separate database, same `schema.sql` |
| Cloudflare Hyperdrive | Yes | New config per database, binding set in Pages dashboard |
| Cloudflare R2 bucket | Yes | Separate bucket per instance |
| Cloudflare Access policy | Yes | Per-subdomain hostname, client-specific email allowlist |
| DNS (CNAME) | Yes | `{slug}.syncrodocsystems.com` → `{pages-project}.pages.dev` |
| Codebase | No | Same code deployed everywhere |
| Gemini API / Vertex AI | Shared | Same API key or Vertex AI project (configurable per-instance via admin panel) |

**Active Instances:**

| Slug | Pages Project | Domain(s) | Client |
|------|--------------|-----------|--------|
| `wpf` | `spd-matrix` | `wpf.syncrodocsystems.com`, `spd-matrix.foray-consulting.com` | Western Pension Fund (Foray) |

**Deploying a New Instance:**
See `INSTANCE-DEPLOY.md` for the Claude Code runbook that automates CLI steps and guides through manual dashboard steps for any new instance.

**Key Principle:** Dashboard-configured bindings do NOT work for Pages Functions — bindings MUST be in `wrangler.toml`. For multi-tenant deploys, temporarily swap the Hyperdrive ID and R2 bucket name in `wrangler.toml` to the target instance's values, deploy, then immediately revert. See `INSTANCE-DEPLOY.md` Phase 3B for details.

**User Identity:** Cloudflare Access does not reliably inject the `Cf-Access-Authenticated-User-Email` header for `syncrodocsystems.com` subdomains. The `getUserEmail()` function in `functions/api/history/_db.js` includes a JWT cookie parser fallback that extracts the email from the `CF_Authorization` cookie.

### Updating the Deployment

When making changes:

1. **Edit files in project root** (e.g., `index.html`, `viewer.html`, `functions/`)
2. **Test locally:** `wrangler pages dev`
3. **Deploy:** `wrangler pages deploy` (NOT `wrangler deploy` - this is a Pages project)
4. **Verify:** Visit the live URL or check deployment in Cloudflare Dashboard

**Important:** This is a Cloudflare Pages project. Using `wrangler deploy` will fail with an error. Always use `wrangler pages deploy`.

## Testing

**Unit Tests (Vitest):**
```bash
npm test          # Run all unit tests
npm run test:watch  # Watch mode
```
- `tests/unit/api-error-handling.test.js` — 150 tests covering API error propagation, SSE stream parsing, JSON extraction/recovery, request body construction, prompt templates, retry logic, proxy error format, pre-flight validation
- `tests/unit/api-validation.test.js` — Admin settings allowlist, share token validation, email validation, note type validation
- `tests/unit/db-helpers.test.js` — Database helper function tests
- `tests/unit/file-upload.test.js` — File upload validation tests

**E2E Tests (Playwright):**
```bash
npm run test:e2e  # Requires local dev server on port 8788
```

**test-gemini.html:**
- Standalone CORS and API compatibility testing tool
- Tests 4 scenarios:
  1. Direct generateContent API call (CORS check)
  2. Files API upload (CORS check)
  3. Inline base64 PDF upload
  4. Streaming with SSE
- Use this to validate API access before deploying changes
- All tests passed confirming direct browser integration works

## QA Testing

**tests/QA/:**
- Contains outputs from 3 production runs with identical inputs
- Each run folder (1/, 2/, 3/) contains: Summary.txt, Comparison.csv, Citations.csv, chat.txt
- QA_Analysis.md provides detailed comparative analysis

**Key QA Findings:**
- Model outputs vary between runs (non-deterministic)
- Critical issue: Run 2 missed detecting San Diego plan entirely (4 vs 5 plans)
- Procedural element coverage varies (17-20 elements across runs)
- San Diego's "Mandatory Arbitration + Class Action Waiver" only captured in Run 3
- Citation format varies between runs (date-prefixed vs full descriptive names)

**Recommendations for Production:**
- Add validation to confirm expected plan count after analysis
- Standardize required procedural elements in prompts
- Ensure critical legal distinctions (arbitration clauses) are always surfaced
