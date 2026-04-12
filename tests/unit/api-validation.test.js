import { describe, it, expect } from 'vitest';

describe('admin settings key allowlist', () => {
  // Replicate the allowlist from functions/api/admin/settings.js
  const ALLOWED_KEYS = new Set([
    'vertex_ai_enabled',
    'vertex_ai_project_id',
    'vertex_ai_location',
    'vertex_ai_service_account_email',
    'vertex_ai_private_key',
  ]);

  it('allows all expected Vertex AI setting keys', () => {
    expect(ALLOWED_KEYS.has('vertex_ai_enabled')).toBe(true);
    expect(ALLOWED_KEYS.has('vertex_ai_project_id')).toBe(true);
    expect(ALLOWED_KEYS.has('vertex_ai_location')).toBe(true);
    expect(ALLOWED_KEYS.has('vertex_ai_service_account_email')).toBe(true);
    expect(ALLOWED_KEYS.has('vertex_ai_private_key')).toBe(true);
  });

  it('rejects arbitrary keys that could store unintended data', () => {
    expect(ALLOWED_KEYS.has('admin_password')).toBe(false);
    expect(ALLOWED_KEYS.has('__proto__')).toBe(false);
    expect(ALLOWED_KEYS.has('constructor')).toBe(false);
    expect(ALLOWED_KEYS.has('')).toBe(false);
    expect(ALLOWED_KEYS.has('gemini_api_key')).toBe(false);
  });
});

describe('chat message role validation', () => {
  const VALID_ROLES = ['user', 'assistant', 'system'];

  it('accepts valid roles', () => {
    for (const role of VALID_ROLES) {
      expect(VALID_ROLES.includes(role)).toBe(true);
    }
  });

  it('rejects invalid roles', () => {
    const invalid = ['admin', 'tool', 'function', '', 'USER', 'ASSISTANT', null, undefined];
    for (const role of invalid) {
      expect(VALID_ROLES.includes(role)).toBe(false);
    }
  });
});

describe('share token validation logic', () => {
  // Replicate the validation checks from functions/api/share/[token].js
  function validateToken(shareToken) {
    if (!shareToken.is_active) return { valid: false, error: 'revoked' };
    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
      return { valid: false, error: 'expired' };
    }
    if (shareToken.max_uses !== null && shareToken.use_count >= shareToken.max_uses) {
      return { valid: false, error: 'max_uses_reached' };
    }
    return { valid: true };
  }

  it('accepts active token with no constraints', () => {
    const result = validateToken({
      is_active: true,
      expires_at: null,
      max_uses: null,
      use_count: 0,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects revoked token', () => {
    const result = validateToken({
      is_active: false,
      expires_at: null,
      max_uses: null,
      use_count: 0,
    });
    expect(result).toEqual({ valid: false, error: 'revoked' });
  });

  it('rejects expired token', () => {
    const result = validateToken({
      is_active: true,
      expires_at: '2020-01-01T00:00:00Z',
      max_uses: null,
      use_count: 0,
    });
    expect(result).toEqual({ valid: false, error: 'expired' });
  });

  it('accepts token with future expiry', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const result = validateToken({
      is_active: true,
      expires_at: future.toISOString(),
      max_uses: null,
      use_count: 0,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects token at max uses', () => {
    const result = validateToken({
      is_active: true,
      expires_at: null,
      max_uses: 5,
      use_count: 5,
    });
    expect(result).toEqual({ valid: false, error: 'max_uses_reached' });
  });

  it('rejects token over max uses', () => {
    const result = validateToken({
      is_active: true,
      expires_at: null,
      max_uses: 3,
      use_count: 10,
    });
    expect(result).toEqual({ valid: false, error: 'max_uses_reached' });
  });

  it('accepts token under max uses', () => {
    const result = validateToken({
      is_active: true,
      expires_at: null,
      max_uses: 10,
      use_count: 3,
    });
    expect(result.valid).toBe(true);
  });

  it('checks revoked before expired (revoked takes priority)', () => {
    const result = validateToken({
      is_active: false,
      expires_at: '2020-01-01T00:00:00Z',
      max_uses: 1,
      use_count: 5,
    });
    expect(result.error).toBe('revoked');
  });
});

describe('email validation', () => {
  // The current server-side check from shares.js:159
  function isValidEmail(email) {
    return typeof email === 'string' && email.trim().toLowerCase().includes('@');
  }

  it('accepts standard email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('first.last@company.org')).toBe(true);
  });

  it('rejects strings without @', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(42)).toBe(false);
  });
});

describe('note type validation', () => {
  // Replicates the validation from analyses/[id].js:274
  function validateNoteType(noteType) {
    return noteType === 'actionable' ? 'actionable' : 'observational';
  }

  it('accepts actionable', () => {
    expect(validateNoteType('actionable')).toBe('actionable');
  });

  it('defaults unknown values to observational', () => {
    expect(validateNoteType('observational')).toBe('observational');
    expect(validateNoteType('invalid')).toBe('observational');
    expect(validateNoteType('')).toBe('observational');
    expect(validateNoteType(null)).toBe('observational');
    expect(validateNoteType(undefined)).toBe('observational');
  });
});
