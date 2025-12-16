// Database helper for Hyperdrive connection to Railway PostgreSQL
// Uses the 'postgres' package with Hyperdrive's connection string

import postgres from 'postgres';

/**
 * Create a SQL client using Hyperdrive connection
 * @param {Object} env - Environment bindings (contains DB Hyperdrive binding)
 * @returns {Function} postgres SQL tagged template function
 */
export function createSqlClient(env) {
  // Hyperdrive provides connectionString property
  return postgres(env.DB.connectionString, {
    // Hyperdrive handles connection pooling, so we use simple settings
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10
  });
}

/**
 * Get or create user by email
 * @param {Function} sql - postgres SQL client
 * @param {string} email - User email from Cloudflare Access
 * @returns {Promise<{id: string, email: string}>}
 */
export async function getOrCreateUser(sql, email) {
  // Try to find existing user
  const existing = await sql`
    SELECT id, email FROM users WHERE email = ${email}
  `;

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new user
  const created = await sql`
    INSERT INTO users (email) VALUES (${email})
    RETURNING id, email
  `;

  return created[0];
}

/**
 * Get authenticated user email from Cloudflare Access header
 * Falls back to a dev email for local testing
 * @param {Request} request
 * @returns {string|null}
 */
export function getUserEmail(request) {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');

  // In local dev (no Cloudflare Access), use a fallback email for testing
  if (!email) {
    const url = new URL(request.url);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return 'local-dev@test.com';
    }
  }

  return email;
}

/**
 * Create unauthorized response
 * @returns {Response}
 */
export function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ error: 'Unauthorized: No authenticated user' }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Create JSON response
 * @param {any} data
 * @param {number} status
 * @returns {Response}
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Create error response
 * @param {string} message
 * @param {number} status
 * @returns {Response}
 */
export function errorResponse(message, status = 500) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
