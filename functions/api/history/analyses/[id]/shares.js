// API endpoint: /api/history/analyses/:id/shares
// GET: List all shares for an analysis (owner only)
// POST: Create new share (email or link)
// DELETE: Handled via [[shareId]].js for specific share revocation

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../../_db.js';

/**
 * Generate a cryptographically secure token
 * @returns {string} 64-character hex string
 */
function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * GET /api/history/analyses/:id/shares
 * Returns all shares for the analysis (owner only)
 */
export async function onRequestGet(context) {
  const { request, env, params } = context;

  const email = getUserEmail(request);
  if (!email) {
    return unauthorizedResponse();
  }

  const analysisId = params.id;
  if (!analysisId) {
    return errorResponse('Analysis ID required', 400);
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Verify user is the owner
    const analyses = await sql`
      SELECT id FROM analyses
      WHERE id = ${analysisId} AND user_id = ${user.id}
    `;

    if (analyses.length === 0) {
      return errorResponse('Analysis not found or you are not the owner', 404);
    }

    // Get email shares
    const emailShares = await sql`
      SELECT id, shared_with_email, shared_with_id, created_at
      FROM shared_analyses
      WHERE analysis_id = ${analysisId} AND owner_id = ${user.id}
      ORDER BY created_at DESC
    `;

    // Get link shares
    const linkShares = await sql`
      SELECT id, token, expires_at, max_uses, use_count, is_active, created_at
      FROM share_tokens
      WHERE analysis_id = ${analysisId} AND owner_id = ${user.id}
      ORDER BY created_at DESC
    `;

    // Build base URL for share links
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    return jsonResponse({
      email_shares: emailShares.map(share => ({
        id: share.id,
        shared_with_email: share.shared_with_email,
        shared_with_id: share.shared_with_id,
        created_at: share.created_at
      })),
      link_shares: linkShares.map(share => ({
        id: share.id,
        token: share.token,
        url: `${baseUrl}/?share=${share.token}`,
        expires_at: share.expires_at,
        max_uses: share.max_uses,
        use_count: share.use_count,
        is_active: share.is_active,
        created_at: share.created_at
      }))
    });
  } catch (error) {
    console.error('Error listing shares:', error);
    return errorResponse('Failed to list shares: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * POST /api/history/analyses/:id/shares
 * Create a new share (email or link)
 * Body: { type: 'email', email: '...' } or { type: 'link', expires_in_days?: number, max_uses?: number }
 */
export async function onRequestPost(context) {
  const { request, env, params } = context;

  const email = getUserEmail(request);
  if (!email) {
    return unauthorizedResponse();
  }

  const analysisId = params.id;
  if (!analysisId) {
    return errorResponse('Analysis ID required', 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { type } = body;
  if (!type || (type !== 'email' && type !== 'link')) {
    return errorResponse('type must be "email" or "link"', 400);
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Verify user is the owner
    const analyses = await sql`
      SELECT id FROM analyses
      WHERE id = ${analysisId} AND user_id = ${user.id}
    `;

    if (analyses.length === 0) {
      return errorResponse('Analysis not found or you are not the owner', 404);
    }

    if (type === 'email') {
      const { email: shareEmail } = body;

      if (!shareEmail || typeof shareEmail !== 'string') {
        return errorResponse('email is required for email shares', 400);
      }

      // Normalize email
      const normalizedEmail = shareEmail.trim().toLowerCase();

      // Check if email is valid
      if (!normalizedEmail.includes('@')) {
        return errorResponse('Invalid email address', 400);
      }

      // Don't allow sharing with yourself
      if (normalizedEmail === email.toLowerCase()) {
        return errorResponse('Cannot share with yourself', 400);
      }

      // Check if already shared
      const existing = await sql`
        SELECT id FROM shared_analyses
        WHERE analysis_id = ${analysisId} AND LOWER(shared_with_email) = ${normalizedEmail}
      `;

      if (existing.length > 0) {
        return errorResponse('Already shared with this email', 409);
      }

      // Check if user exists (to link shared_with_id)
      const existingUser = await sql`
        SELECT id FROM users WHERE LOWER(email) = ${normalizedEmail}
      `;

      const sharedWithId = existingUser.length > 0 ? existingUser[0].id : null;

      // Create share
      const result = await sql`
        INSERT INTO shared_analyses (analysis_id, owner_id, shared_with_id, shared_with_email)
        VALUES (${analysisId}, ${user.id}, ${sharedWithId}, ${normalizedEmail})
        RETURNING id, created_at
      `;

      return jsonResponse({
        success: true,
        share_id: result[0].id,
        shared_with_email: normalizedEmail,
        created_at: result[0].created_at
      });

    } else if (type === 'link') {
      const { expires_in_days, max_uses } = body;

      // Calculate expiration
      let expiresAt = null;
      if (expires_in_days && typeof expires_in_days === 'number' && expires_in_days > 0) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + expires_in_days);
        expiresAt = expirationDate.toISOString();
      }

      // Validate max_uses
      let maxUses = null;
      if (max_uses && typeof max_uses === 'number' && max_uses > 0) {
        maxUses = max_uses;
      }

      // Generate token
      const token = generateToken();

      // Create share token
      const result = await sql`
        INSERT INTO share_tokens (analysis_id, owner_id, token, expires_at, max_uses)
        VALUES (${analysisId}, ${user.id}, ${token}, ${expiresAt}, ${maxUses})
        RETURNING id, created_at
      `;

      // Build URL
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      const shareUrl = `${baseUrl}/?share=${token}`;

      return jsonResponse({
        success: true,
        share_id: result[0].id,
        token: token,
        url: shareUrl,
        expires_at: expiresAt,
        max_uses: maxUses,
        created_at: result[0].created_at
      });
    }

  } catch (error) {
    console.error('Error creating share:', error);
    return errorResponse('Failed to create share: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * DELETE /api/history/analyses/:id/shares
 * Deletes a share by ID (passed in body: { share_id, share_type: 'email' | 'link' })
 */
export async function onRequestDelete(context) {
  const { request, env, params } = context;

  const email = getUserEmail(request);
  if (!email) {
    return unauthorizedResponse();
  }

  const analysisId = params.id;
  if (!analysisId) {
    return errorResponse('Analysis ID required', 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { share_id, share_type } = body;
  if (!share_id) {
    return errorResponse('share_id is required', 400);
  }
  if (!share_type || (share_type !== 'email' && share_type !== 'link')) {
    return errorResponse('share_type must be "email" or "link"', 400);
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Verify user is the owner
    const analyses = await sql`
      SELECT id FROM analyses
      WHERE id = ${analysisId} AND user_id = ${user.id}
    `;

    if (analyses.length === 0) {
      return errorResponse('Analysis not found or you are not the owner', 404);
    }

    if (share_type === 'email') {
      const result = await sql`
        DELETE FROM shared_analyses
        WHERE id = ${share_id} AND analysis_id = ${analysisId} AND owner_id = ${user.id}
        RETURNING id
      `;

      if (result.length === 0) {
        return errorResponse('Share not found', 404);
      }
    } else if (share_type === 'link') {
      const result = await sql`
        DELETE FROM share_tokens
        WHERE id = ${share_id} AND analysis_id = ${analysisId} AND owner_id = ${user.id}
        RETURNING id
      `;

      if (result.length === 0) {
        return errorResponse('Share token not found', 404);
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Error deleting share:', error);
    return errorResponse('Failed to delete share: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * Route handler
 */
export async function onRequest(context) {
  const method = context.request.method;

  switch (method) {
    case 'GET':
      return onRequestGet(context);
    case 'POST':
      return onRequestPost(context);
    case 'DELETE':
      return onRequestDelete(context);
    default:
      return new Response('Method not allowed', { status: 405 });
  }
}
