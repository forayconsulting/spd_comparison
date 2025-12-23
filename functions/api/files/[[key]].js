// API endpoint: /api/files/[[key]]
// POST /api/files - Upload file to R2 storage
// GET /api/files/:userId/:analysisId/:filename - Download file from R2

import {
  createSqlClient,
  getUserEmail,
  getOrCreateUser,
  unauthorizedResponse,
  jsonResponse,
  errorResponse
} from '../history/_db.js';

/**
 * POST /api/files
 * Uploads a file to R2 storage
 * Request: multipart/form-data with 'file' and 'analysisId'
 * Returns: { r2Key, r2Etag, filename, size }
 */
async function handleUpload(context) {
  const { request, env } = context;

  // Check R2 binding
  if (!env.DOCUMENTS) {
    console.error('R2 bucket DOCUMENTS not bound. Check wrangler.toml');
    return errorResponse('Document storage not configured', 500);
  }

  const email = getUserEmail(request);
  if (!email) {
    return unauthorizedResponse();
  }

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');
    const analysisId = formData.get('analysisId');

    if (!file || !analysisId) {
      return errorResponse('file and analysisId are required', 400);
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return errorResponse('Only PDF files are supported', 400);
    }

    // Validate file size (20 MB limit)
    if (file.size > 20 * 1024 * 1024) {
      return errorResponse('File size exceeds 20 MB limit', 400);
    }

    // Verify user owns the analysis
    const analyses = await sql`
      SELECT id FROM analyses WHERE id = ${analysisId} AND user_id = ${user.id}
    `;

    if (analyses.length === 0) {
      return errorResponse('Analysis not found', 404);
    }

    // Sanitize filename for R2 key (keep alphanumeric, dots, underscores, hyphens)
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Generate R2 key: {userId}/{analysisId}/{filename}
    const r2Key = `${user.id}/${analysisId}/${safeFilename}`;

    // Upload to R2
    const r2Object = await env.DOCUMENTS.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: 'application/pdf',
        contentDisposition: `inline; filename="${file.name}"`
      },
      customMetadata: {
        originalFilename: file.name,
        uploadedAt: new Date().toISOString()
      }
    });

    return jsonResponse({
      r2Key,
      r2Etag: r2Object.etag,
      filename: file.name,
      size: file.size
    });

  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse('Upload failed: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * GET /api/files/:userId/:analysisId/:filename
 * Returns PDF file from R2 for viewing
 * Supports #page=N fragment for PDF page navigation (handled by browser)
 */
async function handleDownload(context) {
  const { request, env, params } = context;

  // Check R2 binding
  if (!env.DOCUMENTS) {
    console.error('R2 bucket DOCUMENTS not bound. Check wrangler.toml');
    return errorResponse('Document storage not configured', 500);
  }

  const email = getUserEmail(request);
  if (!email) {
    return unauthorizedResponse();
  }

  // Reconstruct the R2 key from path segments
  // params.key is an array of path segments: ['userId', 'analysisId', 'filename']
  const keyParts = params.key;
  if (!keyParts || keyParts.length < 3) {
    return errorResponse('Invalid file path', 400);
  }

  const r2Key = keyParts.join('/');
  const [keyUserId, analysisId] = keyParts;

  const sql = createSqlClient(env);

  try {
    const user = await getOrCreateUser(sql, email);

    // Security: User must own the analysis
    // Check if userId in key matches authenticated user's ID
    if (keyUserId !== user.id) {
      // Future: Check shared_analyses table here for sharing support
      return errorResponse('Access denied', 403);
    }

    // Verify analysis exists and belongs to user
    const analyses = await sql`
      SELECT id FROM analyses WHERE id = ${analysisId} AND user_id = ${user.id}
    `;

    if (analyses.length === 0) {
      return errorResponse('Analysis not found', 404);
    }

    // Get object from R2
    const object = await env.DOCUMENTS.get(r2Key);

    if (!object) {
      return errorResponse('File not found', 404);
    }

    // Return PDF with appropriate headers for browser viewing
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Type', 'application/pdf');

    // Use original filename from metadata if available
    const originalFilename = object.customMetadata?.originalFilename || 'document.pdf';
    headers.set('Content-Disposition', `inline; filename="${originalFilename}"`);

    // Cache for 1 hour (private - user-specific)
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('ETag', object.etag);

    return new Response(object.body, { headers });

  } catch (error) {
    console.error('Download error:', error);
    return errorResponse('Download failed: ' + error.message);
  } finally {
    await sql.end();
  }
}

/**
 * Route handler - dispatches based on method
 */
export async function onRequest(context) {
  const method = context.request.method;
  const keyParts = context.params.key;

  // POST to /api/files (no key parts) = upload
  if (method === 'POST' && (!keyParts || keyParts.length === 0)) {
    return handleUpload(context);
  }

  // GET with key parts = download
  if (method === 'GET' && keyParts && keyParts.length >= 3) {
    return handleDownload(context);
  }

  return new Response('Method not allowed', { status: 405 });
}
