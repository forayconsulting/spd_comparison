// Pages Function: Proxies /api/gemini/:model to Google's Gemini API
// Supports dual-path: Vertex AI (JWT auth) or Consumer API (API key)
// Path is determined by app_settings in the database
//
// Includes keepalive injection: sends SSE comments during long thinking
// pauses to prevent Cloudflare's ~100s idle timeout (524).
// The keepalive starts IMMEDIATELY (before upstream fetch returns) to
// cover the period where Gemini is processing the request.

import { createSqlClient, getAppSettings } from '../history/_db.js';
import { mintAccessToken } from './_vertex.js';

export async function onRequestPost(context) {
  const { params, env, request } = context;
  const model = params.model;

  if (!model) {
    return new Response('Model not specified', { status: 400 });
  }

  try {
    // Check if Vertex AI is configured
    let useVertexAi = false;
    let vertexSettings = {};

    if (env.DB) {
      try {
        const sql = createSqlClient(env);
        const settings = await getAppSettings(sql);
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
        return new Response('API key not configured', { status: 500 });
      }

      geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

      headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      };
    }

    // Clone the request body before consuming it
    const requestBody = await request.text();

    // Create a TransformStream so we can start returning data to the client
    // IMMEDIATELY, then pump upstream data (and keepalives) into it.
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const keepaliveBytes = encoder.encode(': keepalive\n\n');
    const KEEPALIVE_MS = 15000;

    // Start keepalive IMMEDIATELY — this covers the entire upstream fetch wait
    let keepaliveTimer = setInterval(async () => {
      try {
        await writer.write(keepaliveBytes);
      } catch {
        clearInterval(keepaliveTimer);
      }
    }, KEEPALIVE_MS);

    // Run the upstream fetch and stream pump in the background
    (async () => {
      try {
        // This fetch may block for minutes while Gemini thinks
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers,
          body: requestBody
        });

        if (!geminiResponse.ok) {
          // Forward error response as an SSE error event
          const errorText = await geminiResponse.text();
          const errorEvent = `data: {"error": {"code": ${geminiResponse.status}, "message": ${JSON.stringify(errorText)}}}\n\n`;
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
          const errorEvent = `data: {"error": {"code": 502, "message": ${JSON.stringify(e.message)}}}\n\n`;
          await writer.write(encoder.encode(errorEvent));
        } catch { /* writer already closed */ }
      } finally {
        clearInterval(keepaliveTimer);
        try { await writer.close(); } catch { /* already closed */ }
      }
    })();

    // Return the readable stream IMMEDIATELY — keepalives are already flowing
    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (e) {
    return new Response('Proxy error: ' + e.message, { status: 502 });
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  return onRequestPost(context);
}
