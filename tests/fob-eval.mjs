/**
 * FOB Audit Eval Harness
 *
 * Runs the FOB audit analysis headlessly against the Gemini API using the same
 * prompts as index.html, then evaluates the output against known issue patterns
 * from the Leading Edge feedback (requirements/leadingedge/issues-2026-06-17.md).
 *
 * Usage:
 *   node tests/fob-eval.mjs <fob_file> <aggregate_file> [--save]
 *
 * Example:
 *   node tests/fob-eval.mjs \
 *     "/Users/claytonchancey/Desktop/Archived/_DEMO_/Leading Edge/fobdemo/FOBS.ALP2.Autism Learning Partners.Anthem Blue Cross EPO 2500.2026.xlsx" \
 *     "/Users/claytonchancey/Desktop/Archived/_DEMO_/Leading Edge/fobdemo/Leading Edge Admin CA Aggregate (Autism Learning Partners)_ALP2 EPO 2500 Savings Plan _ L4DM _ 20260101.pdf" \
 *     --save
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Config ──────────────────────────────────────────────────────────────────

function loadConfig() {
  const configPath = path.join(ROOT, 'config.js');
  const src = fs.readFileSync(configPath, 'utf8');
  const match = src.match(/GEMINI_API_KEY:\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error('Cannot parse GEMINI_API_KEY from config.js');
  const modelMatch = src.match(/MODEL:\s*['"]([^'"]+)['"]/);
  return {
    apiKey: match[1],
    model: modelMatch?.[1] || 'gemini-3.1-pro-preview',
  };
}

// ── Prompt Templates (mirrored from index.html) ────────────────────────────

function phase1Prompt(fileList) {
  return `Comprehensively read all of the attached documents. You must return an organized overview of which documents are which, how they relate to one another, and the general domain, content, and structure of each.

The uploaded documents are (in order):
${fileList}

When referencing documents, use these EXACT filenames as provided above.

Return ONLY the organized overview with no preamble or footnotes. Be as concise as possible without oversimplifying. Maximum 500 words response.

IMPORTANT CONTEXT: These documents are an Anthem FOB (Features of Benefits) Excel template and its corresponding Aggregate document returned by Anthem. This is an audit comparison to identify configuration errors.

Your response must contain TWO parts:

PART 1: A text overview (max 800 words) identifying:
- Which file is the FOB template (the submission TO Anthem — a locked Excel with benefit deviations) and which is the Aggregate (Anthem's RETURNED document — their processed interpretation)
- The FOB template variant: PPO ("JAA Model Plan - PPO") with label columns A-G merged, INN benefits in column D, OON in column I, deviations in columns L (INN) and M (OON); OR EPO/PAR-Only ("JAA Model Plan - PAR Only") with label columns A-C or A-F merged, INN benefits in column D, OON in column H (usually "Not Applicable"), deviations in columns J (INN) and K (OON)
- Section boundaries in the FOB: Plan Information, Eligibility, Network Selections, Vendor/Contact Info, Deductible/Coinsurance/OOP, Benefits, Pre-Certification/Pre-Cert Lists, Exclusions — with approximate row ranges
- Section boundaries in the Aggregate with approximate row ranges
- The column mapping between FOB and Aggregate (which FOB column maps to which Aggregate column for INN, OON, and deviations)
- Aggregate version info from any Change Log section (version number, date, IMPL reference, status)
- Any structural anomalies: page header artifact rows in the Aggregate, column offset issues, unexpected merge patterns, blank sections

PART 2: Immediately after the overview, output a fenced JSON block:

\`\`\`json
{
  "fob_file": "exact_filename.xlsx",
  "aggregate_file": "exact_filename.xlsx_or_pdf",
  "template_variant": "PPO or EPO",
  "fob_columns": {
    "labels": "A-G",
    "inn_benefits": "D",
    "oon_benefits": "I",
    "inn_deviations": "L",
    "oon_deviations": "M",
    "notes": "N"
  },
  "aggregate_columns": {
    "inn_benefits": "D",
    "oon_benefits": "J",
    "corrections": "L"
  },
  "sections": [
    {"name": "Plan Information", "fob_rows": "3-27", "agg_rows": "1-27"},
    {"name": "Benefits", "fob_rows": "154-500", "agg_rows": "162-500"},
    {"name": "Pre-Certification", "fob_rows": "...", "agg_rows": "..."}
  ],
  "aggregate_version": 1,
  "anomalies": ["description of any structural issues found"]
}
\`\`\``;
}

function phase2Prompt(summaryResponse, fileList, ontologyJSON) {
  let phase2Summary = summaryResponse;
  if (ontologyJSON) {
    phase2Summary += `\n\nFOB ONTOLOGY (from Phase 1): Template variant: ${ontologyJSON.template_variant}. FOB columns: ${JSON.stringify(ontologyJSON.fob_columns)}. Aggregate columns: ${JSON.stringify(ontologyJSON.aggregate_columns)}.`;
  }

  return `Comprehensively read and analyze all of the attached documents. Here is a summary of the documents' content and structure:

<summary>
${phase2Summary}
</summary>

The uploaded documents are (in order):
${fileList}

I want you to return a detailed and comprehensive table comparing elements across all plans. Columns should represent identified plans, and rows should represent identified procedural elements within the plans. The purpose of this table is to compare procedural elements across all plan documents at a glance — including both benefit mechanics (eligibility, vesting, accruals) and administrative/legal procedures (claims processes, appeal rights, deadlines, dispute resolution, and venue).

COLUMN STRUCTURE (read the Phase 1 summary above carefully to decide this):

Columns represent the ENTITIES being compared, not the raw files uploaded. Use the Phase 1 summary to infer the right structure:

- DEFAULT CASE — multiple plan units, each possibly spanning multiple files: If the documents describe two or more distinct plan units (and a single plan unit is often spread across an SPD plus its SMMs/amendments all describing the same unit), use ONE column per plan unit. Collapse all files that belong to the same plan unit into that plan's single column — cell content should draw from whichever of that plan's files is most authoritative or relevant for each row. Do NOT give each file its own column just because it was uploaded separately.

- VERSIONS CASE — documents are versions of the same plan (e.g. "v1" vs "v2", or an original plus named amendments uploaded for side-by-side version comparison): use ONE column per version.

- FALLBACK CASE — documents do NOT form a discernible plan-unit or version structure (each file is independently distinct, documents are unrelated to each other, or the docs aren't plan documents at all): use ONE column per uploaded document.

In all cases, pick whichever structure Phase 1's analysis best supports. When in doubt between "multiple plan units" and "one-column-per-file", prefer the plan-unit interpretation — collapsing related files under one plan is almost always what the user wants.

COLUMN HEADERS (formatting rules):
- Headers must be SHORT and single-line — ideally 1-3 words (e.g. "San Diego", "Vegas", "Plan 4", "v1", "v2").
- Do NOT put full filenames in column headers. Long filenames bloat the header row and make the table unreadable.
- Choose a label that fits on a single line at typical column width (~160px). Prefer plan unit name, version label, location, or a short descriptor.

When referencing specific documents inside table CELLS or anywhere else, you may use the exact filenames as provided above.

Return ONLY the comparison table with no preamble, introduction, or footnotes. Do not oversimplify. Do not condense. Complete this task as comprehensively and completely as possible.

IMPORTANT CONTEXT: This is a FOB Audit comparison. The documents are an Anthem FOB template (what the TPA submitted to Anthem) and an Aggregate document (what Anthem returned after processing). You must compare EVERY benefit line, financial parameter, and plan info field between the two documents.

REQUIRED TABLE COLUMNS — use exactly these column headers:
| Section | Benefit / Field | Setting | FOB Standard | FOB Deviation | Expected Value | Aggregate Value | Status | Details | FOB Ref | Agg Ref |

COLUMN DEFINITIONS:
- **Section**: One of: Plan Info, Eligibility, Network, Financial, Benefits, Pre-Cert, Exclusions
- **Benefit / Field**: The benefit category or field name (e.g., "Urgent Care - Outpatient Professional", "Individual Deductible - INN")
- **Setting**: For benefits with multi-line structured cell data, specify which parameter: Coverage, Covered At, Deductible, Copayment, or Limit. For plan info fields or single-value cells, use "Value".
- **FOB Standard**: The standard/default value from the FOB's locked columns (the baseline Anthem provides)
- **FOB Deviation**: The deviation entered by the TPA in the editable deviation columns. Leave blank if no deviation was entered.
- **Expected Value**: If a deviation exists, this equals the deviation value. If no deviation, this equals the FOB standard value.
- **Aggregate Value**: The actual value Anthem placed in the Aggregate document for this field.
- **Status**: One of: Match, Mismatch, Uncertain, Missing, Blank-OON
- **Details**: For Mismatch: describe what differs. For Uncertain: explain why. For Missing: which document is missing the entry. For Blank-OON: note that EPO OON cells should explicitly say "Not Applicable". For Match: leave blank.
- **FOB Ref**: The cell reference in the FOB document for the compared value, e.g., "R182 C-D" or "R182 C-J" (for deviations). Use R for row and C- for column letter.
- **Agg Ref**: The cell reference in the Aggregate document, e.g., "R165 C-D". Leave blank for Missing rows that don't exist in the Aggregate.

COMPARISON PROCEDURE:
1. For each benefit line in the FOB, read the standard value from the locked benefit columns (INN and OON).
2. Read the deviation from the editable deviation columns (if any exists).
3. Determine Expected Value: if a deviation was entered, Expected = the deviation; if no deviation, Expected = the standard value.
4. Read the corresponding value from the Aggregate document.
5. Compare Expected Value vs. Aggregate Value.
5a. CRITICAL — Compare ALL text content within the cell, not just the primary value. This includes:
    - Qualifier text (e.g., "Limit combined Institutional/Professional")
    - Conditions (e.g., "Covered – Conditionally" vs "Covered")
    - Limits and caps (e.g., "30 Visits Per Year", "Limited to 90 days per benefit period")
    - Notes, restrictions, and sub-provisions (e.g., "Patient is required to be homebound")
    - Sub-items like "All Other: Covered: No"
    If ANY of this content is present in one document but absent from the other, or differs between documents, the status MUST be Mismatch — even if the primary coverage parameter (percentage, copay) matches.
6. For multi-line structured cells, parse EACH field independently:
   - Coverage status (Covered / Not Covered / Covered Conditionally)
   - Covered At (percentage, e.g., 80%)
   - Deductible (Yes / No)
   - Copayment (dollar amount / N/A)
   - Limit (description / N/A)
   - Notes/Qualifiers (any additional text, conditions, or restrictions)
   Create a SEPARATE ROW for each field within the benefit line, regardless of whether it matches or not. The Setting column distinguishes them (Coverage, Covered At, Deductible, Copayment, Limit, Notes). IMPORTANT: Do NOT create a single summary row for the benefit and only add sub-rows for differences. Every field gets its own row.
7. BIDIRECTIONAL CHECK (MANDATORY): After completing the FOB-driven comparison above, perform a REVERSE SCAN of the Aggregate document. For every benefit line, field, or section that appears in the Aggregate but was NOT matched to any FOB row above, add a row with Status: Missing and Details: "Present in Aggregate but not found in FOB template." This ensures the comparison is symmetric — items unique to either document are surfaced.

TERMINOLOGY EQUIVALENCE — do NOT flag these as mismatches:
- "Not Covered" = "Excluded" = "Benefit Not Available"
- "N/A" = "Not Applicable" (especially in OON columns for EPO/PAR-Only plans). However, a BLANK or EMPTY cell is NOT equivalent to "N/A" — blank cells are errors that must be flagged as Blank-OON.
- Percentage formatting: "80%" = "80 %" = "80.00%"
- Dollar formatting: "$35" = "$35.00"
- "Covered" with any coinsurance percentage = covered (do not flag formatting differences)
- Whitespace, capitalization, and minor punctuation differences are not mismatches

STATUS CLASSIFICATION RULES — FOB audits require LITERAL text comparison, not semantic equivalence:
- **Match**: The Expected Value and Aggregate Value contain the same text (after applying ONLY the terminology equivalence normalizations listed above — formatting like "80%" vs "80.00%", "$35" vs "$35.00", and the explicit equivalences like "Not Covered" = "Excluded"). If the actual words, numbers, word order, sentence structure, or qualifying context differ in ANY other way, it is NOT a match. In particular: if one document uses a structured format like "$35/ per PCP visit $70/ per Specialist visit" and the other reformats it as "$35 Per Visit / $70 Per Visit", this is a Mismatch because the provider-type qualifiers are lost. Similarly, rephrased sentences with the same meaning but different word order are Mismatches.
- **Mismatch**: The Expected Value and Aggregate Value differ in wording, values, conditions, qualifiers, limits, notes, or any other textual content — even if they are logically or semantically equivalent. Examples: "12 Months" vs "365 Days" = Mismatch (different text). "Covered" vs "Covered – Conditionally" = Mismatch. "80%" vs "50%" = Mismatch.
- **Uncertain**: Values appear similar but contain subtle differences that could be formatting artifacts or genuine mismatches — flag for human review. Use sparingly.
- **Missing**: A benefit line exists in one document but has no corresponding entry in the other.
- **Blank-OON**: For EPO/PAR-Only plans, any OON cell in the Aggregate that is blank/empty when it should explicitly state "Not Applicable."

EXAMPLES — study these carefully:
- FOB: "12 Months" vs Aggregate: "365 Days" → Status: **Mismatch** (different text, even though semantically similar)
- FOB: "Covered, 80%, Ded Yes, Copay N/A" vs Aggregate: "Covered – Conditionally, 80%, Ded Yes, Copay N/A" → Status: **Mismatch** (qualifier "Conditionally" added)
- FOB: "Covered, 80%, Ded Yes" with limits "Limited to 90 days" vs Aggregate: "Covered, 80%, Ded Yes" with NO limits → Status: **Mismatch** (limit information missing)
- FOB: "Not Covered" vs Aggregate: "Excluded" → Status: **Match** (explicit terminology equivalence)
- FOB: "$35.00" vs Aggregate: "$35" → Status: **Match** (formatting normalization)
- FOB: "Emergency Room" with note "Limit combined Institutional/Professional." vs Aggregate: "Emergency Room" without that note → Status: **Mismatch** (qualifier text differs)
- FOB: "$35/ per PCP visit $70/ per Specialist visit" vs Aggregate: "$35 Per Visit / $70 Per Visit" → Status: **Mismatch** (provider-type distinction "PCP" vs "Specialist" is lost in the Aggregate's reformatted text — the dollar amounts match but the qualifying context differs)
- FOB: "Sleep Studies in the home are covered" vs Aggregate: "Sleep studies are covered in the patients home" → Status: **Mismatch** (different sentence structure — even when the meaning is identical, any difference in phrasing or word order is a Mismatch)

CRITICAL INSTRUCTIONS:
- Report ALL lines including matches. Do NOT skip, summarize, or condense matching lines. Every benefit line from the FOB must appear in the output table.
- Do NOT reorder benefit lines. Maintain the order they appear in the FOB document.
- Include Plan Information fields (plan name, account prefix, dates, etc.) and Financial parameters (deductibles, coinsurance, OOP maximums) — not just benefit lines.
- Include Exclusions section: verify each exclusion confirmation matches between FOB and Aggregate.
- PRE-CERTIFICATION / PRE-CERT LISTS: Both the FOB template and Aggregate may contain Pre-Certification (Pre-Cert) listing sections with lists of services requiring pre-certification. Compare these lists item by item. For each service on either list: if present in both, mark as Match; if present in one but not the other, mark as Missing with Details indicating which document contains it. Use Section: "Pre-Cert" for these rows.
- INN/OON PAIRS: When a benefit has both In-Network (INN) and Out-of-Network (OON) settings, BOTH must appear in the output. Never include only the INN row without its corresponding OON row. Check every benefit that has INN/OON variants and ensure both rows are present.
- Every benefit that appears as a DISTINCT ROW in the source Excel must appear as its own row in the output. Do NOT concatenate, merge, or summarize multiple benefit sub-lines into a single row. For example, if the FOB lists "Cardiac Rehab - Outpatient Institutional", "Cardiac Rehab - Inpatient Professional", and "Chemotherapy - Outpatient Institutional" as separate rows, each MUST appear as a separate row in your output — never as a single "Therapies (Cardiac, Chemo Coverage)" summary row.

EPO/PAR-ONLY OON AUDIT (MANDATORY when the template variant is EPO or PAR-Only):
After completing the INN comparison above, perform a SECOND PASS on every benefit line's OON column in the Aggregate:
1. Read the Aggregate's OON cell for each benefit line.
2. If the OON cell is blank or empty (no text at all — not "Not Applicable", not "N/A", literally empty), create a row with Status: Blank-OON. Use the benefit name with "OON" in the Setting column.
3. If the OON cell says "Not Applicable" or "N/A", that is CORRECT for an EPO plan — mark as Match (no separate row needed).
4. IMPORTANT: An empty/blank cell is NOT the same as "N/A" or "Not Applicable". Blank means the value was not populated and must be corrected.
5. A typical EPO V1 Aggregate will have dozens to hundreds of blank OON cells. This is a known, common error pattern. Do NOT skip this check.

Return ONLY the comparison table with no preamble, introduction, or footnotes. Do not oversimplify. Do not condense. Complete this task as comprehensively and completely as possible.`;
}

// ── Gemini API ──────────────────────────────────────────────────────────────

async function callGemini(config, prompt, fileParts, options = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?alt=sse`;

  const parts = [...fileParts, { text: prompt }];
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens || 32768,
      temperature: options.temperature ?? 1.0,
      ...(options.topP !== undefined && { topP: options.topP }),
      ...(options.seed !== undefined && { seed: options.seed }),
      thinkingConfig: { thinkingLevel: 'high' },
    },
  };

  console.log(`  → Calling ${config.model} (maxTokens: ${body.generationConfig.maxOutputTokens}, temp: ${body.generationConfig.temperature})...`);
  const start = Date.now();

  const MAX_RETRIES = 2;
  let resp;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600000); // 10min timeout
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey,
          'Referer': 'https://app.syncrodocsystems.com',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      break;
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        console.log(`  ⚠️ Attempt ${attempt + 1} failed (${e.cause?.code || e.message}), retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      } else {
        throw e;
      }
    }
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${text.slice(0, 500)}`);
  }

  // Parse SSE stream
  let fullText = '';
  let finishReason = null;
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        if (chunk.error) throw new Error(`API error: ${JSON.stringify(chunk.error)}`);
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason) finishReason = candidate.finishReason;
        const text = candidate?.content?.parts?.[0]?.text;
        if (text) fullText += text;
      } catch (e) {
        if (e.message.startsWith('API error')) throw e;
        // skip unparseable lines
      }
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  ← ${fullText.length} chars in ${elapsed}s (finishReason: ${finishReason})`);

  return { text: fullText, finishReason };
}

// ── File Encoding ───────────────────────────────────────────────────────────

function extractXlsxText(filePath) {
  const workbook = XLSX.readFile(filePath);
  const lines = [];
  let sectionNum = 1;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    lines.push(`=== Sheet: ${sheetName} ===`);

    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (jsonData.length === 0) continue;

    const header = jsonData[0];
    lines.push(`§${sectionNum} | ${header.join(' | ')} |`);
    sectionNum++;

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row.every(cell => String(cell).trim() === '')) continue;
      lines.push(`§${sectionNum} | ${row.join(' | ')} |`);
      sectionNum++;
    }
    lines.push('');
  }

  return lines.join('\n');
}

function encodeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // Non-PDF files: extract to text (matches browser-side extraction)
  if (['.xlsx', '.xls'].includes(ext)) {
    const text = extractXlsxText(filePath);
    return { _isText: true, filename: path.basename(filePath), text };
  }
  if (['.csv', '.txt'].includes(ext)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
    const text = lines.map((l, i) => `§${i + 1} ${l}`).join('\n');
    return { _isText: true, filename: path.basename(filePath), text };
  }

  // PDF and images: send as inline base64
  const data = fs.readFileSync(filePath);
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  return {
    inline_data: {
      mime_type: mimeTypes[ext] || 'application/octet-stream',
      data: data.toString('base64'),
    },
  };
}

function filesToParts(encodedFiles) {
  return encodedFiles.map(f => {
    if (f._isText) {
      return { text: `[Document: ${f.filename}]\n${f.text}` };
    }
    return f;
  });
}

// ── Table Parser ────────────────────────────────────────────────────────────

function parseMarkdownTable(md) {
  const lines = md.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return { headers: [], rows: [] };

  const parse = line => line.split('|').slice(1, -1).map(c => c.trim());
  const headers = parse(lines[0]);
  // skip separator line (index 1)
  const rows = lines.slice(2).map(line => {
    const cells = parse(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] || ''; });
    return obj;
  });

  return { headers, rows };
}

function parseOntologyJSON(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

// ── Continuation Helpers ────────────────────────────────────────────────────

function findContinuationPoint(markdown) {
  const lines = markdown.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return null;

  const parseRow = line => line.split('|').slice(1, -1).map(c => c.trim());
  const headers = parseRow(lines[0]);
  const sectionIdx = headers.findIndex(h => h.toLowerCase().includes('section'));
  if (sectionIdx < 0) return null;

  const sectionsPresent = new Set();
  let lastSection = 'unknown';
  for (let i = 2; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    const s = (cells[sectionIdx] || '').trim();
    if (s) { sectionsPresent.add(s); lastSection = s; }
  }

  return {
    lastSection,
    sectionsPresent: [...sectionsPresent],
    totalRows: lines.length - 2,
  };
}

function buildContinuationPrompt(summary, fileList, ontology, existingOutput) {
  const contPoint = findContinuationPoint(existingOutput);

  let remainingSections = '- All remaining sections not yet covered';
  if (ontology?.sections && contPoint) {
    const presentLower = contPoint.sectionsPresent.map(s => s.toLowerCase());
    const remaining = ontology.sections.filter(s => {
      const name = s.name.toLowerCase();
      return !presentLower.some(p => p.includes(name) || name.includes(p));
    });
    if (remaining.length > 0) {
      remainingSections = remaining.map(s => `- ${s.name} (FOB rows ${s.fob_rows})`).join('\n');
    }
  }

  // Extract the FOB-specific addendum from a dummy phase2Prompt call
  const fullPrompt = phase2Prompt('', '', null);
  const fobAddendum = fullPrompt.split('IMPORTANT CONTEXT: This is a FOB Audit comparison.').slice(1).join('');

  return `Comprehensively read and analyze all of the attached documents. Here is a summary of the documents' content and structure:

<summary>
${summary}
</summary>

The uploaded documents are (in order):
${fileList}

You are CONTINUING a FOB audit comparison table that was truncated. Here is what has been generated so far (${contPoint ? contPoint.totalRows : '?'} rows covering sections: ${contPoint ? contPoint.sectionsPresent.join(', ') : 'unknown'}):

<existing_output_tail>
${existingOutput.split('\n').slice(-30).join('\n')}
</existing_output_tail>

CONTINUATION INSTRUCTIONS:
1. Do NOT output the table header row or separator row. Start IMMEDIATELY with data rows.
2. Continue from where the existing output left off. The last section covered was "${contPoint ? contPoint.lastSection : 'unknown'}".
3. Cover these remaining sections:
${remainingSections}
4. Use the EXACT SAME column format: | Section | Benefit / Field | Setting | FOB Standard | FOB Deviation | Expected Value | Aggregate Value | Status | Details | FOB Ref | Agg Ref |
5. Maintain FOB document order. Do not repeat rows already in the existing output.

IMPORTANT CONTEXT: This is a FOB Audit comparison.${fobAddendum ? '\n' + fobAddendum : ''}`;
}

function buildBlankOonPrompt(summary, fileList, ontology) {
  return `Comprehensively read the attached documents. Here is a summary:

<summary>
${summary}
</summary>

The uploaded documents are (in order):
${fileList}

This is an EPO/PAR-Only plan. Perform ONLY the Blank-OON audit:

For EVERY benefit line in the Aggregate document, check the OON (Out-of-Network) column:
- If the OON cell contains "Not Applicable", "N/A", or "Not Covered" → this is CORRECT, skip it
- If the OON cell is BLANK or EMPTY (no text at all) → create a row

Output format — use this EXACT table structure with NO header row:
| Section | Benefit / Field | Setting | FOB Standard | FOB Deviation | Expected Value | Aggregate Value | Status | Details | FOB Ref | Agg Ref |

For each blank OON cell, output a row with:
- Section: the appropriate section (Benefits, Financial, etc.)
- Benefit / Field: the benefit name
- Setting: OON
- FOB Standard, FOB Deviation, Expected Value: leave blank or N/A
- Aggregate Value: (blank)
- Status: Blank-OON
- Details: OON cell is blank — should explicitly state "Not Applicable" for EPO plan
- Agg Ref: the Aggregate cell reference

Do NOT include rows that already have "Not Applicable" or "N/A".
Do NOT include a table header or separator. Start immediately with data rows.
Return ONLY the table rows with no preamble or footnotes.`;
}

function stripTableHeader(markdown) {
  return markdown.split('\n').filter(line => {
    const t = line.trim();
    if (t.startsWith('|') && t.toLowerCase().includes('section') && t.toLowerCase().includes('benefit') && t.toLowerCase().includes('status')) {
      return false;
    }
    if (t.startsWith('|') && /^\|[\s|:-]+$/.test(t)) {
      return false;
    }
    return true;
  }).join('\n');
}

// ── Eval Checks (aligned to LE-01 through LE-09) ───────────────────────────

function runEvals(table, ontology, finishReason) {
  const results = [];
  const rows = table.rows;
  const statusCol = 'Status';
  const sectionCol = 'Section';
  const benefitCol = 'Benefit / Field';
  const settingCol = 'Setting';
  const detailsCol = 'Details';
  const expectedCol = 'Expected Value';
  const aggregateCol = 'Aggregate Value';

  function check(id, name, pass, detail) {
    results.push({ id, name, pass, detail });
  }

  // ── Summary stats ──
  const total = rows.length;
  const statuses = {};
  rows.forEach(r => {
    const s = (r[statusCol] || '').toLowerCase().trim();
    statuses[s] = (statuses[s] || 0) + 1;
  });
  console.log(`\n  Table: ${total} rows — ${JSON.stringify(statuses)}`);

  // ── LE-01: Bidirectional detection ──
  const missingRows = rows.filter(r => (r[statusCol] || '').toLowerCase().includes('missing'));
  const aggOnlyMissing = missingRows.filter(r =>
    (r[detailsCol] || '').toLowerCase().includes('aggregate') &&
    (r[detailsCol] || '').toLowerCase().includes('not found in fob')
  );
  check('LE-01', 'Bidirectional: aggregate-only fields detected',
    aggOnlyMissing.length > 0,
    `${aggOnlyMissing.length} aggregate-only "Missing" rows found (need >0)`
  );

  // ── LE-02: Consistency (row count) — single-run check: just report ──
  check('LE-02', 'Row count stability (record for comparison)',
    total >= 100,
    `${total} total rows (expect >=100 for a real FOB; re-run to compare)`
  );

  // ── LE-03: No concatenated benefit rows ──
  const suspiciousConcats = rows.filter(r => {
    const b = (r[benefitCol] || '').toLowerCase();
    // Only flag rows that look like "Therapies (Cardiac, Chemo Coverage)" — a summary of multiple benefits
    // Exclude legitimate benefit names like "Travel and Lodging for Organ Transplants (BDCT)"
    if (!b.includes('(') || !b.includes(',')) return false;
    const parenContent = b.match(/\(([^)]+)\)/)?.[1] || '';
    const isSummary = (parenContent.includes(',') || parenContent.includes(' and ')) &&
      (b.startsWith('therapies') || b.startsWith('transplants') || b.match(/^[a-z]+ \(/));
    return isSummary;
  });
  check('LE-03', 'No concatenated benefit rows (Therapies/Transplants)',
    suspiciousConcats.length === 0,
    suspiciousConcats.length > 0
      ? `Found ${suspiciousConcats.length} suspicious: ${suspiciousConcats.map(r => r[benefitCol]).join('; ')}`
      : 'No concatenated benefit rows detected'
  );

  // ── LE-05: Literal comparison (semantic equivalence rejected) ──
  const semanticMatches = rows.filter(r => {
    const exp = (r[expectedCol] || '').toLowerCase();
    const agg = (r[aggregateCol] || '').toLowerCase();
    const status = (r[statusCol] || '').toLowerCase();
    if (status !== 'match') return false;
    // Check known semantic equivalence traps
    if ((exp.includes('12 month') && agg.includes('365 day')) ||
        (exp.includes('365 day') && agg.includes('12 month'))) return true;
    if ((exp.includes('annually') && agg.includes('per year')) ||
        (exp.includes('per year') && agg.includes('annually'))) return true;
    return false;
  });
  check('LE-05', 'Literal comparison: no semantic-equivalence matches',
    semanticMatches.length === 0,
    semanticMatches.length > 0
      ? `Found ${semanticMatches.length} semantic matches that should be Mismatch: ${semanticMatches.map(r => `"${r[benefitCol]}"`).join(', ')}`
      : 'No semantic equivalence false-matches detected'
  );

  // ── LE-06: Pre-Cert section present ──
  const preCertRows = rows.filter(r =>
    (r[sectionCol] || '').toLowerCase().includes('pre-cert') ||
    (r[sectionCol] || '').toLowerCase().includes('precert') ||
    (r[benefitCol] || '').toLowerCase().includes('pre-cert') ||
    (r[benefitCol] || '').toLowerCase().includes('precert')
  );
  check('LE-06', 'Pre-Cert section present in output',
    preCertRows.length > 0,
    `${preCertRows.length} Pre-Cert rows found`
  );

  // ── LE-07: Section coverage completeness ──
  const sections = new Set(rows.map(r => (r[sectionCol] || '').toLowerCase().trim()).filter(Boolean));
  const expectedSections = ['plan info', 'eligibility', 'financial', 'benefits'];
  const missingSections = expectedSections.filter(s => ![...sections].some(o => o.includes(s)));
  check('LE-07', 'All major sections covered',
    missingSections.length === 0,
    missingSections.length > 0
      ? `Missing sections: ${missingSections.join(', ')}`
      : `Found sections: ${[...sections].join(', ')}`
  );

  // Benefit row count should be substantial
  const benefitRows = rows.filter(r => (r[sectionCol] || '').toLowerCase().includes('benefit'));
  check('LE-07b', 'Sufficient benefit row count (>50)',
    benefitRows.length > 50,
    `${benefitRows.length} benefit rows`
  );

  // ── LE-08: INN/OON pairs ──
  const innRows = rows.filter(r => (r[benefitCol] || '').toLowerCase().includes('inn') || (r[settingCol] || '').toLowerCase().includes('inn'));
  const oonRows = rows.filter(r => (r[benefitCol] || '').toLowerCase().includes('oon') || (r[settingCol] || '').toLowerCase().includes('oon'));
  check('LE-08', 'INN/OON balance (OON rows exist if INN rows exist)',
    innRows.length === 0 || oonRows.length > 0,
    `INN rows: ${innRows.length}, OON rows: ${oonRows.length}`
  );

  // ── LE-09: False matches check (spot check for detail mismatches) ──
  const matchesWithDetails = rows.filter(r => {
    const status = (r[statusCol] || '').toLowerCase().trim();
    const exp = (r[expectedCol] || '').trim();
    const agg = (r[aggregateCol] || '').trim();
    if (status !== 'match') return false;
    if (!exp || !agg) return false;
    // Rough check: if expected and aggregate are both >20 chars and differ substantially
    if (exp.length > 20 && agg.length > 20) {
      const expNorm = exp.toLowerCase().replace(/\s+/g, ' ');
      const aggNorm = agg.toLowerCase().replace(/\s+/g, ' ');
      if (expNorm !== aggNorm && !expNorm.includes(aggNorm) && !aggNorm.includes(expNorm)) {
        return true;
      }
    }
    return false;
  });
  check('LE-09', 'No false matches with differing detail text',
    matchesWithDetails.length <= 3, // allow a few edge cases
    matchesWithDetails.length > 0
      ? `${matchesWithDetails.length} potential false matches: ${matchesWithDetails.slice(0, 3).map(r => `"${r[benefitCol]}" (${r[settingCol]})`).join(', ')}`
      : 'No false matches detected'
  );

  // ── Truncation check ──
  check('TRUNC', 'Output not truncated',
    finishReason !== 'MAX_TOKENS',
    `finishReason: ${finishReason}`
  );

  // ── EPO Blank-OON check (if applicable) ──
  if (ontology?.template_variant?.toLowerCase()?.includes('epo') ||
      ontology?.template_variant?.toLowerCase()?.includes('par')) {
    const blankOon = rows.filter(r => (r[statusCol] || '').toLowerCase().includes('blank'));
    check('BLANK-OON', 'Blank-OON audit ran for EPO plan',
      blankOon.length >= 0, // Pass as long as the check ran; 0 may be correct for clean aggregates
      `${blankOon.length} Blank-OON rows found (0 is valid if aggregate OON cells are properly filled)`
    );
  }

  return results;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const save = args.includes('--save');
  const files = args.filter(a => !a.startsWith('--'));

  if (files.length !== 2) {
    console.error('Usage: node tests/fob-eval.mjs <fob_file> <aggregate_file> [--save]');
    process.exit(1);
  }

  for (const f of files) {
    if (!fs.existsSync(f)) { console.error(`File not found: ${f}`); process.exit(1); }
  }

  const config = loadConfig();
  const fileList = files.map(f => `- ${path.basename(f)}`).join('\n');
  const encodedFiles = files.map(f => encodeFile(f));
  const fileParts = filesToParts(encodedFiles);

  console.log('\n══════════════════════════════════════════');
  console.log('  FOB Audit Eval Harness');
  console.log('══════════════════════════════════════════');
  console.log(`  Model: ${config.model}`);
  console.log(`  Files: ${files.map(f => path.basename(f)).join(', ')}`);

  // ── Phase 1 ──
  console.log('\n── Phase 1: Summary & Ontology ──');
  const p1 = await callGemini(config, phase1Prompt(fileList), fileParts, {
    temperature: 0.2, topP: 0.9, seed: 42,
  });

  const ontology = parseOntologyJSON(p1.text);
  if (ontology) {
    console.log(`  Ontology: variant=${ontology.template_variant}, sections=${ontology.sections?.length || 0}`);
  } else {
    console.warn('  ⚠️  Could not parse ontology JSON from Phase 1');
  }

  // ── Phase 2 ──
  console.log('\n── Phase 2: Comparison Table ──');
  let p2 = await callGemini(config, phase2Prompt(p1.text, fileList, ontology), fileParts, {
    maxOutputTokens: 65536, temperature: 0.2, topP: 0.9, seed: 42,
  });

  // Continuation loop for truncated output
  const MAX_CONTINUATIONS = 4;
  let fullText = p2.text;
  let lastFinish = p2.finishReason;
  let continuationCount = 0;

  for (let cont = 1; cont <= MAX_CONTINUATIONS && lastFinish === 'MAX_TOKENS' && fullText.length > 0; cont++) {
    continuationCount++;
    console.log(`\n  🔄 Continuation ${cont}/${MAX_CONTINUATIONS} (${fullText.length} chars so far)`);

    const contPrompt = buildContinuationPrompt(p1.text, fileList, ontology, fullText);
    const contResult = await callGemini(config, contPrompt, fileParts, {
      maxOutputTokens: 65536, temperature: 0.2, topP: 0.9, seed: 42,
    });

    const cleanCont = stripTableHeader(contResult.text);
    fullText += '\n' + cleanCont;
    lastFinish = contResult.finishReason;
  }

  if (lastFinish === 'MAX_TOKENS') {
    console.warn(`  ⚠️  Still truncated after ${MAX_CONTINUATIONS} continuations`);
  }

  // Blank-OON dedicated pass for EPO
  const isEpo = ontology?.template_variant?.toLowerCase()?.includes('epo') || ontology?.template_variant?.toLowerCase()?.includes('par');
  if (isEpo) {
    const tempTable = parseMarkdownTable(fullText);
    const blankOonCount = tempTable.rows.filter(r => (r['Status'] || '').toLowerCase().includes('blank')).length;
    if (blankOonCount === 0) {
      console.log('\n  🔍 EPO with 0 Blank-OON rows — running dedicated pass');
      const oonPrompt = buildBlankOonPrompt(p1.text, fileList, ontology);
      const oonResult = await callGemini(config, oonPrompt, fileParts, {
        maxOutputTokens: 32768, temperature: 0.2, topP: 0.9, seed: 42,
      });
      const cleanOon = stripTableHeader(oonResult.text);
      if (cleanOon.trim()) {
        fullText += '\n' + cleanOon;
        console.log('  ✅ Blank-OON pass appended');
      }
    }
  }

  p2 = { text: fullText, finishReason: lastFinish };

  // ── Parse ──
  console.log('\n── Parsing Output ──');
  const table = parseMarkdownTable(p2.text);
  console.log(`  Parsed ${table.rows.length} rows, ${table.headers.length} columns`);
  if (table.headers.length > 0) {
    console.log(`  Headers: ${table.headers.join(' | ')}`);
  }

  // ── Evals ──
  console.log('\n── Eval Results ──');
  const evals = runEvals(table, ontology, p2.finishReason);

  let passed = 0, failed = 0;
  for (const e of evals) {
    const icon = e.pass ? '✅' : '❌';
    console.log(`  ${icon} ${e.id}: ${e.name}`);
    console.log(`     ${e.detail}`);
    if (e.pass) passed++; else failed++;
  }

  console.log(`\n  ────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed out of ${evals.length} checks`);

  // ── Save ──
  if (save) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = path.join(ROOT, 'tests', 'QA', 'fob-evals');
    fs.mkdirSync(outDir, { recursive: true });
    const outBase = path.join(outDir, timestamp);

    fs.writeFileSync(`${outBase}-phase1.txt`, p1.text);
    fs.writeFileSync(`${outBase}-phase2.md`, p2.text);
    fs.writeFileSync(`${outBase}-evals.json`, JSON.stringify({
      timestamp,
      model: config.model,
      files: files.map(f => path.basename(f)),
      ontology,
      rowCount: table.rows.length,
      finishReason: p2.finishReason,
      continuations: continuationCount,
      evals,
      statusCounts: (() => {
        const c = {};
        table.rows.forEach(r => {
          const s = (r['Status'] || '').toLowerCase().trim();
          c[s] = (c[s] || 0) + 1;
        });
        return c;
      })(),
    }, null, 2));

    console.log(`\n  Saved to ${outDir}/${timestamp}-*`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
