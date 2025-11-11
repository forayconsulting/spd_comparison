// Gemini API Configuration
// Copy this file to config-gemini.js and add your API key

const CONFIG = {
  // Get your API key from: https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',

  // Model to use (see https://ai.google.dev/gemini-api/docs/models)
  // Options:
  // - gemini-2.0-flash-exp (fast, cost-effective, experimental)
  // - gemini-2.5-pro-preview-06-05 (most capable, larger context)
  // - gemini-2.5-flash (balanced performance and cost)
  MODEL: 'gemini-2.0-flash-exp',

  // Maximum output tokens (response length)
  MAX_OUTPUT_TOKENS: 4096,

  // Thinking budget for internal reasoning (0-32768)
  // -1 = dynamic (model decides), 0 = disabled, 1024+ = explicit budget
  THINKING_BUDGET: 1024
};
