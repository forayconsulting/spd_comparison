// API endpoint: /api/workspaces
// GET - List workspaces the current user belongs to

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from './history/_db.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { request, env } = context;
  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);

    const workspaces = await sql`
      SELECT w.id, w.name, w.description, wm.role,
             (SELECT COUNT(*) FROM workspace_collections wc WHERE wc.workspace_id = w.id)::int as collection_count,
             (SELECT COUNT(*) FROM analyses a WHERE a.workspace_id = w.id)::int as analysis_count,
             (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspace_id = w.id)::int as member_count
      FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${user.id}
      WHERE w.is_active = true
      ORDER BY w.name ASC
    `;

    return jsonResponse({ workspaces });
  } catch (error) {
    console.error('List user workspaces error:', error);
    return errorResponse('Failed to list workspaces');
  } finally {
    await sql.end();
  }
}
