// API endpoint: /api/admin/workspaces
// GET  - List all workspaces (system admin only)
// POST - Create workspace with initial admin (system admin only)

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  requireAdmin,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../history/_db.js';

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'GET') return handleList(context);
  if (method === 'POST') return handleCreate(context);
  return new Response('Method not allowed', { status: 405 });
}

async function handleList({ request, env }) {
  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const adminCheck = requireAdmin(user);
    if (adminCheck) return adminCheck;

    const workspaces = await sql`
      SELECT w.id, w.name, w.description, w.is_active, w.created_at, w.updated_at,
             u.email as created_by_email,
             (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id)::int as member_count,
             (SELECT COUNT(*) FROM workspace_collections wc WHERE wc.workspace_id = w.id)::int as collection_count,
             (SELECT COUNT(*) FROM analyses a WHERE a.workspace_id = w.id)::int as analysis_count
      FROM workspaces w
      JOIN users u ON w.created_by = u.id
      ORDER BY w.created_at DESC
    `;

    return jsonResponse({ workspaces });
  } catch (error) {
    console.error('List workspaces error:', error);
    return errorResponse('Failed to list workspaces');
  } finally {
    await sql.end();
  }
}

async function handleCreate({ request, env }) {
  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const adminCheck = requireAdmin(user);
    if (adminCheck) return adminCheck;

    const body = await request.json();
    const { name, description, admin_email } = body;

    if (!name || !admin_email) {
      return errorResponse('name and admin_email are required', 400);
    }

    // Get or create the workspace admin user
    const adminUser = await getOrCreateUser(sql, admin_email);

    // Create workspace
    const [workspace] = await sql`
      INSERT INTO workspaces (name, description, created_by)
      VALUES (${name}, ${description || null}, ${user.id})
      RETURNING id, name, created_at
    `;

    // Add the designated admin as workspace admin
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role, added_by)
      VALUES (${workspace.id}, ${adminUser.id}, 'admin', ${user.id})
    `;

    // Also add the system admin as a member if they're a different person
    if (adminUser.id !== user.id) {
      await sql`
        INSERT INTO workspace_members (workspace_id, user_id, role, added_by)
        VALUES (${workspace.id}, ${user.id}, 'admin', ${user.id})
        ON CONFLICT (workspace_id, user_id) DO NOTHING
      `;
    }

    return jsonResponse({
      id: workspace.id,
      name: workspace.name,
      created_at: workspace.created_at,
      admin_email: admin_email
    }, 201);
  } catch (error) {
    console.error('Create workspace error:', error);
    return errorResponse('Failed to create workspace');
  } finally {
    await sql.end();
  }
}
