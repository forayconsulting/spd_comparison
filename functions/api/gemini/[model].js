// Pages Function: Proxies /api/gemini/:model to Google's Gemini API
// Supports dual-path: Vertex AI (JWT auth) or Consumer API (API key)
// Path is determined by app_settings in the database
//
// Includes keepalive injection: sends SSE comments during long thinking
// pauses to prevent Cloudflare's ~100s idle timeout (524).
// The keepalive starts IMMEDIATELY — before the Vertex AI settings DB
// lookup, JWT minting, or the upstream Gemini fetch — since any of those
// can stall and none of them may block the first byte reaching the client.

import { createSqlClient, getAppSettings } from '../history/_db.js';
import { mintAccessToken } from './_vertex.js';

// Google's auth/permission errors echo the API key verbatim
// (e.g. "Consumer 'api_key:AIza...' has been suspended"). Without this,
// the proxy forwards that text to the browser and leaks the key to every
// user on any error — the vector that got prior keys hijacked/suspended.
// Strip anything matching a Google API key before it leaves the server.
function redactSecrets(text) {
  return String(text).replace(/AIza[0-9A-Za-z_\-]{35}/g, 'AIza…[redacted]');
}

// Bounds a promise so a slow/hung dependency (e.g. the Postgres settings
// lookup) can't silently stall the whole request past Cloudflare's edge
// timeout — callers still get a rejection to handle/fall back on.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  // Extract model from URL path instead of params.model because
  // Cloudflare Pages Functions strips dots from [param] route segments
  // (e.g., "gemini-3.1-pro-preview" becomes "gemini-3-pro-preview")
  const url = new URL(request.url);
  const model = url.pathname.split('/api/gemini/')[1];

  if (!model) {
    return new Response('Model not specified', { status: 400 });
  }

  // Create a TransformStream so we can start returning data to the client
  // IMMEDIATELY — before the Vertex AI settings DB lookup, JWT minting, or
  // the upstream Gemini fetch — then pump upstream data (and keepalives)
  // into it. Any of those steps can be slow; none of them may block the
  // first byte, or Cloudflare's edge sees total silence and returns a 524
  // before Gemini is ever reached.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const keepaliveBytes = encoder.encode(': keepalive\n\n');
  const KEEPALIVE_MS = 15000;

  // Start keepalive IMMEDIATELY — this covers the entire settings lookup,
  // JWT minting, and upstream fetch wait
  let keepaliveTimer = setInterval(async () => {
    try {
      await writer.write(keepaliveBytes);
    } catch {
      clearInterval(keepaliveTimer);
    }
  }, KEEPALIVE_MS);

  // Run everything else in the background
  (async () => {
    try {
      // Clone the request body before consuming it
      const requestBody = await request.text();

      // Check if Vertex AI is configured
      let useVertexAi = false;
      let vertexSettings = {};

      if (env.DB) {
        try {
          const sql = createSqlClient(env);
          const settings = await withTimeout(getAppSettings(sql), 5000, 'app_settings lookup');
          if (settings.vertex_ai_enabled === 'true' &&
              settings.vertex_ai_project_id &&
              settings.vertex_ai_location &&
              settings.vertex_ai_service_account_email &&
              settings.vertex_ai_private_key) {
            useVertexAi = true;
            vertexSettings = settings;
          }
        } catch (dbErr) {
          console.error('Failed to check Vertex AI settings:', dbErr.message);
        }
      }

      let geminiUrl, headers;

      if (useVertexAi) {
        const accessToken = await mintAccessToken(
          vertexSettings.vertex_ai_service_account_email,
          vertexSettings.vertex_ai_private_key
        );

        const projectId = vertexSettings.vertex_ai_project_id;
        const location = vertexSettings.vertex_ai_location;
        const isGlobalModel = model.includes('preview');
        const host = isGlobalModel
          ? 'aiplatform.googleapis.com'
          : `${location}-aiplatform.googleapis.com`;
        const loc = isGlobalModel ? 'global' : location;
        geminiUrl = `https://${host}/v1/projects/${projectId}/locations/${loc}/publishers/google/models/${model}:streamGenerateContent?alt=sse`;

        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        };
      } else {
        if (!env.GEMINI_API_KEY) {
          const errorEvent = `data: {"error": {"code": 500, "message": "API key not configured"}}\n\n`;
          await writer.write(encoder.encode(errorEvent));
          clearInterval(keepaliveTimer);
          await writer.close();
          return;
        }

        geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

        headers = {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
          // Sent so the consumer key can be HTTP-referrer restricted. This value
          // is set server-side only and is never exposed to the browser, so a
          // leaked key string is unusable without also forging this referrer.
          // Must match an allowed referrer on the key (see GEMINI_KEY_REFERER).
          'Referer': env.GEMINI_KEY_REFERER || 'https://app.syncrodocsystems.com'
        };
      }

      // This fetch may block for minutes while Gemini thinks
      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers,
        body: requestBody
      });

      if (!geminiResponse.ok) {
        // Forward error response as an SSE error event with upstream context
        const errorText = await geminiResponse.text();
        // Extract a human-readable message from the upstream error
        let displayMessage = errorText;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed?.error?.message) displayMessage = parsed.error.message;
        } catch { /* use raw text */ }
        // Never forward a key the upstream echoed back to the client.
        displayMessage = redactSecrets(displayMessage);
        const errorEvent = `data: {"error": {"code": ${geminiResponse.status}, "message": ${JSON.stringify(displayMessage)}, "upstream": ${JSON.stringify(geminiUrl)}}}\n\n`;
        console.error(`Upstream error ${geminiResponse.status} from ${geminiUrl}: ${displayMessage}`);
        await writer.write(encoder.encode(errorEvent));
        clearInterval(keepaliveTimer);
        await writer.close();
        return;
      }

      // Stream upstream response to client, resetting keepalive on each chunk
      const reader = geminiResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Real data arrived — reset keepalive timer
        clearInterval(keepaliveTimer);
        keepaliveTimer = setInterval(async () => {
          try { await writer.write(keepaliveBytes); } catch { clearInterval(keepaliveTimer); }
        }, KEEPALIVE_MS);
        await writer.write(value);
      }
    } catch (e) {
      // Write error as SSE event so client can handle it
      try {
        const errorEvent = `data: {"error": {"code": 502, "message": "Upstream connection failed"}}\n\n`;
        await writer.write(encoder.encode(errorEvent));
      } catch { /* writer already closed */ }
    } finally {
      clearInterval(keepaliveTimer);
      try { await writer.close(); } catch { /* already closed */ }
    }
  })();

  // Return the readable stream IMMEDIATELY — keepalives are already flowing,
  // regardless of how slow the settings lookup or upstream fetch turn out to be
  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  return onRequestPost(context);
}
