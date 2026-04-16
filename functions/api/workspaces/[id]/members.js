// API endpoint: /api/workspaces/:id/members
// GET    - List members (any member)
// POST   - Add member (workspace admin only)
// PATCH  - Change role (workspace admin only)
// DELETE - Remove member (workspace admin only)

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
  if (method === 'POST') return handleAdd(context);
  if (method === 'PATCH') return handleChangeRole(context);
  if (method === 'DELETE') return handleRemove(context);
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

    const members = await sql`
      SELECT wm.id, wm.role, wm.created_at,
             u.id as user_id, u.email,
             adder.email as added_by_email
      FROM workspace_members wm
      JOIN users u ON wm.user_id = u.id
      LEFT JOIN users adder ON wm.added_by = adder.id
      WHERE wm.workspace_id = ${workspaceId}
      ORDER BY wm.role ASC, wm.created_at ASC
    `;

    return jsonResponse({ members });
  } catch (error) {
    console.error('List members error:', error);
    return errorResponse('Failed to list members');
  } finally {
    await sql.end();
  }
}

async function handleAdd({ request, env, params }) {
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
    const { email: memberEmail, role } = body;

    if (!memberEmail) {
      return errorResponse('email is required', 400);
    }

    const memberRole = role === 'admin' ? 'admin' : 'member';

    // Get or create the user
    const memberUser = await getOrCreateUser(sql, memberEmail);

    // Check if already a member
    const existing = await sql`
      SELECT id FROM workspace_members
      WHERE workspace_id = ${workspaceId} AND user_id = ${memberUser.id}
    `;
    if (existing.length > 0) {
      return errorResponse('User is already a workspace member', 409);
    }

    const [member] = await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role, added_by)
      VALUES (${workspaceId}, ${memberUser.id}, ${memberRole}, ${user.id})
      RETURNING id, role, created_at
    `;

    return jsonResponse({
      id: member.id,
      user_id: memberUser.id,
      email: memberEmail,
      role: member.role,
      created_at: member.created_at
    }, 201);
  } catch (error) {
    console.error('Add member error:', error);
    return errorResponse('Failed to add member');
  } finally {
    await sql.end();
  }
}

async function handleChangeRole({ request, env, params }) {
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
    const { user_id, role } = body;

    if (!user_id || !role) {
      return errorResponse('user_id and role are required', 400);
    }

    if (!['admin', 'member'].includes(role)) {
      return errorResponse('role must be admin or member', 400);
    }

    // Prevent demoting yourself if you're the last admin
    if (user_id === user.id && role === 'member') {
      const adminCount = await sql`
        SELECT COUNT(*)::int as count FROM workspace_members
        WHERE workspace_id = ${workspaceId} AND role = 'admin'
      `;
      if (adminCount[0].count <= 1) {
        return errorResponse('Cannot demote the last workspace admin', 400);
      }
    }

    const [updated] = await sql`
      UPDATE workspace_members SET role = ${role}
      WHERE workspace_id = ${workspaceId} AND user_id = ${user_id}
      RETURNING id, role
    `;

    if (!updated) {
      return errorResponse('Member not found', 404);
    }

    return jsonResponse({ success: true, role: updated.role });
  } catch (error) {
    console.error('Change role error:', error);
    return errorResponse('Failed to change role');
  } finally {
    await sql.end();
  }
}

async function handleRemove({ request, env, params }) {
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
    const { user_id } = body;

    if (!user_id) {
      return errorResponse('user_id is required', 400);
    }

    // Prevent removing the last admin
    if (user_id === user.id) {
      return errorResponse('Cannot remove yourself. Transfer admin role first.', 400);
    }

    const deleted = await sql`
      DELETE FROM workspace_members
      WHERE workspace_id = ${workspaceId} AND user_id = ${user_id}
      RETURNING id
    `;

    if (deleted.length === 0) {
      return errorResponse('Member not found', 404);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    return errorResponse('Failed to remove member');
  } finally {
    await sql.end();
  }
}
