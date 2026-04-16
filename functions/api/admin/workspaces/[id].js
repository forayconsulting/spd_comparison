// API endpoint: /api/admin/workspaces/:id
// GET    - Workspace detail (system admin only)
// PATCH  - Update workspace (system admin only)
// DELETE - Soft delete workspace (system admin only)

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  requireAdmin,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../../history/_db.js';

export async function onRequest(context) {
  const { request } = context;
  const method = request.method;

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
    const adminCheck = requireAdmin(user);
    if (adminCheck) return adminCheck;

    const workspaceId = params.id;

    const [workspace] = await sql`
      SELECT w.*, u.email as created_by_email
      FROM workspaces w
      JOIN users u ON w.created_by = u.id
      WHERE w.id = ${workspaceId}
    `;

    if (!workspace) {
      return errorResponse('Workspace not found', 404);
    }

    const members = await sql`
      SELECT wm.id, wm.role, wm.created_at, u.id as user_id, u.email
      FROM workspace_members wm
      JOIN users u ON wm.user_id = u.id
      WHERE wm.workspace_id = ${workspaceId}
      ORDER BY wm.role ASC, wm.created_at ASC
    `;

    const collections = await sql`
      SELECT wc.id, wc.name, wc.description, wc.analysis_mode, wc.created_at,
             (SELECT COUNT(*) FROM workspace_documents wd WHERE wd.collection_id = wc.id)::int as document_count
      FROM workspace_collections wc
      WHERE wc.workspace_id = ${workspaceId}
      ORDER BY wc.created_at DESC
    `;

    return jsonResponse({
      ...workspace,
      members,
      collections
    });
  } catch (error) {
    console.error('Get workspace error:', error);
    return errorResponse('Failed to get workspace');
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
    const adminCheck = requireAdmin(user);
    if (adminCheck) return adminCheck;

    const workspaceId = params.id;
    const body = await request.json();
    const { name, description, is_active } = body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return errorResponse('No fields to update', 400);
    }

    // Build dynamic update
    const [updated] = await sql`
      UPDATE workspaces SET
        name = COALESCE(${updates.name ?? null}, name),
        description = COALESCE(${updates.description ?? null}, description),
        is_active = COALESCE(${updates.is_active ?? null}, is_active)
      WHERE id = ${workspaceId}
      RETURNING id, name, description, is_active, updated_at
    `;

    if (!updated) {
      return errorResponse('Workspace not found', 404);
    }

    return jsonResponse(updated);
  } catch (error) {
    console.error('Update workspace error:', error);
    return errorResponse('Failed to update workspace');
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
    const adminCheck = requireAdmin(user);
    if (adminCheck) return adminCheck;

    const workspaceId = params.id;

    // Soft delete: set is_active = false
    const [updated] = await sql`
      UPDATE workspaces SET is_active = false
      WHERE id = ${workspaceId}
      RETURNING id
    `;

    if (!updated) {
      return errorResponse('Workspace not found', 404);
    }

    return jsonResponse({ success: true, id: workspaceId });
  } catch (error) {
    console.error('Delete workspace error:', error);
    return errorResponse('Failed to delete workspace');
  } finally {
    await sql.end();
  }
}
