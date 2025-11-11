# SPD Plan Comparison Tool

An AI-powered tool for comparing pension plan documents to identify policy differences and support standardization efforts following plan mergers.

## What It Does

This tool helps pension fund administrators quickly compare Summary Plan Descriptions (SPDs), Summary of Material Modifications (SMMs), and related plan documents across multiple plan units. Instead of manually reviewing hundreds of pages, you can:

- **Upload multiple plan documents** (PDFs) from different plan units
- **Get instant AI analysis** comparing claims procedures, appeals processes, arbitration requirements, and other key provisions
- **Identify critical differences** that affect participant rights and benefits
- **Receive structured reports** in XML format with detailed findings and recommendations

## Key Features

### Intelligent Document Analysis
Powered by Google Gemini 2.5 Pro with specialized expertise in:
- ERISA pension plan regulations and compliance
- Multiemployer pension fund structures
- Claims and appeals procedures under DOL regulations
- Arbitration and dispute resolution in pension contexts

### Simple Workflow
1. Click "Plan Docs" to expand the file upload section
2. Drag and drop your PDF documents or click to browse
3. Click "Compare Documents" to start the analysis
4. Review the detailed comparison report
5. Ask follow-up questions to dig deeper

### Smart Comparison Features
- **Structured Analysis:** Extracts claims procedures, appeals timeframes, arbitration requirements, and more
- **Critical Finding Flags:** Highlights provisions that substantially restrict or protect participant rights
- **Risk Assessment:** Identifies potential legal compliance issues
- **Standardization Recommendations:** Suggests where alignment would benefit participants

## Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- A Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### Setup (2 minutes)
1. Copy `config.example.js` to `config.js`
2. Open `config.js` and add your Gemini API key
3. Open `index.html` in your web browser
4. Start comparing documents!

No installation, no command line, no technical setup required.

## Usage Tips

### Best Practices
- **Use clear, focused uploads:** Group related documents (e.g., all SMMs about disability procedures) for targeted comparisons
- **Ask specific questions** like "What are the appeals filing deadlines?" or "Compare arbitration requirements"
- **Request structured output** by asking for "XML format" or "comparison table"
- **Leverage large context:** Upload multiple large documents simultaneously (up to 1,000 pages total)

### Document Limits
- **File size:** 20 MB per file maximum (inline upload)
- **Page count:** 1,000 pages per individual PDF document (10x more than previous limits!)
- **Total context:** 1 million tokens (~750,000 words or ~1,500 pages total)
- **Total documents:** Upload as many documents as needed within context/size limits

The expanded limits allow you to compare complete SPDs, not just excerpts.

## Example Use Cases

### Post-Merger Standardization
*"I just merged 10 local pension plans. Which ones have different appeals procedures?"*

Upload SPDs from all 10 plans → Click Compare → Get a structured breakdown of differences in appeals filing deadlines, review processes, and claimant rights.

### Compliance Review
*"Do any of our plans have mandatory arbitration clauses that might face legal challenges?"*

Upload relevant plan documents → Ask about arbitration → Get analysis with risk assessment and recent case law considerations.

### Policy Harmonization
*"We want to standardize claims procedures. What's the range of decision timeframes across our plans?"*

Upload claims procedure sections → Request comparison → Receive participant-protection ranking and standardization recommendations.

## Cost Efficiency

This tool uses Google Gemini 2.5 Pro with smart caching:

- **First comparison:** $1.25 per million input tokens (≤200k context), $2.50/M (>200k)
- **Follow-up questions:** 75% cheaper with implicit caching (automatic)
- **Output:** $10.00 per million output tokens (≤200k), $15.00/M (>200k)
- **Typical session:** Analyze 5-10 documents with multiple questions for under $2

Compare this to:
- Law firm associate at $500/hour: $2,000+ for similar analysis
- Manual document review: 10-20 hours of staff time

**Why Gemini?**
- **10x larger page limits:** 1,000 pages per PDF vs 100 pages with Claude
- **5x larger context:** 1M tokens vs 200k tokens
- **Lower cost:** ~40% cheaper for comparable workloads
- **Can process all 10 SPDs simultaneously** (if total <1,000 pages)

## Technical Architecture

### Simple & Secure
- **No server required:** Runs entirely in your browser
- **Direct API connection:** Your documents go straight to Google's secure API
- **No data storage:** Files are converted to base64 and sent with each request, not stored anywhere
- **Privacy first:** Client PDFs never touch our servers (that's why `plan_docs/` is gitignored)

### Powered By
- **Google Gemini 2.5 Pro:** State-of-the-art AI model with 1M token context window
- **Built-in reasoning:** Model reasons internally before responding for better analysis
- **Implicit caching:** 75% cost reduction on repeated context (automatic)
- **Streaming responses:** Real-time analysis as it thinks and writes
- **Direct browser integration:** CORS-enabled API, no proxy needed

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
**Status:** Functional prototype with Gemini 2.5 Pro integration

## Support & Development

This is a proof-of-concept tool. For questions, enhancements, or issues:

- Technical documentation: See `CLAUDE.md`
- Business requirements: See `requirements/requirements.md`
- System prompt details: See `requirements/system_prompt.md`

## License

Internal tool for Western Pension Fund. Not licensed for external distribution.
