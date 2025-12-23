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

    // Get notes for this analysis
    const notes = await sql`
      SELECT id, tab, anchor_text, anchor_prefix, anchor_suffix, content, created_at, updated_at
      FROM notes
      WHERE analysis_id = ${analysisId}
    `;

    return jsonResponse({
      ...analysis,
      chat_messages: chatMessages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.created_at
      })),
      notes: notes
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

  const { title, file_metadata, new_messages, add_note, update_note, delete_note } = body;

  // Need at least one field to update
  if (!title && !file_metadata && (!new_messages || !Array.isArray(new_messages)) && !add_note && !update_note && !delete_note) {
    return errorResponse('At least one update field is required', 400);
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

    // Update file_metadata if provided (used to add R2 keys after upload)
    if (file_metadata && Array.isArray(file_metadata)) {
      await sql`
        UPDATE analyses SET file_metadata = ${JSON.stringify(file_metadata)}, updated_at = NOW()
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

    // Add note
    if (add_note) {
      const { tab, anchor_text, anchor_prefix, anchor_suffix, content } = add_note;

      if (!tab || !anchor_text || !content) {
        return errorResponse('add_note requires tab, anchor_text, and content', 400);
      }

      const result = await sql`
        INSERT INTO notes (analysis_id, tab, anchor_text, anchor_prefix, anchor_suffix, content)
        VALUES (${analysisId}, ${tab}, ${anchor_text}, ${anchor_prefix || null}, ${anchor_suffix || null}, ${content})
        RETURNING id, created_at
      `;

      await sql`
        UPDATE analyses SET updated_at = NOW() WHERE id = ${analysisId}
      `;

      return jsonResponse({ success: true, note_id: result[0].id, created_at: result[0].created_at });
    }

    // Update note
    if (update_note) {
      const { note_id, content } = update_note;

      if (!note_id || !content) {
        return errorResponse('update_note requires note_id and content', 400);
      }

      const result = await sql`
        UPDATE notes SET content = ${content}
        WHERE id = ${note_id} AND analysis_id = ${analysisId}
        RETURNING id, updated_at
      `;

      if (result.length === 0) {
        return errorResponse('Note not found', 404);
      }

      await sql`
        UPDATE analyses SET updated_at = NOW() WHERE id = ${analysisId}
      `;

      return jsonResponse({ success: true, updated_at: result[0].updated_at });
    }

    // Delete note
    if (delete_note) {
      const { note_id } = delete_note;

      if (!note_id) {
        return errorResponse('delete_note requires note_id', 400);
      }

      const result = await sql`
        DELETE FROM notes
        WHERE id = ${note_id} AND analysis_id = ${analysisId}
        RETURNING id
      `;

      if (result.length === 0) {
        return errorResponse('Note not found', 404);
      }

      await sql`
        UPDATE analyses SET updated_at = NOW() WHERE id = ${analysisId}
      `;

      return jsonResponse({ success: true });
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

    // First, get the analysis to retrieve file_metadata for R2 cleanup
    const analyses = await sql`
      SELECT id, file_metadata FROM analyses
      WHERE id = ${analysisId} AND user_id = ${user.id}
    `;

    if (analyses.length === 0) {
      return errorResponse('Analysis not found', 404);
    }

    const analysis = analyses[0];

    // Delete R2 objects if they exist
    if (env.DOCUMENTS && analysis.file_metadata) {
      let fileMetadata = analysis.file_metadata;
      if (typeof fileMetadata === 'string') {
        try {
          fileMetadata = JSON.parse(fileMetadata);
        } catch {
          fileMetadata = [];
        }
      }

      if (Array.isArray(fileMetadata)) {
        for (const file of fileMetadata) {
          if (file.r2Key) {
            try {
              await env.DOCUMENTS.delete(file.r2Key);
            } catch (e) {
              console.warn(`Failed to delete R2 object ${file.r2Key}:`, e);
              // Continue - don't fail deletion if R2 cleanup fails
            }
          }
        }
      }
    }

    // Delete analysis (CASCADE will handle chat_messages and notes)
    await sql`
      DELETE FROM analyses
      WHERE id = ${analysisId} AND user_id = ${user.id}
    `;

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
