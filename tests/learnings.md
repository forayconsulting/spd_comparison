# Multi-Turn Workflow Experiment - Learnings

**Date:** November 11, 2025
**Branch:** updated-use-case
**Commits:** 541c0b3 (reverted), various uncommitted changes
**Outcome:** Reverted to single-turn workflow (66ac310)

## Context and Motivation

### Initial Problem
User noticed significant inconsistencies between runs of the same documents with the single-turn workflow:
- Same PDFs uploaded multiple times produced different results
- Completeness and quality varied unpredictably
- Suspected the 378-line system prompt + three-output JSON requirement was overwhelming Gemini 2.5 Pro

### Hypothesis
If each output (Summary, Comparison Spreadsheet, Language Comparison) was generated in its own turn within a multi-turn conversation:
1. Each turn could focus on ONE specific task with a targeted prompt
2. Model would maintain context across turns via conversation history
3. Later turns could reference earlier analysis (e.g., Phase 3 knows which procedure elements Phase 2 identified)
4. Progressive context engineering would improve consistency and completeness

### User Insight
> "WHAT IF each of the outputs (each tab's contents) was it's own turn in a multi-turn conversation with Gemini 2.5 Pro? In other words, Summary gets generated first from all the PDFs, with a summary-specific prompt. Then, a follow-up prompt is sent asking for the comparison spreadsheet. Then, after it comes in, a third and final follow-up is generated with the language comparison. I feel like, if I were interacting with Gemini as a user and doing this complete task manually, I would do it that way to get good progressive context engineering results and ensure that each response is full and detailed."

## Architecture Design

### Three-Turn Sequential Workflow

**Turn 1: Document Inventory & Summary**
- System Prompt: BASE_CONTEXT + TURN1_PROMPT (~150 lines)
- Task: Identify documents, detect plan units, assess completeness
- Output: `{plan_units: [...], summary: {...}}`
- PDFs: Included in this turn only

**Turn 2: Comparison Spreadsheet**
- System Prompt: BASE_CONTEXT + TURN2_PROMPT (~120 lines)
- Task: Systematic extraction of procedure elements with concise summaries
- Output: `{comparison_spreadsheet: {rows: [...]}}`
- Context: Full conversation history including Turn 1 response
- PDFs: NOT re-sent (context persists)

**Turn 3: Language Comparison**
- System Prompt: BASE_CONTEXT + TURN3_PROMPT (~110 lines)
- Task: Verbatim legal text extraction with precise citations
- Output: `{language_comparison: {rows: [...]}}`
- Context: Full conversation history including Turns 1 & 2
- PDFs: NOT re-sent (context persists)

### Key Technical Decisions

1. **Conversation History Management**
   - PDFs only sent in first message (lines 2431-2440 in executeComparisonPhase)
   - Each turn appends to `contents` array with full history
   - Leverages Gemini's implicit caching (75-90% cost reduction)

2. **State Management**
   ```javascript
   state: {
     comparisonWorkflowActive: false,
     currentPhase: 0, // 0 = not started, 1-3 = phases
     phase1Data: null,
     phase2Data: null,
     phase3Data: null,
     planUnits: null // Stored from Phase 1 for consistency
   }
   ```

3. **Progressive Rendering**
   - Summary tab renders immediately after Phase 1 completes
   - Comparison and Language tabs show loading spinners
   - As each phase completes, spinner replaced with content

4. **Workflow Orchestration**
   - `startComparisonWorkflow()`: Orchestrates all 3 phases sequentially
   - `executeComparisonPhase(phaseNum, systemPrompt, userPrompt)`: Executes one turn
   - `storePhaseResult(phaseNum, jsonResponse)`: Parses JSON and triggers rendering

## Implementation Timeline

### Phase 1: Prompt Splitting (1 hour)
- Split 378-line SYSTEM_PROMPT_TEXT into BASE_CONTEXT + 3 turn-specific prompts
- Created TURN1_PROMPT, TURN2_PROMPT, TURN3_PROMPT
- Maintained shared expertise/competencies in BASE_CONTEXT

### Phase 2: State & Orchestration (2 hours)
- Added workflow state management fields
- Implemented `startComparisonWorkflow()` to sequence 3 turns
- Modified `sendMessage()` to route comparison requests to workflow
- Created `executeComparisonPhase()` for per-turn execution
- Modified `streamResponse()` to accept custom system prompt parameter

### Phase 3: Progressive Rendering (1.5 hours)
- Created `renderSummaryProgressive()`, `renderComparisonProgressive()`, `renderLanguageProgressive()`
- Added `showTabLoading()` for spinner display in pending tabs
- Implemented `storePhaseResult()` for JSON parsing and tab population

### Phase 4: Bug Fixes (3 hours)
- **Issue 1:** `finalizeStreamingMessage()` being called after each phase
  - **Fix:** Skip finalization when `comparisonWorkflowActive` (line 2776)

- **Issue 2:** JSON truncation (response cut off mid-stream)
  - **Fix:** Increased maxOutputTokens from 4096 → 8192 → 16384 → 65536

- **Issue 3:** `switchTab()` failing with "Cannot read properties of undefined (reading 'target')"
  - **Fix:** Modified function to handle both event-based and programmatic calls (lines 3275-3301)

- **Issue 4:** Blank tabs after Phase 1
  - **Fix:** Proactively show loading spinners in Phases 2 & 3 tabs when Phase 1 completes (lines 2650-2652)

## Issues Encountered

### Technical Issues (Resolved)

1. **JSON Parsing Conflicts**
   - Old `parseAndRenderOutputs()` trying to parse three-output format after Phase 1
   - Phase 1 only returns `plan_units` + `summary`, causing parsing errors
   - Fixed by skipping `finalizeStreamingMessage()` during workflow

2. **Token Limit Exhaustion**
   - Phase 3 (full legal text) hitting 8192 token limit
   - JSON getting truncated mid-response: `"San Francisc..."`
   - Progressively increased to 65536 tokens (max for Gemini 2.5 Pro)

3. **Event Handler Mismatch**
   - `switchTab()` expected event object from onclick
   - Programmatic calls passing only tab name string
   - Added dual-mode handling (event vs. string parameter)

4. **Loading State Visibility**
   - Tabs 2 & 3 showed blank instead of spinners
   - Users couldn't tell if Phases 2/3 were running
   - Fixed by showing spinners immediately after Phase 1

### Fatal Issue (Unresolved)

**Poor Content Extraction Quality**

The multi-turn workflow successfully executed all 3 phases, but **results were terrible**:

```
Procedure Element: COVID-19 Pandemic Relief Provisions
Procedure Element: Benefit Increase Effective Date
Procedure Element: Benefit Exclusion for Mental/Emotional Illness
Procedure Element: Disability Benefit After Age 55
...
```

**Problem:** Model extracted random SMM amendment content instead of core Claims & Appeals procedures:
- 80% of cells showed "Not specified in documents provided"
- Only 1-2 plans had data for most procedure elements
- Focus on benefit increases and COVID relief (not merger-critical)
- Completely missed Claims & Appeals sections in base SPDs

**Root Cause:** Overly generic "content-driven" prompts in Turn 2/3:
```markdown
Read through all documents and identify what plan provisions are actually present.
**Do NOT force extraction of topics not present in the documents.**
```

This guidance caused the model to:
1. Scan SMM amendments first (shorter, easier to parse)
2. Extract whatever provisions it found quickly
3. Stop looking for comprehensive SPD content
4. Miss the actual Claims & Appeals procedures buried in 156-page SPDs

## Why We Reverted

### Expected Benefits (Not Realized)
- ❌ **Better consistency:** Results still varied, now with worse content selection
- ❌ **Better completeness:** Most cells empty ("Not specified")
- ❌ **Better focus:** Model found random content instead of merger-critical provisions
- ✅ **Progressive UX:** Loading indicators worked well (only positive outcome)

### User Decision
> "Hm, I'm not liking this much. I would like you to please reset to the last good commit before we tried the multi-turn approach, please"

After seeing results with mostly empty cells and irrelevant procedure elements (benefit increases, COVID provisions), user decided the experiment failed to improve quality.

### Revert Action
```bash
git reset --hard 66ac310  # "Improve UX: move loading indicator..."
```

Returned to single-turn workflow with:
- One 378-line system prompt
- Single API call generating all three outputs as JSON
- Smart progress detection (simulated phases by parsing JSON structure)

## Key Learnings

### 1. Multi-Turn ≠ Automatic Quality Improvement

**Assumption:** Splitting into focused turns would improve results.

**Reality:** Turn focus doesn't matter if prompts lack clear extraction targets.

The real problem wasn't prompt length or cognitive load—it was **lack of explicit guidance about what to extract**. The "content-driven" philosophy (extract whatever you find) failed because:
- Models take the path of least resistance (SMMs vs. full SPDs)
- Without explicit targets, random content gets extracted
- "Don't force extraction" became "don't extract comprehensively"

### 2. Context Building Requires Explicit Checkpoints

**Assumption:** Phase 2 would "know" what Phase 1 analyzed and extract accordingly.

**Reality:** Models don't automatically understand intent across turns without explicit instructions.

Even though conversation history was maintained, Phase 2 didn't understand that:
- Phase 1 identified **which plans** exist
- Phase 2 should extract **Claims & Appeals specifically**
- Phase 3 should provide **exact citations** for what Phase 2 found

Each turn needs explicit references to previous turns:
```markdown
"You identified these plan units in Phase 1: {plan_units}
Now extract Claims and Appeals procedures FOR EACH of those plans."
```

### 3. Token Limits Are Real Constraints

65,536 tokens sounds like a lot, but Phase 3 requirements were:
- 6 plan units × 12 procedure elements × 4 components = 288 text blocks
- Each block: summary + full verbatim text + citation
- Many provisions span multiple paragraphs (100-200 words each)

**Estimated tokens needed:** 80,000-100,000 for complete extraction.

Even at max tokens, comprehensive extraction may not be possible in single response for 6+ plans.

### 4. Progressive Rendering Worked Well

The only successful part of the experiment was the UX:
- Loading spinners in pending tabs provided clear feedback
- Users understood the 3-phase workflow
- Tab-by-tab population felt natural

This pattern could be reused even without true multi-turn backend (simulate with progress detection).

### 5. Content-Driven vs. Targeted Extraction Trade-off

**Content-Driven Philosophy:**
- "Extract whatever provisions exist in the documents"
- Flexible, adapts to any document type
- Risk: Extracts easiest/most visible content, misses core provisions

**Targeted Extraction Philosophy:**
- "Extract these specific 17 procedure elements"
- Predictable, comprehensive for known use cases
- Risk: Forces extraction where provisions don't exist, less adaptable

**The middle ground:** Hierarchical extraction with fallbacks:
1. Try to extract Claims & Appeals (primary goal)
2. If not found, try Vesting & Eligibility (secondary)
3. If not found, identify what IS present (fallback)

## Recommendations for Future Work

### If Retrying Multi-Turn

1. **Add explicit chaining between turns:**
   ```javascript
   Turn 2 Prompt: `
   In Phase 1, you identified these plan units: ${phase1Data.plan_units.join(', ')}

   Now extract Claims and Appeals procedures from EACH plan's base SPD document.
   Focus on sections titled "Claims Procedures", "Appeals Process", "How to File a Claim".

   Generate comparison_spreadsheet with these elements:
   - Initial Claim Filing Deadline
   - Claim Denial Notification Deadline
   - Appeals Filing Deadline
   ...
   `
   ```

2. **Add validation between phases:**
   ```javascript
   if (phase2Data.rows.length < 5) {
     throw new Error('Phase 2 found too few procedure elements. Retry with broader search.');
   }
   ```

3. **Use smaller, more focused turns:**
   - Phase 1: Document inventory only
   - Phase 2: Extract Claims procedures only
   - Phase 3: Extract Appeals procedures only
   - Phase 4: Extract legal language for Phases 2+3
   - Phase 5: Generate final outputs

4. **Test with single plan first:**
   - Validate workflow works well for 1 plan
   - Then scale to 6 plans
   - Avoids debugging on complex multi-plan scenarios

### Alternative Approaches

1. **Hierarchical Single-Turn with Explicit Priorities:**
   - Keep single-turn workflow
   - Rewrite system prompt with clear extraction hierarchy:
     ```
     Priority 1: Claims & Appeals (MUST extract if present)
     Priority 2: Vesting & Eligibility (SHOULD extract if present)
     Priority 3: Other provisions (MAY extract if present)
     ```

2. **Hybrid: Summary + Targeted Multi-Turn:**
   - Turn 1: Document inventory (current Phase 1)
   - Turn 2: Single comprehensive comparison (combines current Phases 2+3)
   - Fewer turns = less chance for errors, still maintains focus

3. **Explicit Section Targeting:**
   - Instruct model to search for section headers: "Claims Procedures", "How to File", "Appeals Process"
   - Extract page ranges for these sections first
   - Then extract provisions from identified sections only

4. **RAG-Style Chunking (Advanced):**
   - Pre-chunk PDFs into sections server-side
   - Identify Claims & Appeals sections explicitly
   - Send only relevant sections to model
   - Requires backend processing (not pure browser app)

## Files Changed During Experiment

### Modified
- `index.html` (+554 lines, -9 lines)
  - Split system prompts (BASE_CONTEXT, TURN1_PROMPT, TURN2_PROMPT, TURN3_PROMPT)
  - Added workflow orchestration (startComparisonWorkflow, executeComparisonPhase)
  - Added progressive rendering (renderSummaryProgressive, etc.)
  - Added loading spinners (showTabLoading)
  - Fixed switchTab event handling
  - Increased maxOutputTokens: 4096 → 65536

### Reverted
All changes discarded via `git reset --hard 66ac310`

## Conclusion

The multi-turn experiment was **technically successful** but **functionally failed**:

✅ Successfully implemented 3-turn sequential workflow
✅ Maintained conversation history across turns
✅ Progressive tab rendering with loading indicators
✅ Proper error handling and JSON parsing

❌ Results were low quality (mostly "Not specified")
❌ Model extracted irrelevant provisions (SMM amendments)
❌ Missed core Claims & Appeals procedures in base SPDs
❌ No improvement over single-turn consistency

**Key insight:** The problem wasn't the single-turn architecture—it was the overly generic content-driven prompt philosophy. Multi-turn can't fix vague extraction instructions.

**Path forward:** Either:
1. Keep single-turn, add explicit Claims & Appeals targeting
2. Retry multi-turn with explicit section targeting and validation
3. Add user input to specify extraction focus ("Claims & Appeals" vs. "All provisions")
