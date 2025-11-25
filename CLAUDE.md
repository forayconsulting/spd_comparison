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

- **Model:** Gemini 3 Pro Preview (most advanced reasoning model, 65k token output)
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
- Three-tab UI: Summary, Comparison Spreadsheet, Language Comparison
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
- **Table styling:** Subtle borders added to all tables for better cell visibility

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

**Configuration:**
- `config.js` (gitignored) contains actual API key
- `config.example.js` provides template
- Configuration object:
  - `CONFIG.GEMINI_API_KEY`: API key from Google AI Studio
  - `CONFIG.MODEL`: Model to use (default: gemini-3-pro-preview)
  - `CONFIG.MAX_OUTPUT_TOKENS`: 32768 (Gemini 3 Pro supports up to 65,536 tokens)
  - `CONFIG.THINKING_LEVEL`: Controls reasoning depth - 'low' (fast) or 'high' (deep reasoning, default). Used in `thinkingConfig.thinkingLevel` API parameter.

### File Structure

```
/
├── index.html                      # Main three-output interface (Gemini-powered)
├── config.js                       # API key configuration (gitignored)
├── config.example.js               # Config template
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
7. Download any output as markdown using the download buttons in each tab

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

### Streaming Implementation

**Gemini SSE Format:**
```javascript
// Simpler than Claude - just parse JSON chunks
const lines = event.split(/\r?\n/);
for (const line of lines) {
  if (line.startsWith('data: ')) {
    const chunk = JSON.parse(line.slice(6));
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      // Append to response
    }
  }
}
```

**Internal Reasoning:**
- Gemini 3 Pro has configurable internal reasoning via `thinkingConfig.thinkingLevel` parameter
- Structure: `generationConfig: { thinkingConfig: { thinkingLevel: 'high' } }`
- Options: `'low'` (fast, cost-effective) or `'high'` (deep reasoning, default)
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
| **Gemini 3 Pro Preview** | 1,000 pages | 1M tokens (~1,500 pages total) | 65k tokens |
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

**Context Injection:**
Each chat message automatically includes:
1. Phase 1 summary (document overview)
2. Phase 2 comparison table (procedural elements across plans)
3. Phase 3 language comparison (full text with citations)
4. All uploaded PDF files (re-uploaded fresh, consistent with three-phase approach)

The prompt explicitly instructs the model to reference comparison table rows and cite documents when answering questions.

**Implementation Details:**

**State Management:**
```javascript
state: {
  // Chat-specific properties
  chatMessages: [],              // [{role, content, timestamp}]
  isChatStreaming: false,        // Separate from main comparison streaming
  currentChatResponse: '',       // Accumulator for chat streaming
  chatPanelResultTab: 'comparison', // Which result to show in left panel (summary/comparison/language)
  // ... existing state properties
}
```

**Key Methods:**
- `switchTab('chat')`: Activates split-view mode, hides normal tab view
- `switchMiniResultTab(resultType)`: Switches left panel between Summary/Comparison/Language
- `renderMiniResultPanel(resultType)`: Renders selected result in left panel
- `sendChatMessage(userQuestion)`: Builds context-enriched prompt, uploads PDFs, streams response
- `buildChatContextPrompt(userQuestion)`: Wraps user question with three analysis outputs
- `streamChatResponse(prompt, uploadFiles)`: Handles chat streaming (reuses comparison streaming logic)
- `renderChatMessages()`: Renders chat history with glassmorphism styling

**Chat Prompt Template:**
```
You are analyzing pension plan documents. Here is the completed analysis:

<document_summary>
${Phase 1 Summary}
</document_summary>

<comparison_table>
${Phase 2 Comparison}
</comparison_table>

<detailed_language_comparison>
${Phase 3 Language Comparison}
</detailed_language_comparison>

When referencing the comparison table, cite specific rows or elements.

User Question: ${userQuestion}
```

**UI Features:**
- **Chat tab**: Initially disabled, enabled after Phase 3 completes
- **Split view**: Pushes content (resizes), no overlays
- **Persistent history**: Chat messages remain when switching between tabs
- **Real-time streaming**: Responses stream with visual indicators
- **Mini-tabs**: Switch between Summary/Comparison/Language while chatting
- **Glassmorphism styling**: Matches existing design system
- **Auto-scroll**: Chat panel scrolls to bottom on new messages

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
- Each chat message re-uploads all PDFs (no caching, consistent with comparison approach)
- Trade-off: Higher cost for better quality and fresh analysis
- Chat is opt-in, only used when attorneys need focused exploration

## Git Workflow

- Never commit `config.js` (contains API key)
- Never commit `plan_docs/` directory (contains client PDFs)
- Do not commit or push unless explicitly requested by user
- Legacy Claude implementation preserved in `legacy/` directory

## Testing Tools

**test-gemini.html:**
- Standalone CORS and API compatibility testing tool
- Tests 4 scenarios:
  1. Direct generateContent API call (CORS check)
  2. Files API upload (CORS check)
  3. Inline base64 PDF upload
  4. Streaming with SSE
- Use this to validate API access before deploying changes
- All tests passed ✅ confirming direct browser integration works

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
