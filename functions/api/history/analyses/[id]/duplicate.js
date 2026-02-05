// API endpoint: /api/history/analyses/:id/duplicate
// POST: Create a full copy of an analysis (outputs, files, chat messages, notes)

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  checkAnalysisAccess,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../../_db.js';

const MAX_ANALYSES = 20;

/**
 * POST /api/history/analyses/:id/duplicate
 * Creates a full server-side copy of an analysis owned by the current user
 */
export async function onRequestPost(context) {
  const { request, env, params } = context;

  const email = getUserEmail(request);
  if (!email) {
    return unauthorizedResponse();
  }

  const sourceId = params.id;
  if (!sourceId) {
    return errorResponse('Analysis ID required', 400);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional (title override)
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Check if user can access the source analysis (owner or shared)
    const access = await checkAnalysisAccess(sql, user.id, email, sourceId);
    if (!access.canAccess) {
      return errorResponse('Analysis not found', 404);
    }

    const source = access.analysis;

    // Enforce 20-analysis limit: delete oldest if at limit
    await sql`
      DELETE FROM analyses
      WHERE id IN (
        SELECT id FROM analyses
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
        OFFSET ${MAX_ANALYSES - 1}
      )
    `;

    // Determine title for the copy
    const newTitle = body.title || `Copy of ${source.title || 'Untitled'}`;

    // Insert new analysis row copying outputs and view state
    const result = await sql`
      INSERT INTO analyses (
        user_id, title, file_metadata, summary_response,
        comparison_response, language_response, table_view_state
      )
      VALUES (
        ${user.id},
        ${newTitle},
        ${source.file_metadata ? JSON.stringify(source.file_metadata) : null},
        ${source.summary_response || null},
        ${source.comparison_response || null},
        ${source.language_response || null},
        ${source.table_view_state ? JSON.stringify(source.table_view_state) : null}
      )
      RETURNING id, created_at
    `;

    const newId = result[0].id;

    // Copy R2 files with new keys under the new user's namespace
    let fileMetadata = source.file_metadata;
    if (typeof fileMetadata === 'string') {
      try { fileMetadata = JSON.parse(fileMetadata); } catch { fileMetadata = []; }
    }

    if (env.DOCUMENTS && Array.isArray(fileMetadata) && fileMetadata.length > 0) {
      const updatedMetadata = [];

      for (const file of fileMetadata) {
        const updatedFile = { ...file };

        if (file.r2Key) {
          // Build new R2 key under current user's namespace
          const sanitizedFilename = file.r2Key.split('/').pop();
          const newKey = `${user.id}/${newId}/${sanitizedFilename}`;

          try {
            // Read source object from R2
            const sourceObj = await env.DOCUMENTS.get(file.r2Key);
            if (sourceObj) {
              // Write to new key
              const putResult = await env.DOCUMENTS.put(newKey, sourceObj.body, {
                httpMetadata: sourceObj.httpMetadata,
                customMetadata: sourceObj.customMetadata
              });
              updatedFile.r2Key = newKey;
              updatedFile.r2Etag = putResult?.etag || null;
            }
          } catch (e) {
            console.warn(`Failed to copy R2 object ${file.r2Key}:`, e);
            // Keep original metadata but clear r2Key since copy failed
            updatedFile.r2Key = null;
            updatedFile.r2Etag = null;
          }
        }

        updatedMetadata.push(updatedFile);
      }

      // Update the new analysis with corrected R2 keys
      await sql`
        UPDATE analyses SET file_metadata = ${JSON.stringify(updatedMetadata)}
        WHERE id = ${newId}
      `;
    }

    // Copy chat messages
    const chatMessages = await sql`
      SELECT role, content, created_at
      FROM chat_messages
      WHERE analysis_id = ${sourceId}
      ORDER BY created_at ASC
    `;

    for (const msg of chatMessages) {
      await sql`
        INSERT INTO chat_messages (analysis_id, role, content, created_at)
        VALUES (${newId}, ${msg.role}, ${msg.content}, ${msg.created_at})
      `;
    }

    // Copy notes (top-level first, then replies with remapped parent IDs)
    const topLevelNotes = await sql`
      SELECT id, tab, anchor_text, anchor_prefix, anchor_suffix, content, created_at
      FROM notes
      WHERE analysis_id = ${sourceId} AND parent_note_id IS NULL
      ORDER BY created_at ASC
    `;

    // Map old note IDs to new note IDs for reply remapping
    const noteIdMap = {};

    for (const note of topLevelNotes) {
      const newNote = await sql`
        INSERT INTO notes (analysis_id, tab, anchor_text, anchor_prefix, anchor_suffix, content, author_id, created_at)
        VALUES (${newId}, ${note.tab}, ${note.anchor_text}, ${note.anchor_prefix}, ${note.anchor_suffix}, ${note.content}, ${user.id}, ${note.created_at})
        RETURNING id
      `;
      noteIdMap[note.id] = newNote[0].id;
    }

    // Copy replies with remapped parent_note_id
    const replies = await sql`
      SELECT id, parent_note_id, tab, anchor_text, anchor_prefix, anchor_suffix, content, created_at
      FROM notes
      WHERE analysis_id = ${sourceId} AND parent_note_id IS NOT NULL
      ORDER BY created_at ASC
    `;

    for (const reply of replies) {
      const newParentId = noteIdMap[reply.parent_note_id];
      if (newParentId) {
        await sql`
          INSERT INTO notes (analysis_id, tab, anchor_text, anchor_prefix, anchor_suffix, content, author_id, parent_note_id, created_at)
          VALUES (${newId}, ${reply.tab}, ${reply.anchor_text}, ${reply.anchor_prefix}, ${reply.anchor_suffix}, ${reply.content}, ${user.id}, ${newParentId}, ${reply.created_at})
        `;
      }
    }

    return jsonResponse({
      success: true,
      analysis_id: newId,
      title: newTitle,
      created_at: result[0].created_at
    }, 201);
  } catch (error) {
    console.error('Error duplicating analysis:', error);
    return errorResponse('Failed to duplicate analysis: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * Route handler - only POST allowed
 */
export async function onRequest(context) {
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return new Response('Method not allowed', { status: 405 });
}
