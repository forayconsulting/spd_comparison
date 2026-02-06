// API endpoint: /api/history/analyses/:id
// GET: Load full analysis with chat messages
// PATCH: Append new chat messages
// DELETE: Delete an analysis

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  checkAnalysisAccess,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../_db.js';

/**
 * GET /api/history/analyses/:id
 * Returns full analysis including chat messages and notes with authorship
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

    // Check if user can access this analysis (owner or shared)
    const access = await checkAnalysisAccess(sql, user.id, email, analysisId);

    if (!access.canAccess) {
      return errorResponse('Analysis not found', 404);
    }

    const analysis = access.analysis;

    // Get chat messages for this analysis (user-specific: only their own messages)
    const chatMessages = await sql`
      SELECT id, role, content, created_at
      FROM chat_messages
      WHERE analysis_id = ${analysisId}
      ORDER BY created_at ASC
    `;

    // Get top-level notes with author info (parent_note_id IS NULL)
    const topLevelNotes = await sql`
      SELECT n.id, n.tab, n.anchor_text, n.anchor_prefix, n.anchor_suffix,
             n.content, n.note_type, n.created_at, n.updated_at, n.author_id,
             u.email as author_email
      FROM notes n
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.analysis_id = ${analysisId}
      AND n.parent_note_id IS NULL
      ORDER BY n.created_at ASC
    `;

    // Get all replies for these notes
    const replies = await sql`
      SELECT n.id, n.parent_note_id, n.content, n.created_at, n.updated_at, n.author_id,
             u.email as author_email
      FROM notes n
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.analysis_id = ${analysisId}
      AND n.parent_note_id IS NOT NULL
      ORDER BY n.created_at ASC
    `;

    // Build replies map
    const repliesMap = {};
    for (const reply of replies) {
      if (!repliesMap[reply.parent_note_id]) {
        repliesMap[reply.parent_note_id] = [];
      }
      repliesMap[reply.parent_note_id].push({
        id: reply.id,
        content: reply.content,
        author_email: reply.author_email,
        author_id: reply.author_id,
        created_at: reply.created_at,
        updated_at: reply.updated_at
      });
    }

    // Attach replies to top-level notes
    const notesWithReplies = topLevelNotes.map(note => ({
      id: note.id,
      tab: note.tab,
      anchor_text: note.anchor_text,
      anchor_prefix: note.anchor_prefix,
      anchor_suffix: note.anchor_suffix,
      content: note.content,
      note_type: note.note_type || 'observational',
      author_email: note.author_email,
      author_id: note.author_id,
      created_at: note.created_at,
      updated_at: note.updated_at,
      replies: repliesMap[note.id] || []
    }));

    return jsonResponse({
      id: analysis.id,
      title: analysis.title,
      created_at: analysis.created_at,
      updated_at: analysis.updated_at,
      file_metadata: analysis.file_metadata,
      summary_response: analysis.summary_response,
      comparison_response: analysis.comparison_response,
      language_response: analysis.language_response,
      table_view_state: analysis.table_view_state || null,
      draft_state: analysis.draft_state || null,
      is_owner: access.isOwner,
      owner_email: access.ownerEmail,
      chat_messages: chatMessages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.created_at
      })),
      notes: notesWithReplies
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
 * Updates analysis (title, file_metadata, chat messages, notes, replies)
 * Owner-only: title, file_metadata, new_messages
 * All users with access: add_note, update_note (own only), delete_note (own only), add_reply
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

  const { title, file_metadata, new_messages, add_note, update_note, delete_note, add_reply, table_view_state, draft_state } = body;

  // Need at least one field to update
  if (!title && !file_metadata && (!new_messages || !Array.isArray(new_messages)) && !add_note && !update_note && !delete_note && !add_reply && !table_view_state && draft_state === undefined) {
    return errorResponse('At least one update field is required', 400);
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Check access (owner or shared)
    const access = await checkAnalysisAccess(sql, user.id, email, analysisId);

    if (!access.canAccess) {
      return errorResponse('Analysis not found', 404);
    }

    // Owner-only operations: title, file_metadata, new_messages, table_view_state, draft_state
    if (title || file_metadata || new_messages || table_view_state || draft_state !== undefined) {
      if (!access.isOwner) {
        return errorResponse('Only the owner can update title, file metadata, chat messages, table view state, or draft state', 403);
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

      // Update table_view_state if provided (merge with existing)
      if (table_view_state && typeof table_view_state === 'object') {
        // Merge new view state with existing (per-tab)
        const existing = await sql`
          SELECT table_view_state FROM analyses WHERE id = ${analysisId}
        `;
        let merged = {};
        if (existing[0]?.table_view_state) {
          merged = typeof existing[0].table_view_state === 'string'
            ? JSON.parse(existing[0].table_view_state)
            : existing[0].table_view_state;
        }
        Object.assign(merged, table_view_state);
        await sql`
          UPDATE analyses SET table_view_state = ${JSON.stringify(merged)}, updated_at = NOW()
          WHERE id = ${analysisId}
        `;
      }

      // Update draft_state if provided (replace entirely)
      if (draft_state !== undefined) {
        await sql`
          UPDATE analyses SET draft_state = ${JSON.stringify(draft_state)}, updated_at = NOW()
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

      // Return success if we only had owner operations
      if (!add_note && !update_note && !delete_note && !add_reply) {
        return jsonResponse({ success: true });
      }
    }

    // Add note (any user with access can add)
    if (add_note) {
      const { tab, anchor_text, anchor_prefix, anchor_suffix, content, note_type } = add_note;

      if (!tab || !anchor_text || !content) {
        return errorResponse('add_note requires tab, anchor_text, and content', 400);
      }

      const noteType = note_type === 'actionable' ? 'actionable' : 'observational';

      const result = await sql`
        INSERT INTO notes (analysis_id, tab, anchor_text, anchor_prefix, anchor_suffix, content, author_id, note_type)
        VALUES (${analysisId}, ${tab}, ${anchor_text}, ${anchor_prefix || null}, ${anchor_suffix || null}, ${content}, ${user.id}, ${noteType})
        RETURNING id, created_at
      `;

      await sql`
        UPDATE analyses SET updated_at = NOW() WHERE id = ${analysisId}
      `;

      return jsonResponse({
        success: true,
        note_id: result[0].id,
        created_at: result[0].created_at,
        author_email: email
      });
    }

    // Add reply (any user with access can reply)
    if (add_reply) {
      const { parent_note_id, content } = add_reply;

      if (!parent_note_id || !content) {
        return errorResponse('add_reply requires parent_note_id and content', 400);
      }

      // Verify parent note exists and belongs to this analysis
      const parentNotes = await sql`
        SELECT id, tab, anchor_text, anchor_prefix, anchor_suffix
        FROM notes
        WHERE id = ${parent_note_id} AND analysis_id = ${analysisId}
      `;

      if (parentNotes.length === 0) {
        return errorResponse('Parent note not found', 404);
      }

      const parentNote = parentNotes[0];

      // Insert reply (reuse notes table with parent_note_id)
      const result = await sql`
        INSERT INTO notes (analysis_id, tab, anchor_text, anchor_prefix, anchor_suffix, content, author_id, parent_note_id)
        VALUES (${analysisId}, ${parentNote.tab}, ${parentNote.anchor_text}, ${parentNote.anchor_prefix}, ${parentNote.anchor_suffix}, ${content}, ${user.id}, ${parent_note_id})
        RETURNING id, created_at
      `;

      await sql`
        UPDATE analyses SET updated_at = NOW() WHERE id = ${analysisId}
      `;

      return jsonResponse({
        success: true,
        reply_id: result[0].id,
        created_at: result[0].created_at,
        author_email: email
      });
    }

    // Update note (only author can update their own notes)
    if (update_note) {
      const { note_id, content, note_type } = update_note;

      if (!note_id || (!content && !note_type)) {
        return errorResponse('update_note requires note_id and at least one of content or note_type', 400);
      }

      // Check note exists and user is author
      const notes = await sql`
        SELECT id, author_id FROM notes
        WHERE id = ${note_id} AND analysis_id = ${analysisId}
      `;

      if (notes.length === 0) {
        return errorResponse('Note not found', 404);
      }

      if (notes[0].author_id !== user.id) {
        return errorResponse('You can only edit your own notes', 403);
      }

      // Build update based on what fields are provided
      let result;
      if (content && note_type) {
        const validType = note_type === 'actionable' ? 'actionable' : 'observational';
        result = await sql`
          UPDATE notes SET content = ${content}, note_type = ${validType}
          WHERE id = ${note_id} AND analysis_id = ${analysisId}
          RETURNING id, updated_at
        `;
      } else if (note_type) {
        const validType = note_type === 'actionable' ? 'actionable' : 'observational';
        result = await sql`
          UPDATE notes SET note_type = ${validType}
          WHERE id = ${note_id} AND analysis_id = ${analysisId}
          RETURNING id, updated_at
        `;
      } else {
        result = await sql`
          UPDATE notes SET content = ${content}
          WHERE id = ${note_id} AND analysis_id = ${analysisId}
          RETURNING id, updated_at
        `;
      }

      await sql`
        UPDATE analyses SET updated_at = NOW() WHERE id = ${analysisId}
      `;

      return jsonResponse({ success: true, updated_at: result[0].updated_at });
    }

    // Delete note (only author can delete their own notes)
    if (delete_note) {
      const { note_id } = delete_note;

      if (!note_id) {
        return errorResponse('delete_note requires note_id', 400);
      }

      // Check note exists and user is author
      const notes = await sql`
        SELECT id, author_id FROM notes
        WHERE id = ${note_id} AND analysis_id = ${analysisId}
      `;

      if (notes.length === 0) {
        return errorResponse('Note not found', 404);
      }

      if (notes[0].author_id !== user.id) {
        return errorResponse('You can only delete your own notes', 403);
      }

      await sql`
        DELETE FROM notes
        WHERE id = ${note_id} AND analysis_id = ${analysisId}
      `;

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
