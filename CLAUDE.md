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

### Single-Page Three-Output Application

The project uses a browser-based application (`index.html`) that integrates with Google's Gemini API to produce three coordinated outputs:

- **Model:** Gemini 2.5 Pro (gemini-2.0-flash-exp fallback)
- **Context Window:** 1 million tokens (~750,000 words or ~1,500 pages)
- **Streaming:** Real-time SSE (Server-Sent Events) streaming via Fetch API
- **Output Format:** JSON structure parsed and rendered into three tabs
- **System Prompt:** Specialized three-output generation prompt with JSON schema requirements
- **UI:** Tabbed interface with preview + download for each output

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
- System prompt sent as `systemInstruction: {parts: [{text: SYSTEM_PROMPT_TEXT}]}`
- Response format: JSON only (no markdown wrapping, no additional text)
- Implicit prompt caching (75% cost reduction on repeated context, automatic)

**Configuration:**
- `config.js` (gitignored) contains actual API key
- `config.example.js` provides template
- Configuration object: `CONFIG.GEMINI_API_KEY`, `CONFIG.MODEL`, `CONFIG.MAX_OUTPUT_TOKENS`, `CONFIG.THINKING_BUDGET`

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
│   └── test-gemini.html            # CORS/API testing tool
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
4. Wait for streaming JSON response (model analyzes all documents)
5. View three-tab output interface:
   - **Tab 1: Summary** - Executive overview, document inventory, key findings
   - **Tab 2: Comparison Spreadsheet** - Summary-level side-by-side comparison table
   - **Tab 3: Language Comparison** - Full quoted legal text with citations
6. Download any output using the download buttons in each tab

## Implementation Notes

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

**No Thinking Visibility:**
- Gemini 2.0+ models have internal reasoning but don't expose it via API
- `thinking_config` parameter exists in docs but returns 400 error (not yet available)
- Model still reasons internally for better responses
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
| Provider | Pages per PDF | Total Context |
|----------|---------------|---------------|
| **Gemini 2.5 Pro** | 1,000 pages | 1M tokens (~1,500 pages total) |
| Claude Haiku/Sonnet | 100 pages | 200k tokens (~400 pages total) |

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
