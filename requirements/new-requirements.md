# SPD Comparison Tool - Requirements & Specifications

## Project Context
- **Use Case**: Merger of 5 plan units requiring standardized rules across all units
- **Users**: Attorneys and actuaries on merger implementation team
- **Current Process**: Manual side-by-side document comparison (very time-consuming)
- **Challenge**: Plan documents often not written in ways that allow smooth comparison
- **Demo Target**: Tuesday, November 18th at 2pm ET (merger implementation team meeting)

## Document Types & Hierarchy
- **SPD** (Summary Plan Description) - Base document, typically 100+ pages
- **SMMs** (Summary of Material Modifications) - Sequential modifications to SPD
- **Document Relationship**: Must understand sequence/hierarchy - SMMs modify base SPD
- **Critical**: Cannot compare SMMs alone without base SPD context
- **Missing in Initial Demo**: San Francisco plan (ensure all 5 units included)

## Core Output Requirements (Three-Part Structure)

### 1. Summary Output
**Purpose**: High-level executive overview of document comparison

**Format**:
- Markdown-formatted document
- Concise summary of what's happening across documents
- Quick executive-level understanding

**Content**:
- Document inventory and clarification
- Comparative overview of key differences
- Plan modifications identified
- Missing or incomplete sections flagged

**Example from Initial Demo**:
> "Neither of these SMMs contains the complete claims and appeals procedures required. 
> Both reference the SPD, but they do not include it. We needed to upload the SPD."

### 2. Comparison Spreadsheet (Excel)
**Purpose**: Structured side-by-side comparison of procedure elements across all plans

**Format**:
- Excel file with multiple tabs (not CSV - tabs are interconnected)
- Exact template format maintained across all comparisons
- Plans as columns (all 5 units must be included)
- Procedure elements as rows
- Must be exportable and downloadable

**Content Structure**:
- Each cell contains summary statement of that plan's approach
- Example categories: Appeals details, timeframes, notification requirements
- Standardized rows across all comparisons for consistency

**Example Structure** (from transcript):
```
Procedure Element       | San Diego | Vegas | Sacramento | [Plan 4] | San Francisco
------------------------|-----------|-------|------------|----------|---------------
Written denial notice   | 60 days   | ...   | ...        | ...      | ...
Appeals timeframe       | ...       | ...   | ...        | ...      | ...
Notification method     | ...       | ...   | ...        | ...      | ...
```

**Key Requirements**:
- Consistent template across all comparison runs
- All 5 plans must appear as columns
- Summary-level information in each cell
- Organized by tabs for different comparison categories

### 3. Side-by-Side Language Comparison (Most Critical)
**Purpose**: Provide attorneys with actual legal language needed to draft final documents

**Why This Matters**:
> "Some attorney needs to actually look at the details and get in the weeds on what 
> the specific language is and figure out what is our specific language going to be."

**Structure**:
- Based on procedure elements from comparison spreadsheet (#2)
- Each procedure element broken out with full text from each plan
- NOT summaries - actual quoted language chunks from PDFs
- Probably should also be spreadsheet format for organization

**Required Elements per Entry**:
1. **Complete paragraph language** - Exact legal text from source document
2. **Page number citation** - Where to find this text in original document
3. **Paragraph number reference** - Specific paragraph location
4. **Summary statement** - Brief description linking to source text

**Example Structure**:
```
Procedure Element: Written Denial Notice Timeline

San Diego Plan:
  Summary: 60 days after receipt of written denial notice
  Full Text: "A claimant shall have sixty (60) days following receipt of 
             written notification of denial of benefits to file a written 
             appeal to the Board of Trustees..."
  Citation: SPD Page 47, Paragraph 3

Vegas Plan:
  Summary: 90 days after receipt of written denial notice
  Full Text: "Any claimant who has been denied benefits shall have ninety 
             (90) days from the date of written notification to submit a 
             written request for review..."
  Citation: SPD Page 52, Paragraph 5

Sacramento Plan:
  Summary: 60 days after receipt of written denial notice
  Full Text: [Complete paragraph from SPD/SMM]
  Citation: SPD Page 43, Paragraph 2

[...repeat for all 5 plans]
```

**Critical Distinction**:
- Comparison Spreadsheet (#2): Summary statements only
- Language Comparison (#3): Complete quoted text + summary + citations

**Attorney Use Case**:
- Attorneys review actual language side-by-side
- Determine which approach is best or draft new standardized language
- Page/paragraph references allow them to verify context in original documents
- Replaces manual process of opening multiple PDFs and comparing sections

## Session & Storage Requirements
- **Multi-turn analysis**: Not one-and-done workflow
- **Multiple sessions**: Users return to compare different sections over time
  - Claims and appeals process (initial focus)
  - Vesting rules
  - Permanent break rules
  - Other plan provisions
- **Persistence**: Need hosted solution with data storage
- **Audit logging**: Required for compliance teams
- **Progressive building**: Building complete consolidated SPD over time

## Technical Considerations

### Document Processing
- SPDs typically exceed 100 pages
- Must handle large multi-page documents
- Maintain page sequencing and references across document sections
- Process SPD + multiple SMMs together while understanding hierarchy

### File Format Requirements
- **Excel strongly preferred** over CSV for multi-tab interconnected structure
- If Excel causes technical issues, series of CSVs acceptable as fallback
- Must preserve relationships between tabs/sections
- All outputs must be downloadable files

### Deployment Paths

**Proof of Concept** (Current Phase):
- Lightweight local demonstration sufficient
- Can run on laptop to prove functionality
- Goal: Show attorneys the three outputs and get feedback
- Does not need full production infrastructure yet

**Production Requirements** (Future):
- Hosted solution for multi-session work
- Persistent document management and storage
- Security and compliance considerations
- Server infrastructure for document processing
- Team maintenance and support

## Additional Enhancement (Separate Use Case)
**SMM Consolidation Tool**

**The Problem**:
- Plans have base SPD + multiple SMMs accumulated over time
- Every 5 years, plans must manually consolidate all modifications into new SPD
- Very time-consuming manual process
- Hard to track which sections have been modified

**Proposed Solution**:
- **Input**: Base SPD + all SMMs
- **Process**: Automatically incorporate all modifications into base document
- **Output**: Consolidated final SPD with all changes integrated showing current state

## Success Criteria
1. Attorneys can quickly identify differences across 5 plan units
2. Specific legal language is accessible with precise citations
3. Time to complete comparison reduced from days/weeks to hours
4. Output quality sufficient for attorneys to draft standardized language
5. All 5 plans represented in every output
6. Attorneys trust the citations and can verify sources easily