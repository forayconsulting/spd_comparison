// Gemini API Configuration
// Copy this file to config-gemini.js and add your API key

const CONFIG = {
  // Get your API key from: https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',

  // Model to use (see https://ai.google.dev/gemini-api/docs/models)
  // Options:
  // - gemini-2.5-pro (most capable, best for document analysis)
  // - gemini-2.0-flash-exp (fast, cost-effective, experimental)
  // - gemini-2.5-flash (balanced performance and cost)
  MODEL: 'gemini-2.5-pro',

  // Maximum output tokens (response length)
  MAX_OUTPUT_TOKENS: 8192,

  // Thinking budget for internal reasoning (reserved for future use)
  // Note: thinking_config not yet available in Gemini API
  // Model performs internal reasoning automatically
  THINKING_BUDGET: 32768
};
