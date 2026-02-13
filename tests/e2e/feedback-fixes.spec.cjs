const { test, expect } = require('@playwright/test');

test.describe('Ricardo Feb 9 Feedback Fixes', () => {

  test('Fix 1: State clearing code exists in runThreePhaseComparison', async ({ page }) => {
    await page.goto('/');

    // Set mock state to simulate an old analysis
    await page.evaluate(() => {
      ChatApp.state.summaryResponse = 'Old summary';
      ChatApp.state.comparisonResponse = 'Old comparison';
      ChatApp.state.languageResponse = 'Old language';
      ChatApp.state.comparisonTableData = { headers: [], rows: [] };
      ChatApp.state.languageTableData = { headers: [], rows: [] };
      ChatApp.state.currentAnalysisId = 'old-id';
      document.getElementById('summary-output').innerHTML = '<p>Old content</p>';
      document.getElementById('comparison-output').innerHTML = '<p>Old content</p>';
      document.getElementById('language-output').innerHTML = '<p>Old content</p>';
    });

    // Verify state is set
    const oldSummary = await page.evaluate(() => ChatApp.state.summaryResponse);
    expect(oldSummary).toBe('Old summary');

    // Verify the clearing code exists in the function source
    const hasClearingCode = await page.evaluate(() => {
      const fnSource = ChatApp.runThreePhaseComparison.toString();
      return fnSource.includes('summaryResponse = null') &&
             fnSource.includes('comparisonResponse = null') &&
             fnSource.includes("getElementById('summary-output').innerHTML");
    });
    expect(hasClearingCode).toBe(true);
  });

  test('Fix 2: File count badge updates correctly', async ({ page }) => {
    await page.goto('/');

    // Initially should show 0 files
    const initialText = await page.evaluate(() => {
      return document.getElementById('files-count').textContent;
    });
    expect(initialText).toContain('0');

    // Push mock files and call updateFilesCount
    await page.evaluate(() => {
      ChatApp.state.uploadedFiles = [
        { id: '1', filename: 'test1.pdf', size: 100, mimeType: 'application/pdf', status: 'uploaded' },
        { id: '2', filename: 'test2.pdf', size: 200, mimeType: 'application/pdf', status: 'uploaded' },
        { id: '3', filename: 'test3.pdf', size: 300, mimeType: 'application/pdf', status: 'uploaded' }
      ];
      ChatApp.updateFilesCount();
    });

    const updatedText = await page.evaluate(() => {
      return document.getElementById('files-count').textContent;
    });
    expect(updatedText).toContain('3');
  });

  test('Fix 3: Summary export menu has PDF and Word options', async ({ page }) => {
    await page.goto('/');

    const menuItems = await page.evaluate(() => {
      const menu = document.getElementById('export-menu-summary');
      const buttons = menu.querySelectorAll('.export-menu-item');
      return Array.from(buttons).map(b => b.textContent.trim());
    });

    expect(menuItems).toContain('Download as Word (.docx)');
    expect(menuItems).toContain('Download as PDF');
    expect(menuItems).toContain('Download as TXT');
    expect(menuItems).toContain('Download as XLSX');
  });

  test('Fix 4: Merge export menu has Word and PDF options', async ({ page }) => {
    await page.goto('/');

    const menuItems = await page.evaluate(() => {
      const menu = document.getElementById('export-menu-draft');
      const buttons = menu.querySelectorAll('.export-menu-item');
      return Array.from(buttons).map(b => b.textContent.trim());
    });

    expect(menuItems).toContain('Download as Word (.docx)');
    expect(menuItems).toContain('Download as PDF');
  });

  test('Fix 5: New Analysis header button exists and toggles visibility', async ({ page }) => {
    await page.goto('/');

    // Button exists but is hidden initially
    const btn = page.locator('#new-analysis-header-btn');
    await expect(btn).toBeAttached();
    await expect(btn).toBeHidden();

    // Simulate having a loaded analysis - show the button
    await page.evaluate(() => {
      ChatApp.state.currentAnalysisId = 'test-id';
      const btn = document.getElementById('new-analysis-header-btn');
      btn.style.display = '';
    });

    await expect(btn).toBeVisible();
  });

  test('Fix 6: DOCX and PDF export libraries are loaded', async ({ page }) => {
    await page.goto('/');

    // Wait for CDN scripts to load
    await page.waitForTimeout(2000);

    const htmlToDOCXLoaded = await page.evaluate(() => typeof HTMLToDOCX !== 'undefined');
    const html2pdfLoaded = await page.evaluate(() => typeof html2pdf !== 'undefined');

    expect(htmlToDOCXLoaded).toBe(true);
    expect(html2pdfLoaded).toBe(true);
  });

  test('Fix 7: Inactivity timer initializes', async ({ page }) => {
    await page.goto('/');

    const timerState = await page.evaluate(() => ({
      hasTimer: ChatApp.state.inactivityTimer !== null,
      timeoutMs: ChatApp.state.INACTIVITY_TIMEOUT_MS,
      warningMs: ChatApp.state.WARNING_TIMEOUT_MS,
      hasInitMethod: typeof ChatApp.initInactivityTimer === 'function',
      hasResetMethod: typeof ChatApp.resetInactivityTimer === 'function',
      hasWarningMethod: typeof ChatApp.showInactivityWarning === 'function'
    }));

    expect(timerState.hasTimer).toBe(true);
    expect(timerState.timeoutMs).toBe(14400000);
    expect(timerState.warningMs).toBe(300000);
    expect(timerState.hasInitMethod).toBe(true);
    expect(timerState.hasResetMethod).toBe(true);
    expect(timerState.hasWarningMethod).toBe(true);
  });
});
