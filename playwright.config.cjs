const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.cjs',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8788',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npx wrangler pages dev --port 8788',
    port: 8788,
    timeout: 30000,
    reuseExistingServer: true,
  },
});
