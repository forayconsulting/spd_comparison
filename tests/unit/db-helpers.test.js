import { describe, it, expect } from 'vitest';
import {
  getUserEmail,
  requireAdmin,
  jsonResponse,
  errorResponse,
  unauthorizedResponse,
} from '../../functions/api/history/_db.js';

// Helper to create a mock Request with headers
function mockRequest(headers = {}, url = 'https://spd-matrix.example.com/api/test') {
  return new Request(url, {
    headers: new Headers(headers),
  });
}

describe('getUserEmail', () => {
  it('returns email from Cf-Access-Authenticated-User-Email header', () => {
    const req = mockRequest({ 'Cf-Access-Authenticated-User-Email': 'alice@example.com' });
    expect(getUserEmail(req)).toBe('alice@example.com');
  });

  it('returns email from CF_Authorization JWT cookie when header is absent', () => {
    // JWT payload: {"email":"bob@example.com"} base64 = eyJlbWFpbCI6ImJvYkBleGFtcGxlLmNvbSJ9
    const jwtPayload = btoa(JSON.stringify({ email: 'bob@example.com' }));
    const fakeJwt = `header.${jwtPayload}.signature`;
    const req = mockRequest({ Cookie: `CF_Authorization=${fakeJwt}; other=value` });
    expect(getUserEmail(req)).toBe('bob@example.com');
  });

  it('handles base64url encoding in JWT payload', () => {
    // Use base64url characters (- and _) instead of (+ and /)
    const payload = { email: 'user@example.com' };
    const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_');
    const fakeJwt = `header.${b64}.signature`;
    const req = mockRequest({ Cookie: `CF_Authorization=${fakeJwt}` });
    expect(getUserEmail(req)).toBe('user@example.com');
  });

  it('returns null for malformed JWT cookie', () => {
    const req = mockRequest({ Cookie: 'CF_Authorization=not.valid-json.here' });
    expect(getUserEmail(req)).toBeNull();
  });

  it('returns dev email for localhost requests', () => {
    const req = mockRequest({}, 'http://localhost:8788/api/test');
    expect(getUserEmail(req)).toBe('local-dev@test.com');
  });

  it('returns dev email for 127.0.0.1 requests', () => {
    const req = mockRequest({}, 'http://127.0.0.1:8788/api/test');
    expect(getUserEmail(req)).toBe('local-dev@test.com');
  });

  it('returns null for non-local requests with no auth', () => {
    const req = mockRequest({}, 'https://spd-matrix.example.com/api/test');
    expect(getUserEmail(req)).toBeNull();
  });

  it('prefers header over JWT cookie', () => {
    const jwtPayload = btoa(JSON.stringify({ email: 'cookie@example.com' }));
    const fakeJwt = `h.${jwtPayload}.s`;
    const req = mockRequest({
      'Cf-Access-Authenticated-User-Email': 'header@example.com',
      Cookie: `CF_Authorization=${fakeJwt}`,
    });
    expect(getUserEmail(req)).toBe('header@example.com');
  });
});

describe('requireAdmin', () => {
  it('returns null for admin users (allows through)', () => {
    expect(requireAdmin({ is_admin: true })).toBeNull();
  });

  it('returns 403 response for non-admin users', async () => {
    const response = requireAdmin({ is_admin: false });
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain('Admin');
  });
});

describe('response helpers', () => {
  it('jsonResponse returns JSON with correct status and content-type', async () => {
    const res = jsonResponse({ foo: 'bar' }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const body = await res.json();
    expect(body).toEqual({ foo: 'bar' });
  });

  it('jsonResponse defaults to status 200', () => {
    const res = jsonResponse({});
    expect(res.status).toBe(200);
  });

  it('errorResponse returns error JSON with correct status', async () => {
    const res = errorResponse('Something broke', 422);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('Something broke');
  });

  it('errorResponse defaults to status 500', () => {
    const res = errorResponse('fail');
    expect(res.status).toBe(500);
  });

  it('unauthorizedResponse returns 401 with error message', async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
  });
});
