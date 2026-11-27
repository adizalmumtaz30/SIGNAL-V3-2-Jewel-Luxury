import type { AppState } from '../domain/types';

export interface RemoteWorkspaceResult {
  configured: boolean;
  exists: boolean;
  state: AppState | null;
  updatedAt: string | null;
}

export interface RemoteSaveResult {
  ok: boolean;
  configured: boolean;
  updatedAt?: string;
}

function canUseBackendSync(): boolean {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
  const metaEnv = (import.meta as { env?: { MODE?: string } }).env;
  if (metaEnv?.MODE === 'test') return false;
  const procEnv = (globalThis as { process?: { env?: { VITEST?: string } } }).process?.env;
  if (procEnv?.VITEST) return false;
  return Boolean(window.location?.origin && window.location.origin !== 'null');
}

export async function fetchWorkspaceFromNeon(): Promise<RemoteWorkspaceResult | null> {
  if (!canUseBackendSync()) return null;
  try {
    const response = await fetch('/api/workspace', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<RemoteWorkspaceResult>;
    return {
      configured: Boolean(data.configured),
      exists: Boolean(data.exists),
      state: (data.state as AppState | null) ?? null,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    };
  } catch {
    return null;
  }
}

export async function pushWorkspaceToNeon(state: AppState): Promise<RemoteSaveResult | null> {
  if (!canUseBackendSync()) return null;
  try {
    const response = await fetch('/api/workspace', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ state }),
    });
    const data = (await response.json().catch(() => ({}))) as Partial<RemoteSaveResult>;
    return {
      ok: response.ok && Boolean(data.ok),
      configured: Boolean(data.configured),
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    };
  } catch {
    return null;
  }
}
