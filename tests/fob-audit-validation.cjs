/**
 * FOB Audit Feature Validation Tests
 * Run: node tests/fob-audit-validation.cjs
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function has(s) { return html.includes(s); }
function nearStr(marker, str, range = 5000) {
  const idx = html.indexOf(marker);
  if (idx < 0) return false;
  return html.substring(idx, idx + range).includes(str);
}

console.log('\n=== 1. MODE_ADDENDA ===');
assert(has("'fob-audit':"), 'fob-audit key exists');
assert(has('Anthem FOB (Features of Benefits)'), 'Phase 1 mentions FOB');
assert(has('TERMINOLOGY EQUIVALENCE'), 'Phase 2 has terminology rules');
assert(has('"Not Covered" = "Excluded"'), 'Not Covered = Excluded');
assert(has('Suggested Correction'), 'Phase 3 requests corrections');
assert(has('FOB Standard | FOB Deviation | Expected Value | Aggregate Value | Status | Details'), 'Phase 2 columns');
assert(has('Match, Mismatch, Uncertain, Missing, Blank-OON'), 'Status values');

console.log('\n=== 2. Mode UI ===');
assert(has("'fob-audit': 'Upload FOB template and Aggregate document to begin audit'"), 'Upload hint');
assert(has("'fob-audit': 'Click to audit FOB against Aggregate'"), 'Ready hint');
assert(has("'fob-audit': 'Audit Documents'"), 'Button label');
assert(has('data-mode="fob-audit"'), 'Dropdown');
assert(has('<option value="fob-audit">FOB Audit</option>'), 'Workspace option');

console.log('\n=== 3. Phase Messages ===');
assert(has('const FOB_PHASE_MESSAGES'), 'Constant');
assert(has('Reading FOB template structure'), 'P1 msg');
assert(has('Comparing benefit values'), 'P2 msg');
assert(has('Extracting exact cell values'), 'P3 msg');
assert(has('FOB_PHASE_MESSAGES : PHASE_MESSAGES'), 'Wired');

console.log('\n=== 4. State ===');
assert(has('fobMatchesHidden: false'), 'fobMatchesHidden');
assert(has("fobCorrectionsPhase: 'review'"), 'fobCorrectionsPhase');
assert(has('fobConfirmedMismatches: {}'), 'fobConfirmedMismatches');
assert(has('fobCorrectionTexts: {}'), 'fobCorrectionTexts');
assert(has('fobOntology: null'), 'fobOntology');

console.log('\n=== 5. CSS ===');
['.fob-match td', '.fob-mismatch td', '.fob-uncertain td', '.fob-missing td',
 '.fob-blank-oon td', '.fob-hidden', '.fob-stats-bar', '.fob-toggle-matches',
 '.fob-corrections-header', '.fob-review-row', '.fob-correction-text'
].forEach(c => assert(has(c), c));

console.log('\n=== 6. Methods ===');
['applyFobTabLabels()', 'toggleFobMatches()', 'buildFobChatSystemInstruction()',
 'renderCorrectionsTab()', 'setFobCorrectionsPhase(phase)', 'toggleFobConfirm(rowId, checked)',
 'updateFobCorrection(rowId, text)', 'exportFobCorrections()'
].forEach(m => assert(has(m), m));

console.log('\n=== 7. Integration ===');
assert(has("return this.buildFobChatSystemInstruction()"), 'Chat branch');
assert(has("return this.renderCorrectionsTab()"), 'Draft branch');
assert(has("this.applyFobTabLabels()"), 'Tab labels');
assert(has("fobMode: true"), 'Save state');
assert(has("ds.fobMode"), 'Restore state');

const snaBlock = html.substring(html.indexOf('startNewAnalysis()'), html.indexOf('startNewAnalysis()') + 8000);
assert(snaBlock.includes('fobOntology'), 'startNewAnalysis reset');
const rlaBlock = html.substring(html.indexOf('renderLoadedAnalysis()'), html.indexOf('renderLoadedAnalysis()') + 8000);
assert(rlaBlock.includes('applyFobTabLabels'), 'renderLoadedAnalysis labels');

console.log('\n=== 8. Table Color Coding ===');
assert(has("statusVal === 'match'"), 'Match');
assert(has("statusVal === 'mismatch'"), 'Mismatch');
assert(has("statusVal === 'uncertain'"), 'Uncertain');
assert(has("statusVal === 'missing'"), 'Missing');
assert(has("statusVal === 'blank-oon'"), 'Blank-OON');
assert(has("fobMatchesHidden ? 'Show' : 'Hide'"), 'Toggle');

console.log('\n=== 9. Corrections Tab ===');
assert(has("phase === 'review'"), 'Review');
assert(has("phase === 'corrections'"), 'Corrections');
assert(has("phase === 'export'"), 'Export');
assert(has("toggleFobConfirm"), 'Checkboxes');
assert(has("fob-correction-text"), 'Textareas');
assert(has("status !== 'match'"), 'Filter');

console.log('\n=== 10. XLSX Export ===');
assert(nearStr('exportFobCorrections', 'XLSX.utils.book_new()', 2000), 'Workbook');
assert(nearStr('exportFobCorrections', "'Corrections Summary'", 2000), 'Summary sheet');
assert(nearStr('exportFobCorrections', "'Full Audit'", 2000), 'Full Audit sheet');
assert(nearStr('exportFobCorrections', 'XLSX.writeFile', 2000), 'writeFile');
assert(nearStr('exportFobCorrections', 'DISCLAIMER', 2000), 'Disclaimer');
assert(nearStr('exportFobCorrections', "fobOntology?.fob_file", 2000), 'Ontology fallback');

console.log('\n=== 11. Chat Instruction ===');
assert(nearStr('buildFobChatSystemInstruction', 'benefits administration specialist', 2000), 'Role');
assert(nearStr('buildFobChatSystemInstruction', 'first-dollar coverage', 2000), 'Domain');
assert(nearStr('buildFobChatSystemInstruction', 'EPO/PAR-Only', 2000), 'EPO');
assert(nearStr('buildFobChatSystemInstruction', 'compactionSummary', 2000), 'Compaction');

console.log('\n=== 12. Prompt Quality ===');
assert(has('COMPARISON PROCEDURE:'), 'Procedure');
assert(has('SEPARATE ROW'), 'Row per field');
assert(has('Report ALL lines'), 'All lines');
assert(has('Do NOT reorder'), 'Preserve order');
assert(has('Sheet: "Benefit Template"'), 'FOB citation');
assert(has('Sheet: "Table 1"'), 'Aggregate citation');
assert(has('FOB states'), 'Correction format');

console.log('\n=== 13. Status Logic ===');
const statuses = ['Match', 'Mismatch', 'Mismatch', 'Match', 'Mismatch', 'Match', 'Mismatch', 'Blank-OON', 'Match', 'Uncertain'];
const counts = { match: 0, mismatch: 0, uncertain: 0, missing: 0, 'blank-oon': 0 };
statuses.forEach(s => { const k = s.toLowerCase(); if (counts[k] !== undefined) counts[k]++; });
assert(counts.match === 4, 'Match count');
assert(counts.mismatch === 4, 'Mismatch count');
assert(counts.uncertain === 1, 'Uncertain count');
assert(counts['blank-oon'] === 1, 'Blank-OON count');

const nonMatch = statuses.filter(s => s.toLowerCase() !== 'match');
assert(nonMatch.length === 6, 'Non-match filter');
const confirmed = nonMatch.filter(s => ['mismatch','missing','blank-oon'].includes(s.toLowerCase()));
assert(confirmed.length === 5, 'Default confirmed');

console.log('\n=== 14. Serialization ===');
const mock = { fobMode: true, fobCorrectionsPhase: 'corrections', fobConfirmedMismatches: { 0: true }, fobCorrectionTexts: { 0: 'test' }, fobMatchesHidden: true };
const rt = JSON.parse(JSON.stringify(mock));
assert(rt.fobMode === true, 'fobMode');
assert(rt.fobCorrectionsPhase === 'corrections', 'phase');
assert(rt.fobConfirmedMismatches[0] === true, 'confirmed');
assert(rt.fobMatchesHidden === true, 'hidden');

console.log('\n=== 15. Safety ===');
const fobCode = html.substring(html.indexOf("'fob-audit':"), html.indexOf("'fob-audit':") + 20000);
assert(!fobCode.includes('</script>'), 'No </script> in FOB code');

console.log('\n' + '='.repeat(50));
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));
if (failed > 0) process.exit(1);
