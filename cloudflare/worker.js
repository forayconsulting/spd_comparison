export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Gemini API Proxy - keeps API key server-side
    if (url.pathname.startsWith('/api/gemini/')) {
      return handleGeminiProxy(request, env, url);
    }

    // Serve index.html
    if (url.pathname === '/' || url.pathname === '/index.html') {
      try {
        const assetRequest = new Request(new URL('/index.html', request.url), {
          method: 'GET'
        });
        const asset = await env.ASSETS.fetch(assetRequest);

        if (!asset.ok) {
          return new Response('Asset not found: ' + asset.status, { status: asset.status });
        }

        return new Response(await asset.text(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      } catch (e) {
        return new Response('Error: ' + e.message, { status: 500 });
      }
    }

    // Serve other static assets
    return env.ASSETS.fetch(request);
  }
};

async function handleGeminiProxy(request, env, url) {
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Extract model from path: /api/gemini/{model}
  const pathParts = url.pathname.split('/');
  const model = pathParts[3]; // ['', 'api', 'gemini', 'model-name']

  if (!model) {
    return new Response('Model not specified', { status: 400 });
  }

  if (!env.GEMINI_API_KEY) {
    return new Response('API key not configured', { status: 500 });
  }

  try {
    // Forward request to Gemini API with injected API key
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
