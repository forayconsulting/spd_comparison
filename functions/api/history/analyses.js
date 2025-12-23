// API endpoint: /api/history/analyses
// GET: List user's last 20 analyses
// POST: Create new analysis (enforces 20-limit)

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from './_db.js';

const MAX_ANALYSES = 20;

/**
 * GET /api/history/analyses
 * Returns user's analyses (owned + shared with them)
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  const email = getUserEmail(request);
  if (!email) {
    return unauthorizedResponse();
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Get owned analyses
    const ownedAnalyses = await sql`
      SELECT id, title, created_at, file_metadata
      FROM analyses
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT ${MAX_ANALYSES}
    `;

    // Get shared analyses (shared with this user by email or user_id)
    const sharedAnalyses = await sql`
      SELECT a.id, a.title, a.created_at, a.file_metadata, u.email as owner_email
      FROM analyses a
      JOIN shared_analyses sa ON sa.analysis_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE sa.shared_with_id = ${user.id}
         OR LOWER(sa.shared_with_email) = LOWER(${email})
      ORDER BY a.created_at DESC
      LIMIT ${MAX_ANALYSES}
    `;

    // Format results
    const owned = ownedAnalyses.map(a => ({
      ...a,
      is_owner: true
    }));

    const shared = sharedAnalyses.map(a => ({
      id: a.id,
      title: a.title,
      created_at: a.created_at,
      file_metadata: a.file_metadata,
      is_owner: false,
      owner_email: a.owner_email
    }));

    return jsonResponse({
      current_user_email: email,
      analyses: owned,
      shared_analyses: shared
    });
  } catch (error) {
    console.error('Error listing analyses:', error);
    return errorResponse('Failed to list analyses: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * POST /api/history/analyses
 * Creates new analysis record
 * Enforces 20-limit by deleting oldest if at limit
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  const email = getUserEmail(request);
  if (!email) {
    return unauthorizedResponse();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { title, file_metadata, summary_response, comparison_response, language_response } = body;

  if (!file_metadata || !Array.isArray(file_metadata)) {
    return errorResponse('file_metadata is required and must be an array', 400);
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Enforce 20-analysis limit: delete oldest if at limit
    // This deletes any analyses beyond the 19 most recent (making room for the new one)
    await sql`
      DELETE FROM analyses
      WHERE id IN (
        SELECT id FROM analyses
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
        OFFSET ${MAX_ANALYSES - 1}
      )
    `;

    // Insert new analysis
    const result = await sql`
      INSERT INTO analyses (
        user_id,
        title,
        file_metadata,
        summary_response,
        comparison_response,
        language_response
      )
      VALUES (
        ${user.id},
        ${title || 'Untitled Analysis'},
        ${JSON.stringify(file_metadata)},
        ${summary_response || null},
        ${comparison_response || null},
        ${language_response || null}
      )
      RETURNING id, created_at
    `;

    return jsonResponse(result[0], 201);
  } catch (error) {
    console.error('Error creating analysis:', error);
    return errorResponse('Failed to create analysis: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * Reject other methods
 */
export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') {
    return onRequestGet(context);
  }
  if (method === 'POST') {
    return onRequestPost(context);
  }
  return new Response('Method not allowed', { status: 405 });
}
