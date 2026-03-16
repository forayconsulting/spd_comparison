// Vertex AI JWT token minting for Cloudflare Workers
// Uses Web Crypto API (crypto.subtle) since Node.js client libraries aren't available

/**
 * Base64url encode a Uint8Array or string
 */
function base64urlEncode(data) {
  let str;
  if (typeof data === 'string') {
    str = btoa(data);
  } else {
    // Uint8Array → binary string → base64
    let binary = '';
    for (let i = 0; i < data.byteLength; i++) {
      binary += String.fromCharCode(data[i]);
    }
    str = btoa(binary);
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Parse a PEM private key to an ArrayBuffer for crypto.subtle
 * Handles both PKCS#8 (BEGIN PRIVATE KEY) format
 */
function pemToArrayBuffer(pem) {
  // Remove PEM headers, newlines, and whitespace
  const b64 = pem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Mint a Google OAuth2 access token from a service account
 * @param {string} serviceAccountEmail - Service account email
 * @param {string} privateKeyPem - PEM-encoded private key
 * @returns {Promise<string>} OAuth2 access token
 */
export async function mintAccessToken(serviceAccountEmail, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);

  // Build JWT header and claims
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600, // 1 hour
    scope: 'https://www.googleapis.com/auth/cloud-platform'
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const claimsB64 = base64urlEncode(JSON.stringify(claims));
  const unsignedJwt = `${headerB64}.${claimsB64}`;

  // Import the private key
  const keyBuffer = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign the JWT
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedJwt)
  );
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBuffer));
  const jwt = `${unsignedJwt}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Token exchange failed (${tokenResponse.status}): ${error}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}
