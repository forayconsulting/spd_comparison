// Pages Function: Proxies /api/gemini/:model to Google's Gemini API
// The [model] in the filename creates a dynamic route parameter

export async function onRequestPost(context) {
  const { params, env, request } = context;
  const model = params.model;

  if (!model) {
    return new Response('Model not specified', { status: 400 });
  }

  if (!env.GEMINI_API_KEY) {
    return new Response('API key not configured', { status: 500 });
  }

  try {
    // Forward request to Gemini API with server-side API key injection
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      },
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
