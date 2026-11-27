import { describe, expect, it } from 'vitest';
import {
  isNeonConfigured,
  loadWorkspaceFromNeon,
  normalizeWorkspaceId,
  validateWorkspacePayload,
} from '../server/neonDb';
import { createDemoState } from '../src/domain/seed';

describe('Neon PostgreSQL server persistence helpers', () => {
  it('normalizes valid workspace IDs and rejects invalid characters', () => {
    expect(normalizeWorkspaceId(undefined)).toBe('main');
    expect(normalizeWorkspaceId('')).toBe('main');
    expect(normalizeWorkspaceId('mts-darul-hikmah_2026')).toBe('mts-darul-hikmah_2026');
    expect(() => normalizeWorkspaceId('bad id with spaces')).toThrow();
    expect(() => normalizeWorkspaceId('../escape')).toThrow();
  });

  it('validates complete AppState payloads, defaults to Neon First and Figma Premium off, and rejects malformed payloads', () => {
    const valid = createDemoState();
    expect(valid.settings.databaseMode).toBe('neon');
    expect(valid.settings.figmaPremiumEnabled).toBe(false);
    expect(validateWorkspacePayload(valid)).toBe(valid);

    expect(() => validateWorkspacePayload(null)).toThrow();
    expect(() => validateWorkspacePayload({ ...valid, settings: null })).toThrow();
    expect(() => validateWorkspacePayload({ ...valid, teachers: 'not-an-array' })).toThrow();
  });

  it('falls back gracefully when DATABASE_URL is not configured', async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(isNeonConfigured()).toBe(false);
      const res = await loadWorkspaceFromNeon();
      expect(res).toEqual({
        configured: false,
        exists: false,
        state: null,
        updatedAt: null,
      });
    } finally {
      if (prev !== undefined) {
        process.env.DATABASE_URL = prev;
      }
    }
  });
});
