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
    SELECT id, email, is_admin FROM users WHERE email = ${email}
  `;

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new user
  const created = await sql`
    INSERT INTO users (email) VALUES (${email})
    RETURNING id, email, is_admin
  `;

  return created[0];
}

/**
 * Get all app settings as a key-value object
 * @param {Function} sql - postgres SQL client
 * @returns {Promise<Object>} { key: value, ... }
 */
export async function getAppSettings(sql) {
  const rows = await sql`SELECT key, value FROM app_settings`;
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

/**
 * Return a 403 Response if user is not an admin
 * @param {Object} user - User object with is_admin field
 * @returns {Response|null} 403 Response if not admin, null if admin
 */
export function requireAdmin(user) {
  if (!user.is_admin) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: Admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return null;
}

/**
 * Check workspace membership and role
 * @param {Function} sql - postgres SQL client
 * @param {string} userId - User's UUID
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<{isMember: boolean, role: string|null}>}
 */
export async function checkWorkspaceMembership(sql, userId, workspaceId) {
  const result = await sql`
    SELECT role FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
  `;
  if (result.length === 0) return { isMember: false, role: null };
  return { isMember: true, role: result[0].role };
}

/**
 * Return a 403 Response if user is not a workspace admin
 * @param {{isMember: boolean, role: string|null}} membership
 * @returns {Response|null}
 */
export function requireWorkspaceAdmin(membership) {
  if (!membership.isMember || membership.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Workspace admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return null;
}

/**
 * Return a 403 Response if user is not a workspace member
 * @param {{isMember: boolean, role: string|null}} membership
 * @returns {Response|null}
 */
export function requireWorkspaceMember(membership) {
  if (!membership.isMember) {
    return new Response(
      JSON.stringify({ error: 'Workspace membership required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return null;
}

/**
 * Check if a user can access an analysis (owner, shared, or workspace member)
 * @param {Function} sql - postgres SQL client
 * @param {string} userId - User's UUID
 * @param {string} userEmail - User's email (for checking pending shares)
 * @param {string} analysisId - Analysis UUID
 * @returns {Promise<{canAccess: boolean, isOwner: boolean, isWorkspaceMember?: boolean, workspaceRole?: string, analysis: object|null, ownerEmail: string|null}>}
 */
export async function checkAnalysisAccess(sql, userId, userEmail, analysisId) {
  // First check if user owns the analysis
  const owned = await sql`
    SELECT a.*, u.email as owner_email
    FROM analyses a
    JOIN users u ON a.user_id = u.id
    WHERE a.id = ${analysisId} AND a.user_id = ${userId}
  `;

  if (owned.length > 0) {
    return {
      canAccess: true,
      isOwner: true,
      analysis: owned[0],
      ownerEmail: owned[0].owner_email
    };
  }

  // Check if analysis is shared with this user (by user_id or email)
  const shared = await sql`
    SELECT a.*, u.email as owner_email
    FROM analyses a
    JOIN users u ON a.user_id = u.id
    JOIN shared_analyses sa ON sa.analysis_id = a.id
    WHERE a.id = ${analysisId}
    AND (sa.shared_with_id = ${userId} OR LOWER(sa.shared_with_email) = LOWER(${userEmail}))
    LIMIT 1
  `;

  if (shared.length > 0) {
    // Update shared_with_id if it was a pending email share
    await sql`
      UPDATE shared_analyses
      SET shared_with_id = ${userId}
      WHERE analysis_id = ${analysisId}
      AND LOWER(shared_with_email) = LOWER(${userEmail})
      AND shared_with_id IS NULL
    `;

    return {
      canAccess: true,
      isOwner: false,
      analysis: shared[0],
      ownerEmail: shared[0].owner_email
    };
  }

  // Check workspace membership (for workspace-scoped analyses)
  const wsAnalysis = await sql`
    SELECT a.*, u.email as owner_email
    FROM analyses a
    JOIN users u ON a.user_id = u.id
    WHERE a.id = ${analysisId} AND a.workspace_id IS NOT NULL
  `;

  if (wsAnalysis.length > 0) {
    const membership = await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${wsAnalysis[0].workspace_id} AND user_id = ${userId}
    `;
    if (membership.length > 0) {
      return {
        canAccess: true,
        isOwner: false,
        isWorkspaceMember: true,
        workspaceRole: membership[0].role,
        analysis: wsAnalysis[0],
        ownerEmail: wsAnalysis[0].owner_email
      };
    }
  }

  return {
    canAccess: false,
    isOwner: false,
    analysis: null,
    ownerEmail: null
  };
}

/**
 * Get authenticated user email from Cloudflare Access header
 * Falls back to a dev email for local testing
 * @param {Request} request
 * @returns {string|null}
 */
export function getUserEmail(request) {
  // Primary: Cloudflare Access injects this header
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (email) return email;

  // Fallback: parse email from CF_Authorization JWT cookie
  // (header may not be injected for Pages Functions on some domain configurations)
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/CF_Authorization=([^;]+)/);
  if (match) {
    try {
      const payload = match[1].split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      if (decoded.email) return decoded.email;
    } catch (e) {
      // Invalid JWT, fall through
    }
  }

  // Local dev fallback
  const url = new URL(request.url);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return 'local-dev@test.com';
  }

  return null;
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
