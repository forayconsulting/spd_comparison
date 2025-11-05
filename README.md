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
Powered by Claude AI with specialized expertise in:
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
- An Anthropic API key ([get one here](https://console.anthropic.com))

### Setup (2 minutes)
1. Copy `config.example.js` to `config.js`
2. Open `config.js` and add your Anthropic API key
3. Open `index.html` in your web browser
4. Start comparing documents!

No installation, no command line, no technical setup required.

## Usage Tips

### Best Practices
- **Use smaller documents** (under 100 pages each) for best results: SMMs, notices, amendments, plan highlights
- **Upload documents from the same category** (e.g., all SMMs about disability procedures) for focused comparisons
- **Ask specific questions** like "What are the appeals filing deadlines?" or "Compare arbitration requirements"
- **Request structured output** by asking for "XML format" or "comparison table"

### Document Limits
- **File size:** 32 MB per file maximum
- **Page count:** 100 pages per individual PDF document
- **Total documents:** Upload as many documents as needed, within the 32 MB total request limit

For large SPDs (100+ pages), consider comparing excerpts or specific sections rather than full documents.

## Example Use Cases

### Post-Merger Standardization
*"I just merged 10 local pension plans. Which ones have different appeals procedures?"*

Upload SMMs from all 10 plans → Click Compare → Get a structured breakdown of differences in appeals filing deadlines, review processes, and claimant rights.

### Compliance Review
*"Do any of our plans have mandatory arbitration clauses that might face legal challenges?"*

Upload relevant plan documents → Ask about arbitration → Get analysis with risk assessment and recent case law considerations.

### Policy Harmonization
*"We want to standardize claims procedures. What's the range of decision timeframes across our plans?"*

Upload claims procedure sections → Request comparison → Receive participant-protection ranking and standardization recommendations.

## Cost Efficiency

This tool uses Claude Haiku 4.5, Anthropic's fastest and most cost-effective model, with smart caching:

- **First comparison:** Normal API pricing (~$0.25 per million input tokens)
- **Follow-up questions:** 90% cheaper due to prompt caching
- **Typical session:** Analyze 5-10 documents with multiple questions for under $1

Compare this to:
- Law firm associate at $500/hour: $2,000+ for similar analysis
- Manual document review: 10-20 hours of staff time

## Technical Architecture

### Simple & Secure
- **No server required:** Runs entirely in your browser
- **Direct API connection:** Your documents go straight to Anthropic's secure API
- **No data storage:** Files are converted to base64 and sent with each request, not stored anywhere
- **Privacy first:** Client PDFs never touch our servers (that's why `plan_docs/` is gitignored)

### Powered By
- **Claude Haiku 4.5:** Anthropic's latest fast, cost-effective AI model
- **Extended Thinking:** Complex analysis with step-by-step reasoning
- **Prompt Caching:** 90% cost reduction on repeated context
- **Streaming Responses:** Real-time analysis as it thinks and writes

## Project Background

**Developed for:** Western Pension Fund
**Purpose:** Post-merger plan standardization
**Budget:** $3,000-$4,000 target (vs. $10,000+ for law firm analysis)
**Status:** Proof of concept / functional prototype

## Support & Development

This is a proof-of-concept tool built with Claude Code. For questions, enhancements, or issues:

- Technical documentation: See `CLAUDE.md`
- Business requirements: See `requirements/requirements.md`
- System prompt details: See `requirements/system_prompt.md`

## License

Internal tool for Western Pension Fund. Not licensed for external distribution.
