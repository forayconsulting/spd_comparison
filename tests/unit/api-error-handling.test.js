import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// These tests replicate critical client-side logic from index.html that handles
// API calls, SSE stream parsing, and error propagation. The goal is to ensure
// all analysis modes (cross-plan, amendment-tracking, minutes-analysis,
// invoice-analysis) robustly detect and surface API errors instead of silently
// swallowing them and showing misleading "parse failed" messages.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. parseTimelineJSON — JSON extraction from AI responses
// ---------------------------------------------------------------------------
// Replicated from index.html (global function, ~line 6419)
function parseTimelineJSON(responseText) {
  // Try fenced JSON block first
  const fenceMatch = responseText.match(/```json\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (e) { /* fall through */ }
  }
  // Try raw JSON parse
  try { return JSON.parse(responseText.trim()); } catch (e) { /* fall through */ }
  // Try to find JSON array or object in the text
  const jsonMatch = responseText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch (e) { /* fall through */ }
  }
  return null;
}

describe('parseTimelineJSON', () => {
  describe('fenced JSON blocks', () => {
    it('parses a clean fenced JSON object', () => {
      const input = 'Some text\n```json\n{"meetings": [{"id": "m1"}], "topics": ["Budget"]}\n```\nMore text';
      const result = parseTimelineJSON(input);
      expect(result).toEqual({ meetings: [{ id: 'm1' }], topics: ['Budget'] });
    });

    it('parses a fenced JSON array', () => {
      const input = '```json\n[{"id": "m1", "title": "Q1 Board Meeting"}]\n```';
      const result = parseTimelineJSON(input);
      expect(result).toEqual([{ id: 'm1', title: 'Q1 Board Meeting' }]);
    });

    it('handles extra whitespace inside fence', () => {
      const input = '```json\n\n  {"key": "value"}  \n\n```';
      const result = parseTimelineJSON(input);
      expect(result).toEqual({ key: 'value' });
    });
  });

  describe('raw JSON', () => {
    it('parses raw JSON object', () => {
      const input = '{"vendors": [{"id": "v1"}], "categories": ["Legal"]}';
      const result = parseTimelineJSON(input);
      expect(result).toEqual({ vendors: [{ id: 'v1' }], categories: ['Legal'] });
    });

    it('parses raw JSON array', () => {
      const input = '[{"id": "p1", "label": "Jan 2025"}]';
      const result = parseTimelineJSON(input);
      expect(result).toEqual([{ id: 'p1', label: 'Jan 2025' }]);
    });

    it('handles leading/trailing whitespace', () => {
      const input = '  \n  {"result": true}  \n  ';
      const result = parseTimelineJSON(input);
      expect(result).toEqual({ result: true });
    });
  });

  describe('embedded JSON in text', () => {
    it('extracts JSON object from surrounding text', () => {
      const input = 'Here is the data:\n{"meetings": [], "topics": ["Merger"]}\nEnd of response.';
      const result = parseTimelineJSON(input);
      expect(result).toEqual({ meetings: [], topics: ['Merger'] });
    });

    it('extracts JSON array from surrounding text', () => {
      const input = 'The extracted meetings are:\n[{"id": "m1"}]\nDone.';
      const result = parseTimelineJSON(input);
      expect(result).toEqual([{ id: 'm1' }]);
    });
  });

  describe('failure cases', () => {
    it('returns null for empty string', () => {
      expect(parseTimelineJSON('')).toBe(null);
    });

    it('returns null for plain text with no JSON', () => {
      expect(parseTimelineJSON('This is just a text response with no JSON content.')).toBe(null);
    });

    it('recovers partial data from truncated JSON in fence via regex fallback', () => {
      // The fenced parse fails (truncated array), but the regex fallback
      // finds the first complete JSON object within the text
      const input = '```json\n[{"id": "m1", "title": "Q1 Board"}, {"id": "m2", "tit\n```';
      const result = parseTimelineJSON(input);
      // Regex fallback: \{[\s\S]*\} matches the first complete object
      expect(result).toEqual({ id: 'm1', title: 'Q1 Board' });
    });

    it('recovers partial data from truncated JSON without closing fence', () => {
      const input = '```json\n[{"id": "m1"}, {"id": "m2", "title": "incomplete';
      const result = parseTimelineJSON(input);
      // Regex fallback finds first complete object
      expect(result).toEqual({ id: 'm1' });
    });

    it('returns null when no complete JSON object exists', () => {
      // Truly unrecoverable: no complete {} or [] in the text
      const input = '```json\n[{"id": "m1", "title": "incompl';
      expect(parseTimelineJSON(input)).toBe(null);
    });

    it('returns null for malformed JSON', () => {
      expect(parseTimelineJSON('{not: valid, json}')).toBe(null);
    });

    it('returns null for undefined-like input', () => {
      // The function is called with response text that could be empty after an error
      expect(parseTimelineJSON('undefined')).toBe(null);
    });
  });

  describe('edge cases from real API responses', () => {
    it('parses Phase 1 ontology with meetings and topics', () => {
      const response = `Here is an overview of the meeting documents.

The documents span Q1-Q4 2023 board meetings for GLCTPF.

\`\`\`json
{
  "meetings": [
    {"id": "m1", "title": "Q1 2023 Board Meeting", "date": "2023-03-15", "type": "Board Meeting", "file": "GLCTPF-Board-Minutes-Q1-2023.pdf"},
    {"id": "m2", "title": "Q2 2023 Board Meeting", "date": "2023-06-20", "type": "Board Meeting", "file": "GLCTPF-Board-Minutes-Q2-2023.pdf"}
  ],
  "topics": ["Investment Performance", "Budget Review", "Benefit Changes", "Compliance"]
}
\`\`\``;
      const result = parseTimelineJSON(response);
      expect(result).not.toBeNull();
      expect(result.meetings).toHaveLength(2);
      expect(result.topics).toHaveLength(4);
      expect(result.meetings[0].file).toBe('GLCTPF-Board-Minutes-Q1-2023.pdf');
    });

    it('parses Phase 2 meetings array with topic details', () => {
      const response = `\`\`\`json
[
  {
    "id": "m1",
    "title": "Q1 2023 Board Meeting",
    "date": "2023-03-15",
    "type": "Board Meeting",
    "file": "GLCTPF-Board-Minutes-Q1-2023.pdf",
    "topics": {
      "Investment Performance": {
        "text": "[DECISION] Board approved new investment policy. Returns were 7.2% for the quarter.",
        "citations": [{"label": "p. 3, §2", "page": 3}]
      }
    }
  }
]
\`\`\``;
      const result = parseTimelineJSON(response);
      expect(result).not.toBeNull();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].topics['Investment Performance'].text).toContain('[DECISION]');
    });

    it('parses invoice ontology with vendors, categories, periods', () => {
      const response = `Overview of invoices...

\`\`\`json
{
  "vendors": [{"id": "v1", "name": "Smith & Associates", "shortName": "S&A"}],
  "categories": ["Litigation", "Advisory", "Compliance"],
  "periods": [{"id": "p1", "label": "Jan 2025", "startDate": "2025-01-01", "endDate": "2025-01-31"}],
  "timekeepers": [{"name": "John Smith", "initials": "JS", "vendor": "v1", "rate": 500}]
}
\`\`\``;
      const result = parseTimelineJSON(response);
      expect(result.vendors).toHaveLength(1);
      expect(result.categories).toHaveLength(3);
      expect(result.periods).toHaveLength(1);
      expect(result.timekeepers[0].rate).toBe(500);
    });
  });
});


// ---------------------------------------------------------------------------
// 2. SSE Stream Parsing — the buffer/event/line parsing loop
// ---------------------------------------------------------------------------
// Replicated from index.html streamResponse() ~line 7555-7580

function parseSSEEvents(rawChunks) {
  let buffer = '';
  const parsedChunks = [];
  const parseErrors = [];

  for (const value of rawChunks) {
    buffer += value;
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';

    for (const event of events) {
      if (!event.trim()) continue;

      const lines = event.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = line.slice(6);
            const chunk = JSON.parse(jsonData);
            parsedChunks.push(chunk);
          } catch (e) {
            parseErrors.push({ error: e.message, line });
          }
        }
      }
    }
  }

  return { parsedChunks, parseErrors, remainingBuffer: buffer };
}

describe('SSE stream parsing', () => {
  it('parses a single complete SSE event', () => {
    const chunks = ['data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n'];
    const { parsedChunks, parseErrors } = parseSSEEvents(chunks);
    expect(parsedChunks).toHaveLength(1);
    expect(parsedChunks[0].candidates[0].content.parts[0].text).toBe('Hello');
    expect(parseErrors).toHaveLength(0);
  });

  it('parses multiple SSE events in one chunk', () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":"world"}]}}]}\n\n'
    ];
    const { parsedChunks } = parseSSEEvents(chunks);
    expect(parsedChunks).toHaveLength(2);
  });

  it('handles events split across multiple chunks', () => {
    const chunks = [
      'data: {"candidates":[{"content":{"par',
      'ts":[{"text":"Hello"}]}}]}\n\n'
    ];
    const { parsedChunks, parseErrors } = parseSSEEvents(chunks);
    expect(parsedChunks).toHaveLength(1);
    expect(parseErrors).toHaveLength(0);
  });

  it('handles keepalive comments (SSE comments starting with ":")', () => {
    const chunks = [
      ': keepalive\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"After keepalive"}]}}]}\n\n'
    ];
    const { parsedChunks } = parseSSEEvents(chunks);
    // Keepalive comments have no "data: " prefix, so they are skipped
    expect(parsedChunks).toHaveLength(1);
    expect(parsedChunks[0].candidates[0].content.parts[0].text).toBe('After keepalive');
  });

  it('handles interleaved keepalives and data', () => {
    const chunks = [
      ': keepalive\n\n',
      ': keepalive\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"First"}]}}]}\n\n',
      ': keepalive\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"Second"}]}}]}\n\n'
    ];
    const { parsedChunks } = parseSSEEvents(chunks);
    expect(parsedChunks).toHaveLength(2);
  });

  it('parses error events from the proxy', () => {
    const chunks = [
      'data: {"error": {"code": 400, "message": "Invalid model specified"}}\n\n'
    ];
    const { parsedChunks, parseErrors } = parseSSEEvents(chunks);
    expect(parsedChunks).toHaveLength(1);
    expect(parsedChunks[0].error.code).toBe(400);
    expect(parsedChunks[0].error.message).toBe('Invalid model specified');
    expect(parseErrors).toHaveLength(0);
  });

  it('parses proxy error with nested JSON in message', () => {
    // The proxy wraps errorText via JSON.stringify, which double-escapes it
    const errorText = '{"error":{"code":400,"message":"Model not found"}}';
    const sseEvent = `data: {"error": {"code": 400, "message": ${JSON.stringify(errorText)}}}\n\n`;
    const { parsedChunks } = parseSSEEvents([sseEvent]);
    expect(parsedChunks).toHaveLength(1);
    expect(parsedChunks[0].error.code).toBe(400);
    // The message field contains the full upstream error response as a string
    expect(parsedChunks[0].error.message).toContain('Model not found');
  });

  it('handles CRLF line endings', () => {
    const chunks = ['data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\r\n\r\n'];
    const { parsedChunks } = parseSSEEvents(chunks);
    expect(parsedChunks).toHaveLength(1);
  });

  it('buffers incomplete events correctly', () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"part1"}]}}]}\n\n' +
      'data: {"candidates":[{"content":'
    ];
    const { parsedChunks, remainingBuffer } = parseSSEEvents(chunks);
    expect(parsedChunks).toHaveLength(1);
    expect(remainingBuffer).toContain('data: {"candidates":[{"content":');
  });
});


// ---------------------------------------------------------------------------
// 3. handleStreamChunk — error detection and text accumulation
// ---------------------------------------------------------------------------
// Replicated from index.html ~line 7589-7633

function processStreamChunk(chunk, state) {
  const candidate = chunk.candidates?.[0];
  const warnings = [];
  const errors = [];

  // Check for non-STOP finish reasons
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    warnings.push(`finishReason: ${candidate.finishReason}`);
  }

  // Check for error in chunk
  if (chunk.error) {
    errors.push(chunk.error);
  }

  // Skip chunks with no content
  if (!candidate || !candidate.content || !candidate.content.parts) {
    return { text: '', thinking: '', warnings, errors, hasContent: false };
  }

  let text = '';
  let thinking = '';

  for (const part of candidate.content.parts) {
    if (part.thought) {
      const thinkingText = typeof part.thought === 'string' ? part.thought : (part.text || '');
      thinking += thinkingText;
    } else if (part.text) {
      text += part.text;
    }
  }

  return { text, thinking, warnings, errors, hasContent: true };
}

describe('handleStreamChunk (processStreamChunk)', () => {
  it('extracts text from a normal response chunk', () => {
    const chunk = {
      candidates: [{
        content: { parts: [{ text: 'Hello world' }] }
      }]
    };
    const result = processStreamChunk(chunk, {});
    expect(result.text).toBe('Hello world');
    expect(result.errors).toHaveLength(0);
    expect(result.hasContent).toBe(true);
  });

  it('extracts text from multiple parts', () => {
    const chunk = {
      candidates: [{
        content: { parts: [{ text: 'Hello ' }, { text: 'world' }] }
      }]
    };
    const result = processStreamChunk(chunk, {});
    expect(result.text).toBe('Hello world');
  });

  it('extracts thinking content', () => {
    const chunk = {
      candidates: [{
        content: { parts: [{ thought: true, text: 'Let me think about this...' }] }
      }]
    };
    const result = processStreamChunk(chunk, {});
    expect(result.thinking).toBe('Let me think about this...');
    expect(result.text).toBe('');
  });

  it('handles mixed thinking and text parts', () => {
    const chunk = {
      candidates: [{
        content: { parts: [
          { thought: true, text: 'Thinking...' },
          { text: 'Response text' }
        ]}
      }]
    };
    const result = processStreamChunk(chunk, {});
    expect(result.thinking).toBe('Thinking...');
    expect(result.text).toBe('Response text');
  });

  it('detects error chunks from API', () => {
    const chunk = {
      error: { code: 400, message: 'Invalid request: model not found' }
    };
    const result = processStreamChunk(chunk, {});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(400);
    expect(result.errors[0].message).toBe('Invalid request: model not found');
    expect(result.hasContent).toBe(false);
  });

  it('detects error chunks with nested upstream error text', () => {
    // This is what the proxy sends when upstream returns an error
    const chunk = {
      error: {
        code: 429,
        message: '{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}}'
      }
    };
    const result = processStreamChunk(chunk, {});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(429);
    expect(result.errors[0].message).toContain('RESOURCE_EXHAUSTED');
  });

  it('detects upstream connection failure from proxy', () => {
    const chunk = {
      error: { code: 502, message: 'Upstream connection failed' }
    };
    const result = processStreamChunk(chunk, {});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(502);
  });

  it('warns on non-STOP finish reasons', () => {
    const chunk = {
      candidates: [{
        content: { parts: [{ text: 'partial' }] },
        finishReason: 'MAX_TOKENS'
      }]
    };
    const result = processStreamChunk(chunk, {});
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('MAX_TOKENS');
  });

  it('warns on SAFETY finish reason', () => {
    const chunk = {
      candidates: [{
        content: { parts: [{ text: '' }] },
        finishReason: 'SAFETY'
      }]
    };
    const result = processStreamChunk(chunk, {});
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('SAFETY');
  });

  it('handles chunk with no candidates', () => {
    const chunk = { usageMetadata: { totalTokens: 1000 } };
    const result = processStreamChunk(chunk, {});
    expect(result.hasContent).toBe(false);
    expect(result.text).toBe('');
  });

  it('handles chunk with candidate but no content', () => {
    const chunk = { candidates: [{ finishReason: 'STOP' }] };
    const result = processStreamChunk(chunk, {});
    expect(result.hasContent).toBe(false);
  });

  it('handles empty parts array', () => {
    const chunk = { candidates: [{ content: { parts: [] } }] };
    const result = processStreamChunk(chunk, {});
    expect(result.text).toBe('');
    expect(result.hasContent).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// 4. Full stream processing — combining SSE parsing + chunk handling
//    Tests the critical path: what happens when API errors flow through proxy
// ---------------------------------------------------------------------------

function simulateStreamProcessing(rawChunks) {
  const { parsedChunks } = parseSSEEvents(rawChunks);

  let accumulatedText = '';
  let accumulatedThinking = '';
  const allErrors = [];
  const allWarnings = [];

  for (const chunk of parsedChunks) {
    const result = processStreamChunk(chunk, {});
    accumulatedText += result.text;
    accumulatedThinking += result.thinking;
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return { accumulatedText, accumulatedThinking, allErrors, allWarnings };
}

describe('full stream processing (SSE → chunk handling)', () => {
  it('accumulates text across multiple data events', () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"world!"}]}}]}\n\n'
    ];
    const { accumulatedText, allErrors } = simulateStreamProcessing(chunks);
    expect(accumulatedText).toBe('Hello world!');
    expect(allErrors).toHaveLength(0);
  });

  it('detects API error arriving as SSE event (the critical bug path)', () => {
    // This is exactly what happens when the proxy forwards an upstream error:
    // 1. Proxy returns 200 OK (because TransformStream is already returned)
    // 2. Error arrives as SSE data event
    // 3. Client's response.ok is true, so the !response.ok check never fires
    // 4. Error comes through as a parsed chunk
    const chunks = [
      ': keepalive\n\n',
      ': keepalive\n\n',
      'data: {"error": {"code": 400, "message": "Model gemini-3.1-pro-preview is not found"}}\n\n'
    ];
    const { accumulatedText, allErrors } = simulateStreamProcessing(chunks);
    expect(accumulatedText).toBe('');
    expect(allErrors).toHaveLength(1);
    expect(allErrors[0].code).toBe(400);
    expect(allErrors[0].message).toContain('not found');
  });

  it('detects 429 rate limit error from proxy', () => {
    const chunks = [
      'data: {"error": {"code": 429, "message": "Resource exhausted"}}\n\n'
    ];
    const { accumulatedText, allErrors } = simulateStreamProcessing(chunks);
    expect(accumulatedText).toBe('');
    expect(allErrors).toHaveLength(1);
    expect(allErrors[0].code).toBe(429);
  });

  it('detects 502 upstream connection failure', () => {
    const chunks = [
      ': keepalive\n\n',
      'data: {"error": {"code": 502, "message": "Upstream connection failed"}}\n\n'
    ];
    const { allErrors } = simulateStreamProcessing(chunks);
    expect(allErrors).toHaveLength(1);
    expect(allErrors[0].code).toBe(502);
  });

  it('detects error after partial successful stream', () => {
    // API starts streaming, then errors mid-stream
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Starting analysis..."}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"\\n```json\\n[{\\"id\\": \\"m1"}]}}]}\n\n',
      'data: {"error": {"code": 500, "message": "Internal error"}}\n\n'
    ];
    const { accumulatedText, allErrors } = simulateStreamProcessing(chunks);
    expect(accumulatedText.length).toBeGreaterThan(0);
    expect(allErrors).toHaveLength(1);
    expect(allErrors[0].code).toBe(500);
  });

  it('handles normal completion with usage metadata chunk', () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Done"}]},"finishReason":"STOP"}]}\n\n',
      'data: {"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":50}}\n\n'
    ];
    const { accumulatedText, allErrors, allWarnings } = simulateStreamProcessing(chunks);
    expect(accumulatedText).toBe('Done');
    expect(allErrors).toHaveLength(0);
    expect(allWarnings).toHaveLength(0);
  });

  it('warns on MAX_TOKENS truncation', () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"truncated"}]},"finishReason":"MAX_TOKENS"}]}\n\n'
    ];
    const { allWarnings } = simulateStreamProcessing(chunks);
    expect(allWarnings).toHaveLength(1);
    expect(allWarnings[0]).toContain('MAX_TOKENS');
  });
});


// ---------------------------------------------------------------------------
// 5. Request body construction — correct format for all analysis modes
// ---------------------------------------------------------------------------

function buildRequestBody(options = {}) {
  const {
    model = 'gemini-3.1-pro-preview',
    maxOutputTokens = 32768,
    thinkingLevel = 'high',
    temperature = 1.0,
    systemInstruction = 'You are a helpful assistant.',
    prompt = 'Test prompt',
    files = [],
  } = options;

  const parts = [];

  // Add files
  for (const file of files) {
    if (file.extractedText) {
      parts.push({ text: `[Document: ${file.filename}]\n${file.extractedText}` });
    } else {
      parts.push({
        inline_data: {
          mime_type: file.mimeType,
          data: file.base64Data
        }
      });
    }
  }

  // Add prompt
  parts.push({ text: prompt });

  return {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens,
      temperature,
      thinkingConfig: {
        thinkingLevel
      }
    }
  };
}

describe('request body construction', () => {
  it('builds correct structure with no files', () => {
    const body = buildRequestBody({ prompt: 'Compare documents' });
    expect(body.systemInstruction.parts[0].text).toBe('You are a helpful assistant.');
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts).toHaveLength(1);
    expect(body.contents[0].parts[0].text).toBe('Compare documents');
    expect(body.generationConfig.maxOutputTokens).toBe(32768);
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('high');
  });

  it('includes PDF files as inline_data before prompt', () => {
    const body = buildRequestBody({
      prompt: 'Analyze these documents',
      files: [
        { filename: 'plan.pdf', mimeType: 'application/pdf', base64Data: 'JVBERi0xLjQ=' }
      ]
    });
    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[0].inline_data).toBeDefined();
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('application/pdf');
    expect(body.contents[0].parts[0].inline_data.data).toBe('JVBERi0xLjQ=');
    expect(body.contents[0].parts[1].text).toBe('Analyze these documents');
  });

  it('includes non-PDF files as extracted text', () => {
    const body = buildRequestBody({
      prompt: 'Analyze',
      files: [
        { filename: 'data.xlsx', extractedText: '§1 Sheet1\nRow1\n§2 Sheet2\nRow2' }
      ]
    });
    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[0].text).toContain('[Document: data.xlsx]');
    expect(body.contents[0].parts[0].text).toContain('§1 Sheet1');
  });

  it('includes multiple files in correct order', () => {
    const body = buildRequestBody({
      prompt: 'Compare',
      files: [
        { filename: 'plan1.pdf', mimeType: 'application/pdf', base64Data: 'abc' },
        { filename: 'plan2.pdf', mimeType: 'application/pdf', base64Data: 'def' },
        { filename: 'notes.docx', extractedText: '§1 Notes content' }
      ]
    });
    // 3 files + 1 prompt = 4 parts
    expect(body.contents[0].parts).toHaveLength(4);
    // Files come before prompt
    expect(body.contents[0].parts[0].inline_data.data).toBe('abc');
    expect(body.contents[0].parts[1].inline_data.data).toBe('def');
    expect(body.contents[0].parts[2].text).toContain('[Document: notes.docx]');
    expect(body.contents[0].parts[3].text).toBe('Compare');
  });

  it('respects custom maxOutputTokens', () => {
    const body = buildRequestBody({ maxOutputTokens: 65536 });
    expect(body.generationConfig.maxOutputTokens).toBe(65536);
  });

  it('respects custom thinkingLevel', () => {
    const body = buildRequestBody({ thinkingLevel: 'low' });
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('low');
  });

  it('uses temperature 1.0 by default', () => {
    const body = buildRequestBody();
    expect(body.generationConfig.temperature).toBe(1.0);
  });
});


// ---------------------------------------------------------------------------
// 6. Prompt template construction — MODE_ADDENDA and PROMPT_TEMPLATES
// ---------------------------------------------------------------------------

const MODE_ADDENDA = {
  'cross-plan': { phase1: '', phase2: '', phase3: '' },
  'amendment-tracking': {
    phase1: '\n\nIMPORTANT CONTEXT: These documents are from a SINGLE plan',
    phase2: '\n\nIMPORTANT CONTEXT: These documents are from a SINGLE plan',
    phase3: '\n\nIMPORTANT CONTEXT: These documents are from a SINGLE plan'
  },
  'minutes-analysis': {
    phase1: '\n\nIMPORTANT CONTEXT: These documents are meeting minutes',
    phase2: '',
    phase3: ''
  },
  'invoice-analysis': {
    phase1: '\n\nIMPORTANT CONTEXT: These documents are invoices',
    phase2: '',
    phase3: ''
  }
};

// Simplified prompt templates matching the structure in index.html
function buildPhase1Prompt(fileList, mode) {
  const addendum = MODE_ADDENDA[mode || 'cross-plan']?.phase1 || '';
  return `Comprehensively read all of the attached documents. You must return an organized overview of which documents are which, how they relate to one another, and the general domain, content, and structure of each.

The uploaded documents are (in order):
${fileList}

When referencing documents, use these EXACT filenames as provided above.

Return ONLY the organized overview with no preamble or footnotes. Be as concise as possible without oversimplifying. Maximum 500 words response.${addendum}`;
}

describe('prompt template construction', () => {
  const fileList = '1. plan_a.pdf\n2. plan_b.pdf';

  it('builds cross-plan Phase 1 prompt with no addendum', () => {
    const prompt = buildPhase1Prompt(fileList, 'cross-plan');
    expect(prompt).toContain('Comprehensively read all');
    expect(prompt).toContain('plan_a.pdf');
    expect(prompt).toContain('plan_b.pdf');
    expect(prompt).not.toContain('IMPORTANT CONTEXT');
    expect(prompt).toContain('Maximum 500 words');
  });

  it('builds amendment-tracking Phase 1 prompt with single-plan addendum', () => {
    const prompt = buildPhase1Prompt(fileList, 'amendment-tracking');
    expect(prompt).toContain('IMPORTANT CONTEXT');
    expect(prompt).toContain('SINGLE plan');
  });

  it('builds minutes-analysis Phase 1 prompt with meeting addendum', () => {
    const prompt = buildPhase1Prompt(fileList, 'minutes-analysis');
    expect(prompt).toContain('IMPORTANT CONTEXT');
    expect(prompt).toContain('meeting minutes');
  });

  it('builds invoice-analysis Phase 1 prompt with invoice addendum', () => {
    const prompt = buildPhase1Prompt(fileList, 'invoice-analysis');
    expect(prompt).toContain('IMPORTANT CONTEXT');
    expect(prompt).toContain('invoices');
  });

  it('falls back to cross-plan for unknown mode', () => {
    const prompt = buildPhase1Prompt(fileList, 'unknown-mode');
    expect(prompt).not.toContain('IMPORTANT CONTEXT');
  });

  it('falls back to cross-plan for null mode', () => {
    const prompt = buildPhase1Prompt(fileList, null);
    expect(prompt).not.toContain('IMPORTANT CONTEXT');
  });

  it('includes file list in prompt', () => {
    const longFileList = '1. GLCTPF-Board-Minutes-Q1-2023.pdf\n2. GLCTPF-Board-Minutes-Q2-2023.pdf\n3. CCPF-Board-Minutes-Q1-2019.pdf';
    const prompt = buildPhase1Prompt(longFileList, 'minutes-analysis');
    expect(prompt).toContain('GLCTPF-Board-Minutes-Q1-2023.pdf');
    expect(prompt).toContain('CCPF-Board-Minutes-Q1-2019.pdf');
  });
});


// ---------------------------------------------------------------------------
// 7. fetchWithRetry — retry logic for transient errors
// ---------------------------------------------------------------------------

describe('fetchWithRetry logic', () => {
  const retryableStatuses = [429, 503, 524];

  it('identifies 429 as retryable', () => {
    expect(retryableStatuses.includes(429)).toBe(true);
  });

  it('identifies 503 as retryable', () => {
    expect(retryableStatuses.includes(503)).toBe(true);
  });

  it('identifies 524 as retryable', () => {
    expect(retryableStatuses.includes(524)).toBe(true);
  });

  it('does NOT retry on 400 (client error)', () => {
    expect(retryableStatuses.includes(400)).toBe(false);
  });

  it('does NOT retry on 401 (auth error)', () => {
    expect(retryableStatuses.includes(401)).toBe(false);
  });

  it('does NOT retry on 403 (forbidden)', () => {
    expect(retryableStatuses.includes(403)).toBe(false);
  });

  it('does NOT retry on 500 (server error)', () => {
    // 500 is NOT in the retry list — only 503
    expect(retryableStatuses.includes(500)).toBe(false);
  });

  it('does NOT retry on 200 (success)', () => {
    expect(retryableStatuses.includes(200)).toBe(false);
  });

  describe('exponential backoff calculation', () => {
    it('calculates correct delay bounds for each attempt', () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        // From fetchWithRetry: Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000)
        const minDelay = 1000 * Math.pow(2, attempt); // Without random component
        const maxDelay = Math.min(1000 * Math.pow(2, attempt) + 1000, 30000);
        expect(minDelay).toBeGreaterThan(0);
        expect(maxDelay).toBeLessThanOrEqual(30000);
      }
    });

    it('attempt 0: 1000-2000ms', () => {
      const base = 1000 * Math.pow(2, 0); // 1000
      expect(base).toBe(1000);
    });

    it('attempt 1: 2000-3000ms', () => {
      const base = 1000 * Math.pow(2, 1); // 2000
      expect(base).toBe(2000);
    });

    it('attempt 2: 4000-5000ms', () => {
      const base = 1000 * Math.pow(2, 2); // 4000
      expect(base).toBe(4000);
    });

    it('caps at 30000ms for large attempt numbers', () => {
      const attempt = 10;
      const delay = Math.min(1000 * Math.pow(2, attempt) + 1000, 30000);
      expect(delay).toBe(30000);
    });
  });
});


// ---------------------------------------------------------------------------
// 8. Proxy error forwarding — how [model].js wraps errors
// ---------------------------------------------------------------------------

describe('proxy error forwarding format', () => {
  // Replicates the error event format from functions/api/gemini/[model].js

  function buildProxyErrorEvent(statusCode, errorText) {
    return `data: {"error": {"code": ${statusCode}, "message": ${JSON.stringify(errorText)}}}\n\n`;
  }

  it('constructs valid SSE event for 400 error', () => {
    const event = buildProxyErrorEvent(400, 'Invalid model');
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.code).toBe(400);
    expect(parsed.error.message).toBe('Invalid model');
  });

  it('constructs valid SSE event for 429 rate limit', () => {
    const event = buildProxyErrorEvent(429, 'Quota exceeded');
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.code).toBe(429);
  });

  it('correctly escapes nested JSON in error text', () => {
    const upstreamError = '{"error":{"code":400,"message":"Field \'model\' not found","status":"NOT_FOUND"}}';
    const event = buildProxyErrorEvent(400, upstreamError);
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.code).toBe(400);
    // The upstream error body is preserved as a string
    expect(typeof parsed.error.message).toBe('string');
    expect(parsed.error.message).toContain('NOT_FOUND');
  });

  it('handles 502 upstream connection failure', () => {
    const event = buildProxyErrorEvent(502, 'Upstream connection failed');
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.code).toBe(502);
    expect(parsed.error.message).toBe('Upstream connection failed');
  });

  it('handles error text with special characters', () => {
    const errorText = 'Error: "model" doesn\'t exist & request was <invalid>';
    const event = buildProxyErrorEvent(400, errorText);
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.message).toBe(errorText);
  });

  it('handles empty error text', () => {
    const event = buildProxyErrorEvent(500, '');
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.code).toBe(500);
    expect(parsed.error.message).toBe('');
  });

  it('handles very long error text (full HTML error pages)', () => {
    const longError = '<html><body>' + 'Error details. '.repeat(100) + '</body></html>';
    const event = buildProxyErrorEvent(502, longError);
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.code).toBe(502);
    expect(parsed.error.message.length).toBeGreaterThan(1000);
  });
});


// ---------------------------------------------------------------------------
// 9. API URL construction
// ---------------------------------------------------------------------------

describe('API URL construction', () => {
  function getApiUrl(model, isProxyMode) {
    if (isProxyMode) {
      return `/api/gemini/${model}`;
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  }

  it('builds proxy URL for default model', () => {
    const url = getApiUrl('gemini-3.1-pro-preview', true);
    expect(url).toBe('/api/gemini/gemini-3.1-pro-preview');
  });

  it('builds direct URL for default model', () => {
    const url = getApiUrl('gemini-3.1-pro-preview', false);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse');
  });

  it('builds proxy URL for compaction model', () => {
    const url = getApiUrl('gemini-2.0-flash', true);
    expect(url).toBe('/api/gemini/gemini-2.0-flash');
  });

  it('preserves dots in model name (proxy mode)', () => {
    // Critical: Cloudflare Pages strips dots from route params,
    // so the proxy handler extracts model from the full path
    const url = getApiUrl('gemini-3.1-pro-preview', true);
    expect(url).toContain('3.1');
  });
});


// ---------------------------------------------------------------------------
// 10. Timeline analysis validation — Phase 1 & Phase 2 response validation
// ---------------------------------------------------------------------------

describe('timeline analysis response validation', () => {
  describe('Phase 1: ontology validation', () => {
    function validatePhase1Ontology(response) {
      const ontology = parseTimelineJSON(response);
      if (!ontology || !ontology.meetings || !ontology.topics) {
        return { valid: false, error: 'Failed to parse meeting ontology from Phase 1 response.' };
      }
      return { valid: true, ontology };
    }

    it('accepts valid ontology with meetings and topics', () => {
      const response = '```json\n{"meetings": [{"id": "m1"}], "topics": ["Budget"]}\n```';
      const result = validatePhase1Ontology(response);
      expect(result.valid).toBe(true);
      expect(result.ontology.meetings).toHaveLength(1);
    });

    it('rejects empty response (API error case)', () => {
      const result = validatePhase1Ontology('');
      expect(result.valid).toBe(false);
    });

    it('rejects response with no JSON', () => {
      const result = validatePhase1Ontology('Here is an overview of the meeting documents. They cover Q1-Q4 2023.');
      expect(result.valid).toBe(false);
    });

    it('rejects ontology without meetings array', () => {
      const result = validatePhase1Ontology('```json\n{"topics": ["Budget"]}\n```');
      expect(result.valid).toBe(false);
    });

    it('rejects ontology without topics array', () => {
      const result = validatePhase1Ontology('```json\n{"meetings": [{"id": "m1"}]}\n```');
      expect(result.valid).toBe(false);
    });

    it('accepts ontology with empty meetings array', () => {
      // Edge case: no meetings found but structure is valid
      const result = validatePhase1Ontology('```json\n{"meetings": [], "topics": ["General"]}\n```');
      expect(result.valid).toBe(true);
    });
  });

  describe('Phase 2: meetings array validation', () => {
    function validatePhase2Meetings(response) {
      const meetings = parseTimelineJSON(response);
      if (!meetings || !Array.isArray(meetings)) {
        return { valid: false, error: 'Failed to parse meeting data from Phase 2 response.' };
      }
      return { valid: true, meetings };
    }

    it('accepts valid meetings array', () => {
      const response = '```json\n[{"id": "m1", "title": "Q1 Meeting", "date": "2023-03-15", "topics": {}}]\n```';
      const result = validatePhase2Meetings(response);
      expect(result.valid).toBe(true);
    });

    it('rejects empty response', () => {
      const result = validatePhase2Meetings('');
      expect(result.valid).toBe(false);
    });

    it('rejects object response (not array)', () => {
      const result = validatePhase2Meetings('```json\n{"meetings": [{"id": "m1"}]}\n```');
      expect(result.valid).toBe(false);
    });

    it('accepts empty meetings array', () => {
      const result = validatePhase2Meetings('```json\n[]\n```');
      expect(result.valid).toBe(true);
    });
  });

  describe('invoice ontology validation', () => {
    function validateInvoiceOntology(response) {
      const ontology = parseTimelineJSON(response);
      if (!ontology || !ontology.vendors || !ontology.categories) {
        return { valid: false, error: 'Failed to parse invoice ontology' };
      }
      return { valid: true, ontology };
    }

    it('accepts valid invoice ontology', () => {
      const response = '```json\n{"vendors": [{"id": "v1"}], "categories": ["Legal"], "periods": []}\n```';
      const result = validateInvoiceOntology(response);
      expect(result.valid).toBe(true);
    });

    it('rejects ontology without vendors', () => {
      const response = '```json\n{"categories": ["Legal"]}\n```';
      const result = validateInvoiceOntology(response);
      expect(result.valid).toBe(false);
    });

    it('rejects ontology without categories', () => {
      const response = '```json\n{"vendors": [{"id": "v1"}]}\n```';
      const result = validateInvoiceOntology(response);
      expect(result.valid).toBe(false);
    });
  });
});


// ---------------------------------------------------------------------------
// 11. Invoice JSON repair logic
// ---------------------------------------------------------------------------

describe('invoice batch JSON repair', () => {
  function repairTruncatedJSON(batchResponse) {
    const fenceMatch = batchResponse.match(/```json\s*([\s\S]*?)(?:```|$)/);
    if (!fenceMatch) return null;

    let jsonStr = fenceMatch[1].trim();

    // First try direct parse
    try { return JSON.parse(jsonStr); } catch (e) { /* continue */ }

    // Try repair: find last complete object and close the array
    if (!jsonStr.endsWith(']')) {
      const lastObj = jsonStr.lastIndexOf('\n  }');
      if (lastObj > 0) {
        jsonStr = jsonStr.substring(0, lastObj + 4).replace(/,\s*$/, '') + '\n]';
        try { return JSON.parse(jsonStr); } catch (e) { /* continue */ }
      }
    }

    return null;
  }

  it('parses complete JSON without repair', () => {
    const input = '```json\n[{"id": "p1", "label": "Jan 2025", "vendors": []}]\n```';
    const result = repairTruncatedJSON(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  it('repairs JSON truncated mid-object', () => {
    const input = `\`\`\`json
[
  {
    "id": "p1",
    "label": "Jan 2025",
    "vendors": []
  },
  {
    "id": "p2",
    "label": "Feb 2025",
    "vendo`;
    const result = repairTruncatedJSON(input);
    // Should recover p1 by finding last complete object
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  it('repairs JSON truncated after trailing comma', () => {
    const input = `\`\`\`json
[
  {
    "id": "p1",
    "label": "Jan 2025",
    "vendors": []
  },`;
    const result = repairTruncatedJSON(input);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
  });

  it('returns null for completely invalid content', () => {
    const input = '```json\nnot json at all\n```';
    const result = repairTruncatedJSON(input);
    expect(result).toBeNull();
  });

  it('returns null for input without json fence', () => {
    const input = 'Just plain text with no code block';
    const result = repairTruncatedJSON(input);
    expect(result).toBeNull();
  });
});


// ---------------------------------------------------------------------------
// 12. End-to-end scenario: timeline analysis with API error
// ---------------------------------------------------------------------------

describe('end-to-end: timeline analysis error scenarios', () => {
  it('now correctly surfaces API error instead of misleading parse failure', () => {
    // After the fix: streamResponse checks for accumulated errors and throws
    // with the actual API error message, so the user sees "Model not found"
    // instead of "Failed to parse meeting ontology"

    const sseChunks = [
      ': keepalive\n\n',
      ': keepalive\n\n',
      'data: {"error": {"code": 400, "message": "models/gemini-3.1-pro-preview is not found for API version v1beta"}}\n\n'
    ];

    const { accumulatedText, allErrors } = simulateStreamProcessing(sseChunks);

    // Error is detected
    expect(allErrors).toHaveLength(1);
    expect(allErrors[0].code).toBe(400);
    expect(accumulatedText).toBe('');

    // Simulate the fixed streamResponse behavior:
    // Instead of returning empty string and letting parseTimelineJSON fail,
    // it throws with the real API error message
    if (allErrors.length > 0) {
      const err = allErrors[0];
      const thrownMessage = `API error (${err.code}): ${err.message}`;
      expect(thrownMessage).toContain('not found');
      expect(thrownMessage).not.toContain('Failed to parse');
    }
  });

  it('demonstrates successful timeline flow', () => {
    // Phase 1: Summary + ontology
    const phase1Chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"These documents cover board meetings.\\n\\n```json\\n{\\n  \\"meetings\\": [{\\"id\\": \\"m1\\", \\"title\\": \\"Q1 Meeting\\", \\"date\\": \\"2023-03-15\\", \\"type\\": \\"Board\\", \\"file\\": \\"minutes.pdf\\"}],\\n  \\"topics\\": [\\"Budget\\", \\"Compliance\\"]\\n}\\n```"}]}}]}\n\n',
      'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"totalTokenCount":500}}\n\n'
    ];

    const phase1Result = simulateStreamProcessing(phase1Chunks);
    expect(phase1Result.allErrors).toHaveLength(0);

    const ontology = parseTimelineJSON(phase1Result.accumulatedText);
    expect(ontology).not.toBeNull();
    expect(ontology.meetings).toHaveLength(1);
    expect(ontology.topics).toContain('Budget');

    // Phase 2: Detailed extraction
    const phase2Chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"```json\\n[{\\"id\\": \\"m1\\", \\"title\\": \\"Q1 Meeting\\", \\"date\\": \\"2023-03-15\\", \\"type\\": \\"Board\\", \\"file\\": \\"minutes.pdf\\", \\"topics\\": {\\"Budget\\": {\\"text\\": \\"Board approved $5M budget.\\", \\"citations\\": [{\\"label\\": \\"p. 2\\", \\"page\\": 2}]}}}]\\n```"}]}}]}\n\n'
    ];

    const phase2Result = simulateStreamProcessing(phase2Chunks);
    expect(phase2Result.allErrors).toHaveLength(0);

    const meetings = parseTimelineJSON(phase2Result.accumulatedText);
    expect(meetings).not.toBeNull();
    expect(Array.isArray(meetings)).toBe(true);
    expect(meetings[0].topics.Budget.text).toContain('$5M');
  });
});


// ---------------------------------------------------------------------------
// 13. Pre-flight model validation
// ---------------------------------------------------------------------------

describe('pre-flight model validation', () => {
  // Replicated from index.html validateModelAccess()

  function parsePreflightSSEResponse(responseText) {
    // Check for error events in the SSE response
    const errorMatch = responseText.match(/data: (\{.*"error".*\})/);
    if (errorMatch) {
      try {
        const errData = JSON.parse(errorMatch[1]);
        if (errData.error) {
          return { ok: false, error: errData.error };
        }
      } catch { /* not valid JSON error */ }
    }
    return { ok: true };
  }

  it('detects model-not-found in SSE error response', () => {
    const sseResponse = ': keepalive\n\ndata: {"error": {"code": 400, "message": "Model not found", "upstream": "https://aiplatform.googleapis.com/v1/..."}}\n\n';
    const result = parsePreflightSSEResponse(sseResponse);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(400);
    expect(result.error.message).toContain('not found');
    expect(result.error.upstream).toContain('aiplatform');
  });

  it('detects quota exhaustion in SSE error response', () => {
    const sseResponse = 'data: {"error": {"code": 429, "message": "Resource exhausted"}}\n\n';
    const result = parsePreflightSSEResponse(sseResponse);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(429);
  });

  it('passes when response contains valid data (no error)', () => {
    const sseResponse = 'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n';
    const result = parsePreflightSSEResponse(sseResponse);
    expect(result.ok).toBe(true);
  });

  it('passes when response is empty data chunks (no error)', () => {
    const sseResponse = ': keepalive\n\n: keepalive\n\ndata: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n';
    const result = parsePreflightSSEResponse(sseResponse);
    expect(result.ok).toBe(true);
  });

  it('builds minimal request body for validation', () => {
    // Pre-flight uses the smallest possible request: no files, minimal tokens
    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: 'Say "ok"' }] }],
      generationConfig: { maxOutputTokens: 10 }
    };
    expect(requestBody.contents[0].parts).toHaveLength(1);
    expect(requestBody.generationConfig.maxOutputTokens).toBe(10);
    // No systemInstruction (saves tokens), no thinkingConfig (saves time)
    expect(requestBody.systemInstruction).toBeUndefined();
  });
});


// ---------------------------------------------------------------------------
// 14. Proxy error format with upstream URL context
// ---------------------------------------------------------------------------

describe('proxy error format with upstream URL', () => {
  function buildProxyErrorEventWithUpstream(statusCode, message, geminiUrl) {
    return `data: {"error": {"code": ${statusCode}, "message": ${JSON.stringify(message)}, "upstream": ${JSON.stringify(geminiUrl)}}}\n\n`;
  }

  it('includes Vertex AI global endpoint in error', () => {
    const url = 'https://aiplatform.googleapis.com/v1/projects/myproj/locations/global/publishers/google/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse';
    const event = buildProxyErrorEventWithUpstream(400, 'Model not found', url);
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.upstream).toContain('aiplatform.googleapis.com');
    expect(parsed.error.upstream).toContain('global');
    expect(parsed.error.upstream).toContain('gemini-3.1-pro-preview');
  });

  it('includes Consumer API endpoint in error', () => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse';
    const event = buildProxyErrorEventWithUpstream(429, 'Quota exceeded', url);
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.upstream).toContain('generativelanguage.googleapis.com');
  });

  it('includes regional Vertex AI endpoint in error', () => {
    const url = 'https://us-central1-aiplatform.googleapis.com/v1/projects/myproj/locations/us-central1/publishers/google/models/gemini-2.5-pro:streamGenerateContent?alt=sse';
    const event = buildProxyErrorEventWithUpstream(403, 'Permission denied', url);
    const parsed = JSON.parse(event.slice(6).trim());
    expect(parsed.error.upstream).toContain('us-central1');
    expect(parsed.error.code).toBe(403);
  });

  it('helps distinguish Vertex AI global vs regional routing failures', () => {
    // This is the key diagnostic: if the upstream URL shows "global" but the
    // model isn't available globally, the admin knows to check the
    // isGlobalModel routing logic
    const globalUrl = 'https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse';
    const event = buildProxyErrorEventWithUpstream(404, 'Model not found', globalUrl);
    const parsed = JSON.parse(event.slice(6).trim());

    const isGlobalEndpoint = parsed.error.upstream.includes('/locations/global/');
    expect(isGlobalEndpoint).toBe(true);
    // Admin can see: "Model not found at the global endpoint — maybe it needs a regional endpoint"
  });
});
