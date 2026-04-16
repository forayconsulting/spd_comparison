// API endpoint: /api/workspaces/:id
// GET - Workspace detail with collections summary (requires membership)

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  checkWorkspaceMembership,
  requireWorkspaceMember,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../history/_db.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { request, env, params } = context;
  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const workspaceId = params.id;

    const membership = await checkWorkspaceMembership(sql, user.id, workspaceId);
    const memberCheck = requireWorkspaceMember(membership);
    if (memberCheck) return memberCheck;

    const [workspace] = await sql`
      SELECT w.id, w.name, w.description, w.is_active, w.created_at, w.updated_at,
             u.email as created_by_email
      FROM workspaces w
      JOIN users u ON w.created_by = u.id
      WHERE w.id = ${workspaceId} AND w.is_active = true
    `;

    if (!workspace) {
      return errorResponse('Workspace not found', 404);
    }

    const collections = await sql`
      SELECT wc.id, wc.name, wc.description, wc.analysis_mode, wc.created_at, wc.updated_at,
             u.email as created_by_email,
             (SELECT COUNT(*) FROM workspace_documents wd WHERE wd.collection_id = wc.id)::int as document_count
      FROM workspace_collections wc
      JOIN users u ON wc.created_by = u.id
      WHERE wc.workspace_id = ${workspaceId}
      ORDER BY wc.created_at DESC
    `;

    const memberCount = await sql`
      SELECT COUNT(*)::int as count FROM workspace_members WHERE workspace_id = ${workspaceId}
    `;

    return jsonResponse({
      ...workspace,
      role: membership.role,
      member_count: memberCount[0].count,
      collections
    });
  } catch (error) {
    console.error('Get workspace error:', error);
    return errorResponse('Failed to get workspace');
  } finally {
    await sql.end();
  }
}
