import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const DEFAULT_WORKSPACE_ID = 'main';

export interface NeonWorkspaceRecord {
  configured: boolean;
  exists: boolean;
  state: Record<string, unknown> | null;
  updatedAt: string | null;
}

export interface NeonConnectionStatus {
  configured: boolean;
  connected: boolean;
  updatedAt: string | null;
  error?: string;
}

let cachedUrl: string | null = null;
let cachedSql: NeonQueryFunction<false, false> | null = null;
let schemaReadyPromise: Promise<void> | null = null;
let schemaReadyForUrl: string | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim() || '';
  if (!raw) return '';
  if (!raw.startsWith('postgres://') && !raw.startsWith('postgresql://')) {
    return '';
  }
  return raw;
}

export function isNeonConfigured(): boolean {
  return getDatabaseUrl().length > 0;
}

function getSqlClient(): NeonQueryFunction<false, false> | null {
  const url = getDatabaseUrl();
  if (!url) {
    cachedUrl = null;
    cachedSql = null;
    return null;
  }
  if (!cachedSql || cachedUrl !== url) {
    cachedUrl = url;
    cachedSql = neon(url);
    schemaReadyPromise = null;
    schemaReadyForUrl = null;
  }
  return cachedSql;
}

async function ensureSchema(sql: NeonQueryFunction<false, false>, url: string): Promise<void> {
  if (schemaReadyPromise && schemaReadyForUrl === url) {
    return schemaReadyPromise;
  }
  schemaReadyForUrl = url;
  schemaReadyPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS sakala_workspaces (
        id TEXT PRIMARY KEY,
        school_name TEXT NOT NULL DEFAULT '',
        data_mode TEXT NOT NULL DEFAULT 'demo',
        schema_version INTEGER NOT NULL DEFAULT 2,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  })().catch((err) => {
    schemaReadyPromise = null;
    schemaReadyForUrl = null;
    throw err;
  });

  return schemaReadyPromise;
}

export function normalizeWorkspaceId(rawId?: unknown): string {
  if (rawId === undefined || rawId === null || rawId === '') {
    return DEFAULT_WORKSPACE_ID;
  }
  if (typeof rawId !== 'string' || !WORKSPACE_ID_PATTERN.test(rawId)) {
    throw new Error('ID ruang kerja tidak valid.');
  }
  return rawId;
}

export function validateWorkspacePayload(candidate: unknown): Record<string, unknown> {
  if (!isPlainObject(candidate)) {
    throw new Error('Payload ruang kerja harus berupa objek JSON yang valid.');
  }
  if (!isPlainObject(candidate.settings)) {
    throw new Error('Bagian pengaturan (settings) pada ruang kerja tidak valid.');
  }
  if (typeof candidate.settings.schoolName !== 'string' || !Array.isArray(candidate.settings.activeDays)) {
    throw new Error('Identitas madrasah atau hari aktif pada pengaturan tidak lengkap.');
  }

  const requiredArrays = ['classes', 'teachers', 'subjects', 'requirements', 'slots', 'candidates', 'history'] as const;
  for (const field of requiredArrays) {
    if (!Array.isArray(candidate[field])) {
      throw new Error(`Struktur data '${field}' harus berupa array.`);
    }
  }

  if (candidate.draft !== null && candidate.draft !== undefined && !Array.isArray(candidate.draft)) {
    throw new Error('Format draft jadwal tidak valid.');
  }
  if (candidate.activeSchedule !== null && candidate.activeSchedule !== undefined && !Array.isArray(candidate.activeSchedule)) {
    throw new Error('Format jadwal aktif tidak valid.');
  }

  return candidate;
}

function toIsoStringOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

export async function checkNeonConnection(): Promise<NeonConnectionStatus> {
  const url = getDatabaseUrl();
  const sql = getSqlClient();
  if (!sql || !url) {
    return { configured: false, connected: false, updatedAt: null };
  }

  try {
    await ensureSchema(sql, url);
    const rows = await sql`
      SELECT updated_at
      FROM sakala_workspaces
      WHERE id = ${DEFAULT_WORKSPACE_ID}
      LIMIT 1
    `;
    const updatedAt = rows.length > 0 ? toIsoStringOrNull(rows[0]?.updated_at) : null;
    return {
      configured: true,
      connected: true,
      updatedAt,
    };
  } catch {
    return {
      configured: true,
      connected: false,
      updatedAt: null,
      error: 'Koneksi ke database Neon gagal. Periksa DATABASE_URL pada environment server.',
    };
  }
}

export async function loadWorkspaceFromNeon(rawWorkspaceId?: unknown): Promise<NeonWorkspaceRecord> {
  const workspaceId = normalizeWorkspaceId(rawWorkspaceId);
  const url = getDatabaseUrl();
  const sql = getSqlClient();
  if (!sql || !url) {
    return {
      configured: false,
      exists: false,
      state: null,
      updatedAt: null,
    };
  }

  await ensureSchema(sql, url);
  const rows = await sql`
    SELECT payload, updated_at
    FROM sakala_workspaces
    WHERE id = ${workspaceId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return {
      configured: true,
      exists: false,
      state: null,
      updatedAt: null,
    };
  }

  const row = rows[0];
  const payload = typeof row?.payload === 'string' ? JSON.parse(row.payload) : row?.payload;
  const validated = validateWorkspacePayload(payload);

  return {
    configured: true,
    exists: true,
    state: validated,
    updatedAt: toIsoStringOrNull(row?.updated_at),
  };
}

export async function saveWorkspaceToNeon(
  rawState: unknown,
  rawWorkspaceId?: unknown
): Promise<{ updatedAt: string }> {
  const workspaceId = normalizeWorkspaceId(rawWorkspaceId);
  const validatedState = validateWorkspacePayload(rawState);
  const url = getDatabaseUrl();
  const sql = getSqlClient();
  if (!sql || !url) {
    throw new Error('DATABASE_URL belum dikonfigurasi pada server.');
  }

  await ensureSchema(sql, url);

  const settings = validatedState.settings as Record<string, unknown>;
  const schoolName = typeof settings.schoolName === 'string' ? settings.schoolName.slice(0, 240) : '';
  const dataMode = validatedState.dataMode === 'custom' ? 'custom' : 'demo';
  const schemaVersion =
    typeof validatedState.schemaVersion === 'number' && Number.isFinite(validatedState.schemaVersion)
      ? Math.trunc(validatedState.schemaVersion)
      : 2;

  const serializedPayload = JSON.stringify(validatedState);
  const rows = await sql`
    INSERT INTO sakala_workspaces (id, school_name, data_mode, schema_version, payload, updated_at)
    VALUES (${workspaceId}, ${schoolName}, ${dataMode}, ${schemaVersion}, ${serializedPayload}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET
      school_name = EXCLUDED.school_name,
      data_mode = EXCLUDED.data_mode,
      schema_version = EXCLUDED.schema_version,
      payload = EXCLUDED.payload,
      updated_at = NOW()
    RETURNING updated_at
  `;

  const updatedAt = toIsoStringOrNull(rows[0]?.updated_at) ?? new Date().toISOString();
  return { updatedAt };
}
