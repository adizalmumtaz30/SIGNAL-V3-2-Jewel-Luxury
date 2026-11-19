import type { AppSettings, AppState } from '../../types';
import type {
  DocumentKind,
  DocumentNumberingConfig,
  NumberingResetMode,
} from '../types';

export const DEFAULT_KIND_CODES: Record<DocumentKind, string> = {
  SURAT_MASUK: 'SM',
  SURAT_KELUAR: 'S.Kel',
  SK: 'SK',
  SURAT_TUGAS: 'ST',
  UNDANGAN: 'Und',
  SURAT_KETERANGAN: 'Ket',
  BERITA_ACARA: 'BA',
  NOTULA: 'Not',
  LAPORAN: 'Lap',
  LAINNYA: 'Umum',
};

export const DEFAULT_NUMBERING_PATTERN =
  '{SEQ}/{KODE_SURAT}/{KODE_MADRASAH}/{BULAN_ROMAWI}/{TAHUN}';

const ROMAN_MONTHS = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
] as const;

export function formatRomanMonth(monthOneBased: number): string {
  const idx = Math.max(1, Math.min(12, Math.trunc(monthOneBased))) - 1;
  return ROMAN_MONTHS[idx];
}

export function deriveMadrasahAbbreviation(schoolName?: string): string {
  const clean = (schoolName ?? '').trim();
  if (!clean) return 'MDR';
  const words = clean
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'MDR';
  if (words[0].toUpperCase() === 'MTS' || words[0].toUpperCase() === 'MA' || words[0].toUpperCase() === 'MI') {
    const rest = words
      .slice(1)
      .map((w) => w[0].toUpperCase())
      .join('');
    return rest ? `${words[0]}.${rest}` : words[0].toUpperCase();
  }
  return words
    .slice(0, 4)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function normalizeDocumentNumberingConfig(
  raw?: Partial<DocumentNumberingConfig> | null,
  settings?: Pick<AppSettings, 'schoolName'>
): DocumentNumberingConfig {
  const madrasahCode =
    typeof raw?.madrasahCode === 'string' && raw.madrasahCode.trim()
      ? raw.madrasahCode.trim()
      : deriveMadrasahAbbreviation(settings?.schoolName);

  const formatPattern =
    typeof raw?.formatPattern === 'string' && raw.formatPattern.trim()
      ? raw.formatPattern.trim()
      : DEFAULT_NUMBERING_PATTERN;

  const seqPadding =
    typeof raw?.seqPadding === 'number' && Number.isFinite(raw.seqPadding)
      ? Math.max(2, Math.min(6, Math.trunc(raw.seqPadding)))
      : 3;

  const resetMode: NumberingResetMode =
    raw?.resetMode === 'MONTHLY' || raw?.resetMode === 'CONTINUOUS'
      ? raw.resetMode
      : 'YEARLY';

  const kindCodes: Partial<Record<DocumentKind, string>> = { ...DEFAULT_KIND_CODES };
  if (raw?.kindCodes && typeof raw.kindCodes === 'object') {
    for (const [k, v] of Object.entries(raw.kindCodes)) {
      if (typeof v === 'string' && v.trim()) {
        kindCodes[k as DocumentKind] = v.trim();
      }
    }
  }

  const startingSequence =
    typeof raw?.startingSequence === 'number' && Number.isFinite(raw.startingSequence)
      ? Math.max(1, Math.min(999999, Math.trunc(raw.startingSequence)))
      : 1;

  return {
    enabled: raw?.enabled ?? true,
    madrasahCode,
    formatPattern,
    seqPadding,
    resetMode,
    startingSequence,
    kindCodes,
  };
}

function extractIsoYearAndMonth(isoDate: string): { year: string; month: number } {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec((isoDate ?? '').trim());
  if (!m) {
    const now = new Date();
    return {
      year: String(now.getUTCFullYear()),
      month: now.getUTCMonth() + 1,
    };
  }
  return {
    year: m[1],
    month: Math.max(1, Math.min(12, Number(m[2]) || 1)),
  };
}

function buildPeriodKey(resetMode: NumberingResetMode, year: string, month: number): string {
  if (resetMode === 'CONTINUOUS') return 'ALL';
  if (resetMode === 'MONTHLY') return `${year}-${String(month).padStart(2, '0')}`;
  return year;
}

function extractLeadingSequenceNumber(docNumber: string): number | null {
  const trimmed = docNumber.trim();
  const leading = /^(\d{1,6})\s*[/.-]/.exec(trimmed);
  if (leading) {
    const n = Number(leading[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const anySeq = /\b(\d{2,6})\b/.exec(trimmed);
  if (anySeq) {
    const n = Number(anySeq[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export interface NextNumberCandidateResult {
  suggestedNumber: string;
  nextSequence: number;
  periodKey: string;
  kindCode: string;
  config: DocumentNumberingConfig;
}

/**
 * Menghitung saran nomor surat resmi berikutnya secara read-only (tanpa mengonsumsi urutan di state).
 * Memeriksa koleksi `state.documents` dan `state.documentVersions` agar bebas bentrok.
 */
export function computeNextSequentialNumber(params: {
  state: AppState;
  kind: DocumentKind;
  documentDate: string;
  configOverride?: Partial<DocumentNumberingConfig>;
  excludeDocumentId?: string | null;
}): NextNumberCandidateResult {
  const { state, kind, documentDate, configOverride, excludeDocumentId } = params;
  const config = normalizeDocumentNumberingConfig(
    configOverride ?? state.settings.documentNumbering,
    state.settings
  );

  const { year, month } = extractIsoYearAndMonth(documentDate);
  const targetPeriodKey = buildPeriodKey(config.resetMode, year, month);
  const kindCode = config.kindCodes[kind] ?? DEFAULT_KIND_CODES[kind] ?? 'DOC';
  const romanMonth = formatRomanMonth(month);
  const twoDigitMonth = String(month).padStart(2, '0');

  let maxSeq = 0;

  const inspectRecord = (num: string | null | undefined, dateStr: string, docId?: string) => {
    if (!num || !num.trim()) return;
    if (excludeDocumentId && docId === excludeDocumentId) return;
    const { year: rYear, month: rMonth } = extractIsoYearAndMonth(dateStr);
    const rPeriodKey = buildPeriodKey(config.resetMode, rYear, rMonth);
    if (rPeriodKey !== targetPeriodKey) return;
    const seq = extractLeadingSequenceNumber(num);
    if (seq !== null && seq > maxSeq) {
      maxSeq = seq;
    }
  };

  for (const doc of state.documents ?? []) {
    if (doc.direction === 'INCOMING') continue;
    inspectRecord(doc.documentNumber, doc.documentDate, doc.id);
  }
  for (const ver of state.documentVersions ?? []) {
    inspectRecord(ver.documentNumber, ver.documentDate, ver.documentId);
  }

  let candidateSeq = Math.max(maxSeq + 1, config.startingSequence ?? 1);
  let suggestedNumber = '';

  for (let guard = 0; guard < 500; guard += 1) {
    const padded = String(candidateSeq).padStart(config.seqPadding, '0');
    const formatted = config.formatPattern
      .replaceAll('{SEQ}', padded)
      .replaceAll('{KODE_SURAT}', kindCode)
      .replaceAll('{KODE_MADRASAH}', config.madrasahCode)
      .replaceAll('{BULAN_ROMAWI}', romanMonth)
      .replaceAll('{BULAN}', twoDigitMonth)
      .replaceAll('{TAHUN}', year);

    if (!isDocumentNumberDuplicate(formatted, state, excludeDocumentId)) {
      suggestedNumber = formatted;
      break;
    }
    candidateSeq += 1;
  }

  if (!suggestedNumber) {
    suggestedNumber = `${String(candidateSeq).padStart(config.seqPadding, '0')}/${kindCode}/${config.madrasahCode}/${romanMonth}/${year}`;
  }

  return {
    suggestedNumber,
    nextSequence: candidateSeq,
    periodKey: targetPeriodKey,
    kindCode,
    config,
  };
}

export function normalizeDocumentNumberKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isDocumentNumberDuplicate(
  candidateNumber: string,
  state: AppState,
  excludeDocumentId?: string | null
): boolean {
  const key = normalizeDocumentNumberKey(candidateNumber);
  if (!key) return false;

  for (const doc of state.documents ?? []) {
    if (excludeDocumentId && doc.id === excludeDocumentId) continue;
    if (doc.documentNumber && normalizeDocumentNumberKey(doc.documentNumber) === key) {
      return true;
    }
  }

  for (const ver of state.documentVersions ?? []) {
    if (excludeDocumentId && ver.documentId === excludeDocumentId) continue;
    if (ver.documentNumber && normalizeDocumentNumberKey(ver.documentNumber) === key) {
      return true;
    }
  }

  return false;
}

export function validateOfficialDocumentNumber(
  candidateNumber: string,
  state: AppState,
  excludeDocumentId?: string | null
): { valid: boolean; error?: string; normalized: string } {
  const normalized = candidateNumber.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { valid: false, error: 'Nomor surat resmi wajib diisi sebelum finalisasi.', normalized };
  }
  if (normalized.length < 3 || normalized.length > 100) {
    return {
      valid: false,
      error: 'Nomor surat resmi harus terdiri dari 3–100 karakter.',
      normalized,
    };
  }
  if (/\{\{[^}]+\}\}|\[Nomor Terbit/i.test(normalized)) {
    return {
      valid: false,
      error: 'Nomor surat tidak boleh masih mengandung placeholder token.',
      normalized,
    };
  }
  if (!/^[A-Za-z0-9./\-_\s]+$/.test(normalized)) {
    return {
      valid: false,
      error: 'Nomor surat hanya boleh berisi huruf, angka, spasi, titik, garis miring (/), atau tanda hubung.',
      normalized,
    };
  }
  if (isDocumentNumberDuplicate(normalized, state, excludeDocumentId)) {
    return {
      valid: false,
      error: `Nomor surat "${normalized}" sudah terdaftar pada dokumen/versi lain di arsip. Gunakan nomor lain untuk mencegah duplikasi.`,
      normalized,
    };
  }
  return { valid: true, normalized };
}
