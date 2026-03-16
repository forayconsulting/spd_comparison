// Pages Function: Proxies /api/gemini/:model to Google's Gemini API
// Supports dual-path: Vertex AI (JWT auth) or Consumer API (API key)
// Path is determined by app_settings in the database

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
        // DB unavailable — fall through to Consumer API
        console.error('Failed to check Vertex AI settings:', dbErr.message);
      }
    }

    let geminiUrl, headers;

    if (useVertexAi) {
      // Vertex AI path: mint JWT → exchange for access token → forward request
      const accessToken = await mintAccessToken(
        vertexSettings.vertex_ai_service_account_email,
        vertexSettings.vertex_ai_private_key
      );

      const projectId = vertexSettings.vertex_ai_project_id;
      const location = vertexSettings.vertex_ai_location;
      // Preview models require global endpoint; GA models use regional
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
      // Consumer API path: use API key (existing behavior)
      if (!env.GEMINI_API_KEY) {
        return new Response('API key not configured', { status: 500 });
      }

      geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

      headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      };
    }

    // Forward request to Gemini API
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers,
      body: request.body
    });

    // Stream response back to client
    return new Response(geminiResponse.body, {
      status: geminiResponse.status,
      headers: {
        'Content-Type': geminiResponse.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (e) {
    return new Response('Proxy error: ' + e.message, { status: 502 });
  }
}

// Reject non-POST requests
export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  return onRequestPost(context);
}
