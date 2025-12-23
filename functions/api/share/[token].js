// API endpoint: /api/share/:token
// GET: Validate token and return analysis info
// POST: Claim the share (add current user to shared_analyses)

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../history/_db.js';

/**
 * GET /api/share/:token
 * Validates token and returns analysis info (for share link landing page)
 */
export async function onRequestGet(context) {
  const { request, env, params } = context;

  const token = params.token;
  if (!token) {
    return errorResponse('Token required', 400);
  }

  const sql = createSqlClient(env);

  try {
    // Find the token
    const tokens = await sql`
      SELECT st.*, a.title, u.email as owner_email
      FROM share_tokens st
      JOIN analyses a ON st.analysis_id = a.id
      JOIN users u ON st.owner_id = u.id
      WHERE st.token = ${token}
    `;

    if (tokens.length === 0) {
      return jsonResponse({ valid: false, error: 'not_found' });
    }

    const shareToken = tokens[0];

    // Check if token is active
    if (!shareToken.is_active) {
      return jsonResponse({ valid: false, error: 'revoked' });
    }

    // Check expiration
    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
      return jsonResponse({ valid: false, error: 'expired' });
    }

    // Check max uses
    if (shareToken.max_uses !== null && shareToken.use_count >= shareToken.max_uses) {
      return jsonResponse({ valid: false, error: 'max_uses_reached' });
    }

    return jsonResponse({
      valid: true,
      analysis_id: shareToken.analysis_id,
      title: shareToken.title,
      owner_email: shareToken.owner_email
    });

  } catch (error) {
    console.error('Error validating token:', error);
    return errorResponse('Failed to validate token: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * POST /api/share/:token/claim or /api/share/:token
 * Claims the share token and adds the current user to shared_analyses
 */
export async function onRequestPost(context) {
  const { request, env, params } = context;

  const email = getUserEmail(request);
  if (!email) {
    return unauthorizedResponse();
  }

  const token = params.token;
  if (!token) {
    return errorResponse('Token required', 400);
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Find and validate the token
    const tokens = await sql`
      SELECT st.*, a.user_id as analysis_owner_id
      FROM share_tokens st
      JOIN analyses a ON st.analysis_id = a.id
      WHERE st.token = ${token}
    `;

    if (tokens.length === 0) {
      return errorResponse('Share link not found', 404);
    }

    const shareToken = tokens[0];

    // Check if token is active
    if (!shareToken.is_active) {
      return errorResponse('Share link has been revoked', 410);
    }

    // Check expiration
    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
      return errorResponse('Share link has expired', 410);
    }

    // Check max uses
    if (shareToken.max_uses !== null && shareToken.use_count >= shareToken.max_uses) {
      return errorResponse('Share link has reached maximum uses', 410);
    }

    // Don't allow owner to claim their own share
    if (shareToken.analysis_owner_id === user.id) {
      return jsonResponse({
        success: true,
        analysis_id: shareToken.analysis_id,
        message: 'You own this analysis'
      });
    }

    // Check if user already has access
    const existingShare = await sql`
      SELECT id FROM shared_analyses
      WHERE analysis_id = ${shareToken.analysis_id}
      AND (shared_with_id = ${user.id} OR LOWER(shared_with_email) = LOWER(${email}))
    `;

    if (existingShare.length > 0) {
      // Already has access, just return success
      return jsonResponse({
        success: true,
        analysis_id: shareToken.analysis_id,
        message: 'Already have access'
      });
    }

    // Create the share entry
    await sql`
      INSERT INTO shared_analyses (analysis_id, owner_id, shared_with_id, shared_with_email)
      VALUES (${shareToken.analysis_id}, ${shareToken.owner_id}, ${user.id}, ${email.toLowerCase()})
    `;

    // Increment use count
    await sql`
      UPDATE share_tokens
      SET use_count = use_count + 1
      WHERE id = ${shareToken.id}
    `;

    return jsonResponse({
      success: true,
      analysis_id: shareToken.analysis_id
    });

  } catch (error) {
    console.error('Error claiming share:', error);
    return errorResponse('Failed to claim share: ' + error.message);
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
    default:
      return new Response('Method not allowed', { status: 405 });
  }
}
