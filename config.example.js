// Gemini API Configuration
// Copy this file to config-gemini.js and add your API key

const CONFIG = {
  // Get your API key from: https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',

  // Model to use (see https://ai.google.dev/gemini-api/docs/models)
  // Options:
  // - gemini-3.1-pro-preview (most advanced, 65k token output, best reasoning, 100MB file limit)
  // - gemini-3-pro-preview (previous generation)
  // - gemini-2.5-pro (highly capable, good for document analysis)
  MODEL: 'gemini-3.1-pro-preview',

  // Maximum output tokens (response length)
  // Gemini 3.1 Pro supports up to 65,536 tokens
  MAX_OUTPUT_TOKENS: 32768,

  // Thinking level for internal reasoning
  // Options: 'low' (fast, cost-effective), 'medium' (balanced), or 'high' (deep reasoning, default)
  // Note: Used in thinkingConfig.thinkingLevel API parameter (nested structure)
  THINKING_LEVEL: 'high',

  // Google OAuth Client ID for Google Sheets export (optional)
  // Get one at: https://console.cloud.google.com/apis/credentials
  // Type: OAuth 2.0 Client ID (Web application)
  // Authorized JavaScript origins: your deployment URL + http://localhost:8788
  // Also enable the Google Sheets API in the same project
  GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE'
};
