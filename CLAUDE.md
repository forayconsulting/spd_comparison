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

## Git Workflow

- Never commit `config.js` (contains API key)
- Never commit `plan_docs/` directory (contains client PDFs)
- Do not commit or push unless explicitly requested by user
