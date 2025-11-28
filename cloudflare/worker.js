export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve index.html with injected API key
    if (url.pathname === '/' || url.pathname === '/index.html') {
      try {
        // Fetch index.html from assets - need to rewrite URL for the asset binding
        const assetRequest = new Request(new URL('/index.html', request.url), {
          method: 'GET'
        });
        const asset = await env.ASSETS.fetch(assetRequest);

        if (!asset.ok) {
          return new Response('Asset not found: ' + asset.status, { status: asset.status });
        }

        let html = await asset.text();

        // Inject API key as global variable before </head>
        const apiKey = env.GEMINI_API_KEY || '';
        const injection = `<script>window.INJECTED_GEMINI_API_KEY = "${apiKey}";</script>`;
        html = html.replace('</head>', injection + '</head>');

        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      } catch (e) {
        return new Response('Error: ' + e.message + '\nStack: ' + e.stack, { status: 500 });
      }
    }

    // Serve other static assets normally
    return env.ASSETS.fetch(request);
  }
};
