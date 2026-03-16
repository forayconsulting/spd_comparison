// Admin settings API endpoints
// GET  /api/admin/settings  → returns all app_settings (admin only)
// POST /api/admin/settings  → upserts setting key/value pairs (admin only)

import { createSqlClient, getOrCreateUser, getUserEmail, unauthorizedResponse, getAppSettings, requireAdmin, jsonResponse, errorResponse } from '../history/_db.js';

// Allowed setting keys (whitelist to prevent arbitrary data storage)
const ALLOWED_KEYS = new Set([
  'vertex_ai_enabled',
  'vertex_ai_project_id',
  'vertex_ai_location',
  'vertex_ai_service_account_email',
  'vertex_ai_private_key'
]);

export async function onRequestGet(context) {
  const { env, request } = context;

  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const denied = requireAdmin(user);
    if (denied) return denied;

    const settings = await getAppSettings(sql);
    // Mask private key in response (only indicate presence)
    if (settings.vertex_ai_private_key) {
      settings.vertex_ai_private_key_set = 'true';
      delete settings.vertex_ai_private_key;
    }
    return jsonResponse({ settings, is_admin: true });
  } catch (e) {
    return errorResponse('Failed to load settings: ' + e.message);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const denied = requireAdmin(user);
    if (denied) return denied;

    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return errorResponse('Missing settings object', 400);
    }

    // Upsert each setting
    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_KEYS.has(key)) {
        return errorResponse(`Invalid setting key: ${key}`, 400);
      }

      await sql`
        INSERT INTO app_settings (key, value, updated_by)
        VALUES (${key}, ${value}, ${user.id})
        ON CONFLICT (key)
        DO UPDATE SET value = ${value}, updated_by = ${user.id}, updated_at = NOW()
      `;
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to save settings: ' + e.message);
  }
}

// Reject other methods
export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return onRequestGet(context);
  if (method === 'POST') return onRequestPost(context);
  return new Response('Method not allowed', { status: 405 });
}
