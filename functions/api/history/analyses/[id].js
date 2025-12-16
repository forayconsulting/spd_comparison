// API endpoint: /api/history/analyses/:id
// GET: Load full analysis with chat messages
// PATCH: Append new chat messages
// DELETE: Delete an analysis

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../_db.js';

/**
 * GET /api/history/analyses/:id
 * Returns full analysis including chat messages
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

    // Get analysis (only if it belongs to this user)
    const analyses = await sql`
      SELECT
        id,
        title,
        created_at,
        updated_at,
        file_metadata,
        summary_response,
        comparison_response,
        language_response
      FROM analyses
      WHERE id = ${analysisId} AND user_id = ${user.id}
    `;

    if (analyses.length === 0) {
      return errorResponse('Analysis not found', 404);
    }

    const analysis = analyses[0];

    // Get chat messages for this analysis
    const chatMessages = await sql`
      SELECT id, role, content, created_at
      FROM chat_messages
      WHERE analysis_id = ${analysisId}
      ORDER BY created_at ASC
    `;

    return jsonResponse({
      ...analysis,
      chat_messages: chatMessages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.created_at
      }))
    });
  } catch (error) {
    console.error('Error loading analysis:', error);
    return errorResponse('Failed to load analysis: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * PATCH /api/history/analyses/:id
 * Updates analysis (title and/or appends chat messages)
 */
export async function onRequestPatch(context) {
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

  const { title, new_messages } = body;

  // Need at least one field to update
  if (!title && (!new_messages || !Array.isArray(new_messages))) {
    return errorResponse('title or new_messages is required', 400);
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Verify analysis belongs to user
    const analyses = await sql`
      SELECT id FROM analyses
      WHERE id = ${analysisId} AND user_id = ${user.id}
    `;

    if (analyses.length === 0) {
      return errorResponse('Analysis not found', 404);
    }

    // Update title if provided
    if (title) {
      await sql`
        UPDATE analyses SET title = ${title}, updated_at = NOW()
        WHERE id = ${analysisId}
      `;
    }

    // Insert new chat messages if provided
    if (new_messages && Array.isArray(new_messages)) {
      for (const msg of new_messages) {
        if (msg.role && msg.content) {
          await sql`
            INSERT INTO chat_messages (analysis_id, role, content, created_at)
            VALUES (
              ${analysisId},
              ${msg.role},
              ${msg.content},
              ${msg.timestamp || new Date().toISOString()}
            )
          `;
        }
      }

      // Update analysis updated_at if we added messages
      if (!title) {
        await sql`
          UPDATE analyses SET updated_at = NOW() WHERE id = ${analysisId}
        `;
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Error updating analysis:', error);
    return errorResponse('Failed to update analysis: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * DELETE /api/history/analyses/:id
 * Deletes an analysis and its chat messages
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

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Delete analysis (CASCADE will handle chat_messages)
    const result = await sql`
      DELETE FROM analyses
      WHERE id = ${analysisId} AND user_id = ${user.id}
      RETURNING id
    `;

    if (result.length === 0) {
      return errorResponse('Analysis not found', 404);
    }

    return jsonResponse({ success: true, deleted: analysisId });
  } catch (error) {
    console.error('Error deleting analysis:', error);
    return errorResponse('Failed to delete analysis: ' + error.message);
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
    case 'PATCH':
      return onRequestPatch(context);
    case 'DELETE':
      return onRequestDelete(context);
    default:
      return new Response('Method not allowed', { status: 405 });
  }
}
