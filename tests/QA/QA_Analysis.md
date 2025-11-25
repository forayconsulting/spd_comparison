# QA Analysis: SPD Plan Comparison Agent

## Executive Summary

This document analyzes three production runs of the SPD Plan Comparison Agent using identical input documents (10 PDFs covering 5 pension plans). The analysis reveals **significant consistency issues** that warrant attention before production deployment.

### Critical Findings

| Severity | Issue | Impact |
|----------|-------|--------|
| **HIGH** | Run 2 failed to detect San Diego plan | 20% of plans missing from analysis |
| **HIGH** | Critical legal finding (mandatory arbitration) only in Run 3 | Material legal risk not consistently surfaced |
| **MEDIUM** | Inconsistent procedural elements across runs | Different analysis depth/coverage |
| **LOW** | Citation format variations | Cosmetic but affects traceability |

### Overall Assessment

- **Run 3** produced the most comprehensive and legally significant output
- **Run 2** had a critical failure in document recognition
- **Run 1** was generally accurate but missed highlighting a key legal concern

---

## Test Configuration

### Input Documents (10 PDFs)

| Plan | Document Count | Key Files |
|------|----------------|-----------|
| Southern Nevada (Las Vegas) | 4 | SPD July 2020, COVID SMM, Benefit Increase SMM, Disability SMM |
| UNITE HERE Northwest (Seattle) | 1 | SPD June 2005 with notices through 2018 |
| San Francisco | 2 | SPD December 2018, Window Benefits SMM |
| Sacramento | 1 | SPD September 2016, COVID SMM June 2020 |
| San Diego | 1 | SPD December 2020 |

### Test Methodology

- Same 10 PDFs uploaded for each run
- Same chat query used: "What should I be concerned about with this analysis?"
- Outputs captured: Summary.txt, Comparison.csv, Citations.csv, chat.txt

---

## Critical Findings

### Issue 1: Missing Plan Detection (Run 2)

**Severity: HIGH**

Run 2 failed to detect the San Diego UNITE-HERE Pension Plan, producing analysis for only 4 of 5 plans.

| Run | Plans Detected | Missing |
|-----|----------------|---------|
| Run 1 | 5 | None |
| Run 2 | 4 | **San Diego** |
| Run 3 | 5 | None |

**Evidence from Summary.txt:**

- **Run 1**: "...five distinct multiemployer defined benefit pension plans..."
- **Run 2**: "...four distinct multi-employer defined benefit pension plans..."
- **Run 3**: "...five distinct pension plans..." (correctly includes San Diego section)

**Impact:**
- 20% of comparative data missing
- San Diego-specific concerns (variable accrual rates, mandatory arbitration) completely absent
- Attorneys relying on Run 2 output would have incomplete picture

**Recommendation:** Investigate why document detection failed. Consider adding validation step to confirm expected plan count.

---

### Issue 2: Inconsistent Procedural Element Coverage

**Severity: HIGH**

The comparison tables contain different procedural elements across runs.

| Run | Element Count | Unique Elements |
|-----|---------------|-----------------|
| Run 1 | 17 | Minimum Distribution Age as final row |
| Run 2 | 20 | Plan Administrator, Credit Calculation, Rehabilitation Status, Window Benefits |
| Run 3 | 20 | Effective Date of SPD, Mandatory Arbitration, Claims & Appeals Timeline |

**Key Differences:**

| Element | Run 1 | Run 2 | Run 3 |
|---------|-------|-------|-------|
| Plan Administrator | No | Yes | No |
| Credit Calculation (Service) | No | Yes | No |
| Effective Date of SPD | No | No | Yes |
| Mandatory Arbitration | No | No | **Yes** |
| Claims & Appeals Timeline | No | No | Yes |
| Rehabilitation/Funding Status | No | Yes | No |

**Impact:**
- "Mandatory Arbitration" is a **critical legal element** only captured in Run 3
- Users cannot reliably expect consistent element coverage
- Different runs emphasize different aspects of plan comparison

---

### Issue 3: Critical Legal Finding Inconsistency

**Severity: HIGH**

San Diego's **Mandatory Arbitration and Class Action Waiver** is a material legal concern that affects participants' rights. This was handled differently across runs:

| Run | San Diego Detected | Arbitration in Table | Arbitration in Chat |
|-----|-------------------|---------------------|---------------------|
| Run 1 | Yes | No dedicated row | Not mentioned as concern |
| Run 2 | **No** | N/A | N/A |
| Run 3 | Yes | **Yes** (Row 20) | **Yes** (Concern #3) |

**Run 3 Citations.csv - Mandatory Arbitration row:**
> "MANDATORY ARBITRATION AND CLASS ACTION WAIVER... Arbitration is the exclusive remedy for all claims, disputes, or breaches arising out of or in any way relating to the Plan... The Plan also specifically prohibits class arbitration and class action lawsuits..." (San Diego UNITE-HERE Pension Plan - SPD 2020.pdf, 33, 3-6)

**Run 3 Chat Response:**
> "3. Limitation of Legal Rights (San Diego)... the San Diego plan mandates arbitration as the exclusive remedy and includes a Class Action Waiver... you effectively waive your right to sue in federal court or join a class action if the plan is mismanaged."

**Impact:**
- Attorneys would miss critical legal distinction in Runs 1 and 2
- San Diego participants have fundamentally different legal rights than other plans
- This finding should be consistently surfaced in every run

---

## Detailed Comparison

### Summary Tab Variations

**Structure Comparison:**

| Aspect | Run 1 | Run 2 | Run 3 |
|--------|-------|-------|-------|
| Plan count mentioned | 5 | 4 | 5 |
| Word count (approx) | 650 | 550 | 700 |
| San Diego section | Yes | No | Yes |
| Relationships section | Yes | No | Yes |

**Content Consistency (Shared Plans):**

All runs consistently identified:
- Southern Nevada: SPD July 2020, COVID assistance, 10% benefit increase
- Northwest: SPD June 2005, Critical Status 2012, Rehabilitation Plan 2013
- San Francisco: SPD December 2018, Window benefits system
- Sacramento: SPD September 2016, COVID claims extensions, RMD age update

**San Diego (Runs 1 & 3 only):**
- Run 1: "An SPD effective December 1, 2020. It details participation requirements, vesting schedules, and specific benefit formulas tied to the plan's funded percentage status."
- Run 3: Adds mention of "mandatory arbitration clauses" - more comprehensive

---

### Comparison Table Variations

**Column Header Differences:**

| Plan | Run 1 | Run 2 | Run 3 |
|------|-------|-------|-------|
| Northwest | "Hotel Employees Restaurant Employees Pension Plan (Northwest/Seattle)" | "UNITE HERE Northwest Pension Trust Fund" | "UNITE HERE Northwest Pension Trust Fund (Seattle/WA)" |
| San Francisco | "San Francisco Culinary, Bartenders and Service Employees Pension Plan" | Same | Uses "&" instead of "and" |

**Data Point Consistency Check - Plan Year:**

| Plan | Run 1 | Run 2 | Run 3 |
|------|-------|-------|-------|
| Southern Nevada | "Calendar Year (January 1 – December 31)" | "Calendar Year (January 1 through December 31)" | "Calendar Year (Jan 1 – Dec 31)" |
| Northwest | "June 1 – May 31" | "June 1 through May 31" | "June 1 – May 31" |

Minor formatting variations but data is consistent where covered.

**Data Point Consistency Check - Early Retirement Reduction:**

All runs consistently report:
- Southern Nevada: 0.75% (60-62) + 0.50% (55-60)
- Northwest: Rehabilitation Plan factors (60% at age 60 vs 90% prior)
- San Francisco: 0.6% per month
- Sacramento: 0.5% per month
- San Diego: 0.5% per month (Runs 1 & 3 only)

---

### Citations Tab Variations

**Citation Format Differences:**

| Run | Format Example |
|-----|----------------|
| Run 1 | "(2020-07-01 - SPD.pdf, 6, 6)" |
| Run 2 | "(2020.07.01 - SPD - Southern Nevada..., p. 6, para 5)" |
| Run 3 | "(Southern Nevada Culinary and Bartenders Pension Plan - SPD 2020 & SMMs.pdf, 6, 5)" |

**Citation Accuracy - Sample Verification:**

**Test: Plan Year - Southern Nevada**
- All runs cite page 6, paragraphs 5-6
- Quote: "The Plan Year (which is a calendar year)"
- **Verified**: Consistent and accurate

**Test: Disability - Sacramento**
- All runs (that include Sacramento) quote: "This Plan does not provide a Disability Benefit."
- Run 1: (2016-09 - SPD.pdf, 8, 8)
- Run 3: (Sacramento Independent Hotel... SPD 2016 & SMM.pdf, 13, 10)
- **Note**: Different page references - may indicate different PDF pagination

**Test: Mandatory Arbitration - San Diego (Run 3 only)**
- Quote includes class action waiver language
- Citation: (San Diego UNITE-HERE Pension Plan - SPD 2020.pdf, 33, 3-6)
- **Verified**: Critical legal language properly captured

---

### Chat Response Variations

**Query Used:** "What should I be concerned about with this analysis?"

**Response Structure:**

| Aspect | Run 1 | Run 2 | Run 3 |
|--------|-------|-------|-------|
| Concern categories | 6 | 6 | 6 |
| Action items | 35 items | None | Checklist (4 items) |
| Word count (approx) | 1,100 | 900 | 950 |

**Concern Categories by Run:**

| # | Run 1 | Run 2 | Run 3 |
|---|-------|-------|-------|
| 1 | Financial Health/Critical Status | Critical Funding Status | Plan Solvency/Variable Accruals |
| 2 | Window Benefit Complexity | Variable Benefit Accruals | Window Benefit Trap |
| 3 | Missing Disability Benefits | Lack of Disability Coverage | **Limitation of Legal Rights** |
| 4 | Strict Break in Service Rules | High-Stakes Window Deadlines | Lack of Disability Coverage |
| 5 | Reciprocity/Multi-Jurisdiction | Document Age | High Vesting Thresholds |
| 6 | Early Retirement Penalties | Merged Plan Complexity | Cliff Reduction Factors |

**Unique Concerns:**

- **Run 1 Only**: "Reciprocity and Moving Between Jurisdictions" - discusses how working across plans doesn't automatically vest
- **Run 2 Only**: "Document Age" - flags Northwest SPD from 2005 as potentially outdated
- **Run 3 Only**: "Limitation of Legal Rights" - flags San Diego's mandatory arbitration (CRITICAL)

---

## Citation Accuracy Verification

### Methodology

Cross-referenced key citations against source PDFs in `plan_docs/`.

### Verified Citations

| Data Point | Run | Citation | Verified |
|------------|-----|----------|----------|
| Southern Nevada Plan Year | All | Page 6 | Yes - Calendar year confirmed |
| Northwest Critical Status | All | 2013 Notice | Yes - Rehabilitation Plan documented |
| San Francisco Window VII | 1 & 3 | SMM | Yes - $50/year rate confirmed |
| Sacramento No Disability | All | SPD | Yes - Explicitly stated |
| San Diego Arbitration | 3 only | Page 33 | Yes - Class action waiver present |

### Potential Discrepancies

| Issue | Runs Affected | Notes |
|-------|---------------|-------|
| Page number variations | All | May reflect PDF reader differences |
| Paragraph numbering | All | Inconsistent methodology |
| Quote truncation | Some | Long quotes sometimes shortened |

---

## Recommendations

### Immediate Actions

1. **Investigate Run 2 Failure**
   - Why was San Diego not detected?
   - Add validation to confirm expected document/plan count
   - Consider retry logic if plan count seems low

2. **Standardize Procedural Elements**
   - Define required elements list (including Mandatory Arbitration)
   - Ensure consistent coverage across runs
   - Consider user-configurable element selection

3. **Highlight Legal Distinctions**
   - Flag mandatory arbitration/class action waivers prominently
   - Add "Legal Rights" as standard comparison category
   - Surface ERISA vs arbitration distinction in chat responses

### Process Improvements

4. **Add Output Validation**
   - Verify all uploaded documents are referenced
   - Check for expected plan names in output
   - Alert user if analysis seems incomplete

5. **Standardize Citation Format**
   - Use consistent filename format in citations
   - Include page and paragraph consistently
   - Consider linking to specific PDF pages if possible

6. **Chat Response Consistency**
   - Ensure critical legal/financial concerns are always surfaced
   - Standardize action item format
   - Include all plans in concern analysis

---

## Appendix: Raw Data Comparison Tables

### A. Plans Detected by Run

```
Run 1: Southern Nevada, Northwest, San Francisco, San Diego, Sacramento (5)
Run 2: Southern Nevada, Northwest, San Francisco, Sacramento (4)
Run 3: Southern Nevada, Northwest, San Francisco, Sacramento, San Diego (5)
```

### B. Procedural Elements by Run

**Run 1 (17 elements):**
Plan Year, Participation Start Date, Vesting Requirements, Normal Retirement Age, Early Retirement Eligibility, Early Retirement Reduction, Benefit Calculation Method, Disability Pension, Break in Service Rule, Special COVID-19 Provisions, Normal Form of Payment (Single), Normal Form of Payment (Married), Other Payment Options, Pre-Retirement Death Benefit, Suspension of Benefits, Minimum Distribution Age

**Run 2 (20 elements):**
Plan Year, Plan Administrator, Participation Requirements, Vesting Requirements, Credit Calculation, Normal Retirement Age, Early Retirement Eligibility, Early Retirement Reduction Factors, Disability Pension Eligibility, Disability Benefit Calculation, Benefit Accrual/Formula, Break in Service Rules, Pre-Retirement Death Benefit (Spouse), Post-Retirement Death Benefit, COVID-19 Modifications, RMD, Rehabilitation/Funding Status, Special Window Benefits, Claims & Appeals (not included), Mandatory Arbitration (not included)

**Run 3 (20 elements):**
Effective Date of SPD, Plan Year, Participation Requirements, Vesting Requirements, Normal Retirement Age, Early Retirement Eligibility, Early Retirement Reduction Factors, Disability Pension Eligibility, Benefit Calculation Method, Standard Form of Payment (Unmarried), Standard Form of Payment (Married), Optional Forms of Payment, Pre-Retirement Death Benefit (Married), Pre-Retirement Death Benefit (Unmarried), Suspension of Benefits, Recent/Specific Modifications, Claims & Appeals Timeline, Mandatory Arbitration

### C. Chat Concerns Summary

| Concern Type | Run 1 | Run 2 | Run 3 |
|--------------|-------|-------|-------|
| Plan Solvency/Funding | Yes | Yes | Yes |
| Window Benefits | Yes | Yes | Yes |
| Disability Gap | Yes | Yes | Yes |
| Break in Service | Yes | No | No |
| Legal Rights/Arbitration | No | No | **Yes** |
| Document Age | No | Yes | No |
| Reciprocity | Yes | No | No |
| Early Retirement Penalties | Yes | No | Yes |
| Vesting Thresholds | No | No | Yes |
| Merged Plans | No | Yes | No |

---

## Document Information

- **Generated**: November 25, 2024
- **Analyzer**: Claude Code
- **Input Runs**: 3 (tests/QA/1, tests/QA/2, tests/QA/3)
- **Source Documents**: 10 PDFs in plan_docs/
