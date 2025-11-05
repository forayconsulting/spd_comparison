# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an SPD (Summary Plan Description) comparison tool proof of concept for Western Pension Fund. The goal is to compare pension plan documents across multiple plan units to identify differences and facilitate standardization following a merger.

**Client Requirements:**
- Compare 10 PDF SPD files to identify policy differences (claims procedures, appeals, arbitration, etc.)
- Deliver actionable comparison results more cost-effectively than law firm associates ($500/hour benchmark)
- Budget: $3,000-$4,000 target
- Deliverable: Comparison table/matrix in CSV or structured format

See `requirements/requirements.md` for full business requirements.

## Architecture

### Single-Page Chat Application

The project uses a browser-based chat interface (`index.html`) that integrates with Anthropic's API:

- **Model:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
- **Extended Thinking:** Enabled with configurable token budget (default: 1024 tokens)
- **Streaming:** Real-time SSE (Server-Sent Events) streaming via Fetch API
- **Multi-turn Conversations:** Full conversation history preserved, including thinking blocks with signatures

### Key Components

**index.html:**
- Self-contained HTML/CSS/JS application (no build step)
- Dependencies loaded via CDN:
  - `marked.js` for markdown rendering
  - `prism.js` for syntax highlighting
- State management via `ChatApp` object pattern
- Streaming event handler processes: `content_block_start`, `content_block_delta`, `content_block_stop`, `message_stop`

**API Integration:**
- Direct browser-to-Anthropic API calls (requires `anthropic-dangerous-direct-browser-access: true` CORS header)
- Thinking blocks include `signature` field required for multi-turn conversations
- Messages format: Array of `{role, content}` where content can include `{type: 'thinking', thinking: '...', signature: '...'}` blocks

**Configuration:**
- `config.js` (gitignored) contains actual API key
- `config.example.js` provides template
- Configuration object: `CONFIG.ANTHROPIC_API_KEY`, `CONFIG.MODEL`, `CONFIG.MAX_TOKENS`, `CONFIG.THINKING_BUDGET`

### File Structure

```
/
├── index.html           # Main chat interface
├── config.js            # API key configuration (gitignored)
├── config.example.js    # Config template
├── plan_docs/           # PDF files (gitignored)
├── requirements/        # Business requirements
└── README.md
```

## Running the Application

**Setup:**
1. Copy `config.example.js` to `config.js`
2. Add your Anthropic API key to `config.js`
3. Open `index.html` in a web browser

No build process, server, or dependencies installation required.

## Implementation Notes

**Extended Thinking:**
- Thinking blocks stream in real-time during generation
- Auto-collapse when thinking completes (`content_block_stop` event)
- Must preserve complete thinking blocks with signatures for multi-turn context
- Toggle visibility with Show/Hide controls

**Streaming:**
- Uses `ReadableStream` with `TextDecoderStream` (not EventSource, which only supports GET)
- Buffer management handles partial SSE lines
- Events parsed as `data: {JSON}` lines
- Handle `thinking_delta`, `text_delta`, and `signature_delta` types

**State Management:**
- Messages stored as `{role, content, thinking, signature}` objects
- Current streaming state tracked separately: `currentThinking`, `currentResponse`, `currentSignature`
- Finalized messages added to history only after stream completes

## Plan Docs File Upload Feature

**Overview:**
Collapsible "Plan Docs" section enables drag-and-drop upload of PDF files for document comparison. Files are base64-encoded locally and included in message context.

**Implementation Approach:**
- **Base64 Encoding:** Files are read locally using FileReader API and converted to base64
- **No Files API:** Avoids CORS issues with Files API by sending base64 data directly in messages
- **Local Storage:** File data stored in `ChatApp.state.uploadedFiles` array
- **Automatic Inclusion:** All uploaded files with `status: 'uploaded'` are included in every user message

**File Upload Process:**
1. User drags/drops or clicks to browse files
2. Files validated (32 MB max per file)
3. FileReader converts to base64 string
4. File object stored with metadata: `{id, filename, size, mimeType, status, base64Data}`
5. Status updates: `uploading` → `uploaded` or `error`

**Message Format:**
```javascript
{
  role: 'user',
  content: [
    {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: 'JVBERi0xLjQK...'
      },
      title: 'filename.pdf',
      citations: { enabled: true }
    },
    { type: 'text', text: 'User message...' }
  ]
}
```

**UI Components:**
- Collapsible panel between header and messages
- Drag-and-drop zone with visual feedback
- File cards showing: icon, full filename, size, status, remove button
- File count badge: "📁 Plan Docs (X files)"
- Status indicators: ✓ Uploaded, 🔄 Uploading..., ✗ Error

**Constraints & Learnings:**

### PDF Page Limits (Critical)
Through testing and research, we discovered:

**The Limit:** 100 pages **per individual PDF document** (not total across all PDFs)
- Error: `"A maximum of 100 PDF pages may be provided"`
- Applies to each document separately
- Request size limit: 32 MB total (all documents + messages)

**What Works:**
- Multiple small documents (SMMs, notices, amendments): ✅
- Example: 10 documents × 5 pages each = 50 total pages ✅
- Mix of small docs in single request ✅

**What Fails:**
- Single PDF exceeding 100 pages: ❌
- Example: One 156-page SPD triggers error even if it's the only document
- Error points to specific document index in content array

**Why Claude Desktop Works Differently:**
- Uses Projects with RAG (Retrieval-Augmented Generation)
- Documents stored in knowledge base
- Only relevant excerpts loaded per message
- Can handle 20+ documents including large ones
- Text-only extraction for Project knowledge (no visual analysis)

**Current Approach (Proof of Concept):**
- Focus on **small documents only** (SMMs, notices, amendments)
- Each document must be <100 pages individually
- Works perfectly for comparing policy modifications across plan units
- Large SPDs (100+ pages) excluded from this workflow

**Future Considerations (Not Yet Implemented):**
Research identified several potential solutions for handling large documents:

1. **PDF.js Page Count Detection:**
   - Add pdf.js library to detect page count during upload
   - Display page count on each file card
   - Warn users about 100-page limit per document

2. **Manual Selection System:**
   - Checkboxes to include/exclude specific documents
   - User controls which docs are sent per message
   - "Upload all 10 SPDs, select relevant subset per query"

3. **Automatic Batching:**
   - Split large documents into page ranges
   - Send multiple sequential API requests
   - Build context across conversation turns

4. **Individual Analysis Pattern:**
   - Upload large SPDs one at a time
   - Extract key policies from each
   - Compare findings manually or in subsequent messages

5. **Smart Warnings:**
   - Calculate total pages from selected documents
   - Show red/yellow/green indicators
   - Auto-suggest documents to exclude when over limit

**For current proof of concept:** Working within constraint by focusing on small document comparisons. Large SPD analysis can be handled separately or in future iterations.

## Git Workflow

- Never commit `config.js` (contains API key)
- Never commit `plan_docs/` directory (contains client PDFs)
- Do not commit or push unless explicitly requested by user
