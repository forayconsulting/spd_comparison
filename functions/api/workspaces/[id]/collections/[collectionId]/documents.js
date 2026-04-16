// API endpoint: /api/workspaces/:id/collections/:collectionId/documents
// POST   - Upload document to collection (workspace admin only)
// DELETE - Delete document from collection (workspace admin only)

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  checkWorkspaceMembership,
  requireWorkspaceAdmin,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../../../../history/_db.js';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain'
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'POST') return handleUpload(context);
  if (method === 'DELETE') return handleDelete(context);
  return new Response('Method not allowed', { status: 405 });
}

async function handleUpload({ request, env, params }) {
  if (!env.DOCUMENTS) {
    return errorResponse('Document storage not configured', 500);
  }

  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const workspaceId = params.id;
    const collectionId = params.collectionId;

    const membership = await checkWorkspaceMembership(sql, user.id, workspaceId);
    const adminCheck = requireWorkspaceAdmin(membership);
    if (adminCheck) return adminCheck;

    // Verify collection belongs to workspace
    const [collection] = await sql`
      SELECT id FROM workspace_collections
      WHERE id = ${collectionId} AND workspace_id = ${workspaceId}
    `;
    if (!collection) {
      return errorResponse('Collection not found', 404);
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return errorResponse('file is required', 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return errorResponse(`File type not allowed: ${file.type}`, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(`File too large. Maximum size is 20 MB.`, 400);
    }

    // Sanitize filename
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const r2Key = `workspaces/${workspaceId}/${collectionId}/${sanitizedFilename}`;

    // Upload to R2
    const isPdf = file.type === 'application/pdf';
    const r2Object = await env.DOCUMENTS.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `${isPdf ? 'inline' : 'attachment'}; filename="${file.name}"`
      },
      customMetadata: {
        originalFilename: file.name,
        uploadedAt: new Date().toISOString(),
        workspaceId,
        collectionId
      }
    });

    // Insert document record
    const [doc] = await sql`
      INSERT INTO workspace_documents
        (collection_id, workspace_id, filename, original_filename, size, mime_type, r2_key, r2_etag, uploaded_by)
      VALUES
        (${collectionId}, ${workspaceId}, ${sanitizedFilename}, ${file.name}, ${file.size}, ${file.type}, ${r2Key}, ${r2Object.etag}, ${user.id})
      RETURNING id, filename, original_filename, size, mime_type, r2_key, r2_etag, created_at
    `;

    return jsonResponse(doc, 201);
  } catch (error) {
    console.error('Upload document error:', error);
    return errorResponse('Failed to upload document');
  } finally {
    await sql.end();
  }
}

async function handleDelete({ request, env, params }) {
  if (!env.DOCUMENTS) {
    return errorResponse('Document storage not configured', 500);
  }

  const email = getUserEmail(request);
  if (!email) return unauthorizedResponse();

  const sql = createSqlClient(env);
  try {
    const user = await getOrCreateUser(sql, email);
    const workspaceId = params.id;
    const collectionId = params.collectionId;

    const membership = await checkWorkspaceMembership(sql, user.id, workspaceId);
    const adminCheck = requireWorkspaceAdmin(membership);
    if (adminCheck) return adminCheck;

    const body = await request.json();
    const { document_id } = body;

    if (!document_id) {
      return errorResponse('document_id is required', 400);
    }

    // Find the document
    const [doc] = await sql`
      SELECT id, r2_key FROM workspace_documents
      WHERE id = ${document_id} AND collection_id = ${collectionId} AND workspace_id = ${workspaceId}
    `;

    if (!doc) {
      return errorResponse('Document not found', 404);
    }

    // Delete from R2 (best-effort)
    try {
      await env.DOCUMENTS.delete(doc.r2_key);
    } catch (e) {
      console.warn(`Failed to delete R2 object ${doc.r2_key}:`, e);
    }

    // Delete DB record
    await sql`DELETE FROM workspace_documents WHERE id = ${document_id}`;

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    return errorResponse('Failed to delete document');
  } finally {
    await sql.end();
  }
}
