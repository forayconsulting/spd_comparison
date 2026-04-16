// API endpoint: /api/workspaces/:id/analyses
// GET  - List analyses in workspace (any member)
// POST - Create workspace analysis from collection (any member)

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  checkWorkspaceMembership,
  requireWorkspaceMember,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../../history/_db.js';

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return handleList(context);
  if (method === 'POST') return handleCreate(context);
  return new Response('Method not allowed', { status: 405 });
}

async function handleList({ request, env, params }) {
  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const workspaceId = params.id;

    const membership = await checkWorkspaceMembership(sql, user.id, workspaceId);
    const memberCheck = requireWorkspaceMember(membership);
    if (memberCheck) return memberCheck;

    const analyses = await sql`
      SELECT a.id, a.title, a.created_at, a.updated_at, a.file_metadata, a.analysis_mode,
             a.collection_id, wc.name as collection_name,
             u.email as creator_email,
             CASE WHEN a.summary_response IS NOT NULL THEN true ELSE false END as has_summary,
             CASE WHEN a.comparison_response IS NOT NULL THEN true ELSE false END as has_comparison,
             CASE WHEN a.language_response IS NOT NULL THEN true ELSE false END as has_language
      FROM analyses a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN workspace_collections wc ON a.collection_id = wc.id
      WHERE a.workspace_id = ${workspaceId}
      ORDER BY a.created_at DESC
    `;

    return jsonResponse({ analyses });
  } catch (error) {
    console.error('List workspace analyses error:', error);
    return errorResponse('Failed to list workspace analyses');
  } finally {
    await sql.end();
  }
}

async function handleCreate({ request, env, params }) {
  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const workspaceId = params.id;

    const membership = await checkWorkspaceMembership(sql, user.id, workspaceId);
    const memberCheck = requireWorkspaceMember(membership);
    if (memberCheck) return memberCheck;

    const body = await request.json();
    const { collection_id, title } = body;

    if (!collection_id) {
      return errorResponse('collection_id is required', 400);
    }

    // Verify collection belongs to this workspace and get its details
    const [collection] = await sql`
      SELECT id, name, analysis_mode FROM workspace_collections
      WHERE id = ${collection_id} AND workspace_id = ${workspaceId}
    `;
    if (!collection) {
      return errorResponse('Collection not found in this workspace', 404);
    }

    // Get all documents in the collection (snapshot)
    const documents = await sql`
      SELECT original_filename as filename, size, mime_type, r2_key, r2_etag, created_at
      FROM workspace_documents
      WHERE collection_id = ${collection_id}
      ORDER BY created_at ASC
    `;

    if (documents.length === 0) {
      return errorResponse('Collection has no documents. Upload documents before creating an analysis.', 400);
    }

    // Build file_metadata in the same format as personal analyses
    const fileMetadata = documents.map(doc => ({
      filename: doc.filename,
      size: Number(doc.size),
      mimeType: doc.mime_type,
      r2Key: doc.r2_key,
      r2Etag: doc.r2_etag,
      uploadedAt: doc.created_at
    }));

    const analysisTitle = title || `${collection.name} Analysis`;

    // Create analysis linked to workspace and collection
    const [analysis] = await sql`
      INSERT INTO analyses (
        user_id, title, file_metadata, analysis_mode, workspace_id, collection_id
      ) VALUES (
        ${user.id},
        ${analysisTitle},
        ${JSON.stringify(fileMetadata)},
        ${collection.analysis_mode},
        ${workspaceId},
        ${collection_id}
      )
      RETURNING id, created_at
    `;

    return jsonResponse({
      id: analysis.id,
      created_at: analysis.created_at,
      analysis_mode: collection.analysis_mode,
      file_count: documents.length
    }, 201);
  } catch (error) {
    console.error('Create workspace analysis error:', error);
    return errorResponse('Failed to create workspace analysis');
  } finally {
    await sql.end();
  }
}
