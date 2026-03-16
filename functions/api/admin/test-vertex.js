// POST /api/admin/test-vertex → tests Vertex AI connection with stored credentials
// Mints a JWT, exchanges for access token, makes a lightweight Vertex AI call

import { createSqlClient, getOrCreateUser, getUserEmail, unauthorizedResponse, getAppSettings, requireAdmin, jsonResponse, errorResponse } from '../history/_db.js';
import { mintAccessToken } from '../gemini/_vertex.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const denied = requireAdmin(user);
    if (denied) return denied;

    const settings = await getAppSettings(sql);

    const projectId = settings.vertex_ai_project_id;
    const location = settings.vertex_ai_location;
    const serviceAccountEmail = settings.vertex_ai_service_account_email;
    const privateKey = settings.vertex_ai_private_key;

    if (!projectId || !location || !serviceAccountEmail || !privateKey) {
      return errorResponse('Vertex AI not fully configured. Please save all fields first.', 400);
    }

    // Mint access token
    let accessToken;
    try {
      accessToken = await mintAccessToken(serviceAccountEmail, privateKey);
    } catch (e) {
      return jsonResponse({
        success: false,
        error: 'Token minting failed: ' + e.message,
        stage: 'authentication'
      }, 400);
    }

    // Make a lightweight test call: list models endpoint
    const testUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-2.0-flash:generateContent`;

    const testResponse = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say "ok"' }] }],
        generationConfig: { maxOutputTokens: 5 }
      })
    });

    if (!testResponse.ok) {
      const errorBody = await testResponse.text();
      return jsonResponse({
        success: false,
        error: `Vertex AI returned ${testResponse.status}: ${errorBody}`,
        stage: 'api_call'
      }, 400);
    }

    return jsonResponse({
      success: true,
      message: `Connected to Vertex AI (${location}, project: ${projectId})`
    });
  } catch (e) {
    return errorResponse('Test failed: ' + e.message);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  return onRequestPost(context);
}
