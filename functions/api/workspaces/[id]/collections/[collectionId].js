// API endpoint: /api/workspaces/:id/collections/:collectionId
// GET    - Collection detail with document list (any member)
// PATCH  - Update collection (workspace admin only)
// DELETE - Delete collection + documents (workspace admin only)

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  checkWorkspaceMembership,
  requireWorkspaceMember,
  requireWorkspaceAdmin,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../../../history/_db.js';

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return handleGet(context);
  if (method === 'PATCH') return handleUpdate(context);
  if (method === 'DELETE') return handleDelete(context);
  return new Response('Method not allowed', { status: 405 });
}

async function handleGet({ request, env, params }) {
  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const workspaceId = params.id;

    const membership = await checkWorkspaceMembership(sql, user.id, workspaceId);
    const memberCheck = requireWorkspaceMember(membership);
    if (memberCheck) return memberCheck;

    const collectionId = params.collectionId;

    const [collection] = await sql`
      SELECT wc.id, wc.name, wc.description, wc.analysis_mode, wc.created_at, wc.updated_at,
             u.email as created_by_email
      FROM workspace_collections wc
      JOIN users u ON wc.created_by = u.id
      WHERE wc.id = ${collectionId} AND wc.workspace_id = ${workspaceId}
    `;

    if (!collection) {
      return errorResponse('Collection not found', 404);
    }

    const documents = await sql`
      SELECT wd.id, wd.filename, wd.original_filename, wd.size, wd.mime_type,
             wd.r2_key, wd.created_at, u.email as uploaded_by_email
      FROM workspace_documents wd
      JOIN users u ON wd.uploaded_by = u.id
      WHERE wd.collection_id = ${collectionId}
      ORDER BY wd.created_at ASC
    `;

    const analysisCount = await sql`
      SELECT COUNT(*)::int as count FROM analyses
      WHERE collection_id = ${collectionId}
    `;

    return jsonResponse({
      ...collection,
      documents,
      analysis_count: analysisCount[0].count
    });
  } catch (error) {
    console.error('Get collection error:', error);
    return errorResponse('Failed to get collection');
  } finally {
    await sql.end();
  }
}

async function handleUpdate({ request, env, params }) {
  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const workspaceId = params.id;

    const membership = await checkWorkspaceMembership(sql, user.id, workspaceId);
    const adminCheck = requireWorkspaceAdmin(membership);
    if (adminCheck) return adminCheck;

    const collectionId = params.collectionId;
    const body = await request.json();
    const { name, description } = body;

    const [updated] = await sql`
      UPDATE workspace_collections SET
        name = COALESCE(${name ?? null}, name),
        description = COALESCE(${description ?? null}, description)
      WHERE id = ${collectionId} AND workspace_id = ${workspaceId}
      RETURNING id, name, description, updated_at
    `;

    if (!updated) {
      return errorResponse('Collection not found', 404);
    }

    return jsonResponse(updated);
  } catch (error) {
    console.error('Update collection error:', error);
    return errorResponse('Failed to update collection');
  } finally {
    await sql.end();
  }
}

async function handleDelete({ request, env, params }) {
  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const workspaceId = params.id;

    const membership = await checkWorkspaceMembership(sql, user.id, workspaceId);
    const adminCheck = requireWorkspaceAdmin(membership);
    if (adminCheck) return adminCheck;

    const collectionId = params.collectionId;

    // Get all documents to delete from R2
    const documents = await sql`
      SELECT r2_key FROM workspace_documents
      WHERE collection_id = ${collectionId} AND workspace_id = ${workspaceId}
    `;

    // Delete R2 objects (best-effort)
    if (env.DOCUMENTS) {
      for (const doc of documents) {
        try {
          await env.DOCUMENTS.delete(doc.r2_key);
        } catch (e) {
          console.warn(`Failed to delete R2 object ${doc.r2_key}:`, e);
        }
      }
    }

    // Delete collection (cascades to workspace_documents)
    const deleted = await sql`
      DELETE FROM workspace_collections
      WHERE id = ${collectionId} AND workspace_id = ${workspaceId}
      RETURNING id
    `;

    if (deleted.length === 0) {
      return errorResponse('Collection not found', 404);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Delete collection error:', error);
    return errorResponse('Failed to delete collection');
  } finally {
    await sql.end();
  }
}
