import { afterEach, beforeEach, vi } from 'vitest';
import jsPDFDefault, { jsPDF as jsPDFNamed, type jsPDF as JsPDFInstance } from 'jspdf';

type SaveFn = (
  this: JsPDFInstance,
  filename?: string,
  options?: { returnPromise?: boolean }
) => JsPDFInstance | Promise<void>;

type JsPDFConstructorWithAPI = {
  API?: {
    save?: SaveFn;
  };
};

function noopSave(
  this: JsPDFInstance,
  _filename?: string,
  options?: { returnPromise?: boolean }
): JsPDFInstance | Promise<void> {
  if (options?.returnPromise) {
    return Promise.resolve();
  }
  return this;
}

function collectJsPDFApis(): Array<NonNullable<JsPDFConstructorWithAPI['API']>> {
  const candidates: unknown[] = [
    jsPDFNamed,
    jsPDFDefault,
    (jsPDFDefault as unknown as { jsPDF?: unknown } | undefined)?.jsPDF,
  ];
  const apis = new Set<NonNullable<JsPDFConstructorWithAPI['API']>>();

  for (const candidate of candidates) {
    if (
      (typeof candidate === 'function' || (typeof candidate === 'object' && candidate !== null)) &&
      'API' in candidate
    ) {
      const api = (candidate as JsPDFConstructorWithAPI).API;
      if (api && typeof api === 'object') {
        apis.add(api);
      }
    }
  }

  return Array.from(apis);
}

const jsPdfApis = collectJsPDFApis();

function installFallbackNoopSave(): void {
  for (const api of jsPdfApis) {
    api.save = noopSave;
  }
}

// Pasang pengaman segera saat setup dimuat (sebelum modul tes menginisialisasi jsPDF).
installFallbackNoopSave();

beforeEach(() => {
  installFallbackNoopSave();
  for (const api of jsPdfApis) {
    vi.spyOn(api as { save: SaveFn }, 'save').mockImplementation(noopSave);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  installFallbackNoopSave();
});
