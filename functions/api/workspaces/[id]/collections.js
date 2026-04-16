// API endpoint: /api/workspaces/:id/collections
// GET  - List collections in workspace (any member)
// POST - Create collection (workspace admin only)

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

    const collections = await sql`
      SELECT wc.id, wc.name, wc.description, wc.analysis_mode, wc.created_at, wc.updated_at,
             u.email as created_by_email,
             (SELECT COUNT(*) FROM workspace_documents wd WHERE wd.collection_id = wc.id)::int as document_count,
             (SELECT MAX(wd.created_at) FROM workspace_documents wd WHERE wd.collection_id = wc.id) as last_document_at
      FROM workspace_collections wc
      JOIN users u ON wc.created_by = u.id
      WHERE wc.workspace_id = ${workspaceId}
      ORDER BY wc.created_at DESC
    `;

    return jsonResponse({ collections });
  } catch (error) {
    console.error('List collections error:', error);
    return errorResponse('Failed to list collections');
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
    const adminCheck = requireWorkspaceAdmin(membership);
    if (adminCheck) return adminCheck;

    const body = await request.json();
    const { name, description, analysis_mode } = body;

    if (!name) {
      return errorResponse('name is required', 400);
    }

    const validModes = ['cross-plan', 'amendment-tracking', 'minutes-analysis', 'invoice-analysis'];
    const mode = validModes.includes(analysis_mode) ? analysis_mode : 'cross-plan';

    const [collection] = await sql`
      INSERT INTO workspace_collections (workspace_id, name, description, analysis_mode, created_by)
      VALUES (${workspaceId}, ${name}, ${description || null}, ${mode}, ${user.id})
      RETURNING id, name, description, analysis_mode, created_at
    `;

    return jsonResponse(collection, 201);
  } catch (error) {
    console.error('Create collection error:', error);
    return errorResponse('Failed to create collection');
  } finally {
    await sql.end();
  }
}
