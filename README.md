# SPD Plan Comparison Tool

An AI-powered tool for comparing pension plan documents to identify policy differences and support standardization efforts following plan mergers.

## What It Does

This tool helps pension fund administrators quickly compare Summary Plan Descriptions (SPDs), Summary of Material Modifications (SMMs), and related plan documents across multiple plan units. Instead of manually reviewing hundreds of pages, you can:

- **Upload multiple plan documents** (PDFs) from different plan units
- **Get comprehensive three-phase analysis:** Document summary → Comparison table → Detailed language citations
- **Identify critical differences** across all plan provisions with exact page references
- **Chat with results** to explore specific topics and ask follow-up questions
- **Export to Excel** for further analysis and documentation

## Key Features

### Three-Phase Sequential Analysis
Powered by Google Gemini 3 Pro Preview with progressive context engineering:

**Phase 1: Document Summary**
- Comprehensive overview of all uploaded documents
- Identifies plan structures, relationships, and key domains
- Concise 500-word summary for quick understanding

**Phase 2: Comparison Spreadsheet**
- Side-by-side comparison table of all procedural elements
- Compares provisions across all plan units
- Identifies similarities and differences systematically

**Phase 3: Language Comparison**
- Detailed extraction with full legal text and exact citations
- Format: `(filename, page_number, paragraph_number)`
- Complete language for legal review and standardization

### Interactive Chat Feature
After analysis completes, a collapsible chat sidebar appears:
- **Ask follow-up questions** about specific provisions
- **Explore topics in depth** with context-aware responses
- **All three analysis outputs** automatically included in chat context
- **Fresh PDF analysis** with each question for accuracy

### Export Options
- **Download as Markdown:** Save any tab's content for documentation
- **Excel Export (Coming Soon):** Generate spreadsheets for stakeholder review

## Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- A Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### Setup (2 minutes)
1. Copy `config.example.js` to `config.js`
2. Open `config.js` and add your Gemini API key
3. Open `index.html` in your web browser
4. Click "Plan Docs" to upload SPD/SMM documents
5. Click "Compare Documents" to start three-phase analysis
6. Use the chat sidebar for follow-up questions

No installation, no command line, no technical setup required.

## Usage Tips

### Best Practices
- **Upload all relevant documents:** The tool handles up to 1,000 pages per PDF
- **Review all three tabs:** Summary for overview, Comparison for structure, Language for exact text
- **Use chat for specific questions:** "What are the claims filing deadlines for San Francisco?" or "Compare arbitration requirements"
- **Download markdown exports:** Save analysis outputs for documentation and stakeholder review
- **Leverage progressive analysis:** Each phase builds on the previous for increasingly detailed insights

### Document Limits
- **File size:** 20 MB per file maximum (inline upload)
- **Page count:** 1,000 pages per individual PDF document (10x more than previous limits!)
- **Total context:** 1 million tokens (~750,000 words or ~1,500 pages total)
- **Total documents:** Upload as many documents as needed within context/size limits

The expanded limits allow you to compare complete SPDs, not just excerpts.

## Example Use Cases

### Post-Merger Standardization
*"I just merged 5 local pension plans. Which ones have different appeals procedures?"*

1. Upload SPDs from all 5 plans
2. Review Phase 2 Comparison tab for side-by-side appeals procedures
3. Check Phase 3 Language tab for exact text with citations
4. Use chat: "Which plan has the longest appeals deadline?"

### Compliance Review
*"Do any of our plans have mandatory arbitration clauses?"*

1. Upload all plan documents
2. Review Phase 1 Summary for quick overview
3. Use chat: "Compare arbitration requirements across all plans"
4. Get detailed analysis with specific page references

### Policy Harmonization
*"We want to standardize claims procedures across all merged plans."*

1. Upload all SPDs
2. Export Phase 2 Comparison tab as markdown
3. Use chat to explore: "What's the most participant-friendly claims deadline?"
4. Share analysis with legal team for harmonization decisions

## Cost Efficiency

This tool uses Google Gemini 3 Pro Preview (most advanced reasoning model):

- **Three-phase analysis:** Each phase re-uploads PDFs for fresh analysis (no caching)
- **Input cost:** $2.50 per million input tokens (>200k context)
- **Output cost:** $15.00 per million output tokens (>200k context), up to 65k tokens per response
- **Chat feature:** Re-uploads PDFs + includes all three analysis outputs in context
- **Typical session:** 5-10 documents + 3-5 chat questions = ~$3-5 total

Compare this to:
- Law firm associate at $500/hour: $2,000+ for similar analysis
- Manual document review: 10-20 hours of staff time

**Why Gemini 3 Pro?**
- **Most advanced reasoning:** Internal thinking for higher quality analysis
- **10x larger page limits:** 1,000 pages per PDF vs 100 pages with Claude
- **5x larger context:** 1M tokens vs 200k tokens with Claude
- **Massive output capability:** 65k tokens per response (8x more than Gemini 2.5 Pro)
- **Can process all documents simultaneously** (if total <1,000 pages)

## Technical Architecture

### Simple & Secure
- **No server required:** Runs entirely in your browser
- **Direct API connection:** Your documents go straight to Google's secure API
- **No data storage:** Files are converted to base64 and sent with each request, not stored anywhere
- **Privacy first:** Client PDFs never touch our servers (that's why `plan_docs/` is gitignored)

### Powered By
- **Google Gemini 3 Pro Preview:** Most advanced reasoning model with 1M token context window
- **Three-phase sequential workflow:** Progressive context engineering for comprehensive analysis
- **Internal reasoning:** Model performs deep thinking automatically for higher quality
- **65k token output:** 8x larger responses than Gemini 2.5 Pro
- **Streaming responses:** Real-time analysis as it processes and writes
- **Direct browser integration:** CORS-enabled API, no proxy needed
- **Interactive chat:** Context-aware follow-up questions with full analysis included

## Migration from Claude

This tool previously used Anthropic's Claude API. We migrated to Google Gemini for:
- **Higher PDF limits:** 1,000 pages per document (vs 100 with Claude)
- **Larger context:** 1M tokens (vs 200k with Claude)
- **Better cost efficiency:** 40-60% cheaper for large document analysis
- **Simpler streaming:** Standard SSE format

Legacy Claude implementation available in `legacy/` directory.

## Project Background

**Developed for:** Western Pension Fund
**Purpose:** Post-merger plan standardization
**Budget:** $3,000-$4,000 target (vs. $10,000+ for law firm analysis)
**Status:** Production-ready with Gemini 3 Pro, three-phase analysis, and interactive chat

## Support & Development

This is a proof-of-concept tool. For questions, enhancements, or issues:

- Technical documentation: See `CLAUDE.md`
- Business requirements: See `requirements/requirements.md`
- System prompt details: See `requirements/system_prompt.md`

## License

Internal tool for Western Pension Fund. Not licensed for external distribution.
